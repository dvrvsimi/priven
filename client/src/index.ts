/**
 * Priven SDK - Privacy-Preserving Pool Queries on Solana
 *
 * Query Raydium liquidity pools privately using Multi-Party Computation (MPC)
 * Powered by QuickNode RPC and Arcium MPC
 */

// Main client
export { PrivenClient, createPrivenClient } from "./client";

// Types
export type {
  Predicate,
  EncryptedPredicate,
  PoolData,
  QueryResult,
  QueryOptions,
  PoolFilters,
} from "./types";

// Encryption utilities
export { encryptPredicate, decryptResult } from "./encryption";

// Pool fetching (QuickNode integration)
export {
  fetchRaydiumPools,
  fetchRaydiumPoolsWithRetry,
  getMultiplePools,
  calculateTVL,
  RAYDIUM_V4_PROGRAM_ID,
  RAYDIUM_POOL_SIZE,
} from "./pools";

// Re-export commonly used Solana types
export { PublicKey, Connection, Keypair } from "@solana/web3.js";
