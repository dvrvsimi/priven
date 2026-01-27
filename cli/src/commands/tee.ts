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
  const spinner = createSpinner("Verifying TEE integrity...");

  try {
    const config = await loadConfig();
    const network = options.network || config.network;

    console.log();
    console.log(chalk.bold("TEE Integrity Verification"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Network:     ${chalk.cyan(network)}`);
    console.log(`  TEE RPC:     ${chalk.cyan(config.teeRpc)}`);
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    spinner.start();

    // Import TEE verification from SDK
    const { verifyTeeRpcIntegrity } = await import("@magicblock-labs/ephemeral-rollups-sdk");
    const { MAGICBLOCK_RPC, TEE_VALIDATORS } = await import("@priven/client");

    const teeRpc = config.teeRpc || MAGICBLOCK_RPC.tee;

    // Verify TEE integrity
    const verified = await verifyTeeRpcIntegrity(teeRpc);

    if (verified) {
      spinner.succeed("TEE integrity verified (Intel TDX attestation passed)");
      console.log();
      outputSuccess("TEE is trustworthy");
      console.log();
      console.log(chalk.gray("  The TEE endpoint has been verified using Intel TDX remote attestation."));
      console.log(chalk.gray("  Your encrypted predicates will be processed securely."));
    } else {
      spinner.warn("TEE integrity verification failed");
      console.log();
      outputWarning("TEE attestation could not be verified");
      console.log();
      console.log(chalk.yellow("  Warning: The TEE endpoint could not be verified."));
      console.log(chalk.yellow("  Proceed with caution - your predicates may not be fully protected."));
    }

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
