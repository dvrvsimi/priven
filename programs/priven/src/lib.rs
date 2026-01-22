use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub mod errors;
pub mod state;

use errors::ErrorCode;
use state::*;

// Computation definition offset for evaluate_predicate instruction
const COMP_DEF_OFFSET_EVALUATE_PREDICATE: u32 = comp_def_offset("evaluate_predicate");

// Maximum pools per query (must match circuit constant)
pub const MAX_POOLS: usize = 5;

declare_id!("2YKa6YyAqaSopPC24YsgwWgNzb3RoswmAdTEJtZ9Axy4");

#[arcium_program]
pub mod priven {
    use super::*;

    /// Initialize computation definition for evaluate_predicate
    pub fn init_evaluate_predicate_comp_def(
        ctx: Context<InitEvaluatePredicateCompDef>
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        msg!("evaluate_predicate computation definition initialized");
        Ok(())
    }

    /// Submit a private query
    ///
    /// The user provides:
    ///   - encrypted_predicate: Their search criteria, encrypted as [u8; 32]
    ///   - user_pubkey: Their x25519 public key for result encryption
    ///   - nonce: Random nonce for encryption
    ///   - pool_count: Number of valid pools in the data account
    ///
    /// Pool data account is passed as remaining_accounts[0]
    pub fn submit_query(
        ctx: Context<SubmitQuery>,
        computation_offset: u64,
        encrypted_predicate: [u8; 32],
        user_pubkey: [u8; 32],
        nonce: u128,
        pool_count: u8,
    ) -> Result<()> {
        // Validate we have pool data account
        require!(
            !ctx.remaining_accounts.is_empty(),
            ErrorCode::NoPoolsProvided
        );

        // Validate pool count
        require!(
            pool_count as usize <= MAX_POOLS,
            ErrorCode::TooManyPools
        );

        // Pool data is passed via dedicated account (remaining_accounts[0])
        let pool_data_account = &ctx.remaining_accounts[0];

        // Set up sign PDA
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Build computation args with AccountArgument for pool data
        let args = ArgBuilder::new()
            .x25519_pubkey(user_pubkey)
            .plaintext_u128(nonce)
            .encrypted_u8(encrypted_predicate)   // Encrypted predicate (single ciphertext)
            .account(
                pool_data_account.key(),         // Pool data account pubkey
                0,                                // Offset
                pool_data_account.data_len() as u32, // Length
            )
            .plaintext_u8(pool_count)            // How many pools are valid
            .build();

        // Derive query result PDA for callback
        let query_result_pda = ctx.accounts.query_result.key();

        // Queue computation
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,  // No callback server needed
            vec![
                EvaluatePredicateCallback::callback_ix(
                    computation_offset,
                    &ctx.accounts.mxe_account,
                    &[
                        arcium_client::idl::arcium::types::CallbackAccount {
                            pubkey: query_result_pda,
                            is_writable: true,
                        }
                    ]
                )?
            ],
            1,  // Number of callback transactions
            0,  // Priority fee
        )?;

        // Initialize query result account
        let query_result = &mut ctx.accounts.query_result;
        query_result.user = ctx.accounts.payer.key();
        query_result.computation_offset = computation_offset;
        query_result.encrypted_result = Vec::new();
        query_result.result_slot = 0;
        query_result.success = false;
        query_result.bump = ctx.bumps.query_result;

        msg!("Query submitted with {} pools", pool_count);

        Ok(())
    }

    /// Callback from MPC with encrypted results
    #[arcium_callback(encrypted_ix = "evaluate_predicate")]
    pub fn evaluate_predicate_callback(
        ctx: Context<EvaluatePredicateCallback>,
        output: SignedComputationOutputs<EvaluatePredicateOutput>,
    ) -> Result<()> {
        // Verify and extract output
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(EvaluatePredicateOutput { field_0 }) => field_0,
            Err(_) => {
                msg!("Computation failed or aborted");
                ctx.accounts.query_result.success = false;
                return Err(ErrorCode::AbortedComputation.into());
            }
        };

        // Store encrypted result
        let query_result = &mut ctx.accounts.query_result;

        // Serialize the encrypted result
        let mut encrypted_bytes = Vec::new();
        encrypted_bytes.extend_from_slice(&result.encryption_key);
        encrypted_bytes.extend_from_slice(&result.nonce.to_le_bytes());
        for ciphertext in result.ciphertexts.iter() {
            encrypted_bytes.extend_from_slice(ciphertext);
        }

        query_result.encrypted_result = encrypted_bytes;
        query_result.result_slot = Clock::get()?.slot;
        query_result.success = true;

        // Emit event for client tracking
        emit!(QueryCompleteEvent {
            user: query_result.user,
            computation_offset: query_result.computation_offset,
            success: true,
        });

        msg!("Query result stored successfully");

        Ok(())
    }
}

// =========================================================================
// ACCOUNT STRUCTURES
// =========================================================================

#[queue_computation_accounts("evaluate_predicate", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SubmitQuery<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,

    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        init,
        payer = payer,
        seeds = [
            QueryResultAccount::SEED_PREFIX,
            payer.key().as_ref(),
            &computation_offset.to_le_bytes(),
        ],
        bump,
        space = 8 + QueryResultAccount::INIT_SPACE,
    )]
    pub query_result: Account<'info, QueryResultAccount>,

    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_EVALUATE_PREDICATE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,

    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,

    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    // Pool data account is passed via remaining_accounts
}

#[callback_accounts("evaluate_predicate")]
#[derive(Accounts)]
pub struct EvaluatePredicateCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_EVALUATE_PREDICATE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,

    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,

    // Custom callback accounts
    #[account(mut)]
    pub query_result: Account<'info, QueryResultAccount>,
}

#[init_computation_definition_accounts("evaluate_predicate", payer)]
#[derive(Accounts)]
pub struct InitEvaluatePredicateCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// =========================================================================
// EVENTS
// =========================================================================

#[event]
pub struct QueryCompleteEvent {
    pub user: Pubkey,
    pub computation_offset: u64,
    pub success: bool,
}
