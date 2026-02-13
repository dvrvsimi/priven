/**
 * Priven SDK - Privacy-Preserving RPC Layer for Solana
 *
 * Query pools, token balances, ownership, and transaction history
 * privately using MagicBlock TEE
 */

// Main client
export { PrivenClient, createPrivenClient, PRIVEN_PROGRAM_ID } from "./client";

// Session-based API
export { PrivenSession } from "./session";

// @deprecated - use PRIVEN_PROGRAM_ID
export { PRIVEN_TEE_PROGRAM_ID } from "./constants";

// Types
export type {
  Predicate,
  Filter,
  EncryptedPredicate,
  QueryResult,
  QueryOptions,
  QueryStatus,
  QueryStateAccount,
  QuerySessionAccount,
  QueryConfigAccount,
  MerkleAnchorAccount,
  QueryExecutedEvent,
  QuerySubmittedEvent,
  SessionOpenedEvent,
  SessionClosedEvent,
  BatchAnchoredEvent,
} from "./types";

export {
  QueryType,
  FilterType,
  FilterOp,
  ENCRYPTED_PREDICATE_SIZE,
  MAX_FILTERS,
} from "./types";

// Encryption and query builders
export {
  encryptPredicate,
  decryptResult,
  generateKeyPair,
  createPredicate,
  createFilter,
  PredicateBuilder,
  createTokenBalanceQuery,
  createTokenOwnershipQuery,
  createTxLookupQuery,
} from "./encryption";

// TEE
export {
  createTeeSession,
  createTeeConnection,
  createBaseConnection,
  getTeeRpcUrl,
  isSessionValid,
  isDelegated,
  waitForCommit,
  DELEGATION_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGICBLOCK_RPC,
  TEE_VALIDATORS,
} from "./tee";
export type { TeeSession } from "./tee";

// Pool discovery
export {
  discoverCpmmPools,
  discoverCpmmPoolsWithRetry,
} from "./pools";
export type { CpmmDiscoveryOptions } from "./pools";

// Token discovery
export {
  discoverTokenAccounts,
  discoverTokenHolders,
  getTokenBalance,
  hasTokenBalance,
  getHolderCount,
  TOKEN_PROGRAM_ID,
} from "./tokens";
export type { TokenAccountInfo, TokenDiscoveryOptions } from "./tokens";

// Transaction lookup
export {
  getWalletTransactions,
  hasInteractedWithProgram,
  getInteractedPrograms,
  hasRecentActivity,
  getTransactionCount,
} from "./transactions";
export type { TransactionInfo, TxLookupOptions } from "./transactions";

// Constants
export {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_SIZE,
  QUERY_SEED,
  CONFIG_SEED,
  SESSION_SEED,
  ANCHOR_SEED,
  getTeeEcdhPublicKey,
} from "./constants";

// Re-export Solana types
export { PublicKey, Connection, Keypair } from "@solana/web3.js";
