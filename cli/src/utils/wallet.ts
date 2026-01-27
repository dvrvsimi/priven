/**
 * Wallet loading utilities
 */
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { expandPath } from "../config";

/**
 * Load a Solana keypair from a JSON file
 *
 * @param path - Path to the keypair JSON file (supports ~ expansion)
 * @returns Solana Keypair
 */
export function loadWallet(path: string): Keypair {
  const expandedPath = expandPath(path);

  try {
    const fileContent = readFileSync(expandedPath, "utf-8");
    const secretKey = new Uint8Array(JSON.parse(fileContent));
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Wallet file not found: ${expandedPath}`);
    }
    throw new Error(`Failed to load wallet from ${expandedPath}: ${error}`);
  }
}

/**
 * Get the default wallet path
 */
export function getDefaultWalletPath(): string {
  return expandPath("~/.config/solana/id.json");
}
