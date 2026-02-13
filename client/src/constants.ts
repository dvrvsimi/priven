/**
 * Centralized Constants for Priven
 *
 * Single source of truth for all program IDs, RPC endpoints, and configuration.
 * Import from this file instead of hardcoding values elsewhere.
 */
import { PublicKey } from "@solana/web3.js";

// ============================================================================
// PRIVEN PROGRAM
// ============================================================================

/** Priven Program ID */
export const PRIVEN_PROGRAM_ID = new PublicKey(
  process.env.PRIVEN_PROGRAM_ID || process.env.PRIVEN_TEE_PROGRAM_ID || "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM"
);

/** String version for contexts requiring string */
export const PRIVEN_PROGRAM_ID_STRING =
  process.env.PRIVEN_PROGRAM_ID || process.env.PRIVEN_TEE_PROGRAM_ID || "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM";

/** @deprecated Use PRIVEN_PROGRAM_ID instead */
export const PRIVEN_TEE_PROGRAM_ID = PRIVEN_PROGRAM_ID;

// ============================================================================
// MAGICBLOCK PROGRAMS
// ============================================================================

/** MagicBlock Delegation Program ID */
export const DELEGATION_PROGRAM_ID = new PublicKey(
  process.env.DELEGATION_PROGRAM_ID || "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

/** String version for filter functions */
export const DELEGATION_PROGRAM_ID_STRING =
  process.env.DELEGATION_PROGRAM_ID || "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";

/** MagicBlock Permission Program ID */
export const PERMISSION_PROGRAM_ID = new PublicKey(
  "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
);

/** MagicBlock Magic Program ID */
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);

// ============================================================================
// TEE VALIDATORS
// ============================================================================

/** TEE Validators - Solana identity keys (Ed25519) for on-chain verification */
export const TEE_VALIDATORS = {
  /** Default TEE validator */
  TEE: new PublicKey(
    process.env.TEE_VALIDATOR_DEVNET || "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"
  ),
  /** US region validator */
  US: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  /** EU region validator */
  EU: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  /** Asia region validator */
  ASIA: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
} as const;

/**
 * TEE ECDH Public Key (X25519) for encryption
 *
 * This is DIFFERENT from the validator identity key (Ed25519).
 * X25519 is used for ECDH key exchange in AES-256-GCM encryption.
 *
 * In production, this should be the TEE's published X25519 public key.
 * For testing, generate a keypair and set TEE_ECDH_PUBKEY_HEX env var.
 */
export function getTeeEcdhPublicKey(): Uint8Array {
  const hexKey = process.env.TEE_ECDH_PUBKEY_HEX;
  if (hexKey) {
    return Uint8Array.from(Buffer.from(hexKey, "hex"));
  }
  // Fallback: Return zeros to indicate unconfigured (will fail encryption clearly)
  console.warn("TEE_ECDH_PUBKEY_HEX not set - encryption will fail");
  return new Uint8Array(32);
}

// ============================================================================
// RPC ENDPOINTS
// ============================================================================

/** QuickNode RPC Endpoints */
export const QUICKNODE_RPC = {
  /** Devnet endpoint (from env or default) */
  devnet:
    process.env.QUICKNODE_DEVNET_RPC || "https://api.devnet.solana.com",
  /** Mainnet endpoint (from env or default) */
  mainnet:
    process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com",
} as const;

/** MagicBlock RPC Endpoints */
export const MAGICBLOCK_RPC = {
  /** Devnet MagicBlock RPC */
  devnet: process.env.TEE_RPC_DEVNET || "https://devnet.magicblock.app",
  /** Mainnet MagicBlock RPC */
  mainnet: process.env.TEE_RPC_MAINNET || "https://mainnet.magicblock.app",
  /** TEE-specific RPC (for auth) */
  tee: "https://tee.magicblock.app",
} as const;

// ============================================================================
// TOKEN PROGRAMS
// ============================================================================

/** SPL Token Program ID */
export const TOKEN_PROGRAM_ID = new PublicKey(
  process.env.TOKEN_PROGRAM_ID || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

/** Token Program ID as string */
export const TOKEN_PROGRAM_ID_STRING =
  process.env.TOKEN_PROGRAM_ID || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// ============================================================================
// RAYDIUM CPMM
// ============================================================================

/** Raydium CPMM Program ID */
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  process.env.RAYDIUM_CPMM_PROGRAM_ID || "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);

/** CPMM PoolState account size (bytes) - verified on mainnet */
export const CPMM_POOL_SIZE = 637;

// ============================================================================
// QUICKNODE STREAMS
// ============================================================================

/** QuickNode API base URL */
export const QUICKNODE_API_BASE = "https://api.quicknode.com";

/** QuickNode Streams API key (from env) */
export const QUICKNODE_API_KEY = process.env.QUICKNODE_API_KEY || "";

/** QuickNode Webhook URL (from env) */
export const QUICKNODE_WEBHOOK_URL = process.env.QUICKNODE_WEBHOOK_URL || "";

// ============================================================================
// PRIVEN SEEDS
// ============================================================================

/** Query state PDA seed */
export const QUERY_SEED = Buffer.from("query");

/** Config PDA seed */
export const CONFIG_SEED = Buffer.from("config");

/** Session PDA seed */
export const SESSION_SEED = Buffer.from("session");

/** Merkle anchor PDA seed */
export const ANCHOR_SEED = Buffer.from("anchor");

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

/** Current network (devnet or mainnet) */
export const SOLANA_CLUSTER =
  (process.env.SOLANA_CLUSTER as "devnet" | "mainnet") || "devnet";

/** Get the appropriate RPC URL for the current cluster */
export function getRpcUrl(cluster: "devnet" | "mainnet" = SOLANA_CLUSTER): string {
  return cluster === "mainnet" ? QUICKNODE_RPC.mainnet : QUICKNODE_RPC.devnet;
}

/** Get the appropriate MagicBlock RPC for the current cluster */
export function getMagicBlockRpc(
  cluster: "devnet" | "mainnet" = SOLANA_CLUSTER
): string {
  return cluster === "mainnet" ? MAGICBLOCK_RPC.mainnet : MAGICBLOCK_RPC.devnet;
}

/** Get the TEE RPC endpoint */
export function getTeeRpc(): string {
  return MAGICBLOCK_RPC.tee;
}
