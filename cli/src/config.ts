/**
 * Configuration loading for Priven CLI
 *
 * Supports:
 * - .privenrc (JSON)
 * - .privenrc.json
 * - priven.config.js
 * - Environment variables (PRIVEN_*)
 */
import { cosmiconfig } from "cosmiconfig";
import { homedir } from "os";
import { resolve } from "path";

export interface PrivenConfig {
  /** Solana RPC URL */
  rpcUrl: string;
  /** Network: devnet or mainnet */
  network: "devnet" | "mainnet";
  /** Priven program ID */
  programId: string;
  /** Path to wallet keypair */
  wallet: string;
  /** Default max pools per query */
  defaultMaxPools: number;
  /** TEE RPC endpoint */
  teeRpc: string;
}

const DEFAULT_CONFIG: PrivenConfig = {
  rpcUrl: "https://api.devnet.solana.com",
  network: "devnet",
  programId: "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM",
  wallet: resolve(homedir(), ".config/solana/id.json"),
  defaultMaxPools: 5,
  teeRpc: "https://tee.magicblock.app",
};

/**
 * Load configuration from file and environment
 */
export async function loadConfig(): Promise<PrivenConfig> {
  const explorer = cosmiconfig("priven");

  let fileConfig: Partial<PrivenConfig> = {};

  try {
    const result = await explorer.search();
    if (result && !result.isEmpty) {
      fileConfig = result.config as Partial<PrivenConfig>;
    }
  } catch {
    // No config file found, use defaults
  }

  // Environment variables override file config
  const envConfig: Partial<PrivenConfig> = {};

  if (process.env.PRIVEN_RPC_URL) {
    envConfig.rpcUrl = process.env.PRIVEN_RPC_URL;
  }
  if (process.env.PRIVEN_NETWORK) {
    envConfig.network = process.env.PRIVEN_NETWORK as "devnet" | "mainnet";
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
export function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}
