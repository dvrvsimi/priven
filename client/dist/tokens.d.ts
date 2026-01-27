/**
 * SPL Token Account Fetching for Priven
 *
 * Fetches token accounts via QuickNode RPC for use in private queries.
 * Works on both devnet and mainnet (unlike Raydium V4 which is mainnet-only).
 *
 * Privacy angle: The predicate filters by balance threshold, which reveals
 * trading intent (e.g., "show me accounts with >10K tokens" = accumulation).
 * TEE execution hides this threshold from observers.
 */
import { Connection, PublicKey, Commitment } from "@solana/web3.js";
import type { PoolData } from "./types";
/**
 * SPL Token Program ID
 */
export declare const TOKEN_PROGRAM_ID: PublicKey;
/**
 * SPL Token account size (165 bytes)
 */
export declare const TOKEN_ACCOUNT_SIZE = 165;
/**
 * Filters for fetching token accounts
 */
export interface TokenFilters {
    /** Filter by token mint */
    mint?: PublicKey;
    /** Filter by owner wallet */
    owner?: PublicKey;
    /** Minimum balance to include (client-side filter) */
    minBalance?: bigint;
}
/**
 * Token account data with balance
 */
export interface TokenAccountData {
    /** Token account address */
    address: PublicKey;
    /** Token mint */
    mint: PublicKey;
    /** Owner wallet */
    owner: PublicKey;
    /** Token balance */
    balance: bigint;
}
/**
 * Fetch SPL Token accounts from QuickNode RPC
 *
 * Maps token accounts to PoolData format for compatibility with Priven:
 * - address = token account pubkey
 * - tokenAReserve = token balance
 * - tokenBReserve = 0 (unused)
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param filters - Optional filters
 * @param commitment - Confirmation level
 * @returns Array of token accounts as PoolData
 */
export declare function fetchTokenAccounts(connection: Connection, filters?: TokenFilters, commitment?: Commitment): Promise<PoolData[]>;
/**
 * Fetch token accounts by owner using getTokenAccountsByOwner
 *
 * Faster than getProgramAccounts when filtering by owner.
 *
 * @param connection - Solana connection
 * @param owner - Owner wallet public key
 * @param mint - Optional: filter by specific mint
 * @param commitment - Confirmation level
 * @returns Array of token accounts
 */
export declare function fetchTokenAccountsByOwner(connection: Connection, owner: PublicKey, mint?: PublicKey, commitment?: Commitment): Promise<TokenAccountData[]>;
/**
 * Convert TokenAccountData to PoolData format
 */
export declare function toPoolData(account: TokenAccountData): PoolData;
/**
 * Fetch token accounts with retry logic
 */
export declare function fetchTokenAccountsWithRetry(connection: Connection, filters?: TokenFilters, maxRetries?: number): Promise<PoolData[]>;
/**
 * Well-known token mints for testing
 */
export declare const KNOWN_MINTS: {
    /** Wrapped SOL (exists on all networks) */
    WSOL: PublicKey;
    /** USDC on mainnet */
    USDC_MAINNET: PublicKey;
    /** USDC-Dev on devnet */
    USDC_DEVNET: PublicKey;
};
//# sourceMappingURL=tokens.d.ts.map