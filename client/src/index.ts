/**
 * Priven SDK - Privacy-Preserving Pool Queries on Solana
 *
 * Query Raydium liquidity pools privately using MagicBlock TEE
 * Powered by QuickNode RPC and MagicBlock's Private Ephemeral Rollups
 */

// Main client
export { PrivenClient, createPrivenClient, PRIVEN_PROGRAM_ID, PRIVEN_TEE_PROGRAM_ID } from "./client";

// Types
export type {
  Predicate,
  PredicateV1,
  PredicateV2,
  Filter,
  EncryptedPredicate,
  PoolData,
  QueryResult,
  QueryOptions,
  PoolFilters,
} from "./types";

// Type guards and enums
export {
  FilterType,
  FilterOp,
  isPredicateV1,
  isPredicateV2,
  ENCRYPTED_PREDICATE_SIZE,
  ENCRYPTED_PREDICATE_SIZE_V1,
  MAX_FILTERS,
  FILTER_SIZE,
} from "./types";

// Encryption utilities
export {
  encryptPredicate,
  decryptResult,
  generateKeyPair,
  createTvlPredicate,
  createPredicate,
  createFilter,
  convertV1ToV2,
  PredicateBuilder,
} from "./encryption";

// TEE utilities
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

// Pool fetching (QuickNode integration)
export {
  fetchRaydiumPools,
  fetchRaydiumPoolsWithRetry,
  getMultiplePools,
  calculateTVL,
  RAYDIUM_V4_PROGRAM_ID,
  RAYDIUM_POOL_SIZE,
} from "./pools";

// Token account fetching (works on devnet)
export {
  fetchTokenAccounts,
  fetchTokenAccountsByOwner,
  fetchTokenAccountsWithRetry,
  toPoolData,
  TOKEN_PROGRAM_ID,
  KNOWN_MINTS,
} from "./tokens";
export type { TokenAccountData, TokenFilters } from "./tokens";

// Re-export commonly used Solana types
export { PublicKey, Connection, Keypair } from "@solana/web3.js";
