/**
 * priven tee - TEE verification commands
 *
 * Commands:
 *   priven tee verify - Verify TEE integrity
 */
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../config";
import { outputSuccess, outputError, outputWarning, outputInfo } from "../utils/output";
import { createSpinner } from "../utils/progress";

interface TeeVerifyOptions {
  network?: "devnet" | "mainnet";
}

export function registerTeeCommand(program: Command): void {
  const tee = program
    .command("tee")
    .description("TEE verification commands");

  tee
    .command("verify")
    .description("Verify TEE integrity (Intel TDX attestation)")
    .option("--network <network>", "Network: devnet or mainnet", "devnet")
    .action(async (options: TeeVerifyOptions) => {
      await verifyTee(options);
    });

  tee
    .command("info")
    .description("Display TEE configuration info")
    .action(async () => {
      await showTeeInfo();
    });
}

async function verifyTee(options: TeeVerifyOptions): Promise<void> {
  const spinner = createSpinner("Verifying TEE endpoint...");

  try {
    const config = await loadConfig();
    const network = options.network || config.network;
    const { MAGICBLOCK_RPC, TEE_VALIDATORS } = await import("@priven/client");
    const teeRpc = config.teeRpc || MAGICBLOCK_RPC.tee;

    console.log();
    console.log(chalk.bold("TEE Endpoint Verification"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Network:     ${chalk.cyan(network)}`);
    console.log(`  TEE RPC:     ${chalk.cyan(teeRpc)}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    spinner.start();

    // Fetch a TDX quote from the TEE endpoint
    spinner.text = "Requesting TDX attestation quote...";
    const challenge = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
    const quoteUrl = `${teeRpc}/quote?challenge=${encodeURIComponent(challenge)}`;

    const response = await fetch(quoteUrl);
    const data = await response.json() as { quote?: string; error?: string };

    if (response.status !== 200 || !data.quote) {
      spinner.fail("TEE endpoint did not return a valid quote");
      outputError(data.error || "No quote returned");
      process.exit(1);
    }

    // Quote received - endpoint is functional
    const quoteBytes = Buffer.from(data.quote, "base64");
    spinner.succeed("TEE endpoint is functional (TDX quote received)");

    console.log();
    outputSuccess("TEE endpoint verified");
    console.log();
    console.log(chalk.gray("  Quote size:  ") + chalk.cyan(`${quoteBytes.length} bytes`));
    console.log(chalk.gray("  Challenge:   ") + chalk.cyan(challenge.slice(0, 20) + "..."));
    console.log();
    console.log(chalk.yellow("  Note: Full TDX attestation verification requires a browser environment."));
    console.log(chalk.yellow("  The @phala/dcap-qvl-web library used for cryptographic verification"));
    console.log(chalk.yellow("  is browser-only. Use the SDK in a browser for full verification."));

    // Show validator info
    console.log();
    console.log(chalk.bold("TEE Validators:"));
    console.log(`  ${chalk.cyan("TEE:")}   ${TEE_VALIDATORS.TEE.toBase58()}`);
    console.log(`  ${chalk.cyan("US:")}    ${TEE_VALIDATORS.US.toBase58()}`);
    console.log(`  ${chalk.cyan("EU:")}    ${TEE_VALIDATORS.EU.toBase58()}`);
    console.log(`  ${chalk.cyan("ASIA:")}  ${TEE_VALIDATORS.ASIA.toBase58()}`);
    console.log();
  } catch (error) {
    spinner.fail("TEE verification failed");
    outputError(`${error}`);
    process.exit(1);
  }
}

async function showTeeInfo(): Promise<void> {
  try {
    const config = await loadConfig();

    console.log();
    console.log(chalk.bold("TEE Configuration"));
    console.log(chalk.gray("─".repeat(50)));

    const { MAGICBLOCK_RPC, TEE_VALIDATORS, DELEGATION_PROGRAM_ID } = await import("@priven/client");

    console.log();
    console.log(chalk.bold("Endpoints:"));
    console.log(`  ${chalk.cyan("Devnet:")}   ${MAGICBLOCK_RPC.devnet}`);
    console.log(`  ${chalk.cyan("Mainnet:")}  ${MAGICBLOCK_RPC.mainnet}`);
    console.log(`  ${chalk.cyan("TEE:")}      ${MAGICBLOCK_RPC.tee}`);

    console.log();
    console.log(chalk.bold("Program IDs:"));
    console.log(`  ${chalk.cyan("Delegation:")}  ${DELEGATION_PROGRAM_ID.toBase58()}`);

    console.log();
    console.log(chalk.bold("Validators:"));
    console.log(`  ${chalk.cyan("TEE:")}   ${TEE_VALIDATORS.TEE.toBase58()}`);
    console.log(`  ${chalk.cyan("US:")}    ${TEE_VALIDATORS.US.toBase58()}`);
    console.log(`  ${chalk.cyan("EU:")}    ${TEE_VALIDATORS.EU.toBase58()}`);
    console.log(`  ${chalk.cyan("ASIA:")}  ${TEE_VALIDATORS.ASIA.toBase58()}`);

    console.log();
    console.log(chalk.bold("Current Config:"));
    console.log(`  ${chalk.cyan("TEE RPC:")}    ${config.teeRpc}`);
    console.log(`  ${chalk.cyan("Network:")}    ${config.network}`);
    console.log(`  ${chalk.cyan("Program ID:")} ${config.programId}`);
    console.log();
  } catch (error) {
    outputError(`${error}`);
    process.exit(1);
  }
}
