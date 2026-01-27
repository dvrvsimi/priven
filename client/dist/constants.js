"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOLANA_CLUSTER = exports.CONFIG_SEED = exports.RESULT_SEED = exports.QUERY_SEED = exports.QUICKNODE_WEBHOOK_URL = exports.QUICKNODE_API_KEY = exports.QUICKNODE_API_BASE = exports.RAYDIUM_POOL_SIZE = exports.RAYDIUM_V4_PROGRAM_ID = exports.TOKEN_PROGRAM_ID_STRING = exports.TOKEN_PROGRAM_ID = exports.MAGICBLOCK_RPC = exports.QUICKNODE_RPC = exports.TEE_VALIDATORS = exports.MAGIC_PROGRAM_ID = exports.PERMISSION_PROGRAM_ID = exports.DELEGATION_PROGRAM_ID_STRING = exports.DELEGATION_PROGRAM_ID = exports.PRIVEN_TEE_PROGRAM_ID = exports.PRIVEN_PROGRAM_ID_STRING = exports.PRIVEN_PROGRAM_ID = void 0;
exports.getRpcUrl = getRpcUrl;
exports.getMagicBlockRpc = getMagicBlockRpc;
exports.getTeeRpc = getTeeRpc;
/**
 * Centralized Constants for Priven
 *
 * Single source of truth for all program IDs, RPC endpoints, and configuration.
 * Import from this file instead of hardcoding values elsewhere.
 */
const web3_js_1 = require("@solana/web3.js");
// ============================================================================
// PRIVEN PROGRAM
// ============================================================================
/** Priven Program ID */
exports.PRIVEN_PROGRAM_ID = new web3_js_1.PublicKey(process.env.PRIVEN_PROGRAM_ID || process.env.PRIVEN_TEE_PROGRAM_ID || "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM");
/** String version for contexts requiring string */
exports.PRIVEN_PROGRAM_ID_STRING = process.env.PRIVEN_PROGRAM_ID || process.env.PRIVEN_TEE_PROGRAM_ID || "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM";
/** @deprecated Use PRIVEN_PROGRAM_ID instead */
exports.PRIVEN_TEE_PROGRAM_ID = exports.PRIVEN_PROGRAM_ID;
// ============================================================================
// MAGICBLOCK PROGRAMS
// ============================================================================
/** MagicBlock Delegation Program ID */
exports.DELEGATION_PROGRAM_ID = new web3_js_1.PublicKey(process.env.DELEGATION_PROGRAM_ID || "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
/** String version for filter functions */
exports.DELEGATION_PROGRAM_ID_STRING = process.env.DELEGATION_PROGRAM_ID || "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
/** MagicBlock Permission Program ID */
exports.PERMISSION_PROGRAM_ID = new web3_js_1.PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
/** MagicBlock Magic Program ID */
exports.MAGIC_PROGRAM_ID = new web3_js_1.PublicKey("Magic11111111111111111111111111111111111111");
// ============================================================================
// TEE VALIDATORS
// ============================================================================
/** TEE Validators (from MagicBlock docs) */
exports.TEE_VALIDATORS = {
    /** Default TEE validator */
    TEE: new web3_js_1.PublicKey(process.env.TEE_VALIDATOR_DEVNET || "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
    /** US region validator */
    US: new web3_js_1.PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
    /** EU region validator */
    EU: new web3_js_1.PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
    /** Asia region validator */
    ASIA: new web3_js_1.PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
};
// ============================================================================
// RPC ENDPOINTS
// ============================================================================
/** QuickNode RPC Endpoints */
exports.QUICKNODE_RPC = {
    /** Devnet endpoint (from env or default) */
    devnet: process.env.QUICKNODE_DEVNET_RPC || "https://api.devnet.solana.com",
    /** Mainnet endpoint (from env or default) */
    mainnet: process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com",
};
/** MagicBlock RPC Endpoints */
exports.MAGICBLOCK_RPC = {
    /** Devnet MagicBlock RPC */
    devnet: process.env.TEE_RPC_DEVNET || "https://devnet.magicblock.app",
    /** Mainnet MagicBlock RPC */
    mainnet: process.env.TEE_RPC_MAINNET || "https://mainnet.magicblock.app",
    /** TEE-specific RPC (for auth) */
    tee: "https://tee.magicblock.app",
};
// ============================================================================
// TOKEN PROGRAMS
// ============================================================================
/** SPL Token Program ID */
exports.TOKEN_PROGRAM_ID = new web3_js_1.PublicKey(process.env.TOKEN_PROGRAM_ID || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
/** Token Program ID as string */
exports.TOKEN_PROGRAM_ID_STRING = process.env.TOKEN_PROGRAM_ID || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// ============================================================================
// RAYDIUM
// ============================================================================
/**
 * Raydium V4 AMM Program ID (Mainnet)
 * Devnet: HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8
 */
exports.RAYDIUM_V4_PROGRAM_ID = new web3_js_1.PublicKey(process.env.RAYDIUM_AMM_V4_PROGRAM_ID || "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
/** Raydium V4 pool account size (bytes) */
exports.RAYDIUM_POOL_SIZE = 752;
// ============================================================================
// QUICKNODE STREAMS
// ============================================================================
/** QuickNode API base URL */
exports.QUICKNODE_API_BASE = "https://api.quicknode.com";
/** QuickNode Streams API key (from env) */
exports.QUICKNODE_API_KEY = process.env.QUICKNODE_API_KEY || "";
/** QuickNode Webhook URL (from env) */
exports.QUICKNODE_WEBHOOK_URL = process.env.QUICKNODE_WEBHOOK_URL || "";
// ============================================================================
// PRIVEN SEEDS
// ============================================================================
/** Query state PDA seed */
exports.QUERY_SEED = Buffer.from("query");
/** Query result PDA seed */
exports.RESULT_SEED = Buffer.from("result");
/** Config PDA seed */
exports.CONFIG_SEED = Buffer.from("config");
// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================
/** Current network (devnet or mainnet) */
exports.SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || "devnet";
/** Get the appropriate RPC URL for the current cluster */
function getRpcUrl(cluster = exports.SOLANA_CLUSTER) {
    return cluster === "mainnet" ? exports.QUICKNODE_RPC.mainnet : exports.QUICKNODE_RPC.devnet;
}
/** Get the appropriate MagicBlock RPC for the current cluster */
function getMagicBlockRpc(cluster = exports.SOLANA_CLUSTER) {
    return cluster === "mainnet" ? exports.MAGICBLOCK_RPC.mainnet : exports.MAGICBLOCK_RPC.devnet;
}
/** Get the TEE RPC endpoint */
function getTeeRpc() {
    return exports.MAGICBLOCK_RPC.tee;
}
