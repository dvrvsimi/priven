/**
 * TEE Authentication and Communication Helpers
 *
 * Uses MagicBlock's ephemeral-rollups-sdk for TEE integration
 */
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  verifyTeeRpcIntegrity,
  getAuthToken,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";

// MagicBlock program IDs
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
export const PERMISSION_PROGRAM_ID = new PublicKey(
  "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
);
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);

// MagicBlock RPC endpoints
export const MAGICBLOCK_RPC = {
  devnet: "https://devnet.magicblock.app",
  mainnet: "https://mainnet.magicblock.app",
  tee: "https://tee.magicblock.app",
} as const;

// TEE Validators (from MagicBlock docs)
export const TEE_VALIDATORS = {
  TEE: new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
  US: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  EU: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  ASIA: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
} as const;

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
export async function createTeeSession(
  wallet: Keypair,
  baseRpc: string = MAGICBLOCK_RPC.devnet
): Promise<TeeSession> {
  const teeRpc = MAGICBLOCK_RPC.tee;

  // Verify TEE integrity (Intel TDX attestation)
  console.log("Verifying TEE integrity...");
  const verified = await verifyTeeRpcIntegrity(teeRpc);

  if (!verified) {
    console.warn("TEE integrity verification failed - proceeding anyway");
  }

  // Get auth token
  console.log("Requesting TEE auth token...");
  const authResult = await getAuthToken(
    teeRpc,
    wallet.publicKey,
    async (message: Uint8Array) => {
      return nacl.sign.detached(message, wallet.secretKey);
    }
  );

  // Extract token - SDK may return string or object with token property
  const token = typeof authResult === "string" ? authResult : (authResult as any).token;

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
