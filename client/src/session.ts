/**
 * PrivenSession - Session-based query interface
 *
 * Provides a higher-level API for executing private queries within a session.
 * Sessions group queries for lifecycle management and stats tracking.
 */
import { Program, BN, EventParser } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, TransactionSignature } from "@solana/web3.js";
import { encryptPredicate, decryptResult } from "./encryption";
import { SESSION_SEED, QUERY_SEED, getTeeEcdhPublicKey } from "./constants";
import type { Predicate, QueryExecutedEvent, QueryResult } from "./types";

export class PrivenSession {
  private sessionPda: PublicKey;
  private sessionId: BN;
  private program: Program;
  private wallet: Keypair;
  private connection: Connection;
  private teePublicKey: Uint8Array;
  private queryCounter: number = 0;

  private constructor(
    program: Program,
    wallet: Keypair,
    connection: Connection,
    sessionPda: PublicKey,
    sessionId: BN,
    teePublicKey: Uint8Array
  ) {
    this.program = program;
    this.wallet = wallet;
    this.connection = connection;
    this.sessionPda = sessionPda;
    this.sessionId = sessionId;
    this.teePublicKey = teePublicKey;
  }

  /**
   * Open a new session
   */
  static async open(
    program: Program,
    wallet: Keypair,
    connection: Connection,
    teePublicKey?: Uint8Array
  ): Promise<PrivenSession> {
    const sessionId = new BN(Date.now());
    const [sessionPda] = PublicKey.findProgramAddressSync(
      [SESSION_SEED, wallet.publicKey.toBuffer(), sessionId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .openSession(sessionId)
      .accounts({ user: wallet.publicKey })
      .signers([wallet])
      .rpc();

    const teePubKey = teePublicKey || getTeeEcdhPublicKey();
    if (teePubKey.every((b) => b === 0)) {
      throw new Error("TEE ECDH public key not configured");
    }

    return new PrivenSession(program, wallet, connection, sessionPda, sessionId, teePubKey);
  }

  /**
   * Execute a private query and wait for result
   *
   * Flow:
   * 1. Encrypt predicate
   * 2. Submit query to L1
   * 3. Wait for QueryExecuted event
   * 4. Decrypt and return result
   */
  async query(predicate: Predicate, poolAddresses: PublicKey[]): Promise<QueryResult> {
    const queryId = new BN(Date.now() * 1000 + this.queryCounter++);

    // Encrypt predicate
    const encrypted = await encryptPredicate(predicate, this.teePublicKey);

    // Submit query
    const [queryStatePda] = PublicKey.findProgramAddressSync(
      [QUERY_SEED, this.wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
      this.program.programId
    );

    const txSig = await this.program.methods
      .submitQuery(
        this.sessionId,
        queryId,
        Array.from(encrypted.ciphertext) as number[],
        Array.from(encrypted.publicKey) as number[],
        poolAddresses
      )
      .accounts({ user: this.wallet.publicKey })
      .signers([this.wallet])
      .rpc();

    // Wait for QueryExecuted event
    const event = await this.waitForQueryExecuted(queryId, txSig);

    if (!event.success) {
      throw new Error("Query execution failed in TEE");
    }

    // Decrypt result
    return decryptResult(event.encryptedResult, encrypted.privateKey, this.teePublicKey);
  }

  /**
   * Submit query without waiting for result
   * Returns query ID for later result retrieval
   */
  async submitQuery(
    predicate: Predicate,
    poolAddresses: PublicKey[]
  ): Promise<{ queryId: BN; txSig: TransactionSignature; privateKey: Uint8Array }> {
    const queryId = new BN(Date.now() * 1000 + this.queryCounter++);
    const encrypted = await encryptPredicate(predicate, this.teePublicKey);

    const txSig = await this.program.methods
      .submitQuery(
        this.sessionId,
        queryId,
        Array.from(encrypted.ciphertext) as number[],
        Array.from(encrypted.publicKey) as number[],
        poolAddresses
      )
      .accounts({ user: this.wallet.publicKey })
      .signers([this.wallet])
      .rpc();

    return { queryId, txSig, privateKey: encrypted.privateKey };
  }

  /**
   * Wait for QueryExecuted event for a specific query
   */
  async waitForQueryExecuted(
    queryId: BN,
    _txSig?: TransactionSignature,
    timeoutMs: number = 30000
  ): Promise<QueryExecutedEvent> {
    const startTime = Date.now();
    const pollInterval = 500;

    const [queryStatePda] = PublicKey.findProgramAddressSync(
      [QUERY_SEED, this.wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
      this.program.programId
    );

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check if query state is completed
        const queryState = await (this.program.account as any).queryState.fetch(queryStatePda);

        if (queryState.status.completed || queryState.status.failed) {
          // Query completed - now we need to find the event
          // Get recent signatures for the query state account
          const signatures = await this.connection.getSignaturesForAddress(queryStatePda, {
            limit: 10,
          });

          for (const sigInfo of signatures) {
            const tx = await this.connection.getTransaction(sigInfo.signature, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });

            if (tx?.meta?.logMessages) {
              const event = this.parseQueryExecutedEvent(tx.meta.logMessages, queryId);
              if (event) {
                return event;
              }
            }
          }

          // If we can't find the event, return a synthetic one
          return {
            sessionId: BigInt(this.sessionId.toString()),
            queryId: BigInt(queryId.toString()),
            owner: this.wallet.publicKey,
            success: !!queryState.status.completed,
            matchCount: 0,
            encryptedResult: new Uint8Array(0),
            resultHash: new Uint8Array(32),
          };
        }
      } catch {
        // Account might not exist yet, continue polling
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error(`Timeout waiting for query ${queryId.toString()} result`);
  }

  /**
   * Parse QueryExecuted event from transaction logs using Anchor's EventParser
   */
  private parseQueryExecutedEvent(logs: string[], queryId: BN): QueryExecutedEvent | null {
    const eventParser = new EventParser(this.program.programId, this.program.coder);

    try {
      // parseLogs returns a Generator
      for (const event of eventParser.parseLogs(logs)) {
        if (event.name === "QueryExecuted") {
          const data = event.data;

          // Check if this is our query
          if (data.queryId.toString() !== queryId.toString()) continue;

          return {
            sessionId: BigInt(data.sessionId.toString()),
            queryId: BigInt(data.queryId.toString()),
            owner: data.owner,
            success: data.success,
            matchCount: data.matchCount,
            encryptedResult: new Uint8Array(data.encryptedResult),
            resultHash: new Uint8Array(data.resultHash),
          };
        }
      }
    } catch {
      // Fall back to returning null if parsing fails
    }

    return null;
  }

  /**
   * Close this session and return rent
   */
  async close(): Promise<void> {
    await this.program.methods
      .closeSession()
      .accounts({
        owner: this.wallet.publicKey,
        session: this.sessionPda,
      })
      .signers([this.wallet])
      .rpc();
  }

  /**
   * Get session PDA
   */
  getSessionPda(): PublicKey {
    return this.sessionPda;
  }

  /**
   * Get session ID
   */
  getSessionId(): BN {
    return this.sessionId;
  }

  /**
   * Derive query state PDA for a query ID
   */
  deriveQueryStatePda(queryId: BN): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [QUERY_SEED, this.wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
      this.program.programId
    );
    return pda;
  }
}
