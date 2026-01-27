/**
 * priven pools - Pool discovery commands
 *
 * Commands:
 *   priven pools list - List available pools
 *   priven pools get <address> - Get specific pool info
 *   priven pools stats - Show pool statistics
 */
import { Command } from "commander";
export declare function registerPoolsCommand(program: Command): void;
