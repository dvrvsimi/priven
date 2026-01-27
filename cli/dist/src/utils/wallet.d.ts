/**
 * Wallet loading utilities
 */
import { Keypair } from "@solana/web3.js";
/**
 * Load a Solana keypair from a JSON file
 *
 * @param path - Path to the keypair JSON file (supports ~ expansion)
 * @returns Solana Keypair
 */
export declare function loadWallet(path: string): Keypair;
/**
 * Get the default wallet path
 */
export declare function getDefaultWalletPath(): string;
