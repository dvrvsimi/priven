/**
 * priven tokens - Token balance and ownership queries
 *
 * Subcommands:
 * - priven tokens balance <mint> --min <amount> --max <amount>
 * - priven tokens holders <mint> --limit <n>
 */
import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import { loadConfig } from "../config";
import { loadWallet } from "../utils/wallet";
import {
  outputError,
  outputInfo,
  outputSuccess,
  OutputFormat,
} from "../utils/output";
import { createSpinner } from "../utils/progress";

interface TokenBalanceOptions {
  min?: string;
  max?: string;
  rpcUrl?: string;
  mainnetRpc?: string;
  wallet?: string;
  programId?: string;
  limit?: string;
  timeout?: string;
  output?: OutputFormat;
  dryRun?: boolean;
}

interface TokenHoldersOptions {
  rpcUrl?: string;
  mainnetRpc?: string;
  wallet?: string;
  programId?: string;
  limit?: string;
  timeout?: string;
  output?: OutputFormat;
  dryRun?: boolean;
}

function maskRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url.split("/")[0] + "//***";
  }
}

export function registerTokensCommand(program: Command): void {
  const tokens = program
    .command("tokens")
    .description("Privacy-preserving token balance and ownership queries");

  // priven tokens balance <mint>
  tokens
    .command("balance <mint>")
    .description("Find wallets holding tokens within a balance range")
    .option("--min <lamports>", "Minimum token balance (in smallest units)")
    .option("--max <lamports>", "Maximum token balance (in smallest units)")
    .option("--rpc-url <url>", "Devnet RPC URL for query execution")
    .option("--mainnet-rpc <url>", "Mainnet RPC URL for token account data")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .option("--limit <n>", "Maximum results to return (default: 100)")
    .option("--timeout <ms>", "TEE execution timeout in ms (default: 30000)")
    .option("--output <format>", "Output format: json or table", "table")
    .option("--dry-run", "Show what would be done without executing")
    .action(async (mint: string, options: TokenBalanceOptions) => {
      await executeTokenBalance(mint, options);
    });

  // priven tokens holders <mint>
  tokens
    .command("holders <mint>")
    .description("Find all holders of a specific token")
    .option("--rpc-url <url>", "Devnet RPC URL for query execution")
    .option("--mainnet-rpc <url>", "Mainnet RPC URL for token account data")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .option("--limit <n>", "Maximum holders to return (default: 100)")
    .option("--timeout <ms>", "TEE execution timeout in ms (default: 30000)")
    .option("--output <format>", "Output format: json or table", "table")
    .option("--dry-run", "Show what would be done without executing")
    .action(async (mint: string, options: TokenHoldersOptions) => {
      await executeTokenHolders(mint, options);
    });
}

async function executeTokenBalance(mint: string, options: TokenBalanceOptions): Promise<void> {
  try {
    // Validate mint address
    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(mint);
    } catch {
      outputError(`Invalid token mint address: ${mint}`);
      process.exit(1);
    }

    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const mainnetRpc = options.mainnetRpc || process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;
    const limit = parseInt(options.limit || "100");
    const timeout = parseInt(options.timeout || "30000");
    const outputFormat = (options.output || "table") as OutputFormat;

    // Parse balance filters
    const minBalance = options.min ? BigInt(options.min) : undefined;
    const maxBalance = options.max ? BigInt(options.max) : undefined;

    if (minBalance !== undefined && maxBalance !== undefined && minBalance > maxBalance) {
      outputError("--min cannot be greater than --max");
      process.exit(1);
    }

    console.log();
    console.log(chalk.bold("Priven Token Balance Query"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Query Type:  ${chalk.cyan("TOKEN_BALANCE")}`);
    console.log(`  Token Mint:  ${chalk.yellow(mintPubkey.toBase58().slice(0, 20))}...`);
    if (minBalance !== undefined) {
      console.log(`  Min Balance: ${chalk.cyan(minBalance.toLocaleString())}`);
    }
    if (maxBalance !== undefined) {
      console.log(`  Max Balance: ${chalk.cyan(maxBalance.toLocaleString())}`);
    }
    console.log(`  Result Limit: ${chalk.cyan(limit)}`);
    console.log(`  Data Source: ${chalk.cyan("mainnet")} (SPL Token accounts)`);
    console.log(`  Execution:   ${chalk.cyan("devnet")} (Priven TEE)`);
    console.log(`  Mainnet RPC: ${chalk.gray(maskRpcUrl(mainnetRpc))}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    if (options.dryRun) {
      outputInfo("Dry run - no transactions will be submitted");
      console.log();
      console.log(chalk.bold("Query Flow:"));
      console.log(`  ${chalk.cyan("1.")} Build TOKEN_BALANCE predicate`);
      console.log(`       - Token mint: ${mintPubkey.toBase58().slice(0, 12)}...`);
      if (minBalance !== undefined) {
        console.log(`       - Min balance filter: >= ${minBalance.toLocaleString()}`);
      }
      if (maxBalance !== undefined) {
        console.log(`       - Max balance filter: <= ${maxBalance.toLocaleString()}`);
      }
      console.log(`  ${chalk.cyan("2.")} Encrypt predicate (X25519 + AES-256-GCM)`);
      console.log(`  ${chalk.cyan("3.")} Submit encrypted query to devnet`);
      console.log(`  ${chalk.cyan("4.")} TEE fetches token accounts from mainnet`);
      console.log(`  ${chalk.cyan("5.")} TEE evaluates balance filters privately`);
      console.log(`  ${chalk.cyan("6.")} Decrypt matching wallet addresses`);
      console.log();
      console.log(chalk.gray("Privacy: Nobody knows which token you're querying"));
      console.log(chalk.gray("         or what balance thresholds you care about"));
      return;
    }

    // Load wallet and create connection
    const wallet = loadWallet(walletPath);
    const connection = new Connection(rpcUrl, "confirmed");

    console.log(`  Wallet:      ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);

    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`  Balance:     ${chalk.cyan((balance / 1e9).toFixed(4))} SOL`);

    if (balance < 10_000_000) {
      outputError(`Insufficient balance (need at least 0.01 SOL)`);
      process.exit(1);
    }
    console.log();

    // Import client SDK
    const { createPrivenClient, QueryType, createTokenBalanceQuery } = await import("@priven/client");

    const spinner = createSpinner("Initializing Priven client...");
    spinner.start();

    const client = await createPrivenClient(
      connection,
      wallet,
      new PublicKey(programId)
    );
    spinner.succeed("Client initialized");

    // Initialize TEE session
    const teeSpinner = createSpinner("Initializing TEE session...");
    teeSpinner.start();

    try {
      await client.initTeeSession();
      teeSpinner.succeed("TEE session initialized (Intel TDX verified)");
    } catch {
      teeSpinner.warn("TEE session initialized (integrity NOT verified)");
    }

    // Build predicate
    console.log();
    console.log(chalk.bold("Executing private token balance query..."));

    const predicate = createTokenBalanceQuery(
      mintPubkey.toBytes(),
      minBalance,
      maxBalance
    );

    try {
      const matchingWallets = await client.query(predicate, {
        timeout,
        mainnetRpc,
      });

      console.log();
      outputSuccess("Query completed successfully");
      console.log();
      console.log(`Found ${chalk.cyan(matchingWallets.length)} matching wallets`);

      if (matchingWallets.length > 0) {
        console.log();
        for (const wallet of matchingWallets.slice(0, limit)) {
          console.log(`  • ${wallet.toBase58()}`);
        }
      }
    } catch (error: any) {
      console.log();
      outputError(`Query failed: ${error.message || error}`);
      process.exit(1);
    }
  } catch (error: any) {
    outputError(`Token balance query failed: ${error.message || error}`);
    process.exit(1);
  }
}

async function executeTokenHolders(mint: string, options: TokenHoldersOptions): Promise<void> {
  try {
    // Validate mint address
    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(mint);
    } catch {
      outputError(`Invalid token mint address: ${mint}`);
      process.exit(1);
    }

    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const mainnetRpc = options.mainnetRpc || process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;
    const limit = parseInt(options.limit || "100");
    const timeout = parseInt(options.timeout || "30000");
    const outputFormat = (options.output || "table") as OutputFormat;

    console.log();
    console.log(chalk.bold("Priven Token Ownership Query"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Query Type:  ${chalk.cyan("TOKEN_OWNERSHIP")}`);
    console.log(`  Token Mint:  ${chalk.yellow(mintPubkey.toBase58().slice(0, 20))}...`);
    console.log(`  Result Limit: ${chalk.cyan(limit)}`);
    console.log(`  Data Source: ${chalk.cyan("mainnet")} (SPL Token accounts)`);
    console.log(`  Execution:   ${chalk.cyan("devnet")} (Priven TEE)`);
    console.log(`  Mainnet RPC: ${chalk.gray(maskRpcUrl(mainnetRpc))}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    if (options.dryRun) {
      outputInfo("Dry run - no transactions will be submitted");
      console.log();
      console.log(chalk.bold("Query Flow:"));
      console.log(`  ${chalk.cyan("1.")} Build TOKEN_OWNERSHIP predicate`);
      console.log(`       - Token mint: ${mintPubkey.toBase58().slice(0, 12)}...`);
      console.log(`  ${chalk.cyan("2.")} Encrypt predicate (X25519 + AES-256-GCM)`);
      console.log(`  ${chalk.cyan("3.")} Submit encrypted query to devnet`);
      console.log(`  ${chalk.cyan("4.")} TEE fetches all token accounts for mint`);
      console.log(`  ${chalk.cyan("5.")} TEE extracts unique holder addresses`);
      console.log(`  ${chalk.cyan("6.")} Decrypt holder list locally`);
      console.log();
      console.log(chalk.gray("Use case: Airdrop targeting, community analysis"));
      console.log(chalk.gray("Privacy: Nobody knows which token's holders you want"));
      return;
    }

    // Load wallet and create connection
    const wallet = loadWallet(walletPath);
    const connection = new Connection(rpcUrl, "confirmed");

    console.log(`  Wallet:      ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);

    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`  Balance:     ${chalk.cyan((balance / 1e9).toFixed(4))} SOL`);

    if (balance < 10_000_000) {
      outputError(`Insufficient balance (need at least 0.01 SOL)`);
      process.exit(1);
    }
    console.log();

    // Import client SDK
    const { createPrivenClient, createTokenOwnershipQuery } = await import("@priven/client");

    const spinner = createSpinner("Initializing Priven client...");
    spinner.start();

    const client = await createPrivenClient(
      connection,
      wallet,
      new PublicKey(programId)
    );
    spinner.succeed("Client initialized");

    // Initialize TEE session
    const teeSpinner = createSpinner("Initializing TEE session...");
    teeSpinner.start();

    try {
      await client.initTeeSession();
      teeSpinner.succeed("TEE session initialized (Intel TDX verified)");
    } catch {
      teeSpinner.warn("TEE session initialized (integrity NOT verified)");
    }

    // Build predicate
    console.log();
    console.log(chalk.bold("Executing private token ownership query..."));

    const predicate = createTokenOwnershipQuery(mintPubkey.toBytes());

    try {
      const holders = await client.query(predicate, {
        timeout,
        mainnetRpc,
      });

      console.log();
      outputSuccess("Query completed successfully");
      console.log();
      console.log(`Found ${chalk.cyan(holders.length)} unique holders`);

      if (holders.length > 0) {
        console.log();
        for (const holder of holders.slice(0, limit)) {
          console.log(`  • ${holder.toBase58()}`);
        }
        if (holders.length > limit) {
          console.log(chalk.gray(`  ... and ${holders.length - limit} more`));
        }
      }
    } catch (error: any) {
      console.log();
      outputError(`Query failed: ${error.message || error}`);
      process.exit(1);
    }
  } catch (error: any) {
    outputError(`Token ownership query failed: ${error.message || error}`);
    process.exit(1);
  }
}
