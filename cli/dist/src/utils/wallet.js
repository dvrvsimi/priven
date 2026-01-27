"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWallet = loadWallet;
exports.getDefaultWalletPath = getDefaultWalletPath;
/**
 * Wallet loading utilities
 */
const web3_js_1 = require("@solana/web3.js");
const fs_1 = require("fs");
const config_1 = require("../config");
/**
 * Load a Solana keypair from a JSON file
 *
 * @param path - Path to the keypair JSON file (supports ~ expansion)
 * @returns Solana Keypair
 */
function loadWallet(path) {
    const expandedPath = (0, config_1.expandPath)(path);
    try {
        const fileContent = (0, fs_1.readFileSync)(expandedPath, "utf-8");
        const secretKey = new Uint8Array(JSON.parse(fileContent));
        return web3_js_1.Keypair.fromSecretKey(secretKey);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(`Wallet file not found: ${expandedPath}`);
        }
        throw new Error(`Failed to load wallet from ${expandedPath}: ${error}`);
    }
}
/**
 * Get the default wallet path
 */
function getDefaultWalletPath() {
    return (0, config_1.expandPath)("~/.config/solana/id.json");
}
