import {
  Connection,
  PublicKey,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import { RAYDIUM_CPMM_PROGRAM_ID, CPMM_POOL_SIZE } from "./constants";

/** CPMM pool discovery options */
export interface CpmmDiscoveryOptions {
  tokenMint?: PublicKey;
  limit?: number;
}

// CPMM layout offsets
const TOKEN_0_MINT_OFFSET = 168;
const TOKEN_1_MINT_OFFSET = 200;

/**
 * Discover CPMM pool addresses
 *
 * Returns addresses only - TEE executor fetches full data.
 *
 * When tokenMint is specified, searches BOTH token_0_mint (offset 168) and
 * token_1_mint (offset 200) since the token could be in either position.
 * Results are deduplicated.
 */
export async function discoverCpmmPools(
  connection: Connection,
  options?: CpmmDiscoveryOptions
): Promise<PublicKey[]> {
  const limit = options?.limit || 20;

  console.log("Discovering CPMM pools...");

  if (options?.tokenMint) {
    // Search both positions and merge results
    const [pools0, pools1] = await Promise.all([
      fetchPoolsWithMintAt(connection, options.tokenMint, TOKEN_0_MINT_OFFSET),
      fetchPoolsWithMintAt(connection, options.tokenMint, TOKEN_1_MINT_OFFSET),
    ]);

    // Deduplicate by pubkey string
    const seen = new Set<string>();
    const merged: PublicKey[] = [];
    for (const pool of [...pools0, ...pools1]) {
      const key = pool.toBase58();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(pool);
      }
    }

    console.log(`Found ${merged.length} CPMM pools with mint ${options.tokenMint.toBase58().slice(0, 8)}...`);
    return merged.slice(0, limit);
  }

  // No mint filter - just get all pools by size
  const filters: GetProgramAccountsFilter[] = [
    { dataSize: CPMM_POOL_SIZE },
  ];

  const accounts = await connection.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, {
    filters,
    dataSlice: { offset: 0, length: 0 },
  });

  const addresses = accounts.slice(0, limit).map((a) => a.pubkey);
  console.log(`Found ${addresses.length} CPMM pools`);

  return addresses;
}

async function fetchPoolsWithMintAt(
  connection: Connection,
  mint: PublicKey,
  offset: number
): Promise<PublicKey[]> {
  const filters: GetProgramAccountsFilter[] = [
    { dataSize: CPMM_POOL_SIZE },
    { memcmp: { offset, bytes: mint.toBase58() } },
  ];

  const accounts = await connection.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, {
    filters,
    dataSlice: { offset: 0, length: 0 },
  });

  return accounts.map((a) => a.pubkey);
}

/**
 * Discover CPMM pools with retry
 */
export async function discoverCpmmPoolsWithRetry(
  connection: Connection,
  options?: CpmmDiscoveryOptions,
  maxRetries: number = 3
): Promise<PublicKey[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((r) => setTimeout(r, delay));
      }
      return await discoverCpmmPools(connection, options);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError || new Error("Failed to discover pools after retries");
}
