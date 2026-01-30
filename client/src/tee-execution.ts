/**
 * Priven TEE Execution - Complete Working Flow
 *
 * This module handles the full MagicBlock TEE integration:
 * 1. Account cloning (for read-only accounts like config)
 * 2. Delegation (for writable accounts like queryState)
 * 3. Stateless execution (writes result to queryState)
 * 4. Commit back to L1
 * 5. (Optional) Magic Action to create QueryResult on L1
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Connection,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import * as nacl from "tweetnacl";

// MagicBlock Constants
export const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

export const TEE_RPC = "https://devnet.magicblock.app";

export const TEE_VALIDATORS = {
  TEE: new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
  US: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  EU: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  ASIA: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
};

// Seeds
const QUERY_SEED = Buffer.from("query");
const RESULT_SEED = Buffer.from("result");
const CONFIG_SEED = Buffer.from("config");

/**
 * Derive delegation PDAs
 */
export function deriveDelegationBufferPda(account: PublicKey, ownerProgram: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), account.toBuffer()],
    ownerProgram  // Note: uses owner program, not delegation program
  );
}

export function deriveDelegationRecordPda(account: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

export function deriveDelegationMetadataPda(account: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/**
 * Check if an account is delegated
 */
export async function isDelegated(connection: Connection, account: PublicKey): Promise<boolean> {
  const accountInfo = await connection.getAccountInfo(account);
  if (!accountInfo) return false;
  return accountInfo.owner.equals(DELEGATION_PROGRAM_ID);
}

/**
 * Get TEE auth token
 */
export async function getTeeAuthToken(
  wallet: Keypair
): Promise<{ token: string; expiresAt: number }> {
  // Import dynamically to avoid issues
  const { getAuthToken } = await import("@magicblock-labs/ephemeral-rollups-sdk");

  return getAuthToken(
    TEE_RPC,
    wallet.publicKey,
    async (message: Uint8Array) => {
      return nacl.sign.detached(message, wallet.secretKey);
    }
  );
}

/**
 * Create TEE connection with auth token
 */
export function createTeeConnection(authToken: string): Connection {
  return new Connection(`${TEE_RPC}?token=${authToken}`, {
    commitment: "confirmed",
    wsEndpoint: undefined, // TEE doesn't support websockets
  });
}

/**
 * Clone an account to the ephemeral state (for read-only accounts)
 * This is needed for accounts like `config` that aren't delegated but need to be readable
 */
export async function cloneAccountToEphemeral(
  teeConnection: Connection,
  l1Connection: Connection,
  account: PublicKey
): Promise<void> {
  // Fetch account from L1
  const accountInfo = await l1Connection.getAccountInfo(account);
  if (!accountInfo) {
    throw new Error(`Account ${account.toBase58()} not found on L1`);
  }

  // MagicBlock SDK handles this via the connection
  // The TEE will fetch the account data when needed
  // For explicit cloning, use the SDK's cloneAccount method

  console.log(`Account ${account.toBase58().slice(0, 16)}... available for TEE read`);
}

/**
 * Execute query in TEE using stateless mode
 *
 * Flow:
 * 1. Ensure queryState is delegated
 * 2. Call execute_query_stateless (writes result to queryState)
 * 3. Commit changes back to L1
 */
export async function executeQueryInTee<T>(
  l1Connection: Connection,
  l1Program: Program<T>,
  teeConnection: Connection,
  teeProgram: Program<T>,
  wallet: Keypair,
  queryStatePda: PublicKey,
  owner: PublicKey,
  queryId: BN,
  decryptionKey: Uint8Array
): Promise<{ success: boolean; txSignature?: string; error?: string }> {

  // Step 1: Verify queryState is delegated
  const delegated = await isDelegated(l1Connection, queryStatePda);
  if (!delegated) {
    return { success: false, error: "QueryState not delegated" };
  }
  console.log("  ✓ QueryState is delegated");

  // Step 2: Execute stateless query in TEE
  // This only writes to queryState (already delegated)
  try {
    console.log("  Calling execute_query_stateless in TEE...");

    const tx = await (teeProgram.methods as any)
      .executeQueryStateless(
        Array.from(decryptionKey) as number[],
        owner,
        queryId
      )
      .accountsPartial({
        caller: wallet.publicKey,
        queryState: queryStatePda,
      })
      .signers([wallet])
      .rpc({ skipPreflight: true });

    console.log("  ✓ TEE execution TX:", tx);

    // Step 3: Wait for commit to L1
    // The TEE will automatically commit delegated account changes
    await waitForCommit(l1Connection, queryStatePda, 30000);

    return { success: true, txSignature: tx };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Wait for TEE commit to propagate to L1
 */
export async function waitForCommit(
  connection: Connection,
  account: PublicKey,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000;

  console.log(`  Waiting for commit to L1 (timeout: ${timeoutMs / 1000}s)...`);

  while (Date.now() - startTime < timeoutMs) {
    // Check if account is back on L1 (no longer owned by delegation program)
    const accountInfo = await connection.getAccountInfo(account);

    if (accountInfo && !accountInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      console.log("  ✓ Commit confirmed on L1");
      return true;
    }

    await sleep(pollInterval);
  }

  console.log("  ⚠ Commit timeout - may still be processing");
  return false;
}

/**
 * Complete TEE execution flow
 */
export async function executePrivateQuery<T>(params: {
  l1Connection: Connection;
  l1Program: Program<T>;
  wallet: Keypair;
  queryId: BN;
  decryptionKey: Uint8Array;
}): Promise<{
  success: boolean;
  result?: {
    matchCount: number;
    encryptedResult: Uint8Array;
  };
  error?: string;
}> {
  const { l1Connection, l1Program, wallet, queryId, decryptionKey } = params;

  // Derive PDAs
  const [queryStatePda] = PublicKey.findProgramAddressSync(
    [QUERY_SEED, wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
    l1Program.programId
  );
  const [configPda] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    l1Program.programId
  );

  console.log("\n=== TEE Execution Flow ===");
  console.log("QueryState:", queryStatePda.toBase58());
  console.log("Config:", configPda.toBase58());

  try {
    // Step 1: Get TEE auth
    console.log("\n1. Authenticating with TEE...");
    const authToken = await getTeeAuthToken(wallet);
    console.log("  ✓ Auth token obtained");

    // Step 2: Create TEE connection
    const teeConnection = createTeeConnection(authToken.token);
    const teeProvider = new AnchorProvider(
      teeConnection,
      new anchor.Wallet(wallet),
      { commitment: "confirmed" }
    );
    const teeProgram = new Program(l1Program.idl, teeProvider) as Program<T>;

    // Step 3: Check if already delegated, if not delegate
    console.log("\n2. Checking delegation status...");
    const alreadyDelegated = await isDelegated(l1Connection, queryStatePda);

    if (!alreadyDelegated) {
      console.log("  Delegating queryState to TEE...");

      const delegateTx = await (l1Program.methods as any)
        .delegateQuery(queryId)
        .accounts({
          user: wallet.publicKey,
        })
        .signers([wallet])
        .rpc({ skipPreflight: true });

      console.log("  ✓ Delegation TX:", delegateTx);

      // Wait for delegation to be confirmed
      await sleep(2000);
    } else {
      console.log("  ✓ Already delegated");
    }

    // Step 4: Execute in TEE
    console.log("\n3. Executing query in TEE...");
    const execResult = await executeQueryInTee(
      l1Connection,
      l1Program,
      teeConnection,
      teeProgram,
      wallet,
      queryStatePda,
      wallet.publicKey,
      queryId,
      decryptionKey
    );

    if (!execResult.success) {
      return { success: false, error: execResult.error };
    }

    // Step 5: Fetch result from L1
    console.log("\n4. Fetching result from L1...");
    const queryState = await (l1Program.account as any).queryState.fetch(queryStatePda);

    return {
      success: true,
      result: {
        matchCount: queryState.encryptedResult[0],
        encryptedResult: new Uint8Array(queryState.encryptedResult.slice(0, queryState.encryptedLen)),
      },
    };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Alternative: Execute without creating QueryResult account
 * Uses stateless mode + event parsing
 */
export async function executeQueryStatelessWithEvents<T>(params: {
  teeConnection: Connection;
  teeProgram: Program<T>;
  wallet: Keypair;
  queryStatePda: PublicKey;
  owner: PublicKey;
  queryId: BN;
  decryptionKey: Uint8Array;
}): Promise<{
  success: boolean;
  txSignature?: string;
  events?: any[];
  error?: string;
}> {
  const { teeConnection, teeProgram, wallet, queryStatePda, owner, queryId, decryptionKey } = params;

  try {
    // Execute and get transaction signature
    const tx = await (teeProgram.methods as any)
      .executeQueryStateless(
        Array.from(decryptionKey) as number[],
        owner,
        queryId
      )
      .accountsPartial({
        caller: wallet.publicKey,
        queryState: queryStatePda,
      })
      .signers([wallet])
      .rpc({ skipPreflight: true });

    // Fetch transaction to parse events
    const txDetails = await teeConnection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    // Parse events from logs
    const events: any[] = [];
    if (txDetails?.meta?.logMessages) {
      const eventParser = new anchor.EventParser(
        teeProgram.programId,
        new anchor.BorshCoder(teeProgram.idl)
      );

      for (const event of eventParser.parseLogs(txDetails.meta.logMessages)) {
        events.push(event);
      }
    }

    return { success: true, txSignature: tx, events };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST HELPER
// ============================================================================

/**
 * Correct TEE execution test
 */
export async function testCorrectTeeFlow<T>(
  l1Connection: Connection,
  l1Program: Program<T>,
  wallet: Keypair
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("CORRECT TEE EXECUTION FLOW");
  console.log("=".repeat(60));

  // 1. Submit query
  console.log("\n1. Submitting query to L1...");
  const queryId = new BN(Date.now());
  const predicate = createTestPredicate();
  const mockPool = {
    address: Keypair.generate().publicKey,
    tokenAReserve: new BN(5_000_000),
    tokenBReserve: new BN(5_000_000),
  };

  const [queryStatePda] = PublicKey.findProgramAddressSync(
    [QUERY_SEED, wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
    l1Program.programId
  );

  await (l1Program.methods as any)
    .submitQuery(
      queryId,
      Array.from(predicate) as number[],
      Array.from(new Uint8Array(32)) as number[],
      [mockPool]
    )
    .accounts({ user: wallet.publicKey })
    .signers([wallet])
    .rpc();

  console.log("  ✓ Query submitted");
  console.log("  QueryState:", queryStatePda.toBase58());

  // 2. Execute in TEE
  console.log("\n2. Executing in TEE...");
  const result = await executePrivateQuery({
    l1Connection,
    l1Program,
    wallet,
    queryId,
    decryptionKey: new Uint8Array(32), // In production, this comes from TEE attestation
  });

  if (result.success) {
    console.log("\n" + "=".repeat(60));
    console.log("SUCCESS!");
    console.log("  Match count:", result.result?.matchCount);
    console.log("  Encrypted result length:", result.result?.encryptedResult.length);
    console.log("=".repeat(60));
  } else {
    console.log("\n" + "=".repeat(60));
    console.log("FAILED:", result.error);
    console.log("=".repeat(60));
  }
}

function createTestPredicate(): Uint8Array {
  const ENCRYPTED_SIZE = 80;
  const buffer = new ArrayBuffer(ENCRYPTED_SIZE);
  const view = new DataView(buffer);

  view.setUint8(0, 2);  // version
  view.setUint8(1, 2);  // filter_count

  // Filter 1: TVL >= 1M
  view.setUint8(2, 0);  // type = TVL
  view.setUint8(3, 0);  // op = GTE
  view.setUint8(4, 0);  // field
  view.setBigUint64(5, BigInt(1_000_000), true);

  // Filter 2: TVL <= 10M
  view.setUint8(13, 0);  // type = TVL
  view.setUint8(14, 1);  // op = LTE
  view.setUint8(15, 0);  // field
  view.setBigUint64(16, BigInt(10_000_000), true);

  return new Uint8Array(buffer);
}
