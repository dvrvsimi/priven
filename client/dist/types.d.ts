import { PublicKey, Commitment } from "@solana/web3.js";
/**
 * User's search criteria for pool queries
 * These values are encrypted and evaluated privately in TEE
 */
export interface Predicate {
    /** Minimum TVL in lamports (token_a_reserve + token_b_reserve) */
    minTvl: bigint;
    /** Maximum TVL in lamports */
    maxTvl: bigint;
}
/**
 * Encrypted predicate ready for submission to TEE
 */
export interface EncryptedPredicate {
    /** Encrypted ciphertext - 44 bytes (16 ct + 12 nonce + 16 tag) */
    ciphertext: Uint8Array;
    /** Ephemeral X25519 public key for encryption (32 bytes) */
    publicKey: Uint8Array;
    /** User's ephemeral X25519 private key (PKCS8 format) for decryption */
    privateKey: Uint8Array;
}
/**
 * Pool data structure matching the on-chain PoolData
 */
export interface PoolData {
    /** Pool account address */
    address: PublicKey;
    /** Token A reserve amount in lamports */
    tokenAReserve: bigint;
    /** Token B reserve amount in lamports */
    tokenBReserve: bigint;
}
/**
 * Decrypted query results from TEE
 */
export interface QueryResult {
    /** Array of matching pool addresses (up to 5 pools) */
    matches: PublicKey[];
    /** Number of pools that matched the predicate */
    matchCount: number;
}
/**
 * Options for configuring query execution
 */
export interface QueryOptions {
    /** QuickNode RPC endpoint URL */
    rpcUrl?: string;
    /** Transaction confirmation commitment level */
    commitment?: Commitment;
    /** Maximum number of pools to query (default: 5) */
    maxPools?: number;
    /** Timeout in milliseconds for TEE execution (default: 30000) */
    timeout?: number;
    /** Skip delegation step (if account is already delegated) */
    skipDelegation?: boolean;
}
/**
 * Filters for fetching Raydium pools from QuickNode
 */
export interface PoolFilters {
    /** Filter by pool status (1 = active) */
    status?: number;
    /** Filter by specific token mint address */
    tokenMint?: PublicKey;
    /** Minimum TVL to fetch (pre-filter before TEE) */
    minTvlPrefilter?: bigint;
}
/**
 * Query state status values
 */
export declare enum QueryStatus {
    /** Query created, not yet delegated */
    Pending = 0,
    /** Delegated to TEE, waiting for execution */
    Delegated = 1,
    /** TEE is processing */
    Executing = 2,
    /** Result committed to L1 */
    Completed = 3,
    /** Execution failed */
    Failed = 4
}
/**
 * On-chain QueryState account structure (for parsing)
 */
export interface QueryStateAccount {
    /** Owner wallet pubkey */
    owner: PublicKey;
    /** Unique query identifier */
    queryId: bigint;
    /** Encrypted predicate (44 bytes) */
    encryptedPredicate: Uint8Array;
    /** User's ephemeral public key */
    userPubkey: Uint8Array;
    /** Query status */
    status: QueryStatus;
    /** Pool addresses to query */
    poolAddresses: PublicKey[];
    /** Number of valid pool addresses */
    poolCount: number;
    /** Timestamp when query was submitted */
    submittedAt: bigint;
    /** PDA bump */
    bump: number;
}
/**
 * On-chain QueryResult account structure (for parsing)
 */
export interface QueryResultAccount {
    /** Owner wallet pubkey */
    owner: PublicKey;
    /** Query ID this result corresponds to */
    queryId: bigint;
    /** Encrypted result */
    encryptedResult: Uint8Array;
    /** Actual length of encrypted data */
    encryptedLen: number;
    /** Slot when result was committed */
    completedSlot: bigint;
    /** Whether execution succeeded */
    success: boolean;
    /** PDA bump */
    bump: number;
}
/**
 * Program configuration account
 */
export interface QueryConfigAccount {
    /** Admin pubkey */
    admin: PublicKey;
    /** TEE validator pubkey */
    teeValidator: PublicKey;
    /** Maximum pools per query */
    maxPools: number;
    /** Query fee in lamports */
    queryFee: bigint;
    /** PDA bump */
    bump: number;
}
//# sourceMappingURL=types.d.ts.map