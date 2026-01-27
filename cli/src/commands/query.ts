/**
 * priven query - Execute a privacy-preserving pool query
 *
 * Uses PrivenClient to execute the full TEE flow:
 * 1. Fetch pools from QuickNode
 * 2. Encrypt predicate (AES-256-GCM)
 * 3. Submit query to L1 (creates QueryState)
 * 4. Delegate QueryState to TEE
 * 5. Execute query in TEE
 * 6. Commit and fetch results
 *
 * Supports both V1 (--min-tvl/--max-tvl) and V2 (--filter) predicates.
 */
import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import { loadConfig } from "../config";
import { loadWallet } from "../utils/wallet";
import {
  outputQueryResults,
  outputError,
  outputInfo,
  outputSuccess,
  OutputFormat,
} from "../utils/output";
import { createSpinner } from "../utils/progress";

interface QueryOptions {
  minTvl?: string;
  maxTvl?: string;
  filter?: string[];
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
  maxPools?: string;
  timeout?: string;
  output?: OutputFormat;
  dryRun?: boolean;
}

// Filter type mapping (matches SDK FilterType enum)
const FILTER_TYPES: Record<string, number> = {
  tvl: 0,
  balance: 1,
  volume_24h: 2,
  fee_rate: 3,
  price: 4,
  apy: 5,
  reserve_a: 6,
  reserve_b: 7,
  ratio: 8,
  mint: 9,
  program: 10,
  slot_age: 11,
};

// Filter operation mapping (matches SDK FilterOp enum)
const FILTER_OPS: Record<string, number> = {
  gte: 0, // >=
  lte: 1, // <=
  eq: 2, // ==
  neq: 3, // !=
};

/**
 * Parse a filter expression like "tvl:gte:1000000" into a Filter object
 */
function parseFilterExpression(expr: string): { type: number; op: number; value: bigint } {
  const parts = expr.toLowerCase().split(":");
  if (parts.length !== 3) {
    throw new Error(`Invalid filter format: "${expr}". Expected TYPE:OP:VALUE (e.g., tvl:gte:1000000)`);
  }

  const [typeName, opName, valueStr] = parts;

  const type = FILTER_TYPES[typeName];
  if (type === undefined) {
    throw new Error(`Unknown filter type: "${typeName}". Valid types: ${Object.keys(FILTER_TYPES).join(", ")}`);
  }

  const op = FILTER_OPS[opName];
  if (op === undefined) {
    throw new Error(`Unknown filter operation: "${opName}". Valid ops: ${Object.keys(FILTER_OPS).join(", ")}`);
  }

  let value: bigint;
  try {
    value = BigInt(valueStr);
  } catch {
    throw new Error(`Invalid value: "${valueStr}". Must be a valid integer.`);
  }

  return { type, op, value };
}

/**
 * Collect multiple --filter options into an array
 */
function collectFilters(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerQueryCommand(program: Command): void {
  program
    .command("query")
    .description("Execute a privacy-preserving pool query")
    .option("--min-tvl <lamports>", "Minimum TVL threshold (V1 predicate, deprecated)")
    .option("--max-tvl <lamports>", "Maximum TVL threshold (V1 predicate, deprecated)")
    .option(
      "--filter <expr>",
      "Filter expression: TYPE:OP:VALUE (e.g., tvl:gte:1000000). Can be used multiple times.",
      collectFilters,
      []
    )
    .option("--rpc-url <url>", "Solana RPC URL (default: from config)")
    .option("--wallet <path>", "Path to wallet keypair (default: from config)")
    .option("--program-id <pubkey>", "Priven program ID (default: from config)")
    .option("--max-pools <n>", "Maximum pools to include (default: 5)")
    .option("--timeout <ms>", "TEE execution timeout in ms (default: 30000)")
    .option("--output <format>", "Output format: json or table", "table")
    .option("--dry-run", "Show what would be done without executing")
    .action(async (options: QueryOptions) => {
      await executeQuery(options);
    });
}

async function executeQuery(options: QueryOptions): Promise<void> {
  try {
    // Load configuration
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;
    const maxPools = parseInt(options.maxPools || String(config.defaultMaxPools));
    const timeout = parseInt(options.timeout || "30000");
    const outputFormat = (options.output || "table") as OutputFormat;

    // Determine predicate type (V2 filters or V1 min/max TVL)
    const hasFilters = options.filter && options.filter.length > 0;
    const hasLegacyTvl = options.minTvl && options.maxTvl;

    if (!hasFilters && !hasLegacyTvl) {
      outputError("Must specify either --filter or both --min-tvl and --max-tvl");
      console.log(chalk.gray("\nExamples:"));
      console.log(chalk.gray("  priven query --filter tvl:gte:1000000 --filter tvl:lte:10000000"));
      console.log(chalk.gray("  priven query --min-tvl 1000000 --max-tvl 10000000 (deprecated)"));
      process.exit(1);
    }

    if (hasFilters && hasLegacyTvl) {
      outputError("Cannot mix --filter with --min-tvl/--max-tvl. Use one or the other.");
      process.exit(1);
    }

    // Parse predicate
    let predicateDescription: string;
    let parsedFilters: Array<{ type: number; op: number; value: bigint }> = [];

    if (hasFilters) {
      // V2 predicate with filters
      for (const expr of options.filter!) {
        try {
          parsedFilters.push(parseFilterExpression(expr));
        } catch (error: any) {
          outputError(error.message);
          process.exit(1);
        }
      }

      if (parsedFilters.length > 4) {
        outputError("Maximum 4 filters allowed");
        process.exit(1);
      }

      predicateDescription = `V2: ${parsedFilters.length} filter(s)`;
    } else {
      // V1 legacy predicate
      const minTvl = BigInt(options.minTvl!);
      const maxTvl = BigInt(options.maxTvl!);

      if (minTvl > maxTvl) {
        outputError("min-tvl cannot be greater than max-tvl");
        process.exit(1);
      }

      // Convert to V2 format internally
      parsedFilters = [
        { type: FILTER_TYPES.tvl, op: FILTER_OPS.gte, value: minTvl },
        { type: FILTER_TYPES.tvl, op: FILTER_OPS.lte, value: maxTvl },
      ];

      predicateDescription = `TVL ${minTvl.toLocaleString()} - ${maxTvl.toLocaleString()} (V1)`;
      console.log(chalk.yellow("\nNote: --min-tvl/--max-tvl is deprecated. Use --filter instead."));
    }

    // Show configuration
    console.log();
    console.log(chalk.bold("Priven Private Query"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  RPC URL:     ${chalk.cyan(rpcUrl.slice(0, 50))}${rpcUrl.length > 50 ? "..." : ""}`);
    console.log(`  Program ID:  ${chalk.cyan(programId.slice(0, 20))}...`);
    console.log(`  Network:     ${chalk.cyan(config.network)}`);
    console.log(`  Predicate:   ${chalk.yellow(predicateDescription)}`);
    for (const f of parsedFilters) {
      const typeName = Object.keys(FILTER_TYPES).find((k) => FILTER_TYPES[k] === f.type) || "?";
      const opName = Object.keys(FILTER_OPS).find((k) => FILTER_OPS[k] === f.op) || "?";
      console.log(`               ${chalk.gray(`${typeName}:${opName}:${f.value}`)}`);
    }
    console.log(`  Max Pools:   ${chalk.cyan(maxPools)}`);
    console.log(`  Timeout:     ${chalk.cyan(timeout)}ms`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    if (options.dryRun) {
      outputInfo("Dry run - no transactions will be submitted");
      console.log();
      console.log(chalk.bold("Query Flow:"));
      console.log(`  ${chalk.cyan("1.")} Fetch pools from QuickNode RPC`);
      console.log(`  ${chalk.cyan("2.")} Encrypt predicate with X25519 + AES-256-GCM`);
      console.log(`  ${chalk.cyan("3.")} Submit encrypted query to Solana L1`);
      console.log(`  ${chalk.cyan("4.")} Delegate QueryState to MagicBlock TEE`);
      console.log(`  ${chalk.cyan("5.")} Execute query inside Intel TDX enclave`);
      console.log(`  ${chalk.cyan("6.")} Commit result and decrypt locally`);
      console.log();
      console.log(chalk.gray("Privacy guarantees:"));
      console.log(chalk.gray("  • Predicate encrypted - observers cannot see filter criteria"));
      console.log(chalk.gray("  • TEE execution - decryption happens in hardware enclave"));
      console.log(chalk.gray("  • Result encrypted - only you can decrypt matching pools"));
      return;
    }

    // Load wallet
    const wallet = loadWallet(walletPath);
    console.log(`  Wallet:      ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);
    console.log();

    // Create connection and check balance
    const connection = new Connection(rpcUrl, "confirmed");
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`  Balance:     ${chalk.cyan((balance / 1e9).toFixed(4))} SOL`);

    if (balance < 10_000_000) {
      outputError(`Insufficient balance (need at least 0.01 SOL for fees)`);
      process.exit(1);
    }
    console.log();

    // Import client SDK
    const { createPrivenClient, PRIVEN_TEE_PROGRAM_ID } = await import("@priven/client");

    // Create client
    const spinner = createSpinner("Initializing Priven client...");
    spinner.start();

    let client;
    try {
      client = await createPrivenClient(
        connection,
        wallet,
        new PublicKey(programId)
      );
      spinner.succeed("Client initialized");
    } catch (error: any) {
      spinner.fail("Failed to initialize client");
      if (error.message?.includes("Failed to fetch program IDL")) {
        outputError(`Program not deployed or IDL not available at ${programId}`);
        console.log(chalk.gray("\nMake sure:"));
        console.log(chalk.gray("  1. The program is deployed to the network"));
        console.log(chalk.gray("  2. The IDL is uploaded with 'anchor idl init'"));
      } else {
        outputError(error.message || String(error));
      }
      process.exit(1);
    }

    // Initialize TEE session
    const teeSpinner = createSpinner("Initializing TEE session...");
    teeSpinner.start();

    try {
      await client.initTeeSession();
      teeSpinner.succeed("TEE session initialized (Intel TDX verified)");
    } catch (error: any) {
      teeSpinner.warn("TEE session initialized (integrity NOT verified)");
      console.log(chalk.yellow("  Proceeding with caution..."));
    }

    // Execute the query
    console.log();
    console.log(chalk.bold("Executing private query..."));
    console.log();

    // Build V2 predicate from parsed filters
    const { createPredicate } = await import("@priven/client");
    const filters = parsedFilters.map((f) => ({
      type: f.type,
      op: f.op,
      value: f.value,
    }));
    const predicate = createPredicate(filters as any);

    try {
      const matchingPools = await client.query(predicate, {
        maxPools,
        timeout,
      });

      console.log();
      outputSuccess("Query completed successfully");

      // Output results
      outputQueryResults(
        {
          queryId: Date.now().toString(),
          status: "Completed",
          matchCount: matchingPools.length,
          pools: matchingPools.map((p) => p.toBase58()),
        },
        outputFormat
      );
    } catch (error: any) {
      console.log();
      outputError(`Query failed: ${error.message || error}`);

      // Provide helpful error messages
      if (error.message?.includes("Timeout")) {
        console.log(chalk.gray("\nTry increasing the timeout with --timeout <ms>"));
      } else if (error.message?.includes("No Raydium pools")) {
        console.log(chalk.gray("\nNo pools available. Check your RPC endpoint."));
      } else if (error.message?.includes("insufficient")) {
        console.log(chalk.gray("\nInsufficient SOL for transaction fees."));
      }

      process.exit(1);
    }
  } catch (error: any) {
    outputError(`Query failed: ${error.message || error}`);
    process.exit(1);
  }
}
