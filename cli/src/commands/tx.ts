/**
 * priven tx - Transaction lookup queries
 *
 * Subcommands:
 * - priven tx check <wallet> --program <program_id>
 * - priven tx activity <wallet> --after-slot <slot>
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

interface TxCheckOptions {
  program?: string;
  afterSlot?: string;
  beforeSlot?: string;
  rpcUrl?: string;
  mainnetRpc?: string;
  wallet?: string;
  programId?: string;
  timeout?: string;
  output?: OutputFormat;
  dryRun?: boolean;
}

interface TxActivityOptions {
  afterSlot?: string;
  limit?: string;
  rpcUrl?: string;
  mainnetRpc?: string;
  wallet?: string;
  programId?: string;
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

export function registerTxCommand(program: Command): void {
  const tx = program
    .command("tx")
    .description("Privacy-preserving transaction and program interaction queries");

  // priven tx check <wallet>
  tx
    .command("check <wallet>")
    .description("Check if a wallet has interacted with a specific program")
    .option("--program <pubkey>", "Program ID to check interaction with")
    .option("--after-slot <slot>", "Only check transactions after this slot")
    .option("--before-slot <slot>", "Only check transactions before this slot")
    .option("--rpc-url <url>", "Devnet RPC URL for query execution")
    .option("--mainnet-rpc <url>", "Mainnet RPC URL for transaction data")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .option("--timeout <ms>", "TEE execution timeout in ms (default: 30000)")
    .option("--output <format>", "Output format: json or table", "table")
    .option("--dry-run", "Show what would be done without executing")
    .action(async (targetWallet: string, options: TxCheckOptions) => {
      await executeTxCheck(targetWallet, options);
    });

  // priven tx activity <wallet>
  tx
    .command("activity <wallet>")
    .description("Check if a wallet has any recent transaction activity")
    .option("--after-slot <slot>", "Only check activity after this slot")
    .option("--limit <n>", "Maximum transactions to check (default: 100)")
    .option("--rpc-url <url>", "Devnet RPC URL for query execution")
    .option("--mainnet-rpc <url>", "Mainnet RPC URL for transaction data")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .option("--timeout <ms>", "TEE execution timeout in ms (default: 30000)")
    .option("--output <format>", "Output format: json or table", "table")
    .option("--dry-run", "Show what would be done without executing")
    .action(async (targetWallet: string, options: TxActivityOptions) => {
      await executeTxActivity(targetWallet, options);
    });
}

async function executeTxCheck(targetWallet: string, options: TxCheckOptions): Promise<void> {
  try {
    // Validate wallet address
    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(targetWallet);
    } catch {
      outputError(`Invalid wallet address: ${targetWallet}`);
      process.exit(1);
    }

    // Validate program address if provided
    let programPubkey: PublicKey | undefined;
    if (options.program) {
      try {
        programPubkey = new PublicKey(options.program);
      } catch {
        outputError(`Invalid program ID: ${options.program}`);
        process.exit(1);
      }
    }

    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const mainnetRpc = options.mainnetRpc || process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
    const walletPath = options.wallet || config.wallet;
    const privenProgramId = options.programId || config.programId;
    const timeout = parseInt(options.timeout || "30000");
    const outputFormat = (options.output || "table") as OutputFormat;

    // Parse slot filters
    const afterSlot = options.afterSlot ? BigInt(options.afterSlot) : undefined;
    const beforeSlot = options.beforeSlot ? BigInt(options.beforeSlot) : undefined;

    console.log();
    console.log(chalk.bold("Priven Transaction Lookup Query"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Query Type:    ${chalk.cyan("TX_LOOKUP")}`);
    console.log(`  Target Wallet: ${chalk.yellow(walletPubkey.toBase58().slice(0, 20))}...`);
    if (programPubkey) {
      console.log(`  Check Program: ${chalk.yellow(programPubkey.toBase58().slice(0, 20))}...`);
    }
    if (afterSlot !== undefined) {
      console.log(`  After Slot:    ${chalk.cyan(afterSlot.toLocaleString())}`);
    }
    if (beforeSlot !== undefined) {
      console.log(`  Before Slot:   ${chalk.cyan(beforeSlot.toLocaleString())}`);
    }
    console.log(`  Data Source:   ${chalk.cyan("mainnet")} (Transaction history)`);
    console.log(`  Execution:     ${chalk.cyan("devnet")} (Priven TEE)`);
    console.log(`  Mainnet RPC:   ${chalk.gray(maskRpcUrl(mainnetRpc))}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    if (options.dryRun) {
      outputInfo("Dry run - no transactions will be submitted");
      console.log();
      console.log(chalk.bold("Query Flow:"));
      console.log(`  ${chalk.cyan("1.")} Build TX_LOOKUP predicate`);
      console.log(`       - Wallet: ${walletPubkey.toBase58().slice(0, 12)}...`);
      if (programPubkey) {
        console.log(`       - Program filter: ${programPubkey.toBase58().slice(0, 12)}...`);
      }
      if (afterSlot !== undefined) {
        console.log(`       - After slot: ${afterSlot.toLocaleString()}`);
      }
      console.log(`  ${chalk.cyan("2.")} Encrypt predicate (X25519 + AES-256-GCM)`);
      console.log(`  ${chalk.cyan("3.")} Submit encrypted query to devnet`);
      console.log(`  ${chalk.cyan("4.")} TEE fetches transaction signatures from mainnet`);
      console.log(`  ${chalk.cyan("5.")} TEE checks program interactions privately`);
      console.log(`  ${chalk.cyan("6.")} Decrypt result (boolean: interacted or not)`);
      console.log();
      console.log(chalk.gray("Use case: Compliance checks, wallet profiling, due diligence"));
      console.log(chalk.gray("Privacy: Nobody knows which wallet or program you're checking"));
      console.log();
      console.log(chalk.yellow("Note: Limited to ~100 recent transactions (no indexer)"));
      return;
    }

    // Load wallet and create connection
    const wallet = loadWallet(walletPath);
    const connection = new Connection(rpcUrl, "confirmed");

    console.log(`  Your Wallet:   ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);

    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`  Balance:       ${chalk.cyan((balance / 1e9).toFixed(4))} SOL`);

    if (balance < 10_000_000) {
      outputError(`Insufficient balance (need at least 0.01 SOL)`);
      process.exit(1);
    }
    console.log();

    // Import client SDK
    const { createPrivenClient, createTxLookupQuery } = await import("@priven/client");

    const spinner = createSpinner("Initializing Priven client...");
    spinner.start();

    const client = await createPrivenClient(
      connection,
      wallet,
      new PublicKey(privenProgramId)
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
    console.log(chalk.bold("Executing private transaction lookup..."));

    const predicate = createTxLookupQuery(
      walletPubkey.toBytes(),
      programPubkey?.toBytes(),
      { afterSlot, beforeSlot }
    );

    try {
      const results = await client.query(predicate, {
        timeout,
        mainnetRpc,
      });

      console.log();
      outputSuccess("Query completed successfully");
      console.log();

      if (results.length > 0) {
        if (programPubkey) {
          console.log(`${chalk.green("✓")} Wallet ${chalk.cyan("HAS")} interacted with program`);
        } else {
          console.log(`${chalk.green("✓")} Wallet ${chalk.cyan("HAS")} recent transaction activity`);
        }
      } else {
        if (programPubkey) {
          console.log(`${chalk.red("✗")} Wallet has ${chalk.yellow("NOT")} interacted with program`);
          console.log(chalk.gray("  (within checked transaction history)"));
        } else {
          console.log(`${chalk.red("✗")} No recent transaction activity found`);
        }
      }
    } catch (error: any) {
      console.log();
      outputError(`Query failed: ${error.message || error}`);
      process.exit(1);
    }
  } catch (error: any) {
    outputError(`Transaction lookup failed: ${error.message || error}`);
    process.exit(1);
  }
}

async function executeTxActivity(targetWallet: string, options: TxActivityOptions): Promise<void> {
  try {
    // Validate wallet address
    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(targetWallet);
    } catch {
      outputError(`Invalid wallet address: ${targetWallet}`);
      process.exit(1);
    }

    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const mainnetRpc = options.mainnetRpc || process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
    const walletPath = options.wallet || config.wallet;
    const privenProgramId = options.programId || config.programId;
    const limit = parseInt(options.limit || "100");
    const timeout = parseInt(options.timeout || "30000");
    const outputFormat = (options.output || "table") as OutputFormat;

    const afterSlot = options.afterSlot ? BigInt(options.afterSlot) : undefined;

    console.log();
    console.log(chalk.bold("Priven Wallet Activity Query"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Query Type:    ${chalk.cyan("TX_LOOKUP (activity)")}`);
    console.log(`  Target Wallet: ${chalk.yellow(walletPubkey.toBase58().slice(0, 20))}...`);
    if (afterSlot !== undefined) {
      console.log(`  After Slot:    ${chalk.cyan(afterSlot.toLocaleString())}`);
    }
    console.log(`  TX Limit:      ${chalk.cyan(limit)}`);
    console.log(`  Data Source:   ${chalk.cyan("mainnet")} (Transaction history)`);
    console.log(`  Execution:     ${chalk.cyan("devnet")} (Priven TEE)`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    if (options.dryRun) {
      outputInfo("Dry run - no transactions will be submitted");
      console.log();
      console.log(chalk.bold("Query Flow:"));
      console.log(`  ${chalk.cyan("1.")} Build TX_LOOKUP predicate (activity check)`);
      console.log(`       - Wallet: ${walletPubkey.toBase58().slice(0, 12)}...`);
      if (afterSlot !== undefined) {
        console.log(`       - After slot: ${afterSlot.toLocaleString()}`);
      }
      console.log(`  ${chalk.cyan("2.")} Encrypt predicate`);
      console.log(`  ${chalk.cyan("3.")} TEE checks getSignaturesForAddress`);
      console.log(`  ${chalk.cyan("4.")} Return activity status (yes/no)`);
      console.log();
      console.log(chalk.gray("Use case: Check if wallet is active, dead wallet detection"));
      return;
    }

    // Load wallet and create connection
    const wallet = loadWallet(walletPath);
    const connection = new Connection(rpcUrl, "confirmed");

    console.log(`  Your Wallet:   ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);

    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`  Balance:       ${chalk.cyan((balance / 1e9).toFixed(4))} SOL`);

    if (balance < 10_000_000) {
      outputError(`Insufficient balance (need at least 0.01 SOL)`);
      process.exit(1);
    }
    console.log();

    // Import client SDK
    const { createPrivenClient, createTxLookupQuery } = await import("@priven/client");

    const spinner = createSpinner("Initializing Priven client...");
    spinner.start();

    const client = await createPrivenClient(
      connection,
      wallet,
      new PublicKey(privenProgramId)
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

    // Build predicate (no program filter = just check activity)
    console.log();
    console.log(chalk.bold("Checking wallet activity..."));

    const predicate = createTxLookupQuery(
      walletPubkey.toBytes(),
      undefined,
      { afterSlot }
    );

    try {
      const results = await client.query(predicate, {
        timeout,
        mainnetRpc,
      });

      console.log();
      outputSuccess("Query completed successfully");
      console.log();

      if (results.length > 0) {
        console.log(`${chalk.green("✓")} Wallet is ${chalk.cyan("ACTIVE")}`);
        if (afterSlot !== undefined) {
          console.log(chalk.gray(`  Has transactions after slot ${afterSlot.toLocaleString()}`));
        }
      } else {
        console.log(`${chalk.yellow("○")} Wallet appears ${chalk.yellow("INACTIVE")}`);
        console.log(chalk.gray("  No recent transactions found"));
      }
    } catch (error: any) {
      console.log();
      outputError(`Query failed: ${error.message || error}`);
      process.exit(1);
    }
  } catch (error: any) {
    outputError(`Activity check failed: ${error.message || error}`);
    process.exit(1);
  }
}
