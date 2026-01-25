import { PublicKey, } from "@solana/web3.js";
/**
 * Raydium V4 AMM Program ID (Mainnet)
 * Devnet: HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8
 */
export const RAYDIUM_V4_PROGRAM_ID = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
/**
 * Raydium V4 pool account size (bytes)
 * V4 AMM pools are exactly 752 bytes
 */
export const RAYDIUM_POOL_SIZE = 752;
/**
 * Fetch all Raydium V4 pools from QuickNode RPC
 *
 * Uses getProgramAccounts with filters for efficient querying
 * This is the core QuickNode integration for the hackathon prize
 *
 * @param connection - Solana connection (should point to QuickNode endpoint)
 * @param filters - Optional filters for pool selection
 * @param commitment - Confirmation commitment level
 * @returns Array of pool data
 */
export async function fetchRaydiumPools(connection, filters, commitment = "confirmed") {
    console.log("Fetching Raydium pools from QuickNode...");
    // Build program account filters
    const programFilters = [
        // Filter by exact account size (752 bytes for V4 AMM)
        { dataSize: RAYDIUM_POOL_SIZE },
    ];
    // Optional: Filter by pool status (offset 0, 1 byte)
    // status == 1 means active pool
    if (filters?.status !== undefined) {
        programFilters.push({
            memcmp: {
                offset: 0,
                bytes: Buffer.from([filters.status]).toString("base64"),
            },
        });
    }
    // Optional: Filter by token mint
    // This requires knowing the exact offset of token mints in the account data
    // For MVP, we'll skip this and filter client-side
    if (filters?.tokenMint) {
        console.warn("Token mint filtering not yet implemented, will filter client-side");
    }
    try {
        // Core QuickNode Integration: getProgramAccounts
        // This fetches all accounts owned by the Raydium program
        const accounts = await connection.getProgramAccounts(RAYDIUM_V4_PROGRAM_ID, {
            filters: programFilters,
            commitment,
        });
        console.log(`Found ${accounts.length} Raydium V4 pools`);
        // Parse pool data from accounts
        const pools = accounts
            .map((account) => parsePoolAccount(account.pubkey, account.account))
            .filter((pool) => pool !== null);
        // Apply client-side filters
        let filteredPools = pools;
        if (filters?.minTvlPrefilter) {
            filteredPools = filteredPools.filter((pool) => {
                const tvl = pool.tokenAReserve + pool.tokenBReserve;
                return tvl >= filters.minTvlPrefilter;
            });
            console.log(`Filtered to ${filteredPools.length} pools with TVL >= ${filters.minTvlPrefilter}`);
        }
        return filteredPools;
    }
    catch (error) {
        console.error("Error fetching Raydium pools:", error);
        throw new Error(`Failed to fetch pools from QuickNode: ${error}`);
    }
}
/**
 * Fetch specific pools by address using batch RPC call
 *
 * Uses getMultipleAccounts for efficient batch fetching
 * Up to 100 accounts per call (QuickNode supports this)
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param poolAddresses - Array of pool public keys
 * @param commitment - Confirmation commitment level
 * @returns Array of pool data (null entries are filtered out)
 */
export async function getMultiplePools(connection, poolAddresses, commitment = "confirmed") {
    if (poolAddresses.length === 0) {
        return [];
    }
    console.log(`Fetching ${poolAddresses.length} pools from QuickNode (batch)...`);
    try {
        // Core QuickNode Integration: getMultipleAccounts
        // Batch fetch up to 100 accounts per call
        const accounts = await connection.getMultipleAccountsInfo(poolAddresses, commitment);
        // Parse each account
        const pools = [];
        for (let i = 0; i < accounts.length; i++) {
            const accountInfo = accounts[i];
            if (accountInfo) {
                const pool = parsePoolAccount(poolAddresses[i], accountInfo);
                if (pool) {
                    pools.push(pool);
                }
            }
        }
        console.log(`Successfully fetched ${pools.length} pools`);
        return pools;
    }
    catch (error) {
        console.error("Error fetching multiple pools:", error);
        throw new Error(`Failed to fetch pools from QuickNode: ${error}`);
    }
}
/**
 * Parse a Raydium V4 pool account into PoolData structure
 *
 * Raydium V4 accounts have NO Anchor discriminator
 * Data starts directly at offset 0
 *
 * For MVP, we extract minimal fields:
 * - address (from pubkey)
 * - token_a_reserve (needs proper offset)
 * - token_b_reserve (needs proper offset)
 *
 * @param pubkey - Pool account public key
 * @param accountInfo - Account data from RPC
 * @returns Parsed pool data or null if invalid
 */
function parsePoolAccount(pubkey, accountInfo) {
    try {
        const data = accountInfo.data;
        // Validate account size
        if (data.length !== RAYDIUM_POOL_SIZE) {
            console.warn(`Invalid pool account size: ${data.length} bytes`);
            return null;
        }
        // Validate account owner
        if (!accountInfo.owner.equals(RAYDIUM_V4_PROGRAM_ID)) {
            console.warn(`Account owner mismatch: expected ${RAYDIUM_V4_PROGRAM_ID.toBase58()}, got ${accountInfo.owner.toBase58()}`);
            return null;
        }
        // Parse reserve data
        // Note: These offsets are approximate and may need adjustment
        // For production, use @raydium-io/raydium-sdk's LIQUIDITY_STATE_LAYOUT_V4
        //
        // Simplified parsing for MVP:
        // We'll use the full account data and let the on-chain program parse it
        //
        // For demonstration, extract some fields:
        // Offset 0-7: status (u64)
        // ...many fields...
        // We need baseVault and quoteVault balances, not reserves directly
        //
        // For MVP: We'll pass the full account data to the circuit
        // and set reserves to 0 (the circuit will read from account buffer)
        // Extract pool reserves (approximate offsets - needs verification)
        // These are placeholders; actual implementation would use Raydium SDK
        const tokenAReserve = 0n; // Placeholder - circuit reads from account
        const tokenBReserve = 0n; // Placeholder - circuit reads from account
        return {
            address: pubkey,
            tokenAReserve,
            tokenBReserve,
        };
    }
    catch (error) {
        console.error(`Error parsing pool ${pubkey.toBase58()}:`, error);
        return null;
    }
}
/**
 * Calculate TVL from pool reserves
 *
 * @param pool - Pool data
 * @returns Total value locked (sum of reserves)
 */
export function calculateTVL(pool) {
    return pool.tokenAReserve + pool.tokenBReserve;
}
/**
 * Rate limiter for QuickNode requests
 * QuickNode allows ~3 requests per second
 *
 * @param ms - Milliseconds to wait
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Fetch pools with exponential backoff retry
 *
 * Handles rate limiting and transient errors
 *
 * @param connection - Solana connection
 * @param filters - Pool filters
 * @param maxRetries - Maximum retry attempts
 * @returns Array of pool data
 */
export async function fetchRaydiumPoolsWithRetry(connection, filters, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Add delay between retries (exponential backoff)
            if (attempt > 0) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.log(`Retry attempt ${attempt + 1} after ${delay}ms...`);
                await sleep(delay);
            }
            return await fetchRaydiumPools(connection, filters);
        }
        catch (error) {
            lastError = error;
            console.warn(`Attempt ${attempt + 1} failed:`, error);
            // Don't retry on certain errors
            if (error instanceof Error && error.message.includes("404")) {
                throw error;
            }
        }
    }
    throw lastError || new Error("Failed to fetch pools after retries");
}
