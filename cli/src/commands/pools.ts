/**
 * priven pools - Pool discovery commands
 *
 * Commands:
 *   priven pools list - List available CPMM pools
 *   priven pools get <address> - Get specific pool info
 *   priven pools stats - Show pool statistics
 */
import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import {
  outputPools,
  outputError,
  outputSuccess,
  outputInfo,
  formatNumber,
  OutputFormat,
  PoolDisplay,
} from "../utils/output";
import { createSpinner } from "../utils/progress";

interface PoolsListOptions {
  rpcUrl?: string;
  limit?: string;
  output?: OutputFormat;
}

interface PoolsGetOptions {
  rpcUrl?: string;
  output?: OutputFormat;
}

interface PoolsStatsOptions {
  rpcUrl?: string;
}

export function registerPoolsCommand(program: Command): void {
  const pools = program
    .command("pools")
    .description("Pool discovery commands");

  pools
    .command("list")
    .description("List Raydium CPMM pools from mainnet")
    .option("--rpc-url <url>", "Mainnet RPC URL (default: QuickNode)")
    .option("--limit <n>", "Maximum number of pools to show", "20")
    .option("--output <format>", "Output format: json or table", "table")
    .action(async (options: PoolsListOptions) => {
      await listPools(options);
    });

  pools
    .command("get <address>")
    .description("Get detailed info for a specific pool")
    .option("--rpc-url <url>", "Solana RPC URL")
    .option("--output <format>", "Output format: json or table", "table")
    .action(async (address: string, options: PoolsGetOptions) => {
      await getPool(address, options);
    });

  pools
    .command("stats")
    .description("Show Raydium CPMM pool statistics from mainnet")
    .option("--rpc-url <url>", "Mainnet RPC URL (default: QuickNode)")
    .action(async (options: PoolsStatsOptions) => {
      await showPoolStats(options);
    });
}

async function listPools(options: PoolsListOptions): Promise<void> {
  const spinner = createSpinner("Fetching pools...");

  try {
    const limit = parseInt(options.limit || "20");
    const outputFormat = (options.output || "table") as OutputFormat;

    console.log();
    console.log(chalk.bold("Raydium CPMM Pool Discovery (Mainnet)"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Limit:       ${chalk.cyan(limit)}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    spinner.start();

    const rpcUrl =
      options.rpcUrl ||
      process.env.QUICKNODE_MAINNET_RPC ||
      "https://api.mainnet-beta.solana.com";

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.text = "Fetching Raydium CPMM pools...";

    const { discoverCpmmPoolsWithRetry, RAYDIUM_CPMM_PROGRAM_ID } = await import("@priven/client");
    const poolAddresses = await discoverCpmmPoolsWithRetry(connection, { limit });

    const pools: PoolDisplay[] = poolAddresses.map((addr: PublicKey) => ({
      address: addr.toBase58(),
      tvl: "-",
      tokenAReserve: "-",
      tokenBReserve: "-",
    }));

    spinner.succeed(`Found ${poolAddresses.length} CPMM pools`);

    console.log();
    outputPools(pools, outputFormat);

    if (pools.length > 0) {
      console.log();
      console.log(chalk.gray(`Use 'priven pools get <address>' for detailed info`));
      console.log(chalk.gray(`Note: TVL requires fetching vault accounts (not shown in list)`));
    }
  } catch (error: any) {
    spinner.fail("Failed to fetch pools");
    outputError(error.message || String(error));

    if (error.message?.includes("rate")) {
      console.log(chalk.gray("\nTry again in a few seconds (rate limited)"));
    }
    process.exit(1);
  }
}

async function getPool(address: string, options: PoolsGetOptions): Promise<void> {
  const spinner = createSpinner("Fetching pool info...");

  try {
    const rpcUrl = options.rpcUrl || process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
    const outputFormat = (options.output || "table") as OutputFormat;

    let poolPubkey: PublicKey;
    try {
      poolPubkey = new PublicKey(address);
    } catch {
      outputError("Invalid pool address");
      process.exit(1);
    }

    console.log();
    console.log(chalk.bold("Pool Details"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Address:     ${chalk.cyan(address)}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    spinner.start();

    const connection = new Connection(rpcUrl, "confirmed");
    const { RAYDIUM_CPMM_PROGRAM_ID, CPMM_POOL_SIZE } = await import("@priven/client");

    const accountInfo = await connection.getAccountInfo(poolPubkey);

    if (accountInfo) {
      const isCpmmPool = accountInfo.owner.equals(RAYDIUM_CPMM_PROGRAM_ID) &&
                         accountInfo.data.length === CPMM_POOL_SIZE;

      spinner.succeed("Account found");
      console.log();

      if (outputFormat === "json") {
        console.log(JSON.stringify({
          address: address,
          owner: accountInfo.owner.toBase58(),
          lamports: accountInfo.lamports,
          dataSize: accountInfo.data.length,
          isCpmmPool,
        }, null, 2));
      } else {
        console.log(chalk.bold("  Account Information:"));
        console.log(`    ${chalk.cyan("Address:")}      ${address}`);
        console.log(`    ${chalk.cyan("Owner:")}        ${accountInfo.owner.toBase58()}`);
        console.log(`    ${chalk.cyan("Type:")}         ${isCpmmPool ? "Raydium CPMM Pool" : "Other Account"}`);
        console.log(`    ${chalk.cyan("Lamports:")}     ${formatNumber(BigInt(accountInfo.lamports))}`);
        console.log(`    ${chalk.cyan("Data Size:")}    ${accountInfo.data.length} bytes`);

        if (isCpmmPool) {
          // Parse CPMM pool data (simplified - key offsets)
          const data = accountInfo.data;
          // ammConfig at offset 8 (32 bytes)
          // token0Mint at offset 168 (32 bytes)
          // token1Mint at offset 200 (32 bytes)
          const ammConfig = new PublicKey(data.slice(8, 40));
          const token0Mint = new PublicKey(data.slice(168, 200));
          const token1Mint = new PublicKey(data.slice(200, 232));

          console.log(`    ${chalk.cyan("AMM Config:")}   ${ammConfig.toBase58()}`);
          console.log(`    ${chalk.cyan("Token 0:")}      ${token0Mint.toBase58()}`);
          console.log(`    ${chalk.cyan("Token 1:")}      ${token1Mint.toBase58()}`);
        }
      }
    } else {
      spinner.fail("Account not found");
      outputError("Account does not exist on chain");
      process.exit(1);
    }

    console.log();
  } catch (error: any) {
    spinner.fail("Failed to fetch pool");
    outputError(error.message || String(error));
    process.exit(1);
  }
}

async function showPoolStats(options: PoolsStatsOptions): Promise<void> {
  const spinner = createSpinner("Gathering pool statistics...");

  try {
    console.log();
    console.log(chalk.bold("Raydium CPMM Pool Statistics (Mainnet)"));
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    spinner.start();

    const rpcUrl =
      options.rpcUrl ||
      process.env.QUICKNODE_MAINNET_RPC ||
      "https://api.mainnet-beta.solana.com";

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.text = "Fetching CPMM pools...";

    const { discoverCpmmPoolsWithRetry, RAYDIUM_CPMM_PROGRAM_ID } = await import("@priven/client");
    const pools = await discoverCpmmPoolsWithRetry(connection, { limit: 1000 });

    spinner.succeed("Statistics gathered");
    console.log();

    console.log(chalk.bold("  Raydium CPMM Statistics:"));
    console.log(`    ${chalk.cyan("Program ID:")}    ${RAYDIUM_CPMM_PROGRAM_ID.toBase58()}`);
    console.log(`    ${chalk.cyan("Total Pools:")}   ${chalk.green(pools.length.toLocaleString())}`);
    console.log();
    console.log(chalk.gray("  Note: TVL calculation requires fetching vault accounts"));
    console.log(chalk.gray("        Use 'priven pools get <address>' for individual pool TVL"));

    console.log();
  } catch (error: any) {
    spinner.fail("Failed to gather statistics");
    outputError(error.message || String(error));
    process.exit(1);
  }
}
