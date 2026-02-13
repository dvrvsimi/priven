use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM");

// ============================================================================
// CONSTANTS
// ============================================================================

/// Maximum pools per query
pub const MAX_POOLS: usize = 20;

/// Size of AES-GCM encrypted predicate
pub const ENCRYPTED_PREDICATE_SIZE: usize = 80;

/// Maximum encrypted result size: count(1) + MAX_POOLS * 32 + nonce(12) + tag(16) = 669
pub const MAX_ENCRYPTED_RESULT_SIZE: usize = 1 + MAX_POOLS * 32 + 28;

/// Query state seed
pub const QUERY_SEED: &[u8] = b"query";

/// Config seed
pub const CONFIG_SEED: &[u8] = b"config";

/// Session seed
pub const SESSION_SEED: &[u8] = b"session";

/// Merkle anchor seed
pub const ANCHOR_SEED: &[u8] = b"anchor";

/// Session timeout (1 hour)
pub const SESSION_TIMEOUT_SECONDS: i64 = 3600;

/// Query timeout (1 hour)
pub const QUERY_TIMEOUT_SECONDS: i64 = 3600;

#[ephemeral]
#[program]
pub mod priven {
    use super::*;

    // ========================================================================
    // CONFIG INSTRUCTIONS
    // ========================================================================

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
        config.total_queries = 0;
        config.bump = ctx.bumps.config;
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

    /// Close config account and return rent to admin (for migration)
    pub fn close_config(ctx: Context<CloseConfig>) -> Result<()> {
        let config_info = &ctx.accounts.config;
        let admin = &ctx.accounts.admin;

        // Verify config account has data
        let config_data = config_info.try_borrow_data()?;
        require!(config_data.len() >= 40, PrivenError::InvalidConfig); // 8 discriminator + 32 admin

        // Verify admin is the first pubkey after discriminator
        let stored_admin = Pubkey::try_from(&config_data[8..40]).map_err(|_| PrivenError::InvalidConfig)?;
        require!(stored_admin == admin.key(), PrivenError::Unauthorized);
        drop(config_data);

        // Transfer lamports and zero account
        let lamports = config_info.lamports();
        **config_info.try_borrow_mut_lamports()? = 0;
        **admin.try_borrow_mut_lamports()? = admin.lamports().checked_add(lamports).unwrap();

        // Zero the data to mark as closed
        let mut data = config_info.try_borrow_mut_data()?;
        data.fill(0);

        Ok(())
    }

    // ========================================================================
    // SESSION INSTRUCTIONS
    // ========================================================================

    /// Open a new query session
    pub fn open_session(ctx: Context<OpenSession>, session_id: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.owner = ctx.accounts.user.key();
        session.session_id = session_id;
        session.created_at = Clock::get()?.unix_timestamp;
        session.last_query_at = 0;
        session.query_count = 0;
        session.bump = ctx.bumps.session;

        emit!(SessionOpened {
            session_id,
            owner: ctx.accounts.user.key(),
        });

        Ok(())
    }

    /// Close a session and return rent to owner
    pub fn close_session(ctx: Context<CloseSession>) -> Result<()> {
        emit!(SessionClosed {
            session_id: ctx.accounts.session.session_id,
            owner: ctx.accounts.session.owner,
            query_count: ctx.accounts.session.query_count,
        });
        Ok(())
    }

    /// Expire an idle session after timeout (permissionless)
    pub fn expire_session(ctx: Context<ExpireSession>) -> Result<()> {
        let session = &ctx.accounts.session;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp > session.created_at + SESSION_TIMEOUT_SECONDS,
            PrivenError::SessionNotExpired
        );

        emit!(SessionExpired {
            session_id: session.session_id,
            owner: session.owner,
        });

        Ok(())
    }

    // ========================================================================
    // QUERY INSTRUCTIONS
    // ========================================================================

    /// Submit a new query within a session
    pub fn submit_query(
        ctx: Context<SubmitQuery>,
        session_id: u64,
        query_id: u64,
        encrypted_predicate: [u8; ENCRYPTED_PREDICATE_SIZE],
        user_pubkey: [u8; 32],
        pool_addresses: Vec<Pubkey>,
    ) -> Result<()> {
        require!(!pool_addresses.is_empty(), PrivenError::NoPoolsProvided);
        require!(
            pool_addresses.len() <= ctx.accounts.config.max_pools as usize,
            PrivenError::TooManyPools
        );

        let query_state = &mut ctx.accounts.query_state;
        query_state.owner = ctx.accounts.user.key();
        query_state.session_id = session_id;
        query_state.query_id = query_id;
        query_state.encrypted_predicate = encrypted_predicate;
        query_state.user_pubkey = user_pubkey;
        query_state.status = QueryStatus::Pending;
        query_state.pool_count = pool_addresses.len() as u8;
        query_state.pool_addresses = pool_addresses.clone();
        query_state.submitted_at = Clock::get()?.unix_timestamp;
        query_state.bump = ctx.bumps.query_state;

        // Update global query count
        ctx.accounts.config.total_queries += 1;

        emit!(QuerySubmitted {
            session_id,
            query_id,
            owner: ctx.accounts.user.key(),
            pool_count: query_state.pool_count,
        });

        Ok(())
    }

    /// Delegate query state to TEE validator for private execution
    pub fn delegate_query(ctx: Context<DelegateQuery>, query_id: u64) -> Result<()> {
        ctx.accounts.delegate_query_state(
            &ctx.accounts.user,
            &[QUERY_SEED, ctx.accounts.user.key().as_ref(), &query_id.to_le_bytes()],
            ephemeral_rollups_sdk::cpi::DelegateConfig::default(),
        )?;

        emit!(QueryDelegated {
            query_id,
            owner: ctx.accounts.user.key(),
        });

        Ok(())
    }

    /// Commit and undelegate query state back to L1
    pub fn undelegate_query(
        ctx: Context<UndelegateQuery>,
        _owner: Pubkey,
        _query_id: u64,
    ) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.query_state.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        Ok(())
    }

    /// Submit result from TEE executor
    pub fn submit_result(
        ctx: Context<SubmitResult>,
        encrypted_result: Vec<u8>,
        match_count: u8,
        success: bool,
        result_hash: [u8; 32],
        _owner: Pubkey,
        _query_id: u64,
    ) -> Result<()> {
        // Verify caller is the authorized TEE validator
        require!(
            ctx.accounts.caller.key() == ctx.accounts.config.tee_validator,
            PrivenError::UnauthorizedTeeValidator
        );

        // Validate encrypted result size
        require!(
            encrypted_result.len() <= MAX_ENCRYPTED_RESULT_SIZE,
            PrivenError::ResultTooLarge
        );

        let query_state = &mut ctx.accounts.query_state;

        require!(
            query_state.status == QueryStatus::Pending || query_state.status == QueryStatus::Delegated,
            PrivenError::InvalidQueryStatus
        );

        // If session_id != 0, session account must be provided
        if query_state.session_id != 0 {
            require!(
                ctx.accounts.session.is_some(),
                PrivenError::SessionRequired
            );
        }

        query_state.status = if success {
            QueryStatus::Completed
        } else {
            QueryStatus::Failed
        };

        // Update session stats if session account provided
        if let Some(session) = &mut ctx.accounts.session {
            session.query_count += 1;
            session.last_query_at = Clock::get()?.unix_timestamp;
        }

        emit!(QueryExecuted {
            session_id: query_state.session_id,
            query_id: query_state.query_id,
            owner: query_state.owner,
            success,
            match_count,
            encrypted_result,
            result_hash,
        });

        Ok(())
    }

    /// Expire a stuck query after timeout, returns rent to owner
    pub fn expire_query(ctx: Context<ExpireQuery>) -> Result<()> {
        let query_state = &ctx.accounts.query_state;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp > query_state.submitted_at + QUERY_TIMEOUT_SECONDS,
            PrivenError::QueryNotExpired
        );

        require!(
            query_state.status != QueryStatus::Completed
                && query_state.status != QueryStatus::Failed,
            PrivenError::InvalidQueryStatus
        );

        emit!(QueryExpired {
            query_id: query_state.query_id,
            owner: query_state.owner,
        });

        Ok(())
    }

    /// Close completed/failed query, return rent to owner
    pub fn close_query(ctx: Context<CloseQuery>) -> Result<()> {
        emit!(QueryClosed {
            query_id: ctx.accounts.query_state.query_id,
            owner: ctx.accounts.query_state.owner,
        });
        Ok(())
    }

    // ========================================================================
    // MERKLE ANCHORING INSTRUCTIONS
    // ========================================================================

    /// Initialize Merkle anchor (admin only)
    pub fn initialize_anchor(ctx: Context<InitializeAnchor>) -> Result<()> {
        let anchor = &mut ctx.accounts.anchor;
        anchor.authority = ctx.accounts.admin.key();
        anchor.latest_root = [0u8; 32];
        anchor.query_count = 0;
        anchor.anchor_slot = 0;
        anchor.epoch = 0;
        anchor.bump = ctx.bumps.anchor;
        Ok(())
    }

    /// Post Merkle root batch (TEE operator only)
    pub fn anchor_batch(
        ctx: Context<AnchorBatch>,
        merkle_root: [u8; 32],
        query_count: u64,
    ) -> Result<()> {
        let anchor = &mut ctx.accounts.anchor;
        let clock = Clock::get()?;

        anchor.latest_root = merkle_root;
        anchor.query_count = query_count;
        anchor.anchor_slot = clock.slot;
        anchor.epoch += 1;

        emit!(BatchAnchored {
            epoch: anchor.epoch,
            merkle_root,
            query_count,
            slot: anchor.anchor_slot,
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
pub struct UpdateConfig<'info> {
    #[account(constraint = admin.key() == config.admin @ PrivenError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,
}

/// Close config account - uses UncheckedAccount to handle size mismatch during migration
#[derive(Accounts)]
pub struct CloseConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Config account that may have incorrect size due to migration.
    /// We manually verify the admin is the first 32 bytes of account data (after discriminator).
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(session_id: u64)]
pub struct OpenSession<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + QuerySession::INIT_SPACE,
        seeds = [SESSION_SEED, user.key().as_ref(), &session_id.to_le_bytes()],
        bump
    )]
    pub session: Account<'info, QuerySession>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner,
    )]
    pub session: Account<'info, QuerySession>,
}

#[derive(Accounts)]
pub struct ExpireSession<'info> {
    pub caller: Signer<'info>,

    /// CHECK: Receives rent refund
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    #[account(
        mut,
        close = owner,
        constraint = session.owner == owner.key() @ PrivenError::Unauthorized
    )]
    pub session: Account<'info, QuerySession>,
}

#[derive(Accounts)]
#[instruction(session_id: u64, query_id: u64)]
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

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,

    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(query_id: u64)]
pub struct DelegateQuery<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: PDA seeds include user.key() for ownership verification
    #[account(
        mut,
        del,
        seeds = [QUERY_SEED, user.key().as_ref(), &query_id.to_le_bytes()],
        bump,
    )]
    pub query_state: AccountInfo<'info>,
}

#[commit]
#[derive(Accounts)]
#[instruction(owner: Pubkey, query_id: u64)]
pub struct UndelegateQuery<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, owner.as_ref(), &query_id.to_le_bytes()],
        bump,
    )]
    pub query_state: Account<'info, QueryState>,

    /// CHECK: MagicBlock context account
    pub magic_context: AccountInfo<'info>,

    /// CHECK: MagicBlock program
    pub magic_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(encrypted_result: Vec<u8>, match_count: u8, success: bool, result_hash: [u8; 32], owner: Pubkey, query_id: u64)]
pub struct SubmitResult<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [QUERY_SEED, owner.as_ref(), &query_id.to_le_bytes()],
        bump,
    )]
    pub query_state: Account<'info, QueryState>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,

    /// Optional session account to update stats
    #[account(
        mut,
        seeds = [SESSION_SEED, owner.as_ref(), &query_state.session_id.to_le_bytes()],
        bump = session.bump,
    )]
    pub session: Option<Account<'info, QuerySession>>,
}

#[derive(Accounts)]
pub struct ExpireQuery<'info> {
    pub caller: Signer<'info>,

    /// CHECK: Rent destination
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [QUERY_SEED, query_state.owner.as_ref(), &query_state.query_id.to_le_bytes()],
        bump = query_state.bump,
        constraint = query_state.owner == owner.key() @ PrivenError::Unauthorized
    )]
    pub query_state: Account<'info, QueryState>,
}

#[derive(Accounts)]
pub struct CloseQuery<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner,
        constraint = query_state.status == QueryStatus::Completed
            || query_state.status == QueryStatus::Failed @ PrivenError::InvalidQueryStatus
    )]
    pub query_state: Account<'info, QueryState>,
}

#[derive(Accounts)]
pub struct InitializeAnchor<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, QueryConfig>,

    #[account(
        init,
        payer = admin,
        space = 8 + MerkleAnchor::INIT_SPACE,
        seeds = [ANCHOR_SEED],
        bump
    )]
    pub anchor: Account<'info, MerkleAnchor>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AnchorBatch<'info> {
    #[account(
        constraint = caller.key() == anchor.authority @ PrivenError::Unauthorized
    )]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [ANCHOR_SEED],
        bump = anchor.bump,
    )]
    pub anchor: Account<'info, MerkleAnchor>,
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct QueryConfig {
    pub admin: Pubkey,         // 32
    pub tee_validator: Pubkey, // 32
    pub max_pools: u8,         // 1
    pub query_fee: u64,        // 8
    pub total_queries: u64,    // 8
    pub bump: u8,              // 1
}

#[account]
#[derive(InitSpace)]
pub struct QuerySession {
    pub owner: Pubkey,      // 32
    pub session_id: u64,    // 8
    pub created_at: i64,    // 8
    pub last_query_at: i64, // 8
    pub query_count: u64,   // 8
    pub bump: u8,           // 1
}

#[account]
#[derive(InitSpace)]
pub struct QueryState {
    pub owner: Pubkey,                                        // 32
    pub session_id: u64,                                      // 8
    pub query_id: u64,                                        // 8
    pub encrypted_predicate: [u8; ENCRYPTED_PREDICATE_SIZE],  // 80
    pub user_pubkey: [u8; 32],                                // 32
    pub status: QueryStatus,                                  // 1
    #[max_len(MAX_POOLS)]
    pub pool_addresses: Vec<Pubkey>,                          // 4 + 32*n
    pub pool_count: u8,                                       // 1
    pub submitted_at: i64,                                    // 8
    pub bump: u8,                                             // 1
}

#[account]
#[derive(InitSpace)]
pub struct MerkleAnchor {
    pub authority: Pubkey,      // 32
    pub latest_root: [u8; 32],  // 32
    pub query_count: u64,       // 8
    pub anchor_slot: u64,       // 8
    pub epoch: u64,             // 8
    pub bump: u8,               // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default, InitSpace)]
pub enum QueryStatus {
    #[default]
    Pending,
    Delegated,
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
    #[msg("Too many pools")]
    TooManyPools,
    #[msg("Invalid query status for this operation")]
    InvalidQueryStatus,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Query has not expired yet")]
    QueryNotExpired,
    #[msg("Session has not expired yet")]
    SessionNotExpired,
    #[msg("Caller is not the authorized TEE validator")]
    UnauthorizedTeeValidator,
    #[msg("Encrypted result exceeds maximum size")]
    ResultTooLarge,
    #[msg("Session account required when session_id != 0")]
    SessionRequired,
    #[msg("Invalid config account")]
    InvalidConfig,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct SessionOpened {
    pub session_id: u64,
    pub owner: Pubkey,
}

#[event]
pub struct SessionClosed {
    pub session_id: u64,
    pub owner: Pubkey,
    pub query_count: u64,
}

#[event]
pub struct SessionExpired {
    pub session_id: u64,
    pub owner: Pubkey,
}

#[event]
pub struct QuerySubmitted {
    pub session_id: u64,
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
    pub session_id: u64,
    pub query_id: u64,
    pub owner: Pubkey,
    pub success: bool,
    pub match_count: u8,
    pub encrypted_result: Vec<u8>,
    pub result_hash: [u8; 32],
}

#[event]
pub struct QueryClosed {
    pub query_id: u64,
    pub owner: Pubkey,
}

#[event]
pub struct QueryExpired {
    pub query_id: u64,
    pub owner: Pubkey,
}

#[event]
pub struct BatchAnchored {
    pub epoch: u64,
    pub merkle_root: [u8; 32],
    pub query_count: u64,
    pub slot: u64,
}
