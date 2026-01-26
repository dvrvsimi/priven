/**
 * Priven TEE Client
 *
 * Privacy-preserving pool queries using MagicBlock TEE
 */
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction, } from "@solana/web3.js";
import { encryptPredicate, decryptResult } from "./encryption";
import { fetchRaydiumPoolsWithRetry } from "./pools";
import { createTeeSession, createTeeConnection, waitForCommit, TEE_VALIDATORS, } from "./tee";
// Helper to sign transactions
function signTransaction(tx, wallet) {
    if (tx instanceof Transaction) {
        tx.partialSign(wallet);
    }
    return tx;
}
function signAllTransactions(txs, wallet) {
    txs.forEach((tx) => {
        if (tx instanceof Transaction) {
            tx.partialSign(wallet);
        }
    });
    return txs;
}
// Priven TEE Program ID
export const PRIVEN_TEE_PROGRAM_ID = new PublicKey("EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM");
// Seeds
const QUERY_SEED = Buffer.from("query");
const RESULT_SEED = Buffer.from("result");
const CONFIG_SEED = Buffer.from("config");
/**
 * Main client for Priven TEE protocol
 */
export class PrivenClient {
    program;
    wallet;
    baseConnection;
    teeSession = null;
    constructor(program, wallet, baseConnection) {
        this.program = program;
        this.wallet = wallet;
        this.baseConnection = baseConnection;
    }
    /**
     * Initialize TEE session (call before queries)
     */
    async initTeeSession() {
        this.teeSession = await createTeeSession(this.wallet, this.baseConnection.rpcEndpoint);
        console.log(`TEE session created (verified: ${this.teeSession.verified})`);
    }
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
    async query(predicate, options) {
        const maxPools = options?.maxPools || 5;
        const timeout = options?.timeout || 30000;
        // Ensure TEE session
        if (!this.teeSession) {
            await this.initTeeSession();
        }
        console.log("Starting private pool query (TEE)...");
        console.log(`  Min TVL: ${predicate.minTvl}`);
        console.log(`  Max TVL: ${predicate.maxTvl}`);
        // Step 1: Fetch pools
        console.log("\nStep 1/6: Fetching pools from QuickNode...");
        const pools = await fetchRaydiumPoolsWithRetry(this.baseConnection, {
            status: 1,
        });
        if (pools.length === 0) {
            throw new Error("No Raydium pools found");
        }
        const selectedPools = pools.slice(0, maxPools);
        console.log(`Selected ${selectedPools.length} pools`);
        // Step 2: Encrypt predicate
        console.log("\nStep 2/6: Encrypting search criteria...");
        const teePublicKey = TEE_VALIDATORS.TEE.toBytes();
        const encrypted = await encryptPredicate(predicate, teePublicKey);
        console.log("Predicate encrypted (AES-256-GCM)");
        // Step 3: Submit query to L1
        console.log("\nStep 3/6: Submitting query to L1...");
        const queryId = new BN(Date.now() * 1000 + Math.floor(Math.random() * 1000));
        const [queryStatePda] = this.deriveQueryStatePda(queryId);
        const [queryResultPda] = this.deriveQueryResultPda(queryId);
        await this.submitQuery(queryId, encrypted, selectedPools);
        console.log(`Query submitted (ID: ${queryId.toString()})`);
        console.log(`  QueryState PDA: ${queryStatePda.toBase58()}`);
        // Step 4: Delegate to TEE
        console.log("\nStep 4/6: Delegating to TEE...");
        await this.delegateQuery(queryId);
        console.log("Query delegated");
        // Step 5: Execute in TEE
        console.log("\nStep 5/6: Executing in TEE...");
        await this.executeInTee(queryId, encrypted.privateKey);
        console.log("TEE execution complete");
        // Step 6: Commit and fetch results
        console.log("\nStep 6/6: Committing and fetching results...");
        await this.commitResult(queryId);
        // Wait for result on L1
        const committed = await waitForCommit(this.baseConnection, queryResultPda, timeout);
        if (!committed) {
            throw new Error("Timeout waiting for result commit");
        }
        // Fetch and decrypt
        const result = await this.fetchAndDecryptResults(queryId, encrypted.privateKey, teePublicKey);
        console.log(`Query complete: ${result.length} matching pools\n`);
        return result;
    }
    /**
     * Submit query to L1
     */
    async submitQuery(queryId, encrypted, pools) {
        const poolData = pools.map((p) => ({
            address: p.address,
            tokenAReserve: new BN(p.tokenAReserve.toString()),
            tokenBReserve: new BN(p.tokenBReserve.toString()),
        }));
        const tx = await this.program.methods
            .submitQuery(queryId, Array.from(encrypted.ciphertext), Array.from(encrypted.publicKey), poolData)
            .accounts({
            user: this.wallet.publicKey,
        })
            .signers([this.wallet])
            .rpc();
        return tx;
    }
    /**
     * Delegate query to TEE
     */
    async delegateQuery(queryId) {
        const tx = await this.program.methods
            .delegateQuery()
            .accounts({
            user: this.wallet.publicKey,
        })
            .signers([this.wallet])
            .rpc();
        return tx;
    }
    /**
     * Execute query in TEE
     */
    async executeInTee(queryId, decryptionKey) {
        if (!this.teeSession) {
            throw new Error("TEE session not initialized");
        }
        // Create connection to TEE RPC
        const teeConnection = createTeeConnection(this.teeSession);
        // Create provider for TEE
        const teeProvider = new AnchorProvider(teeConnection, {
            publicKey: this.wallet.publicKey,
            signTransaction: async (tx) => signTransaction(tx, this.wallet),
            signAllTransactions: async (txs) => signAllTransactions(txs, this.wallet),
        }, { commitment: "confirmed" });
        // Create program instance for TEE
        const teeProgram = new Program(this.program.idl, teeProvider);
        // Execute in TEE
        const tx = await teeProgram.methods
            .executeQuery(Array.from(decryptionKey.slice(0, 32)))
            .accounts({
            teeValidator: TEE_VALIDATORS.TEE,
            payer: this.wallet.publicKey,
        })
            .signers([this.wallet])
            .rpc();
        return tx;
    }
    /**
     * Commit result back to L1
     */
    async commitResult(queryId) {
        if (!this.teeSession) {
            throw new Error("TEE session not initialized");
        }
        const teeConnection = createTeeConnection(this.teeSession);
        const teeProvider = new AnchorProvider(teeConnection, {
            publicKey: this.wallet.publicKey,
            signTransaction: async (tx) => signTransaction(tx, this.wallet),
            signAllTransactions: async (txs) => signAllTransactions(txs, this.wallet),
        }, { commitment: "confirmed" });
        const teeProgram = new Program(this.program.idl, teeProvider);
        const tx = await teeProgram.methods
            .commitResult()
            .accounts({
            payer: this.wallet.publicKey,
        })
            .signers([this.wallet])
            .rpc();
        return tx;
    }
    /**
     * Fetch and decrypt results
     */
    async fetchAndDecryptResults(queryId, privateKey, teePublicKey) {
        const [queryResultPda] = this.deriveQueryResultPda(queryId);
        const queryResult = await this.program.account.queryResult.fetch(queryResultPda);
        if (!queryResult.success) {
            throw new Error("Query execution failed");
        }
        const encryptedResult = new Uint8Array(queryResult.encryptedResult.slice(0, queryResult.encryptedLen));
        const result = await decryptResult(encryptedResult, privateKey, teePublicKey);
        return result.matches;
    }
    // PDA derivation helpers
    deriveConfigPda() {
        return PublicKey.findProgramAddressSync([CONFIG_SEED], this.program.programId);
    }
    deriveQueryStatePda(queryId) {
        return PublicKey.findProgramAddressSync([QUERY_SEED, this.wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)], this.program.programId);
    }
    deriveQueryResultPda(queryId) {
        return PublicKey.findProgramAddressSync([RESULT_SEED, this.wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)], this.program.programId);
    }
}
/**
 * Create a Priven TEE client
 */
export async function createPrivenClient(connection, wallet, programId = PRIVEN_TEE_PROGRAM_ID) {
    const provider = new AnchorProvider(connection, {
        publicKey: wallet.publicKey,
        signTransaction: async (tx) => signTransaction(tx, wallet),
        signAllTransactions: async (txs) => signAllTransactions(txs, wallet),
    }, { commitment: "confirmed" });
    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) {
        throw new Error("Failed to fetch program IDL");
    }
    const program = new Program(idl, provider);
    return new PrivenClient(program, wallet, connection);
}
