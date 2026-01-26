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

const QUICKNODE_API_BASE = "https://api.quicknode.com";

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
export class StreamsClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Create a stream to monitor token account balance changes
   *
   * The filter function runs server-side on QuickNode infrastructure,
   * identifying significant balance changes before sending to webhook.
   *
   * @param config - Stream configuration
   * @returns Stream ID and details
   */
  async createTokenMonitorStream(
    config: Omit<StreamConfig, "apiKey">
  ): Promise<StreamResponse> {
    // Build filter function (runs on QuickNode's infrastructure)
    const filterFunction = buildTokenChangeFilter(
      config.tokenMint?.toBase58(),
      config.minBalanceChange
    );

    // Base64 encode the filter function
    const filterBase64 = Buffer.from(filterFunction).toString("base64");

    const streamName = config.name || `priven-monitor-${Date.now()}`;

    const requestBody = {
      name: streamName,
      network: config.network,
      dataset: "block",
      filter_function: filterBase64,
      region: "us-east-1",
      start_range: -1, // Start from latest block
      destination: {
        type: "webhook",
        attributes: {
          url: config.webhookUrl,
          compression: "none",
          max_retry: 3,
          retry_interval_sec: 5,
          post_timeout_sec: 30,
        },
      },
    };

    console.log("Creating QuickNode Stream for token monitoring...");
    console.log("  Network:", config.network);
    console.log("  Webhook:", config.webhookUrl);
    if (config.tokenMint) {
      console.log("  Token Mint:", config.tokenMint.toBase58());
    }
    if (config.minBalanceChange) {
      console.log("  Min Balance Change:", config.minBalanceChange.toString());
    }

    const response = await fetch(
      `${QUICKNODE_API_BASE}/streams/rest/v1/streams`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create stream: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log("✓ Stream created:", result.id);

    return {
      id: result.id,
      name: result.name,
      status: result.status || "active",
      network: config.network,
      createdAt: result.created_at,
    };
  }

  /**
   * List all streams for the account
   */
  async listStreams(): Promise<StreamResponse[]> {
    const response = await fetch(
      `${QUICKNODE_API_BASE}/streams/rest/v1/streams?limit=100`,
      {
        headers: { "x-api-key": this.apiKey },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list streams: ${response.status}`);
    }

    const result = await response.json();
    return (result.data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      network: s.network,
      createdAt: s.created_at,
    }));
  }

  /**
   * Get a specific stream by ID
   */
  async getStream(streamId: string): Promise<StreamResponse | null> {
    const response = await fetch(
      `${QUICKNODE_API_BASE}/streams/rest/v1/streams/${streamId}`,
      {
        headers: { "x-api-key": this.apiKey },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get stream: ${response.status}`);
    }

    const s = await response.json();
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      network: s.network,
      createdAt: s.created_at,
    };
  }

  /**
   * Pause a stream
   */
  async pauseStream(streamId: string): Promise<void> {
    const response = await fetch(
      `${QUICKNODE_API_BASE}/streams/rest/v1/streams/${streamId}/pause`,
      {
        method: "POST",
        headers: { "x-api-key": this.apiKey },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to pause stream: ${response.status}`);
    }
    console.log("✓ Stream paused:", streamId);
  }

  /**
   * Activate a paused stream
   */
  async activateStream(streamId: string): Promise<void> {
    const response = await fetch(
      `${QUICKNODE_API_BASE}/streams/rest/v1/streams/${streamId}/activate`,
      {
        method: "POST",
        headers: { "x-api-key": this.apiKey },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to activate stream: ${response.status}`);
    }
    console.log("✓ Stream activated:", streamId);
  }

  /**
   * Delete a stream
   */
  async deleteStream(streamId: string): Promise<void> {
    const response = await fetch(
      `${QUICKNODE_API_BASE}/streams/rest/v1/streams/${streamId}`,
      {
        method: "DELETE",
        headers: { "x-api-key": this.apiKey },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete stream: ${response.status}`);
    }
    console.log("✓ Stream deleted:", streamId);
  }

  /**
   * Test a filter function against a specific block
   * Useful for validating the filter before deploying
   *
   * @param network - Network to test on
   * @param blockNumber - Block number to test against
   * @param filterFunction - JavaScript filter function code
   * @returns Filter output for the block
   */
  async testFilter(
    network: SolanaNetwork,
    blockNumber: number,
    filterFunction: string
  ): Promise<any> {
    const filterBase64 = Buffer.from(filterFunction).toString("base64");

    const response = await fetch(
      `${QUICKNODE_API_BASE}/streams/rest/v1/streams/test_filter`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          network,
          block: blockNumber,
          dataset: "block",
          filter_function: filterBase64,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Filter test failed: ${response.status} - ${error}`);
    }

    return response.json();
  }
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
export function buildTokenChangeFilter(
  tokenMint?: string,
  minBalanceChange?: bigint
): string {
  const mintFilter = tokenMint ? `"${tokenMint}"` : "null";
  const minChange = minBalanceChange?.toString() || "0";

  return `
// QuickNode Streams filter for Priven token monitoring
// Identifies significant balance changes in token accounts

function main(block) {
  const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const TARGET_MINT = ${mintFilter};
  const MIN_CHANGE = BigInt("${minChange}");

  const changes = [];

  // Iterate through all transactions in the block
  for (const tx of block.transactions || []) {
    if (tx.meta?.err) continue; // Skip failed transactions

    // Check for token balance changes
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Build map of pre-balances
    const preMap = new Map();
    for (const pre of preBalances) {
      const key = pre.accountIndex + "-" + (pre.mint || "");
      preMap.set(key, {
        amount: BigInt(pre.uiTokenAmount?.amount || "0"),
        mint: pre.mint,
        owner: pre.owner,
      });
    }

    // Compare with post-balances
    for (const post of postBalances) {
      const key = post.accountIndex + "-" + (post.mint || "");
      const pre = preMap.get(key);
      const preAmount = pre?.amount || BigInt(0);
      const postAmount = BigInt(post.uiTokenAmount?.amount || "0");

      // Skip if mint filter doesn't match
      if (TARGET_MINT && post.mint !== TARGET_MINT) continue;

      // Calculate absolute change
      const change = postAmount > preAmount
        ? postAmount - preAmount
        : preAmount - postAmount;

      // Only include significant changes
      if (change >= MIN_CHANGE) {
        changes.push({
          account: tx.transaction?.message?.accountKeys?.[post.accountIndex] || "unknown",
          mint: post.mint,
          owner: post.owner,
          previousBalance: preAmount.toString(),
          newBalance: postAmount.toString(),
          changeAmount: change.toString(),
          slot: block.slot,
          signature: tx.transaction?.signatures?.[0] || "unknown",
        });
      }
    }
  }

  // Return filtered data (null = no webhook call)
  return changes.length > 0 ? { data: changes, blockSlot: block.slot } : null;
}
`;
}

/**
 * Create a StreamsClient from environment variable
 */
export function createStreamsClient(apiKey?: string): StreamsClient {
  const key = apiKey || process.env.QUICKNODE_API_KEY;
  if (!key) {
    throw new Error(
      "QUICKNODE_API_KEY environment variable or apiKey parameter required"
    );
  }
  return new StreamsClient(key);
}

/**
 * Priven event types that can be monitored
 */
export type PrivenEventType =
  | "query_submitted"
  | "query_delegated"
  | "query_executed"
  | "result_committed";

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
export function buildPrivenFilter(config: PrivenFilterConfig = {}): string {
  const programId = config.programId || "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM";
  const eventTypes = config.eventTypes || ["query_submitted", "query_delegated", "query_executed", "result_committed"];
  const userPubkeys = config.userPubkeys || [];
  const includeLogs = config.includeLogs ?? false;

  return `function main(payload) {
  const { data, metadata } = payload;

  const PRIVEN_PROGRAM = "${programId}";
  const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
  const MONITOR_EVENTS = ${JSON.stringify(eventTypes)};
  const USER_FILTER = ${JSON.stringify(userPubkeys)};
  const INCLUDE_LOGS = ${includeLogs};

  const INSTRUCTION_MAP = {
    "SubmitQuery": "query_submitted",
    "DelegateQuery": "query_delegated",
    "ExecuteQuery": "query_executed",
    "CommitResult": "result_committed",
  };

  const events = [];

  for (const block of data || []) {
    for (const tx of block.transactions || []) {
      if (tx.meta?.err) continue;

      const accounts = tx.transaction?.message?.accountKeys || [];
      const logs = tx.meta?.logMessages || [];

      const pubkeys = accounts.map(a => typeof a === "string" ? a : a.pubkey);
      if (!pubkeys.some(pk => pk === PRIVEN_PROGRAM || pk === DELEGATION_PROGRAM)) continue;

      let eventType = null;
      for (const log of logs) {
        const match = log.match(/Instruction: (\\w+)/);
        if (match && INSTRUCTION_MAP[match[1]]) {
          eventType = INSTRUCTION_MAP[match[1]];
          break;
        }
      }

      if (!eventType || !MONITOR_EVENTS.includes(eventType)) continue;

      if (USER_FILTER.length > 0) {
        const matchesUser = pubkeys.some(pk => USER_FILTER.includes(pk));
        if (!matchesUser) continue;
      }

      const event = {
        type: eventType,
        signature: tx.transaction?.signatures?.[0],
        slot: block.parentSlot + 1,
        blockTime: block.blockTime,
        accounts: accounts.filter(a => a.writable).map(a => a.pubkey),
        fee: tx.meta?.fee,
      };

      if (INCLUDE_LOGS) {
        event.logs = logs.filter(l => l.includes(PRIVEN_PROGRAM) || l.includes("Instruction:"));
      }

      events.push(event);
    }
  }

  if (events.length === 0) return null;

  return { data: events, metadata };
}`;
}
