"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.expandPath = expandPath;
/**
 * Configuration loading for Priven CLI
 *
 * Supports:
 * - .privenrc (JSON)
 * - .privenrc.json
 * - priven.config.js
 * - Environment variables (PRIVEN_*)
 */
const cosmiconfig_1 = require("cosmiconfig");
const os_1 = require("os");
const path_1 = require("path");
const DEFAULT_CONFIG = {
    rpcUrl: "https://api.devnet.solana.com",
    network: "devnet",
    programId: "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM",
    wallet: (0, path_1.resolve)((0, os_1.homedir)(), ".config/solana/id.json"),
    defaultMaxPools: 5,
    teeRpc: "https://tee.magicblock.app",
};
/**
 * Load configuration from file and environment
 */
async function loadConfig() {
    const explorer = (0, cosmiconfig_1.cosmiconfig)("priven");
    let fileConfig = {};
    try {
        const result = await explorer.search();
        if (result && !result.isEmpty) {
            fileConfig = result.config;
        }
    }
    catch {
        // No config file found, use defaults
    }
    // Environment variables override file config
    const envConfig = {};
    if (process.env.PRIVEN_RPC_URL) {
        envConfig.rpcUrl = process.env.PRIVEN_RPC_URL;
    }
    if (process.env.PRIVEN_NETWORK) {
        envConfig.network = process.env.PRIVEN_NETWORK;
    }
    if (process.env.PRIVEN_PROGRAM_ID) {
        envConfig.programId = process.env.PRIVEN_PROGRAM_ID;
    }
    if (process.env.PRIVEN_WALLET) {
        envConfig.wallet = process.env.PRIVEN_WALLET;
    }
    if (process.env.PRIVEN_TEE_RPC) {
        envConfig.teeRpc = process.env.PRIVEN_TEE_RPC;
    }
    // Merge: defaults < file < env
    return {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        ...envConfig,
    };
}
/**
 * Expand ~ in paths to home directory
 */
function expandPath(path) {
    if (path.startsWith("~")) {
        return (0, path_1.resolve)((0, os_1.homedir)(), path.slice(2));
    }
    return (0, path_1.resolve)(path);
}
