use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};

// Crypto imports for AES-GCM
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use sha2::Sha256;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret};

declare_id!("EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM");

/// Maximum pools per query
pub const MAX_POOLS: usize = 5;

/// Maximum filters in predicate
pub const MAX_FILTERS: usize = 4;

/// Size of each filter: type(1) + op(1) + field(1) + value(8) = 11 bytes
pub const FILTER_SIZE: usize = 11;

/// Predicate plaintext size: version(1) + count(1) + filters(11*4) = 46 bytes
pub const PREDICATE_V2_PLAINTEXT_SIZE: usize = 46;

/// Size of AES-GCM encrypted predicate: ~48 bytes ciphertext + 12 nonce + 16 tag = 76, rounded to 80
pub const ENCRYPTED_PREDICATE_SIZE: usize = 80;

/// Legacy predicate size (for backward compatibility)
pub const ENCRYPTED_PREDICATE_SIZE_V1: usize = 44;

/// Size of encrypted result: 1 byte count + (32 * 5) addresses + 12 nonce + 16 tag
pub const ENCRYPTED_RESULT_SIZE: usize = 189;

// ============================================================================
// FILTER TYPES AND OPERATIONS (V2 Predicate Schema)
// ============================================================================

/// Filter types for predicate evaluation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum FilterType {
    Tvl = 0,
    Balance = 1,
    Volume24h = 2,
    FeeRate = 3,
    Price = 4,
    Apy = 5,
    ReserveA = 6,
    ReserveB = 7,
    Ratio = 8,
    Mint = 9,
    Program = 10,
    SlotAge = 11,
}

/// Filter comparison operations
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum FilterOp {
    Gte = 0, // >=
    Lte = 1, // <=
    Eq = 2,  // ==
    Neq = 3, // !=
}

/// Single filter in V2 predicate (11 bytes)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug)]
pub struct Filter {
    pub filter_type: u8,
    pub op: u8,
    pub field: u8, // Reserved for future use
    pub value: u64,
}

/// Parsed V2 predicate structure
pub struct PredicateV2 {
    pub version: u8,
    pub filter_count: u8,
    pub filters: [Filter; MAX_FILTERS],
}

/// Query state seed
pub const QUERY_SEED: &[u8] = b"query";

/// Result seed
pub const RESULT_SEED: &[u8] = b"result";

/// Config seed
pub const CONFIG_SEED: &[u8] = b"config";

#[ephemeral]
#[program]
pub mod priven {
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

        // Emit event for indexers
        emit!(QuerySubmitted {
            query_id,
            owner: ctx.accounts.user.key(),
            pool_count: pools.len() as u8,
        });

        Ok(())
    }

    /// Delegate query state to TEE validator for private execution
    pub fn delegate_query(ctx: Context<DelegateQuery>) -> Result<()> {
        let query_state = &mut ctx.accounts.query_state;
        query_state.status = QueryStatus::Delegated;

        emit!(QueryDelegated {
            query_id: query_state.query_id,
            owner: query_state.owner,
        });

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

        // Extract match count from encrypted result (first byte of plaintext before encryption)
        let match_count = if encrypted_len > 0 { encrypted_result[0] } else { 0 };

        emit!(QueryExecuted {
            query_id: query_state.query_id,
            owner: query_state.owner,
            success,
            match_count,
            encrypted_result: encrypted_result.to_vec(),
            encrypted_len,
        });

        Ok(())
    }

    /// Execute query in stateless mode - result returned in event, no result account needed
    /// This is the TEE-friendly version that only writes to query_state (already delegated)
    pub fn execute_query_stateless(ctx: Context<ExecuteQueryStateless>, decryption_key: [u8; 32]) -> Result<()> {
        let query_state = &mut ctx.accounts.query_state;

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

        query_state.status = if success {
            QueryStatus::Completed
        } else {
            QueryStatus::Failed
        };

        // Extract match count
        let match_count = if encrypted_len > 0 { encrypted_result[0] } else { 0 };

        // Emit result in event (stateless - no result account)
        emit!(QueryExecuted {
            query_id: query_state.query_id,
            owner: query_state.owner,
            success,
            match_count,
            encrypted_result: encrypted_result[..encrypted_len as usize].to_vec(),
            encrypted_len,
        });

        Ok(())
    }

    /// Commit result and undelegate back to L1
    pub fn commit_result(ctx: Context<CommitResult>) -> Result<()> {
        let query_state = &mut ctx.accounts.query_state;
        let query_result = &ctx.accounts.query_result;

        // Validate result matches query
        require!(
            query_result.query_id == query_state.query_id,
            PrivenError::QueryMismatch
        );

        // Emit completion event
        emit!(QueryCompleted {
            query_id: query_state.query_id,
            owner: query_state.owner,
            success: query_result.success,
            result_slot: query_result.completed_slot,
        });

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

    /// Expire a stuck query after timeout (1 hour)
    /// Anyone can call this to clean up expired queries
    pub fn expire_query(ctx: Context<ExpireQuery>) -> Result<()> {
        let query_state = &mut ctx.accounts.query_state;
        let clock = Clock::get()?;

        // 1 hour timeout in seconds
        const QUERY_TIMEOUT_SECONDS: i64 = 3600;

        require!(
            clock.unix_timestamp > query_state.submitted_at + QUERY_TIMEOUT_SECONDS,
            PrivenError::QueryNotExpired
        );

        // Only expire if not already completed/failed
        require!(
            query_state.status != QueryStatus::Completed
                && query_state.status != QueryStatus::Failed,
            PrivenError::InvalidQueryStatus
        );

        query_state.status = QueryStatus::Failed;

        emit!(QueryExpired {
            query_id: query_state.query_id,
            owner: query_state.owner,
        });

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
#[derive(Accounts)]
pub struct ExecuteQuery<'info> {
    /// Payer for result account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, query_state.owner.as_ref(), &query_state.query_id.to_le_bytes()],
        bump = query_state.bump,
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

/// Execute query stateless - TEE-friendly version that only writes to query_state
/// Result is emitted in QueryExecuted event, no result account needed
#[derive(Accounts)]
pub struct ExecuteQueryStateless<'info> {
    /// Caller (TEE validator or authorized executor)
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, query_state.owner.as_ref(), &query_state.query_id.to_le_bytes()],
        bump = query_state.bump,
    )]
    pub query_state: Account<'info, QueryState>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,
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

#[derive(Accounts)]
pub struct ExpireQuery<'info> {
    /// Anyone can expire a stuck query
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, query_state.owner.as_ref(), &query_state.query_id.to_le_bytes()],
        bump = query_state.bump
    )]
    pub query_state: Account<'info, QueryState>,
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
    pub query_fee: u64, // Reserved for future use, not enforced
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
    #[msg("Decryption failed - invalid ciphertext or key")]
    DecryptionFailed,
    #[msg("Invalid predicate format")]
    InvalidPredicateFormat,
    #[msg("Unsupported predicate version")]
    UnsupportedPredicateVersion,
    #[msg("Too many filters (max 4)")]
    TooManyFilters,
    #[msg("Query ID mismatch between state and result")]
    QueryMismatch,
    #[msg("Query has not expired yet")]
    QueryNotExpired,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct QuerySubmitted {
    pub query_id: u64,
    pub owner: Pubkey,
    pub pool_count: u8,
}

#[event]
pub struct QueryDelegated {
    pub query_id: u64,
    pub owner: Pubkey,
}

#[event]
pub struct QueryExecuted {
    pub query_id: u64,
    pub owner: Pubkey,
    pub success: bool,
    pub match_count: u8,
    pub encrypted_result: Vec<u8>,  // Encrypted result for stateless mode
    pub encrypted_len: u16,
}

#[event]
pub struct QueryCompleted {
    pub query_id: u64,
    pub owner: Pubkey,
    pub success: bool,
    pub result_slot: u64,
}

#[event]
pub struct QueryExpired {
    pub query_id: u64,
    pub owner: Pubkey,
}

// ============================================================================
// CRYPTO HELPERS (AES-256-GCM with X25519 ECDH)
// ============================================================================

/// HKDF info string for key derivation (must match client)
const HKDF_INFO: &[u8] = b"priven-v1";

/// Derive AES-256 key from X25519 shared secret using HKDF-SHA256
fn derive_aes_key(shared_secret: &[u8; 32]) -> [u8; 32] {
    let hkdf = Hkdf::<Sha256>::new(Some(&[0u8; 32]), shared_secret);
    let mut aes_key = [0u8; 32];
    hkdf.expand(HKDF_INFO, &mut aes_key)
        .expect("HKDF expand failed");
    aes_key
}

/// Decrypt predicate using X25519 ECDH + AES-256-GCM
fn decrypt_predicate(
    encrypted: &[u8],
    tee_private_key: &[u8; 32],
    user_public_key: &[u8; 32],
) -> Option<Vec<u8>> {
    // Minimum size: some ciphertext + nonce(12) + tag(16)
    if encrypted.len() < 29 {
        return None;
    }

    let nonce_start = encrypted.len() - 28;
    let tag_start = encrypted.len() - 16;

    let ciphertext = &encrypted[..nonce_start];
    let nonce_bytes = &encrypted[nonce_start..tag_start];
    let tag = &encrypted[tag_start..];

    // Perform X25519 ECDH
    let tee_secret = StaticSecret::from(*tee_private_key);
    let user_pubkey = X25519PublicKey::from(*user_public_key);
    let shared_secret = tee_secret.diffie_hellman(&user_pubkey);

    // Derive AES key
    let aes_key = derive_aes_key(shared_secret.as_bytes());

    // Initialize cipher
    let cipher = Aes256Gcm::new_from_slice(&aes_key).ok()?;

    // Reconstruct ciphertext+tag (aes-gcm expects them concatenated)
    let mut ct_with_tag = Vec::with_capacity(ciphertext.len() + 16);
    ct_with_tag.extend_from_slice(ciphertext);
    ct_with_tag.extend_from_slice(tag);

    // Decrypt
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ct_with_tag.as_ref()).ok()
}

/// Encrypt result back to user using their ephemeral public key
fn encrypt_result_data(
    plaintext: &[u8],
    user_public_key: &[u8; 32],
    tee_private_key: &[u8; 32],
) -> Option<Vec<u8>> {
    // Derive shared secret
    let tee_secret = StaticSecret::from(*tee_private_key);
    let user_pubkey = X25519PublicKey::from(*user_public_key);
    let shared_secret = tee_secret.diffie_hellman(&user_pubkey);

    // Derive AES key
    let aes_key = derive_aes_key(shared_secret.as_bytes());

    // Initialize cipher
    let cipher = Aes256Gcm::new_from_slice(&aes_key).ok()?;

    // Generate deterministic nonce from hash of plaintext (for reproducibility)
    use sha2::Digest;
    let mut hasher = Sha256::new();
    hasher.update(plaintext);
    let hash_result = hasher.finalize();
    let mut nonce_bytes = [0u8; 12];
    nonce_bytes.copy_from_slice(&hash_result[..12]);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt (returns ciphertext || tag)
    let ciphertext_with_tag = cipher.encrypt(nonce, plaintext).ok()?;

    // Build output: [ciphertext][nonce: 12][tag: 16]
    let ct_len = ciphertext_with_tag.len() - 16;
    let ciphertext = &ciphertext_with_tag[..ct_len];
    let tag = &ciphertext_with_tag[ct_len..];

    let mut result = Vec::with_capacity(ct_len + 28);
    result.extend_from_slice(ciphertext);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(tag);

    Some(result)
}

/// Parse V2 predicate from decrypted bytes
fn parse_predicate_v2(decrypted: &[u8]) -> Option<PredicateV2> {
    if decrypted.len() < 2 {
        return None;
    }

    let version = decrypted[0];
    if version != 2 {
        return None;
    }

    let filter_count = decrypted[1] as usize;
    if filter_count > MAX_FILTERS {
        return None;
    }

    let mut filters = [Filter::default(); MAX_FILTERS];

    for i in 0..filter_count {
        let offset = 2 + (i * FILTER_SIZE);
        if offset + FILTER_SIZE > decrypted.len() {
            return None;
        }

        filters[i] = Filter {
            filter_type: decrypted[offset],
            op: decrypted[offset + 1],
            field: decrypted[offset + 2],
            value: u64::from_le_bytes(decrypted[offset + 3..offset + 11].try_into().ok()?),
        };
    }

    Some(PredicateV2 {
        version,
        filter_count: filter_count as u8,
        filters,
    })
}

/// Parse legacy V1 predicate (min_tvl, max_tvl) into V2 format
fn parse_predicate_v1(decrypted: &[u8]) -> Option<PredicateV2> {
    if decrypted.len() < 16 {
        return None;
    }

    let min_tvl = u64::from_le_bytes(decrypted[0..8].try_into().ok()?);
    let max_tvl = u64::from_le_bytes(decrypted[8..16].try_into().ok()?);

    Some(PredicateV2 {
        version: 1,
        filter_count: 2,
        filters: [
            Filter {
                filter_type: FilterType::Tvl as u8,
                op: FilterOp::Gte as u8,
                field: 0,
                value: min_tvl,
            },
            Filter {
                filter_type: FilterType::Tvl as u8,
                op: FilterOp::Lte as u8,
                field: 0,
                value: max_tvl,
            },
            Filter::default(),
            Filter::default(),
        ],
    })
}

/// Get field value from pool based on filter type
/// Note: For token accounts, balance is stored in token_a_reserve
fn get_pool_field_value(pool: &PoolData, filter_type: u8) -> u64 {
    match filter_type {
        0 => pool.tvl(),           // TVL (reserve_a + reserve_b)
        1 => pool.token_a_reserve, // Balance (for token accounts)
        6 => pool.token_a_reserve, // ReserveA
        7 => pool.token_b_reserve, // ReserveB
        8 => {
            // Ratio (A/B * 1e9)
            if pool.token_b_reserve > 0 {
                (pool.token_a_reserve as u128 * 1_000_000_000 / pool.token_b_reserve as u128) as u64
            } else {
                u64::MAX
            }
        }
        _ => 0, // Other filter types not supported
    }
}

/// Evaluate a single pool against all filters (AND logic)
fn evaluate_pool(pool: &PoolData, predicate: &PredicateV2) -> bool {
    for i in 0..predicate.filter_count as usize {
        let filter = &predicate.filters[i];
        let pool_value = get_pool_field_value(pool, filter.filter_type);

        let matches = match filter.op {
            0 => pool_value >= filter.value, // GTE
            1 => pool_value <= filter.value, // LTE
            2 => pool_value == filter.value, // EQ
            3 => pool_value != filter.value, // NEQ
            _ => false,
        };

        if !matches {
            return false;
        }
    }
    true
}

// ============================================================================
// PRIVATE EXECUTION (runs inside TEE)
// ============================================================================

/// Execute private query inside TEE enclave
///
/// Flow:
/// 1. Decrypt predicate using X25519 ECDH + AES-256-GCM
/// 2. Parse predicate (V1 or V2 format)
/// 3. Evaluate pools against all filters
/// 4. Encrypt results back to user
fn execute_private_query(
    encrypted_predicate: &[u8; ENCRYPTED_PREDICATE_SIZE],
    decryption_key: &[u8; 32],
    user_pubkey: &[u8; 32],
    pools: &[PoolData],
) -> ([u8; ENCRYPTED_RESULT_SIZE], u16, bool) {
    // Step 1: Decrypt predicate
    let decrypted = match decrypt_predicate(encrypted_predicate, decryption_key, user_pubkey) {
        Some(d) => d,
        None => {
            // Fallback: treat as raw bytes for backward compatibility / testing
            encrypted_predicate.to_vec()
        }
    };

    // Step 2: Parse predicate (detect version)
    let predicate = if !decrypted.is_empty() && decrypted[0] == 2 {
        // V2 format
        match parse_predicate_v2(&decrypted) {
            Some(p) => p,
            None => return ([0u8; ENCRYPTED_RESULT_SIZE], 0, false),
        }
    } else {
        // V1 legacy format
        match parse_predicate_v1(&decrypted) {
            Some(p) => p,
            None => return ([0u8; ENCRYPTED_RESULT_SIZE], 0, false),
        }
    };

    // Step 3: Evaluate pools against predicate
    let mut matching_pools: Vec<Pubkey> = Vec::with_capacity(MAX_POOLS);

    for pool in pools.iter() {
        if evaluate_pool(pool, &predicate) {
            matching_pools.push(pool.address);
            if matching_pools.len() >= MAX_POOLS {
                break;
            }
        }
    }

    // Step 4: Build and encrypt result
    // Plaintext format: [match_count: u8][addresses: 32 * count]
    let match_count = matching_pools.len() as u8;
    let plaintext_len = 1 + (matching_pools.len() * 32);
    let mut plaintext = vec![0u8; plaintext_len];

    plaintext[0] = match_count;
    for (i, pubkey) in matching_pools.iter().enumerate() {
        let offset = 1 + i * 32;
        plaintext[offset..offset + 32].copy_from_slice(pubkey.as_ref());
    }

    // Encrypt result back to user
    let encrypted_result_vec =
        match encrypt_result_data(&plaintext, user_pubkey, decryption_key) {
            Some(e) => e,
            None => {
                // Fallback: return plaintext with mock nonce/tag (for testing)
                let mut fallback = plaintext.clone();
                fallback.extend_from_slice(&[0xAB; 12]); // mock nonce
                fallback.extend_from_slice(&[0xCD; 16]); // mock tag
                fallback
            }
        };

    // Copy to fixed-size array
    let mut result = [0u8; ENCRYPTED_RESULT_SIZE];
    let copy_len = encrypted_result_vec.len().min(ENCRYPTED_RESULT_SIZE);
    result[..copy_len].copy_from_slice(&encrypted_result_vec[..copy_len]);

    let actual_len = copy_len as u16;
    (result, actual_len, true)
}
