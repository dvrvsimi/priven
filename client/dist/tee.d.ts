/**
 * TEE Authentication and Communication Helpers
 *
 * Uses MagicBlock's ephemeral-rollups-sdk for TEE integration
 */
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
export declare const DELEGATION_PROGRAM_ID: PublicKey;
export declare const PERMISSION_PROGRAM_ID: PublicKey;
export declare const MAGIC_PROGRAM_ID: PublicKey;
export declare const MAGICBLOCK_RPC: {
    readonly devnet: "https://devnet.magicblock.app";
    readonly mainnet: "https://mainnet.magicblock.app";
    readonly tee: "https://tee.magicblock.app";
};
export declare const TEE_VALIDATORS: {
    readonly TEE: PublicKey;
    readonly US: PublicKey;
    readonly EU: PublicKey;
    readonly ASIA: PublicKey;
};
/**
 * TEE session with auth token
 */
export interface TeeSession {
    /** Base RPC endpoint (devnet/mainnet) */
    baseRpc: string;
    /** TEE RPC endpoint */
    teeRpc: string;
    /** Auth token for TEE access */
    token: string;
    /** Expiry timestamp */
    expiresAt: number;
    /** Whether TEE integrity is verified */
    verified: boolean;
}
/**
 * Create and authenticate a TEE session
 *
 * @param wallet - Wallet keypair for signing auth request
 * @param baseRpc - Base RPC endpoint (defaults to devnet)
 * @returns Authenticated TEE session
 */
export declare function createTeeSession(wallet: Keypair, baseRpc?: string): Promise<TeeSession>;
/**
 * Get TEE RPC URL with auth token
 */
export declare function getTeeRpcUrl(session: TeeSession): string;
/**
 * Check if session is still valid
 */
export declare function isSessionValid(session: TeeSession): boolean;
/**
 * Create a connection to the TEE RPC
 */
export declare function createTeeConnection(session: TeeSession): Connection;
/**
 * Create a connection to the base RPC (L1)
 */
export declare function createBaseConnection(session: TeeSession): Connection;
/**
 * Derive delegation buffer PDA
 */
export declare function deriveDelegationBufferPda(delegatedAccount: PublicKey): [PublicKey, number];
/**
 * Derive delegation record PDA
 */
export declare function deriveDelegationRecordPda(delegatedAccount: PublicKey): [PublicKey, number];
/**
 * Derive delegation metadata PDA
 */
export declare function deriveDelegationMetadataPda(delegatedAccount: PublicKey): [PublicKey, number];
/**
 * Check if an account is currently delegated
 */
export declare function isDelegated(connection: Connection, accountPubkey: PublicKey): Promise<boolean>;
/**
 * Wait for an account to appear on L1 (after commit)
 */
export declare function waitForCommit(connection: Connection, accountPubkey: PublicKey, timeoutMs?: number, pollIntervalMs?: number): Promise<boolean>;
//# sourceMappingURL=tee.d.ts.map