import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import type { Predicate, QueryOptions } from "./types";
/**
 * Main client for Priven protocol
 *
 * Executes privacy-preserving pool queries using MPC
 */
export declare class PrivenClient {
    private program;
    private connection;
    private provider;
    private privateKey;
    private publicKey;
    /**
     * Create a new Priven client
     *
     * @param program - Anchor program instance for Priven
     * @param provider - Anchor provider with wallet
     */
    constructor(program: Program, provider: AnchorProvider);
    /**
     * Execute a private pool query
     *
     * Flow:
     * 1. Fetch MXE public key from on-chain
     * 2. Fetch pools from QuickNode
     * 3. Encrypt predicate
     * 4. Submit transaction with encrypted predicate
     * 5. Wait for MPC computation
     * 6. Fetch and decrypt results
     *
     * @param predicate - Search criteria (min_tvl, max_tvl)
     * @param options - Query options (filters, timeout, etc.)
     * @returns Array of matching pool addresses
     */
    query(predicate: Predicate, options?: QueryOptions): Promise<PublicKey[]>;
    /**
     * Submit encrypted query to Priven program
     *
     * @param encrypted - Encrypted predicate
     * @param poolAddresses - Pool addresses to query
     * @returns Computation offset for result tracking
     */
    private submitQuery;
    /**
     * Fetch and decrypt query results from on-chain
     *
     * @param computationOffset - Computation offset from submission
     * @returns Array of matching pool addresses
     */
    private fetchAndDecryptResults;
}
/**
 * Helper function to create a Priven client from connection and program ID
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param programId - Priven program ID
 * @param wallet - Wallet keypair
 * @returns Initialized Priven client
 */
export declare function createPrivenClient(connection: Connection, programId: PublicKey, wallet: Keypair): Promise<PrivenClient>;
//# sourceMappingURL=client.d.ts.map