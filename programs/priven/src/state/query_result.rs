use anchor_lang::prelude::*;

/// Stores the encrypted result of a query
/// User can fetch this and decrypt locally
#[account]
pub struct QueryResultAccount {
    /// The user who submitted the query
    pub user: Pubkey,

    /// Computation offset (for correlation)
    pub computation_offset: u64,

    /// Encrypted result data (deterministic size)
    /// QueryResult (161 bytes) → encrypted
    /// Structure: encryption_key (32) + nonce (16) + ciphertexts (192)
    pub encrypted_result: [u8; 240],

    /// Actual length of encrypted_result used
    pub encrypted_result_len: u16,

    /// Slot when the result was received
    pub result_slot: u64,

    /// Whether the computation succeeded
    pub success: bool,

    /// Bump seed for PDA
    pub bump: u8,
}

impl QueryResultAccount {
    pub const SEED_PREFIX: &'static [u8] = b"query_result";

    pub const SPACE: usize = 8 +   // discriminator
        32 +  // user: Pubkey
        8 +   // computation_offset: u64
        240 + // encrypted_result: [u8; 240]
        2 +   // encrypted_result_len: u16
        8 +   // result_slot: u64
        1 +   // success: bool
        1;    // bump: u8
}
