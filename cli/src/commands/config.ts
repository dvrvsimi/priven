/**
 * priven config - Configuration commands
 *
 * Commands:
 *   priven config show - Display current configuration
 */
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, PrivenConfig } from "../config";
import { outputError } from "../utils/output";

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Configuration commands");

  config
    .command("show")
    .description("Display current configuration")
    .action(async () => {
      await showConfig();
    });

  config
    .command("init")
    .description("Initialize a .privenrc configuration file")
    .option("--force", "Overwrite existing config file")
    .action(async (options: { force?: boolean }) => {
      await initConfig(options);
    });
}

async function showConfig(): Promise<void> {
  try {
    const config = await loadConfig();

    console.log();
    console.log(chalk.bold("Priven Configuration"));
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    const entries: [string, string][] = [
      ["RPC URL", config.rpcUrl],
      ["Network", config.network],
      ["Program ID", config.programId],
      ["Wallet", config.wallet],
      ["TEE RPC", config.teeRpc],
      ["Max Pools", String(config.defaultMaxPools)],
    ];

    for (const [key, value] of entries) {
      const displayValue = value.length > 60 ? value.slice(0, 57) + "..." : value;
      console.log(`  ${chalk.cyan(key.padEnd(12))} ${displayValue}`);
    }

    console.log();
    console.log(chalk.gray("Configuration sources (in order of priority):"));
    console.log(chalk.gray("  1. Environment variables (PRIVEN_*)"));
    console.log(chalk.gray("  2. Config file (.privenrc, .privenrc.json, priven.config.js)"));
    console.log(chalk.gray("  3. Default values"));
    console.log();
  } catch (error) {
    outputError(`Failed to load configuration: ${error}`);
    process.exit(1);
  }
}

async function initConfig(options: { force?: boolean }): Promise<void> {
  const fs = await import("fs");
  const path = await import("path");

  const configPath = path.resolve(process.cwd(), ".privenrc");

  // Check if file exists
  if (fs.existsSync(configPath) && !options.force) {
    outputError(`Config file already exists: ${configPath}`);
    console.log(chalk.gray("Use --force to overwrite"));
    process.exit(1);
  }

  const defaultConfig: Partial<PrivenConfig> = {
    rpcUrl: "https://api.devnet.solana.com",
    network: "devnet",
    programId: "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM",
    wallet: "~/.config/solana/id.json",
    defaultMaxPools: 5,
    teeRpc: "https://tee.magicblock.app",
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + "\n");

  console.log();
  console.log(chalk.green("✓"), `Created config file: ${configPath}`);
  console.log();
  console.log(chalk.gray("Edit this file to customize your Priven CLI settings."));
  console.log(chalk.gray("You can also use environment variables (PRIVEN_*) to override."));
  console.log();
}
