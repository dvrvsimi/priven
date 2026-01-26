import { Connection, PublicKey, AccountInfo, Commitment } from "@solana/web3.js";
import type { PoolData, PoolFilters } from "./types";
/**
 * Raydium V4 AMM Program ID (Mainnet)
 * Devnet: HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8
 */
export declare const RAYDIUM_V4_PROGRAM_ID: PublicKey;
/**
 * Raydium V4 pool account size (bytes)
 * V4 AMM pools are exactly 752 bytes
 */
export declare const RAYDIUM_POOL_SIZE = 752;
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
export declare function fetchRaydiumPools(connection: Connection, filters?: PoolFilters, commitment?: Commitment): Promise<PoolData[]>;
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
export declare function getMultiplePools(connection: Connection, poolAddresses: PublicKey[], commitment?: Commitment): Promise<PoolData[]>;
/**
 * Extract vault pubkeys from Raydium pool for fetching actual balances
 *
 * @param accountInfo - Pool account data
 * @returns Base and quote vault pubkeys
 */
export declare function extractVaultPubkeys(accountInfo: AccountInfo<Buffer>): {
    baseVault: PublicKey;
    quoteVault: PublicKey;
} | null;
/**
 * Fetch pools with actual vault balances (more accurate TVL)
 *
 * This makes additional RPC calls to fetch vault token balances
 * Use for higher accuracy when pool count is small
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param pools - Pools from fetchRaydiumPools
 * @returns Pools with accurate reserve amounts
 */
export declare function enrichPoolsWithVaultBalances(connection: Connection, pools: Array<{
    address: PublicKey;
    accountInfo: AccountInfo<Buffer>;
}>): Promise<PoolData[]>;
/**
 * Calculate TVL from pool reserves
 *
 * @param pool - Pool data
 * @returns Total value locked (sum of reserves)
 */
export declare function calculateTVL(pool: PoolData): bigint;
/**
 * Rate limiter for QuickNode requests
 * QuickNode allows ~3 requests per second
 *
 * @param ms - Milliseconds to wait
 */
export declare function sleep(ms: number): Promise<void>;
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
export declare function fetchRaydiumPoolsWithRetry(connection: Connection, filters?: PoolFilters, maxRetries?: number): Promise<PoolData[]>;
//# sourceMappingURL=pools.d.ts.map