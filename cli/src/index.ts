/**
 * Priven CLI - Main entry point
 *
 * Sets up Commander.js with all available commands
 */
import { Command } from "commander";
import { registerQueryCommand } from "./commands/query";
import { registerPoolsCommand } from "./commands/pools";
import { registerTeeCommand } from "./commands/tee";
import { registerConfigCommand } from "./commands/config";

export function createCli(): Command {
  const program = new Command();

  program
    .name("priven")
    .description("Privacy-preserving pool queries on Solana via MagicBlock TEE")
    .version("0.1.0");

  // Register all commands
  registerQueryCommand(program);
  registerPoolsCommand(program);
  registerTeeCommand(program);
  registerConfigCommand(program);

  return program;
}

export { loadConfig } from "./config";
export { loadWallet } from "./utils/wallet";
