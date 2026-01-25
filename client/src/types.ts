import { PublicKey, Commitment } from "@solana/web3.js";

/**
 * User's search criteria for pool queries
 * These values are encrypted and evaluated privately in MPC
 */
export interface Predicate {
  /** Minimum TVL in lamports (token_a_reserve + token_b_reserve) */
  minTvl: bigint;

  /** Maximum TVL in lamports */
  maxTvl: bigint;
}

/**
 * Encrypted predicate ready for submission to MPC
 */
export interface EncryptedPredicate {
  /** Encrypted ciphertext - always exactly 32 bytes (Arcium requirement) */
  ciphertext: Uint8Array;

  /** Ephemeral x25519 public key for encryption (32 bytes) */
  publicKey: Uint8Array;

  /** Random nonce for encryption (u128) */
  nonce: bigint;
}

/**
 * Pool data structure matching the circuit's PoolData
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
 * Decrypted query results from MPC
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

  /** Timeout in milliseconds for MPC computation (default: 90000) */
  timeout?: number;
}

/**
 * Filters for fetching Raydium pools from QuickNode
 */
export interface PoolFilters {
  /** Filter by pool status (1 = active) */
  status?: number;

  /** Filter by specific token mint address */
  tokenMint?: PublicKey;

  /** Minimum TVL to fetch (pre-filter before MPC) */
  minTvlPrefilter?: bigint;
}
