use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};

declare_id!("EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM");

/// Maximum pools per query
pub const MAX_POOLS: usize = 5;

/// Size of AES-GCM encrypted predicate: 16 bytes data + 12 nonce + 16 tag
pub const ENCRYPTED_PREDICATE_SIZE: usize = 44;

/// Size of encrypted result: 1 byte count + (32 * 5) addresses + 12 nonce + 16 tag
pub const ENCRYPTED_RESULT_SIZE: usize = 189;

/// Query state seed
pub const QUERY_SEED: &[u8] = b"query";

/// Result seed
pub const RESULT_SEED: &[u8] = b"result";

/// Config seed
pub const CONFIG_SEED: &[u8] = b"config";

#[ephemeral]
#[program]
pub mod priven_tee {
    use super::*;

    /// Initialize program configuration
    pub fn initialize(
        ctx: Context<Initialize>,
        tee_validator: Pubkey,
        max_pools: u8,
        query_fee: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.tee_validator = tee_validator;
        config.max_pools = max_pools;
        config.query_fee = query_fee;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Submit a new query (creates QueryState)
    pub fn submit_query(
        ctx: Context<SubmitQuery>,
        query_id: u64,
        encrypted_predicate: [u8; ENCRYPTED_PREDICATE_SIZE],
        user_pubkey: [u8; 32],
        pools: Vec<PoolData>,
    ) -> Result<()> {
        require!(!pools.is_empty(), PrivenError::NoPoolsProvided);
        require!(pools.len() <= MAX_POOLS, PrivenError::TooManyPools);

        let query_state = &mut ctx.accounts.query_state;
        query_state.owner = ctx.accounts.user.key();
        query_state.query_id = query_id;
        query_state.encrypted_predicate = encrypted_predicate;
        query_state.user_pubkey = user_pubkey;
        query_state.status = QueryStatus::Pending;
        query_state.pool_count = pools.len() as u8;
        query_state.submitted_at = Clock::get()?.unix_timestamp;
        query_state.bump = ctx.bumps.query_state;

        // Copy pool data
        for (i, pool) in pools.iter().enumerate() {
            query_state.pools[i] = *pool;
        }

        Ok(())
    }

    /// Delegate query state to TEE validator for private execution
    pub fn delegate_query(ctx: Context<DelegateQuery>) -> Result<()> {
        ctx.accounts.query_state.status = QueryStatus::Delegated;
        Ok(())
    }

    /// Execute query inside TEE (runs in trusted enclave)
    pub fn execute_query(ctx: Context<ExecuteQuery>, decryption_key: [u8; 32]) -> Result<()> {
        let query_state = &mut ctx.accounts.query_state;
        let query_result = &mut ctx.accounts.query_result;

        require!(
            query_state.status == QueryStatus::Delegated,
            PrivenError::QueryNotDelegated
        );

        query_state.status = QueryStatus::Executing;

        // Execute private query inside TEE
        let (encrypted_result, encrypted_len, success) = execute_private_query(
            &query_state.encrypted_predicate,
            &decryption_key,
            &query_state.user_pubkey,
            &query_state.pools[..query_state.pool_count as usize],
        );

        // Store result
        query_result.owner = query_state.owner;
        query_result.query_id = query_state.query_id;
        query_result.encrypted_result = encrypted_result;
        query_result.encrypted_len = encrypted_len;
        query_result.completed_slot = Clock::get()?.slot;
        query_result.success = success;
        query_result.bump = ctx.bumps.query_result;

        query_state.status = if success {
            QueryStatus::Completed
        } else {
            QueryStatus::Failed
        };

        Ok(())
    }

    /// Commit result and undelegate back to L1
    pub fn commit_result(_ctx: Context<CommitResult>) -> Result<()> {
        Ok(())
    }

    /// Update program configuration (admin only)
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_tee_validator: Option<Pubkey>,
        new_max_pools: Option<u8>,
        new_query_fee: Option<u64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if let Some(validator) = new_tee_validator {
            config.tee_validator = validator;
        }
        if let Some(max) = new_max_pools {
            config.max_pools = max;
        }
        if let Some(fee) = new_query_fee {
            config.query_fee = fee;
        }

        Ok(())
    }
}

// ============================================================================
// ACCOUNT CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + QueryConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, QueryConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(query_id: u64)]
pub struct SubmitQuery<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + QueryState::INIT_SPACE,
        seeds = [QUERY_SEED, user.key().as_ref(), &query_id.to_le_bytes()],
        bump
    )]
    pub query_state: Account<'info, QueryState>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,

    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateQuery<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, user.key().as_ref(), &query_state.query_id.to_le_bytes()],
        bump = query_state.bump,
        constraint = query_state.owner == user.key() @ PrivenError::Unauthorized,
        del
    )]
    pub query_state: Account<'info, QueryState>,
}

/// Execute query - runs inside TEE ephemeral rollup
///
/// Security model:
/// - The query_state must be delegated (owned by delegation program)
/// - Only the TEE runtime can execute instructions on delegated accounts
/// - No external validator signature needed - delegation IS the authorization
#[derive(Accounts)]
pub struct ExecuteQuery<'info> {
    /// Payer for result account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, query_state.owner.as_ref(), &query_state.query_id.to_le_bytes()],
        bump = query_state.bump,
        // The delegation status check happens in the instruction logic
    )]
    pub query_state: Account<'info, QueryState>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + QueryResult::INIT_SPACE,
        seeds = [RESULT_SEED, query_state.owner.as_ref(), &query_state.query_id.to_le_bytes()],
        bump
    )]
    pub query_result: Account<'info, QueryResult>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,

    pub system_program: Program<'info, System>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitResult<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, query_state.owner.as_ref(), &query_state.query_id.to_le_bytes()],
        bump = query_state.bump
    )]
    pub query_state: Account<'info, QueryState>,

    #[account(
        mut,
        seeds = [RESULT_SEED, query_result.owner.as_ref(), &query_result.query_id.to_le_bytes()],
        bump = query_result.bump
    )]
    pub query_result: Account<'info, QueryResult>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(constraint = admin.key() == config.admin @ PrivenError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct QueryConfig {
    pub admin: Pubkey,
    pub tee_validator: Pubkey,
    pub max_pools: u8,
    pub query_fee: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct QueryState {
    pub owner: Pubkey,
    pub query_id: u64,
    pub encrypted_predicate: [u8; ENCRYPTED_PREDICATE_SIZE],
    pub user_pubkey: [u8; 32],
    pub status: QueryStatus,
    #[max_len(MAX_POOLS)]
    pub pools: [PoolData; MAX_POOLS],
    pub pool_count: u8,
    pub submitted_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct QueryResult {
    pub owner: Pubkey,
    pub query_id: u64,
    pub encrypted_result: [u8; ENCRYPTED_RESULT_SIZE],
    pub encrypted_len: u16,
    pub completed_slot: u64,
    pub success: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct PoolData {
    pub address: Pubkey,
    pub token_a_reserve: u64,
    pub token_b_reserve: u64,
}

impl PoolData {
    pub fn tvl(&self) -> u64 {
        self.token_a_reserve.saturating_add(self.token_b_reserve)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default, InitSpace)]
pub enum QueryStatus {
    #[default]
    Pending,
    Delegated,
    Executing,
    Completed,
    Failed,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum PrivenError {
    #[msg("No pools provided")]
    NoPoolsProvided,
    #[msg("Too many pools (max 5)")]
    TooManyPools,
    #[msg("Invalid query status for this operation")]
    InvalidQueryStatus,
    #[msg("Query not delegated - must delegate before execution")]
    QueryNotDelegated,
    #[msg("Unauthorized")]
    Unauthorized,
}

// ============================================================================
// PRIVATE EXECUTION (runs inside TEE)
// ============================================================================

/// Execute private query inside TEE enclave
///
/// In MagicBlock TEE:
/// - The TEE runtime decrypts `encrypted_predicate` using ECDH with the provided keys
/// - Predicate format after decryption: [min_tvl: u64 LE, max_tvl: u64 LE] = 16 bytes
/// - We evaluate pools against the TVL range
/// - Results are encrypted back to user (simplified for demo)
///
/// Note: In production, the TEE enclave handles AES-GCM via Intel TDX hardware.
/// For local testing, we simulate by treating the first 16 bytes of the "encrypted"
/// predicate as raw [min_tvl, max_tvl] values.
fn execute_private_query(
    encrypted_predicate: &[u8; ENCRYPTED_PREDICATE_SIZE],
    _decryption_key: &[u8; 32],
    _user_pubkey: &[u8; 32],
    pools: &[PoolData],
) -> ([u8; ENCRYPTED_RESULT_SIZE], u16, bool) {
    // Parse predicate (in real TEE, this would be decrypted first)
    // Format: [min_tvl: u64 LE][max_tvl: u64 LE]
    let min_tvl = u64::from_le_bytes(
        encrypted_predicate[0..8].try_into().unwrap_or([0u8; 8])
    );
    let max_tvl = u64::from_le_bytes(
        encrypted_predicate[8..16].try_into().unwrap_or([u8::MAX; 8])
    );

    // Evaluate pools against predicate
    let mut matching_pools: Vec<Pubkey> = Vec::with_capacity(MAX_POOLS);

    for pool in pools.iter() {
        let tvl = pool.tvl();
        if tvl >= min_tvl && tvl <= max_tvl {
            matching_pools.push(pool.address);
            if matching_pools.len() >= MAX_POOLS {
                break;
            }
        }
    }

    // Build result: [match_count: u8][addresses: 32 * count][padding][nonce: 12][tag: 16]
    // In real TEE, this would be AES-GCM encrypted to user's pubkey
    let mut result = [0u8; ENCRYPTED_RESULT_SIZE];
    let match_count = matching_pools.len() as u8;

    result[0] = match_count;

    for (i, pubkey) in matching_pools.iter().enumerate() {
        let offset = 1 + i * 32;
        result[offset..offset + 32].copy_from_slice(pubkey.as_ref());
    }

    // Add mock nonce and tag at the end (for demo - real TEE would encrypt)
    // Nonce at offset (1 + 32*5) = 161, Tag at offset 173
    let nonce_offset = 1 + (MAX_POOLS * 32);
    result[nonce_offset..nonce_offset + 12].copy_from_slice(&[0xAB; 12]); // mock nonce
    result[nonce_offset + 12..nonce_offset + 28].copy_from_slice(&[0xCD; 16]); // mock tag

    let actual_len = 1 + (match_count as u16 * 32) + 28; // count + addresses + nonce + tag
    (result, actual_len, true)
}
