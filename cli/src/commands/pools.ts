/**
 * priven pools - Pool discovery commands
 *
 * Commands:
 *   priven pools list - List available pools
 *   priven pools get <address> - Get specific pool info
 *   priven pools stats - Show pool statistics
 */
import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import type { TokenAccountData, PoolData } from "@priven/client";
import { loadConfig } from "../config";
import { loadWallet } from "../utils/wallet";
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
  wallet?: string;
  network?: "devnet" | "mainnet";
  minTvl?: string;
  limit?: string;
  output?: OutputFormat;
}

interface PoolsGetOptions {
  rpcUrl?: string;
  output?: OutputFormat;
}

interface PoolsStatsOptions {
  rpcUrl?: string;
  network?: "devnet" | "mainnet";
}

export function registerPoolsCommand(program: Command): void {
  const pools = program
    .command("pools")
    .description("Pool discovery commands");

  pools
    .command("list")
    .description("List available pools")
    .option("--rpc-url <url>", "Solana RPC URL")
    .option("--wallet <path>", "Path to wallet keypair (for token accounts)")
    .option("--network <network>", "Network: devnet or mainnet", "devnet")
    .option("--min-tvl <lamports>", "Minimum TVL filter")
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
    .description("Show pool statistics")
    .option("--rpc-url <url>", "Solana RPC URL")
    .option("--network <network>", "Network: devnet or mainnet", "devnet")
    .action(async (options: PoolsStatsOptions) => {
      await showPoolStats(options);
    });
}

async function listPools(options: PoolsListOptions): Promise<void> {
  const spinner = createSpinner("Fetching pools...");

  try {
    const config = await loadConfig();
    const network = options.network || config.network;
    const limit = parseInt(options.limit || "20");
    const minTvl = options.minTvl ? BigInt(options.minTvl) : 0n;
    const outputFormat = (options.output || "table") as OutputFormat;

    console.log();
    console.log(chalk.bold("Pool Discovery"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Network:     ${chalk.cyan(network)}`);
    if (minTvl > 0n) {
      console.log(`  Min TVL:     ${chalk.yellow(formatNumber(minTvl))}`);
    }
    console.log(`  Limit:       ${chalk.cyan(limit)}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    spinner.start();

    let pools: PoolDisplay[] = [];

    if (network === "devnet") {
      // On devnet, fetch token accounts from wallet
      const rpcUrl = options.rpcUrl || config.rpcUrl;
      const walletPath = options.wallet || config.wallet;

      const connection = new Connection(rpcUrl, "confirmed");
      const wallet = loadWallet(walletPath);

      spinner.text = `Fetching token accounts for ${wallet.publicKey.toBase58().slice(0, 8)}...`;

      const { fetchTokenAccountsByOwner } = await import("@priven/client");
      const accounts = await fetchTokenAccountsByOwner(connection, wallet.publicKey);

      const filteredAccounts = accounts
        .filter((a: TokenAccountData) => a.balance >= minTvl)
        .sort((a: TokenAccountData, b: TokenAccountData) => {
          // Sort by balance descending
          if (b.balance > a.balance) return 1;
          if (b.balance < a.balance) return -1;
          return 0;
        })
        .slice(0, limit);

      pools = filteredAccounts.map((a: TokenAccountData) => ({
        address: a.address.toBase58(),
        tvl: formatNumber(a.balance),
        tokenAReserve: formatNumber(a.balance),
        tokenBReserve: "0",
      }));

      spinner.succeed(`Found ${accounts.length} token accounts (showing ${pools.length})`);
    } else {
      // On mainnet, fetch Raydium pools with retry
      const rpcUrl =
        options.rpcUrl ||
        process.env.QUICKNODE_MAINNET_RPC ||
        "https://api.mainnet-beta.solana.com";

      const connection = new Connection(rpcUrl, "confirmed");

      spinner.text = "Fetching Raydium V4 pools (with retry)...";

      const { fetchRaydiumPoolsWithRetry, calculateTVL } = await import("@priven/client");
      const raydiumPools = await fetchRaydiumPoolsWithRetry(connection, {
        status: 1, // Only active pools
        minTvlPrefilter: minTvl,
      });

      // Sort by TVL descending
      raydiumPools.sort((a: PoolData, b: PoolData) => {
        const tvlA = calculateTVL(a);
        const tvlB = calculateTVL(b);
        if (tvlB > tvlA) return 1;
        if (tvlB < tvlA) return -1;
        return 0;
      });

      pools = raydiumPools.slice(0, limit).map((p: PoolData) => {
        const tvl = BigInt(p.tokenAReserve.toString()) + BigInt(p.tokenBReserve.toString());
        return {
          address: p.address.toBase58(),
          tvl: formatNumber(tvl),
          tokenAReserve: formatNumber(BigInt(p.tokenAReserve.toString())),
          tokenBReserve: formatNumber(BigInt(p.tokenBReserve.toString())),
        };
      });

      spinner.succeed(`Found ${raydiumPools.length} active Raydium pools (showing ${pools.length})`);
    }

    console.log();
    outputPools(pools, outputFormat);

    // Summary
    if (pools.length > 0) {
      console.log();
      console.log(chalk.gray(`Use 'priven pools get <address>' for detailed info`));
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
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const outputFormat = (options.output || "table") as OutputFormat;

    // Validate address
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
    const { getMultiplePools, RAYDIUM_V4_PROGRAM_ID } = await import("@priven/client");

    // Try to fetch as Raydium pool
    const pools = await getMultiplePools(connection, [poolPubkey]);

    if (pools.length > 0) {
      const pool = pools[0];
      const tvl = BigInt(pool.tokenAReserve.toString()) + BigInt(pool.tokenBReserve.toString());

      spinner.succeed("Pool found");
      console.log();

      if (outputFormat === "json") {
        console.log(JSON.stringify({
          address: pool.address.toBase58(),
          type: "Raydium V4",
          tokenAReserve: pool.tokenAReserve.toString(),
          tokenBReserve: pool.tokenBReserve.toString(),
          tvl: tvl.toString(),
        }, null, 2));
      } else {
        console.log(chalk.bold("  Pool Information:"));
        console.log(`    ${chalk.cyan("Address:")}      ${pool.address.toBase58()}`);
        console.log(`    ${chalk.cyan("Type:")}         Raydium V4 AMM`);
        console.log(`    ${chalk.cyan("Token A:")}      ${formatNumber(BigInt(pool.tokenAReserve.toString()))}`);
        console.log(`    ${chalk.cyan("Token B:")}      ${formatNumber(BigInt(pool.tokenBReserve.toString()))}`);
        console.log(`    ${chalk.cyan("TVL:")}          ${formatNumber(tvl)}`);
        console.log(`    ${chalk.cyan("Program:")}      ${RAYDIUM_V4_PROGRAM_ID.toBase58()}`);
      }
    } else {
      // Try as token account
      const accountInfo = await connection.getAccountInfo(poolPubkey);

      if (accountInfo) {
        spinner.succeed("Account found");
        console.log();

        if (outputFormat === "json") {
          console.log(JSON.stringify({
            address: address,
            owner: accountInfo.owner.toBase58(),
            lamports: accountInfo.lamports,
            dataSize: accountInfo.data.length,
            executable: accountInfo.executable,
          }, null, 2));
        } else {
          console.log(chalk.bold("  Account Information:"));
          console.log(`    ${chalk.cyan("Address:")}      ${address}`);
          console.log(`    ${chalk.cyan("Owner:")}        ${accountInfo.owner.toBase58()}`);
          console.log(`    ${chalk.cyan("Lamports:")}     ${formatNumber(BigInt(accountInfo.lamports))}`);
          console.log(`    ${chalk.cyan("Data Size:")}    ${accountInfo.data.length} bytes`);
          console.log(`    ${chalk.cyan("Executable:")}   ${accountInfo.executable}`);
        }
      } else {
        spinner.fail("Pool/account not found");
        outputError("Account does not exist on chain");
        process.exit(1);
      }
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
    const config = await loadConfig();
    const network = options.network || config.network;

    console.log();
    console.log(chalk.bold("Pool Statistics"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Network:     ${chalk.cyan(network)}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    spinner.start();

    if (network === "mainnet") {
      const rpcUrl =
        options.rpcUrl ||
        process.env.QUICKNODE_MAINNET_RPC ||
        "https://api.mainnet-beta.solana.com";

      const connection = new Connection(rpcUrl, "confirmed");

      spinner.text = "Fetching Raydium pools...";

      const { fetchRaydiumPoolsWithRetry, calculateTVL, RAYDIUM_V4_PROGRAM_ID } = await import("@priven/client");
      const pools = await fetchRaydiumPoolsWithRetry(connection, { status: 1 });

      // Calculate statistics
      let totalTvl = 0n;
      let minPoolTvl = BigInt(Number.MAX_SAFE_INTEGER);
      let maxPoolTvl = 0n;

      for (const pool of pools) {
        const tvl = calculateTVL(pool);
        totalTvl += tvl;
        if (tvl < minPoolTvl) minPoolTvl = tvl;
        if (tvl > maxPoolTvl) maxPoolTvl = tvl;
      }

      const avgTvl = pools.length > 0 ? totalTvl / BigInt(pools.length) : 0n;

      spinner.succeed("Statistics gathered");
      console.log();

      console.log(chalk.bold("  Raydium V4 Statistics:"));
      console.log(`    ${chalk.cyan("Program ID:")}    ${RAYDIUM_V4_PROGRAM_ID.toBase58()}`);
      console.log(`    ${chalk.cyan("Total Pools:")}   ${chalk.green(pools.length.toLocaleString())}`);
      console.log(`    ${chalk.cyan("Total TVL:")}     ${chalk.green(formatNumber(totalTvl))}`);
      console.log(`    ${chalk.cyan("Average TVL:")}   ${formatNumber(avgTvl)}`);
      console.log(`    ${chalk.cyan("Min Pool TVL:")} ${formatNumber(minPoolTvl)}`);
      console.log(`    ${chalk.cyan("Max Pool TVL:")} ${formatNumber(maxPoolTvl)}`);
    } else {
      // Devnet - show token account stats
      const rpcUrl = options.rpcUrl || config.rpcUrl;
      const walletPath = config.wallet;

      const connection = new Connection(rpcUrl, "confirmed");
      const wallet = loadWallet(walletPath);

      spinner.text = "Fetching token accounts...";

      const { fetchTokenAccountsByOwner, TOKEN_PROGRAM_ID } = await import("@priven/client");
      const accounts = await fetchTokenAccountsByOwner(connection, wallet.publicKey);

      let totalBalance = 0n;
      for (const account of accounts) {
        totalBalance += account.balance;
      }

      spinner.succeed("Statistics gathered");
      console.log();

      console.log(chalk.bold("  Token Account Statistics:"));
      console.log(`    ${chalk.cyan("Wallet:")}         ${wallet.publicKey.toBase58().slice(0, 20)}...`);
      console.log(`    ${chalk.cyan("Token Program:")}  ${TOKEN_PROGRAM_ID.toBase58()}`);
      console.log(`    ${chalk.cyan("Total Accounts:")} ${chalk.green(accounts.length.toLocaleString())}`);
      console.log(`    ${chalk.cyan("Total Balance:")}  ${chalk.green(formatNumber(totalBalance))}`);

      outputInfo("Note: Devnet uses token accounts as mock pools for testing");
    }

    console.log();
  } catch (error: any) {
    spinner.fail("Failed to gather statistics");
    outputError(error.message || String(error));
    process.exit(1);
  }
}
