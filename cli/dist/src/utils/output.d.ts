export type OutputFormat = "table" | "json";
/**
 * Format pool data for display
 */
export interface PoolDisplay {
    address: string;
    tvl: string;
    tokenAReserve: string;
    tokenBReserve: string;
}
/**
 * Format query results for display
 */
export interface QueryResultDisplay {
    matchCount: number;
    pools: string[];
    queryId: string;
    status: string;
}
/**
 * Output pools in the requested format
 */
export declare function outputPools(pools: PoolDisplay[], format: OutputFormat): void;
/**
 * Output query results in the requested format
 */
export declare function outputQueryResults(result: QueryResultDisplay, format: OutputFormat): void;
/**
 * Output an error message
 */
export declare function outputError(message: string): void;
/**
 * Output a success message
 */
export declare function outputSuccess(message: string): void;
/**
 * Output a warning message
 */
export declare function outputWarning(message: string): void;
/**
 * Output info message
 */
export declare function outputInfo(message: string): void;
/**
 * Format a number with commas
 */
export declare function formatNumber(num: number | bigint): string;
/**
 * Format lamports as SOL
 */
export declare function formatLamports(lamports: number | bigint): string;
