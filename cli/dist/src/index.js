"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWallet = exports.loadConfig = void 0;
exports.createCli = createCli;
/**
 * Priven CLI - Main entry point
 *
 * Sets up Commander.js with all available commands
 */
const commander_1 = require("commander");
const query_1 = require("./commands/query");
const pools_1 = require("./commands/pools");
const tee_1 = require("./commands/tee");
const config_1 = require("./commands/config");
function createCli() {
    const program = new commander_1.Command();
    program
        .name("priven")
        .description("Privacy-preserving pool queries on Solana via MagicBlock TEE")
        .version("0.1.0");
    // Register all commands
    (0, query_1.registerQueryCommand)(program);
    (0, pools_1.registerPoolsCommand)(program);
    (0, tee_1.registerTeeCommand)(program);
    (0, config_1.registerConfigCommand)(program);
    return program;
}
var config_2 = require("./config");
Object.defineProperty(exports, "loadConfig", { enumerable: true, get: function () { return config_2.loadConfig; } });
var wallet_1 = require("./utils/wallet");
Object.defineProperty(exports, "loadWallet", { enumerable: true, get: function () { return wallet_1.loadWallet; } });
