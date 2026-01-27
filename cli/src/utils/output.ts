/**
 * Output formatting utilities
 */
import Table from "cli-table3";
import chalk from "chalk";

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
export function outputPools(pools: PoolDisplay[], format: OutputFormat): void {
  if (format === "json") {
    console.log(JSON.stringify(pools, null, 2));
    return;
  }

  if (pools.length === 0) {
    console.log(chalk.yellow("No pools found matching criteria"));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan("Address"),
      chalk.cyan("TVL"),
      chalk.cyan("Token A Reserve"),
      chalk.cyan("Token B Reserve"),
    ],
    colWidths: [46, 20, 20, 20],
  });

  for (const pool of pools) {
    table.push([
      pool.address,
      pool.tvl,
      pool.tokenAReserve,
      pool.tokenBReserve,
    ]);
  }

  console.log(table.toString());
  console.log(chalk.gray(`\nTotal: ${pools.length} pools`));
}

/**
 * Output query results in the requested format
 */
export function outputQueryResults(
  result: QueryResultDisplay,
  format: OutputFormat
): void {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log();
  console.log(chalk.green.bold("Query Results"));
  console.log(chalk.gray("─".repeat(50)));
  console.log(`  Query ID:     ${chalk.cyan(result.queryId)}`);
  console.log(`  Status:       ${chalk.green(result.status)}`);
  console.log(`  Match Count:  ${chalk.yellow(result.matchCount)}`);
  console.log();

  if (result.pools.length > 0) {
    console.log(chalk.white.bold("  Matching Pools:"));
    for (const pool of result.pools) {
      console.log(`    ${chalk.cyan("•")} ${pool}`);
    }
  } else {
    console.log(chalk.yellow("  No pools matched the predicate"));
  }

  console.log();
}

/**
 * Output an error message
 */
export function outputError(message: string): void {
  console.error(chalk.red.bold("Error:"), message);
}

/**
 * Output a success message
 */
export function outputSuccess(message: string): void {
  console.log(chalk.green.bold("✓"), message);
}

/**
 * Output a warning message
 */
export function outputWarning(message: string): void {
  console.log(chalk.yellow.bold("⚠"), message);
}

/**
 * Output info message
 */
export function outputInfo(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

/**
 * Format a number with commas
 */
export function formatNumber(num: number | bigint): string {
  return num.toLocaleString();
}

/**
 * Format lamports as SOL
 */
export function formatLamports(lamports: number | bigint): string {
  const sol = Number(lamports) / 1e9;
  return `${sol.toFixed(4)} SOL`;
}
