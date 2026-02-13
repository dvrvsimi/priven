/**
 * Priven Client
 *
 * Privacy-preserving CPMM pool queries using MagicBlock TEE
 */
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Predicate, QueryOptions, EncryptedPredicate } from "./types";
import { encryptPredicate, decryptResult, generateKeyPair } from "./encryption";
import { discoverCpmmPools } from "./pools";
import { TeeSession, createTeeSession, waitForCommit } from "./tee";
import {
  PRIVEN_PROGRAM_ID,
  getTeeEcdhPublicKey,
  QUERY_SEED,
  CONFIG_SEED,
} from "./constants";
import nacl from "tweetnacl";

export { PRIVEN_PROGRAM_ID };

function signTransaction<T extends Transaction | VersionedTransaction>(
  tx: T,
  wallet: Keypair
): T {
  if (tx instanceof Transaction) {
    tx.partialSign(wallet);
  }
  return tx;
}

function signAllTransactions<T extends Transaction | VersionedTransaction>(
  txs: T[],
  wallet: Keypair
): T[] {
  txs.forEach((tx) => {
    if (tx instanceof Transaction) {
      tx.partialSign(wallet);
    }
  });
  return txs;
}

/**
 * Main client for Priven protocol
 */
export class PrivenClient {
  private program: Program;
  private wallet: Keypair;
  private baseConnection: Connection;
  private teeSession: TeeSession | null = null;

  constructor(program: Program, wallet: Keypair, baseConnection: Connection) {
    this.program = program;
    this.wallet = wallet;
    this.baseConnection = baseConnection;
  }

  async initTeeSession(): Promise<void> {
    this.teeSession = await createTeeSession(
      this.wallet,
      this.baseConnection.rpcEndpoint
    );
    console.log(`TEE session created (verified: ${this.teeSession.verified})`);
  }

  /**
   * Execute a private pool query
   *
   * Flow:
   * 1. Discover CPMM pools
   * 2. Encrypt predicate
   * 3. Submit query with pool addresses
   * 4. Delegate to TEE
   * 5. Wait for QueryExecuted event (TEE executor processes)
   * 6. Decrypt result
   */
  async query(predicate: Predicate, options?: QueryOptions): Promise<PublicKey[]> {
    const maxPools = options?.maxPools || 20;
    const timeout = options?.timeout || 30000;

    if (!this.teeSession) {
      await this.initTeeSession();
    }

    console.log("Starting private pool query...");
    console.log(`  Filters: ${predicate.filters.length}`);

    // Step 1: Discover CPMM pools
    console.log("\nStep 1/4: Discovering CPMM pools...");
    const mainnetRpc =
      options?.mainnetRpc ||
      process.env.QUICKNODE_MAINNET_RPC ||
      "https://api.mainnet-beta.solana.com";
    const mainnetConnection = new Connection(mainnetRpc, "confirmed");
    const poolAddresses = await discoverCpmmPools(mainnetConnection, {
      limit: maxPools,
    });

    if (poolAddresses.length === 0) {
      throw new Error("No CPMM pools found");
    }
    console.log(`Found ${poolAddresses.length} pools`);

    // Step 2: Encrypt predicate
    console.log("\nStep 2/4: Encrypting predicate...");
    const teePublicKey = getTeeEcdhPublicKey();
    if (teePublicKey.every((b) => b === 0)) {
      throw new Error("TEE ECDH public key not configured (set TEE_ECDH_PUBKEY_HEX)");
    }
    const encrypted = await encryptPredicate(predicate, teePublicKey);

    // Step 3: Submit query
    console.log("\nStep 3/4: Submitting query...");
    const queryId = new BN(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    const [queryStatePda] = this.deriveQueryStatePda(queryId);

    await this.submitQuery(queryId, encrypted, poolAddresses);
    console.log(`Query submitted (ID: ${queryId.toString()})`);
    console.log(`  QueryState: ${queryStatePda.toBase58()}`);

    // Step 4: Delegate to TEE
    if (!options?.skipDelegation) {
      console.log("\nStep 4/4: Delegating to TEE...");
      await this.delegateQuery(queryId);
      console.log("Delegated - waiting for TEE execution...");
    }

    // Wait for QueryState to be marked Completed
    const completed = await waitForCommit(
      this.baseConnection,
      queryStatePda,
      timeout,
      500,
      async (accountInfo) => {
        if (!accountInfo) return false;
        // Check status byte (offset after discriminator + owner + query_id + encrypted_predicate + user_pubkey)
        // 8 + 32 + 8 + 80 + 32 = 160, status is at 160
        const status = accountInfo.data[160];
        return status === 2 || status === 3; // Completed or Failed
      }
    );

    if (!completed) {
      throw new Error("Timeout waiting for TEE execution");
    }

    // Parse result from event logs (simplified - in production use proper event parsing)
    // For now, return empty as the actual decryption happens from event data
    console.log("\nQuery complete");
    return [];
  }

  private async submitQuery(
    queryId: BN,
    encrypted: EncryptedPredicate,
    poolAddresses: PublicKey[],
    sessionId: BN = new BN(0)
  ): Promise<string> {
    const tx = await this.program.methods
      .submitQuery(
        sessionId,
        queryId,
        Array.from(encrypted.ciphertext) as number[],
        Array.from(encrypted.publicKey) as number[],
        poolAddresses
      )
      .accounts({
        user: this.wallet.publicKey,
      })
      .signers([this.wallet])
      .rpc();

    return tx;
  }

  private async delegateQuery(queryId: BN): Promise<string> {
    const [queryStatePda] = this.deriveQueryStatePda(queryId);

    const tx = await this.program.methods
      .delegateQuery(queryId)
      .accounts({
        user: this.wallet.publicKey,
        queryState: queryStatePda,
      })
      .signers([this.wallet])
      .rpc();

    return tx;
  }

  async closeQuery(queryId: BN): Promise<string> {
    const [queryStatePda] = this.deriveQueryStatePda(queryId);

    const tx = await this.program.methods
      .closeQuery()
      .accounts({
        owner: this.wallet.publicKey,
        queryState: queryStatePda,
      })
      .signers([this.wallet])
      .rpc();

    return tx;
  }

  /**
   * Execute query with local execution (simulates TEE for development/testing)
   *
   * This mode:
   * 1. Submits query to chain
   * 2. Executes evaluation locally (not in TEE)
   * 3. Submits result as the caller (requires caller to be TEE validator)
   *
   * Use this for local testing when MagicBlock TEE isn't available.
   */
  async queryLocal(predicate: Predicate, options?: QueryOptions): Promise<PublicKey[]> {
    const maxPools = options?.maxPools || 20;

    console.log("Starting LOCAL query execution (development mode)...");
    console.log(`  Filters: ${predicate.filters.length}`);

    // Step 1: Discover CPMM pools
    console.log("\nStep 1/4: Discovering CPMM pools...");
    const mainnetRpc =
      options?.mainnetRpc ||
      process.env.QUICKNODE_MAINNET_RPC ||
      "https://api.mainnet-beta.solana.com";
    const mainnetConnection = new Connection(mainnetRpc, "confirmed");
    const poolAddresses = await discoverCpmmPools(mainnetConnection, {
      limit: maxPools,
    });

    if (poolAddresses.length === 0) {
      throw new Error("No CPMM pools found");
    }
    console.log(`Found ${poolAddresses.length} pools`);

    // Step 2: Generate our own keypair for encryption (local mode)
    console.log("\nStep 2/4: Encrypting predicate...");
    const teeKeyPair = nacl.box.keyPair();
    const encrypted = await encryptPredicate(predicate, teeKeyPair.publicKey);

    // Step 3: Submit query
    console.log("\nStep 3/4: Submitting query...");
    const queryId = new BN(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    const [queryStatePda] = this.deriveQueryStatePda(queryId);
    const [configPda] = this.deriveConfigPda();

    await this.submitQuery(queryId, encrypted, poolAddresses);
    console.log(`Query submitted (ID: ${queryId.toString()})`);
    console.log(`  QueryState: ${queryStatePda.toBase58()}`);

    // Step 4: Execute locally and submit result
    console.log("\nStep 4/4: Executing locally and submitting result...");

    // For local execution, we just return all pools as matches (mock evaluation)
    // In real TEE, this would decrypt, evaluate predicates against actual pool data
    const matchingPools = poolAddresses;

    // Create encrypted result
    const resultPlaintext = new Uint8Array(1 + matchingPools.length * 32);
    resultPlaintext[0] = matchingPools.length;
    matchingPools.forEach((addr, i) => resultPlaintext.set(addr.toBytes(), 1 + i * 32));

    // For local mode, we just submit an unencrypted result (or mock encrypted)
    const encryptedResult = Buffer.from(resultPlaintext);

    // Compute result hash
    const hashBuffer = await crypto.subtle.digest("SHA-256", encryptedResult);
    const resultHash = Array.from(new Uint8Array(hashBuffer)) as number[];

    // Submit result (requires caller to be set as TEE validator in config)
    await this.program.methods
      .submitResult(
        encryptedResult,
        matchingPools.length,
        true,
        resultHash,
        this.wallet.publicKey,
        queryId
      )
      .accountsPartial({
        caller: this.wallet.publicKey,
        queryState: queryStatePda,
        config: configPda,
      })
      .signers([this.wallet])
      .rpc();

    console.log("\nQuery complete (local execution)");
    console.log(`  Matches: ${matchingPools.length} pools`);

    return matchingPools;
  }

  deriveConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      this.program.programId
    );
  }

  deriveQueryStatePda(queryId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [QUERY_SEED, this.wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
      this.program.programId
    );
  }
}

export async function createPrivenClient(
  connection: Connection,
  wallet: Keypair,
  programId: PublicKey = PRIVEN_PROGRAM_ID
): Promise<PrivenClient> {
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: async (tx) => signTransaction(tx, wallet),
      signAllTransactions: async (txs) => signAllTransactions(txs, wallet),
    },
    { commitment: "confirmed" }
  );

  const idl = await Program.fetchIdl(programId, provider);
  if (!idl) {
    throw new Error("Failed to fetch program IDL");
  }

  const program = new Program(idl, provider);
  return new PrivenClient(program, wallet, connection);
}
