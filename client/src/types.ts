import { PublicKey, Commitment } from "@solana/web3.js";

// ============================================================================
// PREDICATE V2 TYPES (Flexible Filters)
// ============================================================================

/**
 * Filter types for predicate evaluation (matches Rust FilterType enum)
 */
export enum FilterType {
  TVL = 0,
  BALANCE = 1,
  VOLUME_24H = 2,
  FEE_RATE = 3,
  PRICE = 4,
  APY = 5,
  RESERVE_A = 6,
  RESERVE_B = 7,
  RATIO = 8,
  MINT = 9,
  PROGRAM = 10,
  SLOT_AGE = 11,
}

/**
 * Filter comparison operations (matches Rust FilterOp enum)
 */
export enum FilterOp {
  GTE = 0, // >=
  LTE = 1, // <=
  EQ = 2, // ==
  NEQ = 3, // !=
}

/**
 * Single filter in V2 predicate (11 bytes when serialized)
 */
export interface Filter {
  /** Filter type (what field to compare) */
  type: FilterType;

  /** Comparison operation */
  op: FilterOp;

  /** Reserved field for future use (default: 0) */
  field?: number;

  /** Value to compare against */
  value: bigint;
}

/**
 * Legacy V1 predicate - simple min/max TVL range
 * @deprecated Use PredicateV2 for more flexibility
 */
export interface PredicateV1 {
  /** Minimum TVL in lamports (token_a_reserve + token_b_reserve) */
  minTvl: bigint;

  /** Maximum TVL in lamports */
  maxTvl: bigint;
}

/**
 * V2 predicate with flexible filters (max 4 filters)
 *
 * Serialized format: [version: u8][filter_count: u8][filters: Filter[]]
 * Each filter: [type: u8][op: u8][field: u8][value: u64] = 11 bytes
 * Total: 2 + (11 * 4) = 46 bytes plaintext -> 80 bytes encrypted
 */
export interface PredicateV2 {
  /** Version marker (always 2) */
  version: 2;

  /** Array of filters to apply (AND logic, max 4) */
  filters: Filter[];
}

/**
 * Union type for both predicate versions
 */
export type Predicate = PredicateV1 | PredicateV2;

/**
 * Type guard to check if predicate is V2
 */
export function isPredicateV2(predicate: Predicate): predicate is PredicateV2 {
  return "version" in predicate && predicate.version === 2;
}

/**
 * Type guard to check if predicate is V1 (legacy)
 */
export function isPredicateV1(predicate: Predicate): predicate is PredicateV1 {
  return "minTvl" in predicate && "maxTvl" in predicate && !("version" in predicate);
}

/** Encrypted predicate size for V1 (legacy): 16 bytes plaintext + 12 nonce + 16 tag = 44 bytes */
export const ENCRYPTED_PREDICATE_SIZE_V1 = 44;

/** Encrypted predicate size for V2: 46 bytes plaintext + padding + 12 nonce + 16 tag = 80 bytes */
export const ENCRYPTED_PREDICATE_SIZE = 80;

/** Maximum filters in V2 predicate */
export const MAX_FILTERS = 4;

/** Size of each filter when serialized */
export const FILTER_SIZE = 11;

/**
 * Encrypted predicate ready for submission to TEE
 */
export interface EncryptedPredicate {
  /** Encrypted ciphertext - 80 bytes for V2 (padded plaintext + 12 nonce + 16 tag) */
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
  /** Mainnet RPC for fetching Raydium pools */
  mainnetRpc?: string;

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
export enum QueryStatus {
  /** Query created, not yet delegated */
  Pending = 0,
  /** Delegated to TEE, waiting for execution */
  Delegated = 1,
  /** TEE is processing */
  Executing = 2,
  /** Result committed to L1 */
  Completed = 3,
  /** Execution failed */
  Failed = 4,
}

/**
 * On-chain QueryState account structure (for parsing)
 */
export interface QueryStateAccount {
  /** Owner wallet pubkey */
  owner: PublicKey;
  /** Unique query identifier */
  queryId: bigint;
  /** Encrypted predicate (80 bytes for V2, 44 bytes for V1 legacy) */
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
