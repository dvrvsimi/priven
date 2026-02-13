import { PublicKey } from "@solana/web3.js";

// ============================================================================
// QUERY TYPES
// ============================================================================

/** Query type discriminator - determines how predicate is evaluated */
export enum QueryType {
  CPMM_POOLS = 0,       // Raydium CPMM pool queries
  TOKEN_BALANCE = 1,    // Token balance threshold queries
  TOKEN_OWNERSHIP = 2,  // Token holder queries
  TX_LOOKUP = 3,        // Transaction/program interaction queries
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/** Filter types for predicate evaluation */
export enum FilterType {
  // CPMM Pool filters (0-15)
  TOKEN_MINT_0 = 0,
  TOKEN_MINT_1 = 1,
  AMM_CONFIG = 2,
  STATUS = 3,
  RESERVE_0 = 4,
  RESERVE_1 = 5,
  TVL = 6,
  LP_SUPPLY = 7,
  OPEN_TIME = 8,

  // Token filters (16-31)
  TOKEN_MINT = 16,      // Token mint to query
  MIN_BALANCE = 17,     // Minimum balance threshold
  MAX_BALANCE = 18,     // Maximum balance threshold
  HOLDER_COUNT = 19,    // For ownership queries

  // Transaction filters (32-47)
  WALLET_ADDRESS = 32,  // Wallet to check history for
  PROGRAM_ID = 33,      // Program to check interaction with
  AFTER_SLOT = 34,      // Only txs after this slot
  BEFORE_SLOT = 35,     // Only txs before this slot
}

/** Filter comparison operations */
export enum FilterOp {
  GTE = 0,
  LTE = 1,
  EQ = 2,
  NEQ = 3,
}

/** Single filter in predicate */
export interface Filter {
  type: FilterType;
  op: FilterOp;
  value: bigint;
}

/** Predicate with flexible filters (max 4) */
export interface Predicate {
  queryType?: QueryType;  // Query type discriminator (default: CPMM_POOLS for backward compat)
  filters: Filter[];
}

/** Encrypted predicate size: 80 bytes */
export const ENCRYPTED_PREDICATE_SIZE = 80;

/** Maximum filters in predicate */
export const MAX_FILTERS = 4;

/** Encrypted predicate for TEE submission */
export interface EncryptedPredicate {
  ciphertext: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/** Decrypted query result from TEE */
export interface QueryResult {
  matches: PublicKey[];
  matchCount: number;
}

/** Query execution options */
export interface QueryOptions {
  mainnetRpc?: string;
  maxPools?: number;
  timeout?: number;
  skipDelegation?: boolean;
}

/** Query state status */
export enum QueryStatus {
  Pending = 0,
  Delegated = 1,
  Completed = 2,
  Failed = 3,
}

// ============================================================================
// ACCOUNT TYPES
// ============================================================================

/** QueryConfig account structure */
export interface QueryConfigAccount {
  admin: PublicKey;
  teeValidator: PublicKey;
  maxPools: number;
  queryFee: bigint;
  totalQueries: bigint;
  bump: number;
}

/** QuerySession account structure */
export interface QuerySessionAccount {
  owner: PublicKey;
  sessionId: bigint;
  createdAt: bigint;
  lastQueryAt: bigint;
  queryCount: bigint;
  bump: number;
}

/** QueryState account structure */
export interface QueryStateAccount {
  owner: PublicKey;
  sessionId: bigint;
  queryId: bigint;
  encryptedPredicate: Uint8Array;
  userPubkey: Uint8Array;
  status: QueryStatus;
  poolAddresses: PublicKey[];
  poolCount: number;
  submittedAt: bigint;
  bump: number;
}

/** MerkleAnchor account structure */
export interface MerkleAnchorAccount {
  authority: PublicKey;
  latestRoot: Uint8Array;
  queryCount: bigint;
  anchorSlot: bigint;
  epoch: bigint;
  bump: number;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/** SessionOpened event */
export interface SessionOpenedEvent {
  sessionId: bigint;
  owner: PublicKey;
}

/** SessionClosed event */
export interface SessionClosedEvent {
  sessionId: bigint;
  owner: PublicKey;
  queryCount: bigint;
}

/** QuerySubmitted event */
export interface QuerySubmittedEvent {
  sessionId: bigint;
  queryId: bigint;
  owner: PublicKey;
  poolCount: number;
}

/** QueryExecuted event */
export interface QueryExecutedEvent {
  sessionId: bigint;
  queryId: bigint;
  owner: PublicKey;
  success: boolean;
  matchCount: number;
  encryptedResult: Uint8Array;
  resultHash: Uint8Array;
}

/** QueryClosed event */
export interface QueryClosedEvent {
  queryId: bigint;
  owner: PublicKey;
}

/** BatchAnchored event */
export interface BatchAnchoredEvent {
  epoch: bigint;
  merkleRoot: Uint8Array;
  queryCount: bigint;
  slot: bigint;
}
