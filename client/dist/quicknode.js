"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuickNodeClient = void 0;
exports.createDevnetClient = createDevnetClient;
exports.createMainnetClient = createMainnetClient;
/**
 * QuickNode SDK Integration for Priven
 *
 * Provides smart transaction handling with:
 * - Auto priority fee calculation
 * - Staked connection routing during congestion
 * - Optimal compute unit estimation
 */
const sdk_1 = require("@quicknode/sdk");
/**
 * QuickNode client wrapper for Priven
 *
 * Wraps the @quicknode/sdk to provide smart transaction handling
 * for Priven queries with auto priority fees.
 */
class QuickNodeClient {
    constructor(config) {
        this.endpointUrl = config.endpointUrl;
        this.endpoint = new sdk_1.Solana({
            endpointUrl: config.endpointUrl,
        });
    }
    /**
     * Get the underlying Connection object
     */
    get connection() {
        return this.endpoint.connection;
    }
    /**
     * Send a transaction with smart priority fee handling
     *
     * Uses QuickNode's sendSmartTransaction which:
     * - Automatically calculates optimal priority fees
     * - Routes through staked connections during congestion
     * - Optimizes compute units
     *
     * @param transaction - Transaction to send
     * @param signer - Keypair to sign the transaction
     * @param feeLevel - Priority fee level (default: "recommended")
     * @returns Transaction signature
     */
    async sendSmartTransaction(transaction, signer, feeLevel = "recommended") {
        console.log(`Sending smart transaction with fee level: ${feeLevel}`);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const signature = await this.endpoint.sendSmartTransaction({
                transaction,
                keyPair: signer,
                feeLevel,
            });
            console.log(`Transaction sent: ${signature}`);
            return signature;
        }
        catch (error) {
            console.error("Failed to send smart transaction:", error);
            throw error;
        }
    }
    /**
     * Prepare a transaction with optimal priority fees without sending
     *
     * Useful when you need to sign with multiple signers or
     * want to inspect the transaction before sending.
     *
     * @param transaction - Transaction to prepare
     * @param payer - Payer public key
     * @param feeLevel - Priority fee level
     * @returns Prepared transaction with priority fee instructions
     */
    async prepareSmartTransaction(transaction, payer, feeLevel = "recommended") {
        console.log(`Preparing smart transaction with fee level: ${feeLevel}`);
        const prepared = await this.endpoint.prepareSmartTransaction({
            transaction,
            payerPublicKey: payer,
            feeLevel,
        });
        return prepared;
    }
    /**
     * Fetch priority fee estimates for a specific program
     *
     * Useful for displaying fee options to users or
     * making custom fee decisions.
     *
     * @param programId - Program to get fee estimates for (optional)
     * @param lastNBlocks - Number of recent blocks to analyze (default: 100)
     * @returns Fee estimates in micro-lamports per compute unit
     */
    async fetchPriorityFeeEstimates(programId, lastNBlocks = 100) {
        console.log(`Fetching priority fee estimates (last ${lastNBlocks} blocks)`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fees = await this.endpoint.fetchEstimatePriorityFees({
            last_n_blocks: lastNBlocks,
            account: programId?.toBase58(),
        });
        // Extract per-compute-unit fees (API structure may vary)
        const perCU = fees.per_compute_unit || fees;
        return {
            low: perCU.low || 0,
            medium: perCU.medium || 0,
            high: perCU.high || 0,
            extreme: perCU.extreme || 0,
        };
    }
    /**
     * Get current slot
     */
    async getSlot() {
        return this.endpoint.connection.getSlot();
    }
    /**
     * Get account balance
     */
    async getBalance(pubkey) {
        return this.endpoint.connection.getBalance(pubkey);
    }
}
exports.QuickNodeClient = QuickNodeClient;
/**
 * Create a QuickNode client with default devnet endpoint
 */
function createDevnetClient(endpointUrl) {
    const url = endpointUrl ||
        process.env.QUICKNODE_DEVNET_RPC ||
        "https://api.devnet.solana.com";
    return new QuickNodeClient({ endpointUrl: url });
}
/**
 * Create a QuickNode client with mainnet endpoint
 */
function createMainnetClient(endpointUrl) {
    const url = endpointUrl ||
        process.env.QUICKNODE_MAINNET_RPC ||
        "https://api.mainnet-beta.solana.com";
    return new QuickNodeClient({ endpointUrl: url });
}
