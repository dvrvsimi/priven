use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Too many pools provided (max 20 for MVP)")]
    TooManyPools,

    #[msg("Invalid pool data account size")]
    InvalidPoolDataSize,

    #[msg("Computation was aborted")]
    AbortedComputation,

    #[msg("Cluster not configured")]
    ClusterNotSet,

    #[msg("Invalid predicate encryption")]
    InvalidPredicateEncryption,

    #[msg("No pools provided")]
    NoPoolsProvided,
}
