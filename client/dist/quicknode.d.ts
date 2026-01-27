import { Connection, Keypair, Transaction, VersionedTransaction, TransactionSignature, PublicKey } from "@solana/web3.js";
/**
 * Fee levels for transaction priority
 */
export type FeeLevel = "low" | "medium" | "high" | "recommended";
/**
 * QuickNode client configuration
 */
export interface QuickNodeConfig {
    /** QuickNode RPC endpoint URL */
    endpointUrl: string;
}
/**
 * Priority fee estimates from QuickNode
 */
export interface PriorityFeeEstimate {
    low: number;
    medium: number;
    high: number;
    extreme: number;
}
/**
 * QuickNode client wrapper for Priven
 *
 * Wraps the @quicknode/sdk to provide smart transaction handling
 * for Priven queries with auto priority fees.
 */
export declare class QuickNodeClient {
    private endpoint;
    private endpointUrl;
    constructor(config: QuickNodeConfig);
    /**
     * Get the underlying Connection object
     */
    get connection(): Connection;
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
    sendSmartTransaction(transaction: Transaction | VersionedTransaction, signer: Keypair, feeLevel?: FeeLevel): Promise<TransactionSignature>;
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
    prepareSmartTransaction(transaction: Transaction, payer: PublicKey, feeLevel?: FeeLevel): Promise<Transaction>;
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
    fetchPriorityFeeEstimates(programId?: PublicKey, lastNBlocks?: number): Promise<PriorityFeeEstimate>;
    /**
     * Get current slot
     */
    getSlot(): Promise<number>;
    /**
     * Get account balance
     */
    getBalance(pubkey: PublicKey): Promise<number>;
}
/**
 * Create a QuickNode client with default devnet endpoint
 */
export declare function createDevnetClient(endpointUrl?: string): QuickNodeClient;
/**
 * Create a QuickNode client with mainnet endpoint
 */
export declare function createMainnetClient(endpointUrl?: string): QuickNodeClient;
//# sourceMappingURL=quicknode.d.ts.map