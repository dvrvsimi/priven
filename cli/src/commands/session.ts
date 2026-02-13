/**
 * priven session - Session management commands
 *
 * Sessions group queries for lifecycle management and stats tracking.
 * Sessions are OPTIONAL - queries work without them using session_id=0.
 *
 * Commands:
 *   priven session open     - Open a new query session
 *   priven session close    - Close session and return rent
 *   priven session list     - List user's sessions
 *   priven session expire   - Expire timed-out session (permissionless)
 */
import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import chalk from "chalk";
import { loadConfig } from "../config";
import { loadWallet } from "../utils/wallet";
import { outputError, outputInfo } from "../utils/output";
import { createSpinner } from "../utils/progress";

interface SessionOpenOptions {
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
}

interface SessionCloseOptions {
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
}

interface SessionListOptions {
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
}

export function registerSessionCommand(program: Command): void {
  const session = program
    .command("session")
    .description("Session management (optional - queries work without sessions)");

  session
    .command("open")
    .description("Open a new query session")
    .option("--rpc-url <url>", "Devnet RPC URL")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .action(async (options: SessionOpenOptions) => {
      await openSession(options);
    });

  session
    .command("close <session-id>")
    .description("Close session and return rent to owner")
    .option("--rpc-url <url>", "Devnet RPC URL")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .action(async (sessionId: string, options: SessionCloseOptions) => {
      await closeSession(sessionId, options);
    });

  session
    .command("list")
    .description("List your active sessions")
    .option("--rpc-url <url>", "Devnet RPC URL")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .action(async (options: SessionListOptions) => {
      await listSessions(options);
    });

  session
    .command("expire <session-id>")
    .description("Expire a timed-out session (permissionless, returns rent to owner)")
    .option("--rpc-url <url>", "Devnet RPC URL")
    .option("--wallet <path>", "Path to wallet keypair")
    .option("--program-id <pubkey>", "Priven program ID")
    .action(async (sessionId: string, options: SessionCloseOptions) => {
      await expireSession(sessionId, options);
    });
}

async function openSession(options: SessionOpenOptions): Promise<void> {
  const spinner = createSpinner("Opening session...");

  try {
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;

    console.log();
    console.log(chalk.bold("Open Query Session"));
    console.log(chalk.gray("─".repeat(50)));

    const wallet = loadWallet(walletPath);
    console.log(`  Wallet:     ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.start();

    const { createPrivenClient, SESSION_SEED: SDK_SESSION_SEED } = await import("@priven/client");

    const client = await createPrivenClient(connection, wallet, new PublicKey(programId));

    // Generate session ID from timestamp
    const sessionId = new BN(Date.now());
    const [sessionPda] = PublicKey.findProgramAddressSync(
      [SDK_SESSION_SEED, wallet.publicKey.toBuffer(), sessionId.toArrayLike(Buffer, "le", 8)],
      new PublicKey(programId)
    );

    spinner.text = "Submitting open_session transaction...";

    // Use the program directly
    const program = (client as any).program;
    const tx = await program.methods
      .openSession(sessionId)
      .accounts({ user: wallet.publicKey })
      .signers([wallet])
      .rpc();

    spinner.succeed("Session opened");

    console.log();
    console.log(chalk.bold("  Session Details:"));
    console.log(`    ${chalk.cyan("Session ID:")}  ${sessionId.toString()}`);
    console.log(`    ${chalk.cyan("Session PDA:")} ${sessionPda.toBase58()}`);
    console.log(`    ${chalk.cyan("Transaction:")} ${tx}`);
    console.log();
    console.log(chalk.gray("  Use this session ID with --session-id flag in query command"));
    console.log(chalk.gray("  Close with: priven session close " + sessionId.toString()));
  } catch (error: any) {
    spinner.fail("Failed to open session");
    outputError(error.message || String(error));
    process.exit(1);
  }
}

async function closeSession(sessionIdStr: string, options: SessionCloseOptions): Promise<void> {
  const spinner = createSpinner("Closing session...");

  try {
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;

    console.log();
    console.log(chalk.bold("Close Query Session"));
    console.log(chalk.gray("─".repeat(50)));

    const wallet = loadWallet(walletPath);
    const sessionId = new BN(sessionIdStr);

    const { SESSION_SEED: SDK_SESSION_SEED, createPrivenClient } = await import("@priven/client");

    const [sessionPda] = PublicKey.findProgramAddressSync(
      [SDK_SESSION_SEED, wallet.publicKey.toBuffer(), sessionId.toArrayLike(Buffer, "le", 8)],
      new PublicKey(programId)
    );

    console.log(`  Session ID:  ${chalk.cyan(sessionIdStr)}`);
    console.log(`  Session PDA: ${chalk.cyan(sessionPda.toBase58().slice(0, 20))}...`);

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.start();

    const client = await createPrivenClient(connection, wallet, new PublicKey(programId));
    const program = (client as any).program;

    const tx = await program.methods
      .closeSession()
      .accounts({
        owner: wallet.publicKey,
        session: sessionPda,
      })
      .signers([wallet])
      .rpc();

    spinner.succeed("Session closed");
    console.log();
    console.log(`  ${chalk.cyan("Transaction:")} ${tx}`);
    console.log(chalk.green("  Rent returned to wallet"));
  } catch (error: any) {
    spinner.fail("Failed to close session");
    outputError(error.message || String(error));
    process.exit(1);
  }
}

async function listSessions(options: SessionListOptions): Promise<void> {
  const spinner = createSpinner("Fetching sessions...");

  try {
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;

    console.log();
    console.log(chalk.bold("Your Query Sessions"));
    console.log(chalk.gray("─".repeat(50)));

    const wallet = loadWallet(walletPath);
    console.log(`  Wallet: ${chalk.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);
    console.log();

    spinner.start();

    const connection = new Connection(rpcUrl, "confirmed");
    const { createPrivenClient, SESSION_SEED: SDK_SESSION_SEED } = await import("@priven/client");

    const client = await createPrivenClient(connection, wallet, new PublicKey(programId));
    const program = (client as any).program;

    // Fetch all session accounts for this user
    const sessions = await program.account.querySession.all([
      {
        memcmp: {
          offset: 8, // After discriminator, owner pubkey
          bytes: wallet.publicKey.toBase58(),
        },
      },
    ]);

    spinner.succeed(`Found ${sessions.length} session(s)`);
    console.log();

    if (sessions.length === 0) {
      outputInfo("No active sessions. Use 'priven session open' to create one.");
      return;
    }

    for (const { account, publicKey } of sessions) {
      console.log(chalk.bold(`  Session ${account.sessionId.toString()}`));
      console.log(`    ${chalk.cyan("PDA:")}          ${publicKey.toBase58()}`);
      console.log(`    ${chalk.cyan("Created:")}      ${new Date(account.createdAt.toNumber() * 1000).toISOString()}`);
      console.log(`    ${chalk.cyan("Query Count:")}  ${account.queryCount.toString()}`);
      if (account.lastQueryAt.toNumber() > 0) {
        console.log(`    ${chalk.cyan("Last Query:")}   ${new Date(account.lastQueryAt.toNumber() * 1000).toISOString()}`);
      }
      console.log();
    }
  } catch (error: any) {
    spinner.fail("Failed to fetch sessions");
    outputError(error.message || String(error));
    process.exit(1);
  }
}

async function expireSession(sessionIdStr: string, options: SessionCloseOptions): Promise<void> {
  const spinner = createSpinner("Expiring session...");

  try {
    const config = await loadConfig();
    const rpcUrl = options.rpcUrl || config.rpcUrl;
    const walletPath = options.wallet || config.wallet;
    const programId = options.programId || config.programId;

    console.log();
    console.log(chalk.bold("Expire Timed-Out Session"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(chalk.gray("  Note: Session must be >1 hour old to expire"));
    console.log();

    const wallet = loadWallet(walletPath);
    const sessionId = new BN(sessionIdStr);

    // For expire, we need the owner's pubkey - this would need to be provided
    // For now, assume caller is checking their own sessions
    outputInfo("Note: To expire another user's session, you need their wallet pubkey");

    const { SESSION_SEED, createPrivenClient } = await import("@priven/client");

    const [sessionPda] = PublicKey.findProgramAddressSync(
      [SESSION_SEED, wallet.publicKey.toBuffer(), sessionId.toArrayLike(Buffer, "le", 8)],
      new PublicKey(programId)
    );

    console.log(`  Session ID:  ${chalk.cyan(sessionIdStr)}`);
    console.log(`  Session PDA: ${chalk.cyan(sessionPda.toBase58().slice(0, 20))}...`);

    const connection = new Connection(rpcUrl, "confirmed");

    spinner.start();

    const client = await createPrivenClient(connection, wallet, new PublicKey(programId));
    const program = (client as any).program;

    const tx = await program.methods
      .expireSession()
      .accountsPartial({
        caller: wallet.publicKey,
        owner: wallet.publicKey,
        session: sessionPda,
      })
      .signers([wallet])
      .rpc();

    spinner.succeed("Session expired");
    console.log();
    console.log(`  ${chalk.cyan("Transaction:")} ${tx}`);
    console.log(chalk.green("  Rent returned to session owner"));
  } catch (error: any) {
    spinner.fail("Failed to expire session");
    if (error.message?.includes("SessionNotExpired")) {
      outputError("Session has not timed out yet (must be >1 hour old)");
    } else {
      outputError(error.message || String(error));
    }
    process.exit(1);
  }
}
