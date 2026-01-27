/**
 * TEE Authentication and Communication Helpers
 *
 * Uses MagicBlock's ephemeral-rollups-sdk for TEE integration.
 * Implements proper auth token handling with refresh mechanism.
 */
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  verifyTeeRpcIntegrity,
  getAuthToken,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";

// Import from centralized constants
import {
  DELEGATION_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGICBLOCK_RPC,
  TEE_VALIDATORS,
} from "./constants";

// Re-export for backwards compatibility
export {
  DELEGATION_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGICBLOCK_RPC,
  TEE_VALIDATORS,
};

/** Token validity buffer (5 minutes before actual expiry) */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Token validity duration (1 hour) */
const TOKEN_VALIDITY_MS = 60 * 60 * 1000;

/** Maximum retries for auth operations */
const MAX_AUTH_RETRIES = 3;

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
export class TeeAuthError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "TeeAuthError";
  }
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
export async function createTeeSession(
  wallet: Keypair,
  baseRpc: string = MAGICBLOCK_RPC.devnet,
  options?: { skipIntegrityCheck?: boolean; maxRetries?: number }
): Promise<TeeSession> {
  const teeRpc = MAGICBLOCK_RPC.tee;
  const maxRetries = options?.maxRetries ?? MAX_AUTH_RETRIES;

  // Verify TEE integrity (Intel TDX attestation)
  let verified = false;
  if (!options?.skipIntegrityCheck) {
    console.log("Verifying TEE integrity...");
    try {
      verified = await verifyTeeRpcIntegrity(teeRpc);
      if (!verified) {
        console.warn("TEE integrity verification returned false - proceeding with caution");
      }
    } catch (error) {
      console.warn("TEE integrity verification failed:", error);
      // Continue - integrity check is informational
    }
  }

  // Get auth token with retry logic
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Requesting TEE auth token (attempt ${attempt}/${maxRetries})...`);

      const authResult = await getAuthToken(
        teeRpc,
        wallet.publicKey,
        async (message: Uint8Array) => {
          return nacl.sign.detached(message, wallet.secretKey);
        }
      );

      // Extract token - SDK may return string or object with token property
      let token: string;
      if (typeof authResult === "string") {
        token = authResult;
      } else if (authResult && typeof authResult === "object" && "token" in authResult) {
        token = (authResult as { token: string }).token;
      } else {
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
    } catch (error) {
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
  throw new TeeAuthError(
    `Failed to authenticate with TEE after ${maxRetries} attempts`,
    lastError ?? undefined
  );
}

/**
 * Refresh a TEE session if it's expired or about to expire
 *
 * @param session - Current session
 * @param wallet - Wallet keypair for signing
 * @returns New or existing session
 */
export async function refreshSessionIfNeeded(
  session: TeeSession,
  wallet: Keypair
): Promise<TeeSession> {
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
export function validateSession(session: TeeSession): void {
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
export function getTeeRpcUrl(session: TeeSession): string {
  return `${session.teeRpc}?token=${session.token}`;
}

/**
 * Check if session is still valid
 */
export function isSessionValid(session: TeeSession): boolean {
  return Date.now() < session.expiresAt;
}

/**
 * Create a connection to the TEE RPC
 */
export function createTeeConnection(session: TeeSession): Connection {
  return new Connection(getTeeRpcUrl(session), "confirmed");
}

/**
 * Create a connection to the base RPC (L1)
 */
export function createBaseConnection(session: TeeSession): Connection {
  return new Connection(session.baseRpc, "confirmed");
}

/**
 * Derive delegation buffer PDA
 * NOTE: Buffer is derived from the OWNER PROGRAM, not delegation program
 */
export function deriveDelegationBufferPda(
  delegatedAccount: PublicKey,
  ownerProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), delegatedAccount.toBuffer()],
    ownerProgramId // Uses owner program, not delegation program!
  );
}

/**
 * Derive delegation record PDA
 */
export function deriveDelegationRecordPda(
  delegatedAccount: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/**
 * Derive delegation metadata PDA
 */
export function deriveDelegationMetadataPda(
  delegatedAccount: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/**
 * Check if an account is currently delegated
 */
export async function isDelegated(
  connection: Connection,
  accountPubkey: PublicKey
): Promise<boolean> {
  const [recordPda] = deriveDelegationRecordPda(accountPubkey);
  const accountInfo = await connection.getAccountInfo(recordPda);
  return accountInfo !== null && accountInfo.data.length > 0;
}

/**
 * Wait for an account to appear on L1 (after commit)
 */
export async function waitForCommit(
  connection: Connection,
  accountPubkey: PublicKey,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 1000
): Promise<boolean> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
