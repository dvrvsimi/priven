use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Maximum number of pools we can evaluate in one computation (MVP: 5 due to stack limits)
    const MAX_POOLS: usize = 5;

    /// Maximum number of matches we return (fixed size to prevent timing leaks)
    const MAX_MATCHES: usize = 5;

    // =========================================================================
    // DATA STRUCTURES
    // =========================================================================

    /// Pool data structure - simplified for MVP (just TVL components)
    /// In production, this would match the exact Raydium AMM pool layout
    #[derive(Clone, Copy)]
    pub struct PoolData {
        pub address: [u8; 32],      // Pool pubkey
        pub token_a_reserve: u64,   // Reserve of token A
        pub token_b_reserve: u64,   // Reserve of token B
    }

    /// User's search criteria - THIS IS THE SECRET
    /// The MPC nodes will only see secret shares of these values
    #[derive(Clone, Copy)]
    pub struct Predicate {
        pub min_tvl: u64,           // Minimum TVL (token_a_reserve + token_b_reserve)
        pub max_tvl: u64,           // Maximum TVL
    }

    /// Query result - encrypted list of matching pool addresses
    #[derive(Clone, Copy)]
    pub struct QueryResult {
        pub matches: [[u8; 32]; MAX_MATCHES],  // Matching pool addresses (padded with zeros)
        pub match_count: u8,                    // Actual number of matches (encrypted!)
    }

    // =========================================================================
    // MAIN ENCRYPTED INSTRUCTION
    // =========================================================================

    /// Evaluate a private predicate against public pool data
    ///
    /// Inputs:
    ///   - predicate: Enc<Shared, Predicate> - User's encrypted search criteria
    ///   - pools: [PoolData; MAX_POOLS] - Public pool data (plaintext)
    ///   - pool_count: u8 - How many pools are actually valid (rest are padding)
    ///
    /// Output:
    ///   - Enc<Shared, QueryResult> - Encrypted list of matching pools
    ///
    /// Privacy guarantee:
    ///   - MPC nodes see secret shares of predicate, never the actual values
    ///   - Output is encrypted to user's key, no one else can read matches
    #[instruction]
    pub fn evaluate_predicate(
        predicate: Enc<Shared, Predicate>,
        pools: [PoolData; MAX_POOLS],
        pool_count: u8,
    ) -> Enc<Shared, QueryResult> {
        // Convert encrypted predicate to secret shares
        // After this, no individual MPC node knows the actual predicate values
        let pred = predicate.to_arcis();

        // Initialize result with zeros
        let mut result = QueryResult {
            matches: [[0u8; 32]; MAX_MATCHES],
            match_count: 0,
        };

        // Iterate over all pools (fixed iteration count, no timing leak)
        for i in 0..MAX_POOLS {
            let pool = pools[i];

            // Calculate TVL (Total Value Locked)
            // TVL = token_a_reserve + token_b_reserve
            let tvl = pool.token_a_reserve + pool.token_b_reserve;

            // Evaluate predicate conditions on secret shares
            // All comparisons happen on secret shares!
            let tvl_matches = tvl >= pred.min_tvl && tvl <= pred.max_tvl;

            // Check if this is a valid pool (not padding)
            let is_valid_pool = i < pool_count as usize;

            // Combine conditions
            let matches = tvl_matches && is_valid_pool;

            // Add to results if matches and we have room
            // This branch is evaluated on secret shares, preventing timing attacks
            if matches && (result.match_count as usize) < MAX_MATCHES {
                result.matches[result.match_count as usize] = pool.address;
                result.match_count += 1;
            }
        }

        // Re-encrypt result to user's key
        // Only the user can decrypt this
        predicate.owner.from_arcis(result)
    }
}
