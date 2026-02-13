/**
 * Token Discovery Module
 *
 * Functions for discovering token holders and accounts.
 * Used by TEE executor for TOKEN_BALANCE and TOKEN_OWNERSHIP queries.
 */
import { Connection, PublicKey } from "@solana/web3.js";

/** SPL Token Program ID */
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/** Token account data layout offsets */
const TOKEN_ACCOUNT_SIZE = 165;
const MINT_OFFSET = 0;
const OWNER_OFFSET = 32;
const AMOUNT_OFFSET = 64;

/** Token account info */
export interface TokenAccountInfo {
  owner: PublicKey;
  mint: PublicKey;
  balance: bigint;
  address: PublicKey;
}

/** Options for token discovery */
export interface TokenDiscoveryOptions {
  minBalance?: bigint;
  maxBalance?: bigint;
  limit?: number;
}

/**
 * Discover token accounts for a specific mint
 * Returns all token accounts holding the specified token
 */
export async function discoverTokenAccounts(
  connection: Connection,
  tokenMint: PublicKey,
  options?: TokenDiscoveryOptions
): Promise<TokenAccountInfo[]> {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: TOKEN_ACCOUNT_SIZE },
      { memcmp: { offset: MINT_OFFSET, bytes: tokenMint.toBase58() } },
    ],
  });

  const results: TokenAccountInfo[] = [];

  for (const { pubkey, account } of accounts) {
    const data = account.data;
    const balance = data.readBigUInt64LE(AMOUNT_OFFSET);

    // Apply balance filters
    if (options?.minBalance !== undefined && balance < options.minBalance) {
      continue;
    }
    if (options?.maxBalance !== undefined && balance > options.maxBalance) {
      continue;
    }

    results.push({
      owner: new PublicKey(data.slice(OWNER_OFFSET, OWNER_OFFSET + 32)),
      mint: tokenMint,
      balance,
      address: pubkey,
    });

    // Apply limit
    if (options?.limit !== undefined && results.length >= options.limit) {
      break;
    }
  }

  return results;
}

/**
 * Discover unique token holders for a specific mint
 * Returns list of wallet addresses holding the token
 */
export async function discoverTokenHolders(
  connection: Connection,
  tokenMint: PublicKey,
  options?: TokenDiscoveryOptions
): Promise<PublicKey[]> {
  const accounts = await discoverTokenAccounts(connection, tokenMint, options);

  // Deduplicate owners (a wallet may have multiple token accounts)
  const owners = new Set<string>();
  const result: PublicKey[] = [];

  for (const account of accounts) {
    const ownerStr = account.owner.toBase58();
    if (!owners.has(ownerStr)) {
      owners.add(ownerStr);
      result.push(account.owner);

      if (options?.limit !== undefined && result.length >= options.limit) {
        break;
      }
    }
  }

  return result;
}

/**
 * Get token balance for a specific wallet and mint
 */
export async function getTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  tokenMint: PublicKey
): Promise<bigint> {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: TOKEN_ACCOUNT_SIZE },
      { memcmp: { offset: MINT_OFFSET, bytes: tokenMint.toBase58() } },
      { memcmp: { offset: OWNER_OFFSET, bytes: wallet.toBase58() } },
    ],
  });

  let totalBalance = 0n;
  for (const { account } of accounts) {
    totalBalance += account.data.readBigUInt64LE(AMOUNT_OFFSET);
  }

  return totalBalance;
}

/**
 * Check if wallet holds a specific token
 */
export async function hasTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  tokenMint: PublicKey,
  minBalance?: bigint
): Promise<boolean> {
  const balance = await getTokenBalance(connection, wallet, tokenMint);
  return balance >= (minBalance ?? 1n);
}

/**
 * Get holder count for a specific token mint
 */
export async function getHolderCount(
  connection: Connection,
  tokenMint: PublicKey,
  minBalance?: bigint
): Promise<number> {
  const holders = await discoverTokenHolders(connection, tokenMint, {
    minBalance: minBalance ?? 1n,
  });
  return holders.length;
}
