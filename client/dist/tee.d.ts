/**
 * TEE Authentication and Communication Helpers
 *
 * Uses MagicBlock's ephemeral-rollups-sdk for TEE integration.
 * Implements proper auth token handling with refresh mechanism.
 */
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID, PERMISSION_PROGRAM_ID, MAGIC_PROGRAM_ID, MAGICBLOCK_RPC, TEE_VALIDATORS } from "./constants";
export { DELEGATION_PROGRAM_ID, PERMISSION_PROGRAM_ID, MAGIC_PROGRAM_ID, MAGICBLOCK_RPC, TEE_VALIDATORS, };
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
    /** Wallet used to create this session (for refresh) */
    walletPublicKey: string;
}
/**
 * Error thrown when TEE authentication fails
 */
export declare class TeeAuthError extends Error {
    readonly cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
/**
 * Create and authenticate a TEE session
 *
 * @param wallet - Wallet keypair for signing auth request
 * @param baseRpc - Base RPC endpoint (defaults to devnet)
 * @param options - Optional configuration
 * @returns Authenticated TEE session
 * @throws TeeAuthError if authentication fails after retries
 */
export declare function createTeeSession(wallet: Keypair, baseRpc?: string, options?: {
    skipIntegrityCheck?: boolean;
    maxRetries?: number;
}): Promise<TeeSession>;
/**
 * Refresh a TEE session if it's expired or about to expire
 *
 * @param session - Current session
 * @param wallet - Wallet keypair for signing
 * @returns New or existing session
 */
export declare function refreshSessionIfNeeded(session: TeeSession, wallet: Keypair): Promise<TeeSession>;
/**
 * Validate that a session is still usable
 *
 * @param session - Session to validate
 * @throws TeeAuthError if session is invalid or expired
 */
export declare function validateSession(session: TeeSession): void;
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
 * NOTE: Buffer is derived from the OWNER PROGRAM, not delegation program
 */
export declare function deriveDelegationBufferPda(delegatedAccount: PublicKey, ownerProgramId: PublicKey): [PublicKey, number];
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