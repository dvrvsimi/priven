import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, } from "@solana/web3.js";
import { getMXEPublicKey, awaitComputationFinalization, x25519, } from "@arcium-hq/client";
import { encryptPredicate, decryptResult } from "./encryption";
import { fetchRaydiumPoolsWithRetry, } from "./pools";
/**
 * Main client for Priven protocol
 *
 * Executes privacy-preserving pool queries using MPC
 */
export class PrivenClient {
    program;
    connection;
    provider;
    privateKey;
    publicKey;
    /**
     * Create a new Priven client
     *
     * @param program - Anchor program instance for Priven
     * @param provider - Anchor provider with wallet
     */
    constructor(program, provider) {
        this.program = program;
        this.provider = provider;
        this.connection = provider.connection;
        // Generate ephemeral x25519 keypair for this session
        this.privateKey = x25519.utils.randomPrivateKey();
        this.publicKey = x25519.getPublicKey(this.privateKey);
    }
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
    async query(predicate, options) {
        const maxPools = options?.maxPools || 5;
        const timeout = options?.timeout || 90000;
        console.log("Starting private pool query...");
        console.log(`   Min TVL: ${predicate.minTvl}`);
        console.log(`   Max TVL: ${predicate.maxTvl}`);
        console.log(`   Max pools: ${maxPools}`);
        // Step 1: Get MXE public key for encryption
        console.log("\nStep 1/6: Fetching MXE encryption key...");
        const mxePublicKey = await getMXEPublicKey(this.provider, this.program.programId);
        if (!mxePublicKey) {
            throw new Error("MXE public key not found. Is the MXE initialized?");
        }
        console.log("MXE public key retrieved");
        // Step 2: Encrypt predicate
        console.log("\nStep 2/6: Encrypting search criteria...");
        const encrypted = await encryptPredicate(predicate, mxePublicKey);
        console.log("Predicate encrypted (32 bytes)");
        // Step 3: Fetch pools from QuickNode
        console.log("\nStep 3/6: Fetching pools from QuickNode...");
        const pools = await fetchRaydiumPoolsWithRetry(this.connection, {
            status: 1, // Active pools only
        });
        if (pools.length === 0) {
            throw new Error("No Raydium pools found");
        }
        // Select up to maxPools (circuit constraint)
        const selectedPools = pools.slice(0, maxPools);
        console.log(`Selected ${selectedPools.length} pools for query`);
        // Step 4: Submit query to MPC
        console.log("\nStep 4/6: Submitting query to MPC network...");
        const computationOffset = await this.submitQuery(encrypted, selectedPools.map((p) => p.address));
        console.log(`Query submitted (offset: ${computationOffset})`);
        // Step 5: Wait for MPC computation
        console.log("\nStep 5/6: Waiting for MPC computation (30-60s)...");
        try {
            // awaitComputationFinalization expects Finality type ("confirmed" | "finalized")
            const finality = (options?.commitment === "finalized") ? "finalized" : "confirmed";
            await Promise.race([
                awaitComputationFinalization(this.provider, computationOffset, this.program.programId, finality),
                new Promise((_, reject) => setTimeout(() => reject(new Error("MPC computation timeout")), timeout)),
            ]);
            console.log("MPC computation complete");
        }
        catch (error) {
            console.error("MPC computation failed:", error);
            throw error;
        }
        // Step 6: Fetch and decrypt results
        console.log("\nStep 6/6: Fetching and decrypting results...");
        const results = await this.fetchAndDecryptResults(computationOffset);
        console.log(`Query complete: ${results.length} matching pools\n`);
        return results;
    }
    /**
     * Submit encrypted query to Priven program
     *
     * @param encrypted - Encrypted predicate
     * @param poolAddresses - Pool addresses to query
     * @returns Computation offset for result tracking
     */
    async submitQuery(encrypted, poolAddresses) {
        // Generate computation offset (unique ID for this query)
        const computationOffset = new BN(Date.now() * 1000 + Math.floor(Math.random() * 1000));
        // Build remaining accounts (pool accounts to read)
        const remainingAccounts = poolAddresses.map((addr) => ({
            pubkey: addr,
            isWritable: false,
            isSigner: false,
        }));
        try {
            // Submit query transaction
            const signature = await this.program.methods
                .submitQuery(computationOffset, Array.from(encrypted.ciphertext), // [u8; 32]
            Array.from(encrypted.publicKey), // [u8; 32]
            new BN(encrypted.nonce.toString()), // u128
            poolAddresses.length // pool_count: u8
            )
                .remainingAccounts(remainingAccounts)
                .rpc({ commitment: "confirmed" });
            console.log(`   Transaction: ${signature}`);
            return computationOffset;
        }
        catch (error) {
            console.error("Failed to submit query:", error);
            throw new Error(`Query submission failed: ${error}`);
        }
    }
    /**
     * Fetch and decrypt query results from on-chain
     *
     * @param computationOffset - Computation offset from submission
     * @returns Array of matching pool addresses
     */
    async fetchAndDecryptResults(computationOffset) {
        // Derive query result PDA
        const [queryResultPda] = PublicKey.findProgramAddressSync([
            Buffer.from("query_result"),
            this.provider.wallet.publicKey.toBuffer(),
            computationOffset.toArrayLike(Buffer, "le", 8),
        ], this.program.programId);
        // Fetch query result account
        const queryResult = await this.program.account.queryResultAccount.fetch(queryResultPda);
        // Verify computation succeeded
        if (!queryResult.success) {
            throw new Error("MPC computation failed or was aborted");
        }
        // Decrypt results
        const encryptedResultLen = queryResult.encryptedResultLen;
        const encryptedResult = new Uint8Array(queryResult.encryptedResult.slice(0, encryptedResultLen));
        const decrypted = decryptResult(encryptedResult, this.privateKey);
        return decrypted.matches;
    }
}
/**
 * Helper function to create a Priven client from connection and program ID
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param programId - Priven program ID
 * @param wallet - Wallet keypair
 * @returns Initialized Priven client
 */
export async function createPrivenClient(connection, programId, wallet) {
    // Create provider
    const provider = new AnchorProvider(connection, {
        publicKey: wallet.publicKey,
        signTransaction: async (tx) => {
            if ("partialSign" in tx) {
                tx.partialSign(wallet);
            }
            return tx;
        },
        signAllTransactions: async (txs) => {
            txs.forEach((tx) => {
                if ("partialSign" in tx) {
                    tx.partialSign(wallet);
                }
            });
            return txs;
        },
    }, { commitment: "confirmed" });
    // Load program IDL (needs to be generated from anchor build)
    // For now, assume IDL is available
    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) {
        throw new Error("Failed to fetch program IDL");
    }
    const program = new Program(idl, provider);
    return new PrivenClient(program, provider);
}
