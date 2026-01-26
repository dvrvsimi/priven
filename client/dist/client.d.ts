/**
 * Priven TEE Client
 *
 * Privacy-preserving pool queries using MagicBlock TEE
 */
import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import type { Predicate, QueryOptions } from "./types";
export declare const PRIVEN_TEE_PROGRAM_ID: PublicKey;
/**
 * Main client for Priven TEE protocol
 */
export declare class PrivenClient {
    private program;
    private wallet;
    private baseConnection;
    private teeSession;
    constructor(program: Program, wallet: Keypair, baseConnection: Connection);
    /**
     * Initialize TEE session (call before queries)
     */
    initTeeSession(): Promise<void>;
    /**
     * Execute a private pool query
     *
     * Flow:
     * 1. Fetch pools from QuickNode
     * 2. Encrypt predicate (AES-256-GCM)
     * 3. Submit query to L1 (creates QueryState)
     * 4. Delegate QueryState to TEE
     * 5. Execute query in TEE
     * 6. Commit and fetch results
     */
    query(predicate: Predicate, options?: QueryOptions): Promise<PublicKey[]>;
    /**
     * Submit query to L1
     */
    private submitQuery;
    /**
     * Delegate query to TEE
     */
    private delegateQuery;
    /**
     * Execute query in TEE
     */
    private executeInTee;
    /**
     * Commit result back to L1
     */
    private commitResult;
    /**
     * Fetch and decrypt results
     */
    private fetchAndDecryptResults;
    deriveConfigPda(): [PublicKey, number];
    deriveQueryStatePda(queryId: BN): [PublicKey, number];
    deriveQueryResultPda(queryId: BN): [PublicKey, number];
}
/**
 * Create a Priven TEE client
 */
export declare function createPrivenClient(connection: Connection, wallet: Keypair, programId?: PublicKey): Promise<PrivenClient>;
//# sourceMappingURL=client.d.ts.map