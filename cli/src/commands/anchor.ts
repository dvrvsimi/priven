/**
 * priven anchor - Merkle anchoring commands
 *
 * Anchoring provides verifiable proof that queries were processed by the TEE.
 * The TEE operator posts Merkle roots of query result hashes to L1.
 *
 * Commands:
 *   priven anchor init    - Initialize anchor account (admin)
 *   priven anchor batch   - Post Merkle batch (TEE operator)
 *   priven anchor status  - View current anchor state
 */
import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import chalk from "chalk";
import { loadConfig } from "../config";
import { loadWallet } from "../utils/wallet";
import { outputError, outputSuccess, outputInfo } from "../utils/output";
import { createSpinner } from "../utils/progress";

interface AnchorInitOptions {
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
}

interface AnchorBatchOptions {
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
}

interface AnchorStatusOptions {
  rpcUrl?: string;
  programId?: string;
}

export function registerAnchorCommand(program: Command): void {
  const anchor = program
    .command("anchor")
    .description("Merkle anchoring commands (TEE operator/admin)");

  anchor
    .command("init")
    .description("Initialize anchor account (admin only)")
    .option("--rpc-url <url>", "Devnet RPC URL")
    .option("--wallet <path>", "Path to admin wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .action(async (options: AnchorInitOptions) => {
      await initAnchor(options);
    });

  anchor
    .command("batch <merkle-root> <query-count>")
    .description("Post Merkle batch (TEE operator only)")
    .option("--rpc-url <url>", "Devnet RPC URL")
    .option("--wallet <path>", "Path to TEE operator wallet")
    .option("--program-id <pubkey>", "Priven program ID")
    .action(async (merkleRoot: string, queryCount: string, options: AnchorBatchOptions) => {
      await postBatch(merkleRoot, queryCount, options);
    });

  anchor
    .command("status")
    .description("View current anchor state")
    .option("--rpc-url <url>", "Devnet RPC URL")
    .option("--program-id <pubkey>", "Priven program ID")
    .action(async (options: AnchorStatusOptions) => {
      await showStatus(options);
    });
}

async function initAnchor(options: AnchorInitOptions): Promise<void> {
  const spinner = createSpinner("Initializing anchor...");

  try {
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;

    console.log();
    console.log(chalk.bold("Initialize Merkle Anchor"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(chalk.yellow("  Admin only - requires program admin wallet"));
    console.log();

    const wallet = loadWallet(walletPath);
    console.log(`  Admin Wallet: ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.start();

    const { createPrivenClient, ANCHOR_SEED } = await import("@priven/client");

    const client = await createPrivenClient(connection, wallet, new PublicKey(programId));
    const program = (client as any).program;

    const [anchorPda] = PublicKey.findProgramAddressSync([ANCHOR_SEED], new PublicKey(programId));

    // Check if already initialized
    try {
      await program.account.merkleAnchor.fetch(anchorPda);
      spinner.warn("Anchor already initialized");
      console.log();
      console.log(`  ${chalk.cyan("Anchor PDA:")} ${anchorPda.toBase58()}`);
      console.log(chalk.gray("  Use 'priven anchor status' to view current state"));
      return;
    } catch {
      // Not initialized, proceed
    }

    spinner.text = "Submitting initialize_anchor transaction...";

    const tx = await program.methods
      .initializeAnchor()
      .accounts({ admin: wallet.publicKey })
      .signers([wallet])
      .rpc();

    spinner.succeed("Anchor initialized");

    console.log();
    console.log(chalk.bold("  Anchor Details:"));
    console.log(`    ${chalk.cyan("Anchor PDA:")}  ${anchorPda.toBase58()}`);
    console.log(`    ${chalk.cyan("Authority:")}   ${wallet.publicKey.toBase58()}`);
    console.log(`    ${chalk.cyan("Transaction:")} ${tx}`);
    console.log();
    console.log(chalk.gray("  TEE operator can now post batches with 'priven anchor batch'"));
  } catch (error: any) {
    spinner.fail("Failed to initialize anchor");
    if (error.message?.includes("Unauthorized")) {
      outputError("Not authorized - must be program admin");
    } else {
      outputError(error.message || String(error));
    }
    process.exit(1);
  }
}

async function postBatch(merkleRootHex: string, queryCountStr: string, options: AnchorBatchOptions): Promise<void> {
  const spinner = createSpinner("Posting batch...");

  try {
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;

    console.log();
    console.log(chalk.bold("Post Merkle Batch"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(chalk.yellow("  TEE operator only - requires anchor authority wallet"));
    console.log();

    // Parse merkle root (hex string or base58)
    let merkleRoot: Uint8Array;
    if (merkleRootHex.startsWith("0x")) {
      merkleRoot = Uint8Array.from(Buffer.from(merkleRootHex.slice(2), "hex"));
    } else if (merkleRootHex.length === 64) {
      merkleRoot = Uint8Array.from(Buffer.from(merkleRootHex, "hex"));
    } else {
      outputError("Merkle root must be 32 bytes hex (64 chars or 0x-prefixed)");
      process.exit(1);
    }

    if (merkleRoot.length !== 32) {
      outputError("Merkle root must be exactly 32 bytes");
      process.exit(1);
    }

    const queryCount = new BN(queryCountStr);

    const wallet = loadWallet(walletPath);
    console.log(`  Operator:     ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);
    console.log(`  Merkle Root:  ${chalk.cyan(merkleRootHex.slice(0, 16))}...`);
    console.log(`  Query Count:  ${chalk.cyan(queryCountStr)}`);

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.start();

    const { createPrivenClient, ANCHOR_SEED } = await import("@priven/client");

    const client = await createPrivenClient(connection, wallet, new PublicKey(programId));
    const program = (client as any).program;

    const [anchorPda] = PublicKey.findProgramAddressSync([ANCHOR_SEED], new PublicKey(programId));

    spinner.text = "Submitting anchor_batch transaction...";

    const tx = await program.methods
      .anchorBatch(Array.from(merkleRoot) as number[], queryCount)
      .accounts({
        caller: wallet.publicKey,
        anchor: anchorPda,
      })
      .signers([wallet])
      .rpc();

    spinner.succeed("Batch anchored");

    // Fetch updated state
    const anchor = await program.account.merkleAnchor.fetch(anchorPda);

    console.log();
    console.log(chalk.bold("  Batch Anchored:"));
    console.log(`    ${chalk.cyan("Epoch:")}        ${anchor.epoch.toString()}`);
    console.log(`    ${chalk.cyan("Query Count:")}  ${anchor.queryCount.toString()}`);
    console.log(`    ${chalk.cyan("Slot:")}         ${anchor.anchorSlot.toString()}`);
    console.log(`    ${chalk.cyan("Transaction:")}  ${tx}`);
  } catch (error: any) {
    spinner.fail("Failed to post batch");
    if (error.message?.includes("Unauthorized")) {
      outputError("Not authorized - must be anchor authority");
    } else {
      outputError(error.message || String(error));
    }
    process.exit(1);
  }
}

async function showStatus(options: AnchorStatusOptions): Promise<void> {
  const spinner = createSpinner("Fetching anchor status...");

  try {
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const programId = options.programId || config.programId;

    console.log();
    console.log(chalk.bold("Merkle Anchor Status"));
    console.log(chalk.gray("─".repeat(50)));

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.start();

    const { ANCHOR_SEED } = await import("@priven/client");
    const { Program, AnchorProvider } = await import("@coral-xyz/anchor");

    const provider = new AnchorProvider(connection, {} as any, { commitment: "confirmed" });

    const [anchorPda] = PublicKey.findProgramAddressSync([ANCHOR_SEED], new PublicKey(programId));

    // Fetch IDL and create program
    const idl = await Program.fetchIdl(new PublicKey(programId), provider);
    if (!idl) {
      spinner.fail("Program IDL not found");
      process.exit(1);
    }

    const program = new Program(idl, provider);

    try {
      const anchor = await (program.account as any).merkleAnchor.fetch(anchorPda);

      spinner.succeed("Anchor found");
      console.log();

      console.log(chalk.bold("  Anchor State:"));
      console.log(`    ${chalk.cyan("PDA:")}          ${anchorPda.toBase58()}`);
      console.log(`    ${chalk.cyan("Authority:")}    ${anchor.authority.toBase58()}`);
      console.log(`    ${chalk.cyan("Epoch:")}        ${anchor.epoch.toString()}`);
      console.log(`    ${chalk.cyan("Query Count:")}  ${anchor.queryCount.toString()}`);
      console.log(`    ${chalk.cyan("Last Slot:")}    ${anchor.anchorSlot.toString()}`);

      // Format merkle root
      const rootHex = Buffer.from(anchor.latestRoot).toString("hex");
      const isZero = anchor.latestRoot.every((b: number) => b === 0);
      console.log(`    ${chalk.cyan("Latest Root:")}  ${isZero ? chalk.gray("(none)") : rootHex.slice(0, 16) + "..."}`);

      console.log();
      console.log(chalk.gray("  Anchoring provides verifiable proof of TEE query execution"));
    } catch {
      spinner.warn("Anchor not initialized");
      console.log();
      console.log(`  ${chalk.cyan("Anchor PDA:")} ${anchorPda.toBase58()}`);
      outputInfo("Run 'priven anchor init' to initialize (admin only)");
    }
  } catch (error: any) {
    spinner.fail("Failed to fetch status");
    outputError(error.message || String(error));
    process.exit(1);
  }
}
