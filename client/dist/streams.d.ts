/**
 * QuickNode Streams Integration for Priven
 *
 * Real-time blockchain data monitoring that triggers private queries
 * when significant events are detected (e.g., large balance changes).
 *
 * Flow:
 * 1. Create a Stream to monitor token account changes
 * 2. Filter for significant balance changes (>threshold)
 * 3. Webhook triggers private query to TEE
 * 4. Results encrypted - only user can see what matched
 */
import { PublicKey } from "@solana/web3.js";
/**
 * Supported Solana networks for Streams
 */
export type SolanaNetwork = "solana-devnet" | "solana-mainnet" | "solana-testnet";
/**
 * Stream status
 */
export type StreamStatus = "active" | "paused" | "creating" | "error";
/**
 * Stream configuration for monitoring token changes
 */
export interface StreamConfig {
    /** QuickNode API key (from dashboard) */
    apiKey: string;
    /** Network to monitor */
    network: SolanaNetwork;
    /** Webhook URL to receive events */
    webhookUrl: string;
    /** Stream name (optional) */
    name?: string;
    /** Optional: filter by specific token mint */
    tokenMint?: PublicKey;
    /** Optional: minimum balance change to trigger (in lamports) */
    minBalanceChange?: bigint;
}
/**
 * Stream creation response
 */
export interface StreamResponse {
    id: string;
    name: string;
    status: StreamStatus;
    network: SolanaNetwork;
    createdAt?: string;
}
/**
 * Webhook payload from QuickNode Streams
 */
export interface StreamWebhookPayload {
    blockSlot: number;
    data: TokenAccountChange[];
}
/**
 * Token account change event
 */
export interface TokenAccountChange {
    account: string;
    mint: string;
    owner: string;
    previousBalance: string;
    newBalance: string;
    changeAmount: string;
    slot: number;
    signature: string;
}
/**
 * QuickNode Streams client for Priven
 */
export declare class StreamsClient {
    private apiKey;
    constructor(apiKey: string);
    /**
     * Create a stream to monitor token account balance changes
     *
     * The filter function runs server-side on QuickNode infrastructure,
     * identifying significant balance changes before sending to webhook.
     *
     * @param config - Stream configuration
     * @returns Stream ID and details
     */
    createTokenMonitorStream(config: Omit<StreamConfig, "apiKey">): Promise<StreamResponse>;
    /**
     * List all streams for the account
     */
    listStreams(): Promise<StreamResponse[]>;
    /**
     * Get a specific stream by ID
     */
    getStream(streamId: string): Promise<StreamResponse | null>;
    /**
     * Pause a stream
     */
    pauseStream(streamId: string): Promise<void>;
    /**
     * Activate a paused stream
     */
    activateStream(streamId: string): Promise<void>;
    /**
     * Delete a stream
     */
    deleteStream(streamId: string): Promise<void>;
    /**
     * Test a filter function against a specific block
     * Useful for validating the filter before deploying
     *
     * @param network - Network to test on
     * @param blockNumber - Block number to test against
     * @param filterFunction - JavaScript filter function code
     * @returns Filter output for the block
     */
    testFilter(network: SolanaNetwork, blockNumber: number, filterFunction: string): Promise<any>;
}
/**
 * Build the JavaScript filter function for token monitoring
 *
 * This function runs on QuickNode's servers and filters block data
 * to identify significant token account balance changes.
 *
 * @param tokenMint - Optional: only monitor this token mint
 * @param minBalanceChange - Optional: minimum change to trigger webhook
 * @returns JavaScript code as string
 */
export declare function buildTokenChangeFilter(tokenMint?: string, minBalanceChange?: bigint): string;
/**
 * Create a StreamsClient from environment variable
 */
export declare function createStreamsClient(apiKey?: string): StreamsClient;
/**
 * Priven event types that can be monitored
 */
export type PrivenEventType = "query_submitted" | "query_delegated" | "query_executed" | "result_committed";
/**
 * Configuration for Priven stream filter
 */
export interface PrivenFilterConfig {
    /** Priven TEE program ID (default: EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM) */
    programId?: string;
    /** Only monitor specific event types (default: all) */
    eventTypes?: PrivenEventType[];
    /** Only monitor queries from specific users */
    userPubkeys?: string[];
    /** Include full log messages in output */
    includeLogs?: boolean;
}
/**
 * Build a QuickNode Streams filter for monitoring Priven TEE events
 *
 * Monitors:
 * - Query submissions (submit_query)
 * - TEE delegations (delegate_query)
 * - Query executions in TEE (execute_query)
 * - Result commits back to L1 (commit_result)
 *
 * @param config - Filter configuration
 * @returns JavaScript filter function code ready to paste into QuickNode Streams
 */
export declare function buildPrivenFilter(config?: PrivenFilterConfig): string;
//# sourceMappingURL=streams.d.ts.map