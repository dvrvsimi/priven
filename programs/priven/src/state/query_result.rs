use anchor_lang::prelude::*;

/// Stores the encrypted result of a query
/// User can fetch this and decrypt locally
#[account]
#[derive(InitSpace)]
pub struct QueryResultAccount {
    /// The user who submitted the query
    pub user: Pubkey,

    /// Computation offset (for correlation)
    pub computation_offset: u64,

    /// Encrypted result data
    /// Contains: encryption_key (32) + nonce (16) + ciphertexts (variable)
    #[max_len(2048)]
    pub encrypted_result: Vec<u8>,

    /// Slot when the result was received
    pub result_slot: u64,

    /// Whether the computation succeeded
    pub success: bool,

    /// Bump seed for PDA
    pub bump: u8,
}

impl QueryResultAccount {
    pub const SEED_PREFIX: &'static [u8] = b"query_result";
}
