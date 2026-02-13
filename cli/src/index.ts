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
import { registerSessionCommand } from "./commands/session";
import { registerAnchorCommand } from "./commands/anchor";
import { registerTokensCommand } from "./commands/tokens";
import { registerTxCommand } from "./commands/tx";

export function createCli(): Command {
  const program = new Command();

  program
    .name("priven")
    .description("Privacy-preserving RPC layer for Solana via MagicBlock TEE")
    .version("0.2.0");

  // Register all commands
  registerQueryCommand(program);
  registerPoolsCommand(program);
  registerTokensCommand(program);
  registerTxCommand(program);
  registerTeeCommand(program);
  registerConfigCommand(program);
  registerSessionCommand(program);
  registerAnchorCommand(program);

  return program;
}

export { loadConfig } from "./config";
export { loadWallet } from "./utils/wallet";
