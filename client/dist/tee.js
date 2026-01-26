/**
 * TEE Authentication and Communication Helpers
 *
 * Uses MagicBlock's ephemeral-rollups-sdk for TEE integration
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { verifyTeeRpcIntegrity, getAuthToken, } from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
// MagicBlock program IDs
export const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
export const PERMISSION_PROGRAM_ID = new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
export const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
// MagicBlock RPC endpoints
export const MAGICBLOCK_RPC = {
    devnet: "https://devnet.magicblock.app",
    mainnet: "https://mainnet.magicblock.app",
    tee: "https://tee.magicblock.app",
};
// TEE Validators
export const TEE_VALIDATORS = {
    TEE: new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
    US: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
    EU: new PublicKey("MEU3zfM6J8TCGV5Aa5k8gH1q3ZJD8UcY6RjdXeAZ3uj"),
    ASIA: new PublicKey("MAsia1111111111111111111111111111111111111"),
};
/**
 * Create and authenticate a TEE session
 *
 * @param wallet - Wallet keypair for signing auth request
 * @param baseRpc - Base RPC endpoint (defaults to devnet)
 * @returns Authenticated TEE session
 */
export async function createTeeSession(wallet, baseRpc = MAGICBLOCK_RPC.devnet) {
    const teeRpc = MAGICBLOCK_RPC.tee;
    // Verify TEE integrity (Intel TDX attestation)
    console.log("Verifying TEE integrity...");
    const verified = await verifyTeeRpcIntegrity(teeRpc);
    if (!verified) {
        console.warn("TEE integrity verification failed - proceeding anyway");
    }
    // Get auth token
    console.log("Requesting TEE auth token...");
    const authResult = await getAuthToken(teeRpc, wallet.publicKey, async (message) => {
        return nacl.sign.detached(message, wallet.secretKey);
    });
    // Extract token - SDK may return string or object with token property
    const token = typeof authResult === "string" ? authResult : authResult.token;
    // Token typically valid for 1 hour
    const expiresAt = Date.now() + 60 * 60 * 1000;
    return {
        baseRpc,
        teeRpc,
        token,
        expiresAt,
        verified,
    };
}
/**
 * Get TEE RPC URL with auth token
 */
export function getTeeRpcUrl(session) {
    return `${session.teeRpc}?token=${session.token}`;
}
/**
 * Check if session is still valid
 */
export function isSessionValid(session) {
    return Date.now() < session.expiresAt;
}
/**
 * Create a connection to the TEE RPC
 */
export function createTeeConnection(session) {
    return new Connection(getTeeRpcUrl(session), "confirmed");
}
/**
 * Create a connection to the base RPC (L1)
 */
export function createBaseConnection(session) {
    return new Connection(session.baseRpc, "confirmed");
}
/**
 * Derive delegation buffer PDA
 */
export function deriveDelegationBufferPda(delegatedAccount) {
    return PublicKey.findProgramAddressSync([Buffer.from("buffer"), delegatedAccount.toBuffer()], DELEGATION_PROGRAM_ID);
}
/**
 * Derive delegation record PDA
 */
export function deriveDelegationRecordPda(delegatedAccount) {
    return PublicKey.findProgramAddressSync([Buffer.from("delegation"), delegatedAccount.toBuffer()], DELEGATION_PROGRAM_ID);
}
/**
 * Derive delegation metadata PDA
 */
export function deriveDelegationMetadataPda(delegatedAccount) {
    return PublicKey.findProgramAddressSync([Buffer.from("metadata"), delegatedAccount.toBuffer()], DELEGATION_PROGRAM_ID);
}
/**
 * Check if an account is currently delegated
 */
export async function isDelegated(connection, accountPubkey) {
    const [recordPda] = deriveDelegationRecordPda(accountPubkey);
    const accountInfo = await connection.getAccountInfo(recordPda);
    return accountInfo !== null && accountInfo.data.length > 0;
}
/**
 * Wait for an account to appear on L1 (after commit)
 */
export async function waitForCommit(connection, accountPubkey, timeoutMs = 30000, pollIntervalMs = 1000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        if (accountInfo && accountInfo.data.length > 0) {
            return true;
        }
        await sleep(pollIntervalMs);
    }
    return false;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
