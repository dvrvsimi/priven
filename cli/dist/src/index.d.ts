/**
 * Priven CLI - Main entry point
 *
 * Sets up Commander.js with all available commands
 */
import { Command } from "commander";
export declare function createCli(): Command;
export { loadConfig } from "./config";
export { loadWallet } from "./utils/wallet";
