/**
 * Centralized Constants for Priven
 *
 * Single source of truth for all program IDs, RPC endpoints, and configuration.
 * Import from this file instead of hardcoding values elsewhere.
 */
import { PublicKey } from "@solana/web3.js";
/** Priven Program ID */
export declare const PRIVEN_PROGRAM_ID: PublicKey;
/** String version for contexts requiring string */
export declare const PRIVEN_PROGRAM_ID_STRING: string;
/** @deprecated Use PRIVEN_PROGRAM_ID instead */
export declare const PRIVEN_TEE_PROGRAM_ID: PublicKey;
/** MagicBlock Delegation Program ID */
export declare const DELEGATION_PROGRAM_ID: PublicKey;
/** String version for filter functions */
export declare const DELEGATION_PROGRAM_ID_STRING: string;
/** MagicBlock Permission Program ID */
export declare const PERMISSION_PROGRAM_ID: PublicKey;
/** MagicBlock Magic Program ID */
export declare const MAGIC_PROGRAM_ID: PublicKey;
/** TEE Validators (from MagicBlock docs) */
export declare const TEE_VALIDATORS: {
    /** Default TEE validator */
    readonly TEE: PublicKey;
    /** US region validator */
    readonly US: PublicKey;
    /** EU region validator */
    readonly EU: PublicKey;
    /** Asia region validator */
    readonly ASIA: PublicKey;
};
/** QuickNode RPC Endpoints */
export declare const QUICKNODE_RPC: {
    /** Devnet endpoint (from env or default) */
    readonly devnet: string;
    /** Mainnet endpoint (from env or default) */
    readonly mainnet: string;
};
/** MagicBlock RPC Endpoints */
export declare const MAGICBLOCK_RPC: {
    /** Devnet MagicBlock RPC */
    readonly devnet: string;
    /** Mainnet MagicBlock RPC */
    readonly mainnet: string;
    /** TEE-specific RPC (for auth) */
    readonly tee: "https://tee.magicblock.app";
};
/** SPL Token Program ID */
export declare const TOKEN_PROGRAM_ID: PublicKey;
/** Token Program ID as string */
export declare const TOKEN_PROGRAM_ID_STRING: string;
/**
 * Raydium V4 AMM Program ID (Mainnet)
 * Devnet: HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8
 */
export declare const RAYDIUM_V4_PROGRAM_ID: PublicKey;
/** Raydium V4 pool account size (bytes) */
export declare const RAYDIUM_POOL_SIZE = 752;
/** QuickNode API base URL */
export declare const QUICKNODE_API_BASE = "https://api.quicknode.com";
/** QuickNode Streams API key (from env) */
export declare const QUICKNODE_API_KEY: string;
/** QuickNode Webhook URL (from env) */
export declare const QUICKNODE_WEBHOOK_URL: string;
/** Query state PDA seed */
export declare const QUERY_SEED: Buffer<ArrayBuffer>;
/** Query result PDA seed */
export declare const RESULT_SEED: Buffer<ArrayBuffer>;
/** Config PDA seed */
export declare const CONFIG_SEED: Buffer<ArrayBuffer>;
/** Current network (devnet or mainnet) */
export declare const SOLANA_CLUSTER: "devnet" | "mainnet";
/** Get the appropriate RPC URL for the current cluster */
export declare function getRpcUrl(cluster?: "devnet" | "mainnet"): string;
/** Get the appropriate MagicBlock RPC for the current cluster */
export declare function getMagicBlockRpc(cluster?: "devnet" | "mainnet"): string;
/** Get the TEE RPC endpoint */
export declare function getTeeRpc(): string;
//# sourceMappingURL=constants.d.ts.map