"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeeAuthError = exports.TEE_VALIDATORS = exports.MAGICBLOCK_RPC = exports.MAGIC_PROGRAM_ID = exports.PERMISSION_PROGRAM_ID = exports.DELEGATION_PROGRAM_ID = void 0;
exports.createTeeSession = createTeeSession;
exports.refreshSessionIfNeeded = refreshSessionIfNeeded;
exports.validateSession = validateSession;
exports.getTeeRpcUrl = getTeeRpcUrl;
exports.isSessionValid = isSessionValid;
exports.createTeeConnection = createTeeConnection;
exports.createBaseConnection = createBaseConnection;
exports.deriveDelegationBufferPda = deriveDelegationBufferPda;
exports.deriveDelegationRecordPda = deriveDelegationRecordPda;
exports.deriveDelegationMetadataPda = deriveDelegationMetadataPda;
exports.isDelegated = isDelegated;
exports.waitForCommit = waitForCommit;
/**
 * TEE Authentication and Communication Helpers
 *
 * Uses MagicBlock's ephemeral-rollups-sdk for TEE integration.
 * Implements proper auth token handling with refresh mechanism.
 */
const web3_js_1 = require("@solana/web3.js");
const ephemeral_rollups_sdk_1 = require("@magicblock-labs/ephemeral-rollups-sdk");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
// Import from centralized constants
const constants_1 = require("./constants");
Object.defineProperty(exports, "DELEGATION_PROGRAM_ID", { enumerable: true, get: function () { return constants_1.DELEGATION_PROGRAM_ID; } });
Object.defineProperty(exports, "PERMISSION_PROGRAM_ID", { enumerable: true, get: function () { return constants_1.PERMISSION_PROGRAM_ID; } });
Object.defineProperty(exports, "MAGIC_PROGRAM_ID", { enumerable: true, get: function () { return constants_1.MAGIC_PROGRAM_ID; } });
Object.defineProperty(exports, "MAGICBLOCK_RPC", { enumerable: true, get: function () { return constants_1.MAGICBLOCK_RPC; } });
Object.defineProperty(exports, "TEE_VALIDATORS", { enumerable: true, get: function () { return constants_1.TEE_VALIDATORS; } });
/** Token validity buffer (5 minutes before actual expiry) */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
/** Token validity duration (1 hour) */
const TOKEN_VALIDITY_MS = 60 * 60 * 1000;
/** Maximum retries for auth operations */
const MAX_AUTH_RETRIES = 3;
/**
 * Error thrown when TEE authentication fails
 */
class TeeAuthError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "TeeAuthError";
    }
}
exports.TeeAuthError = TeeAuthError;
/**
 * Create and authenticate a TEE session
 *
 * @param wallet - Wallet keypair for signing auth request
 * @param baseRpc - Base RPC endpoint (defaults to devnet)
 * @param options - Optional configuration
 * @returns Authenticated TEE session
 * @throws TeeAuthError if authentication fails after retries
 */
async function createTeeSession(wallet, baseRpc = constants_1.MAGICBLOCK_RPC.devnet, options) {
    const teeRpc = constants_1.MAGICBLOCK_RPC.tee;
    const maxRetries = options?.maxRetries ?? MAX_AUTH_RETRIES;
    // Verify TEE integrity (Intel TDX attestation)
    let verified = false;
    if (!options?.skipIntegrityCheck) {
        console.log("Verifying TEE integrity...");
        try {
            verified = await (0, ephemeral_rollups_sdk_1.verifyTeeRpcIntegrity)(teeRpc);
            if (!verified) {
                console.warn("TEE integrity verification returned false - proceeding with caution");
            }
        }
        catch (error) {
            console.warn("TEE integrity verification failed:", error);
            // Continue - integrity check is informational
        }
    }
    // Get auth token with retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Requesting TEE auth token (attempt ${attempt}/${maxRetries})...`);
            const authResult = await (0, ephemeral_rollups_sdk_1.getAuthToken)(teeRpc, wallet.publicKey, async (message) => {
                return tweetnacl_1.default.sign.detached(message, wallet.secretKey);
            });
            // Extract token - SDK may return string or object with token property
            let token;
            if (typeof authResult === "string") {
                token = authResult;
            }
            else if (authResult && typeof authResult === "object" && "token" in authResult) {
                token = authResult.token;
            }
            else {
                throw new TeeAuthError("Invalid auth response format from TEE");
            }
            if (!token || token.length === 0) {
                throw new TeeAuthError("Empty auth token received from TEE");
            }
            const expiresAt = Date.now() + TOKEN_VALIDITY_MS;
            console.log("TEE auth token obtained successfully");
            return {
                baseRpc,
                teeRpc,
                token,
                expiresAt,
                verified,
                walletPublicKey: wallet.publicKey.toBase58(),
            };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`Auth attempt ${attempt} failed:`, lastError.message);
            if (attempt < maxRetries) {
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.log(`Retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }
    // All retries failed
    throw new TeeAuthError(`Failed to authenticate with TEE after ${maxRetries} attempts`, lastError ?? undefined);
}
/**
 * Refresh a TEE session if it's expired or about to expire
 *
 * @param session - Current session
 * @param wallet - Wallet keypair for signing
 * @returns New or existing session
 */
async function refreshSessionIfNeeded(session, wallet) {
    // Check if session needs refresh (expired or within buffer)
    if (Date.now() >= session.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        console.log("Session expired or expiring soon, refreshing...");
        return createTeeSession(wallet, session.baseRpc, { skipIntegrityCheck: true });
    }
    return session;
}
/**
 * Validate that a session is still usable
 *
 * @param session - Session to validate
 * @throws TeeAuthError if session is invalid or expired
 */
function validateSession(session) {
    if (!session.token || session.token.length === 0) {
        throw new TeeAuthError("Session has no auth token");
    }
    if (Date.now() >= session.expiresAt) {
        throw new TeeAuthError("Session has expired");
    }
}
/**
 * Get TEE RPC URL with auth token
 */
function getTeeRpcUrl(session) {
    return `${session.teeRpc}?token=${session.token}`;
}
/**
 * Check if session is still valid
 */
function isSessionValid(session) {
    return Date.now() < session.expiresAt;
}
/**
 * Create a connection to the TEE RPC
 */
function createTeeConnection(session) {
    return new web3_js_1.Connection(getTeeRpcUrl(session), "confirmed");
}
/**
 * Create a connection to the base RPC (L1)
 */
function createBaseConnection(session) {
    return new web3_js_1.Connection(session.baseRpc, "confirmed");
}
/**
 * Derive delegation buffer PDA
 * NOTE: Buffer is derived from the OWNER PROGRAM, not delegation program
 */
function deriveDelegationBufferPda(delegatedAccount, ownerProgramId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("buffer"), delegatedAccount.toBuffer()], ownerProgramId // Uses owner program, not delegation program!
    );
}
/**
 * Derive delegation record PDA
 */
function deriveDelegationRecordPda(delegatedAccount) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("delegation"), delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
}
/**
 * Derive delegation metadata PDA
 */
function deriveDelegationMetadataPda(delegatedAccount) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("delegation-metadata"), delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
}
/**
 * Check if an account is currently delegated
 */
async function isDelegated(connection, accountPubkey) {
    const [recordPda] = deriveDelegationRecordPda(accountPubkey);
    const accountInfo = await connection.getAccountInfo(recordPda);
    return accountInfo !== null && accountInfo.data.length > 0;
}
/**
 * Wait for an account to appear on L1 (after commit)
 */
async function waitForCommit(connection, accountPubkey, timeoutMs = 30000, pollIntervalMs = 1000) {
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
