export interface PrivenConfig {
    /** Solana RPC URL */
    rpcUrl: string;
    /** Network: devnet or mainnet */
    network: "devnet" | "mainnet";
    /** Priven program ID */
    programId: string;
    /** Path to wallet keypair */
    wallet: string;
    /** Default max pools per query */
    defaultMaxPools: number;
    /** TEE RPC endpoint */
    teeRpc: string;
}
/**
 * Load configuration from file and environment
 */
export declare function loadConfig(): Promise<PrivenConfig>;
/**
 * Expand ~ in paths to home directory
 */
export declare function expandPath(path: string): string;
