/**
 * Transaction Lookup Module
 *
 * Functions for discovering wallet transaction history and program interactions.
 * Used by TEE executor for TX_LOOKUP queries.
 *
 * Note: This module uses getSignaturesForAddress which only returns recent
 * transactions (typically last 1000). For full history, an indexer is required.
 */
import { Connection, PublicKey } from "@solana/web3.js";

/** Transaction info */
export interface TransactionInfo {
  signature: string;
  slot: bigint;
  blockTime: number | null | undefined;
  err: unknown;
}

/** Options for transaction lookup */
export interface TxLookupOptions {
  limit?: number;
  afterSlot?: bigint;
  beforeSlot?: bigint;
}

/**
 * Get recent transaction signatures for a wallet
 */
export async function getWalletTransactions(
  connection: Connection,
  wallet: PublicKey,
  options?: TxLookupOptions
): Promise<TransactionInfo[]> {
  const limit = options?.limit ?? 100;

  const signatures = await connection.getSignaturesForAddress(wallet, {
    limit,
  });

  const results: TransactionInfo[] = [];

  for (const sig of signatures) {
    const slot = BigInt(sig.slot);

    // Apply slot filters
    if (options?.afterSlot !== undefined && slot <= options.afterSlot) {
      continue;
    }
    if (options?.beforeSlot !== undefined && slot >= options.beforeSlot) {
      continue;
    }

    results.push({
      signature: sig.signature,
      slot,
      blockTime: sig.blockTime,
      err: sig.err,
    });
  }

  return results;
}

/**
 * Check if wallet has interacted with a specific program
 */
export async function hasInteractedWithProgram(
  connection: Connection,
  wallet: PublicKey,
  program: PublicKey,
  options?: TxLookupOptions
): Promise<boolean> {
  const limit = options?.limit ?? 100;

  const signatures = await connection.getSignaturesForAddress(wallet, {
    limit,
  });

  for (const sig of signatures) {
    const slot = BigInt(sig.slot);

    // Apply slot filters
    if (options?.afterSlot !== undefined && slot <= options.afterSlot) {
      continue;
    }
    if (options?.beforeSlot !== undefined && slot >= options.beforeSlot) {
      continue;
    }

    try {
      const tx = await connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.transaction.message) continue;

      // Check if program is in account keys
      const accountKeys = tx.transaction.message.staticAccountKeys;
      for (const key of accountKeys) {
        if (key.equals(program)) {
          return true;
        }
      }

      // Also check loaded addresses for versioned transactions
      const loadedAddresses = tx.meta?.loadedAddresses;
      if (loadedAddresses) {
        for (const key of [...loadedAddresses.writable, ...loadedAddresses.readonly]) {
          if (key.equals(program)) {
            return true;
          }
        }
      }
    } catch {
      // Transaction may have been pruned, continue
      continue;
    }
  }

  return false;
}

/**
 * Get programs a wallet has interacted with
 */
export async function getInteractedPrograms(
  connection: Connection,
  wallet: PublicKey,
  options?: TxLookupOptions
): Promise<PublicKey[]> {
  const limit = options?.limit ?? 50;

  const signatures = await connection.getSignaturesForAddress(wallet, {
    limit,
  });

  const programs = new Set<string>();
  const results: PublicKey[] = [];

  // Known system programs to exclude
  const systemPrograms = new Set([
    "11111111111111111111111111111111",
    "ComputeBudget111111111111111111111111111111",
    "SysvarRent111111111111111111111111111111111",
    "SysvarC1ock11111111111111111111111111111111",
  ]);

  for (const sig of signatures) {
    const slot = BigInt(sig.slot);

    if (options?.afterSlot !== undefined && slot <= options.afterSlot) continue;
    if (options?.beforeSlot !== undefined && slot >= options.beforeSlot) continue;

    try {
      const tx = await connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.transaction.message) continue;

      // Get program IDs from instructions
      const message = tx.transaction.message;
      const accountKeys = message.staticAccountKeys;

      // For versioned transactions, get compiledInstructions
      if ("compiledInstructions" in message) {
        for (const ix of message.compiledInstructions) {
          const programId = accountKeys[ix.programIdIndex];
          const programStr = programId.toBase58();

          if (!systemPrograms.has(programStr) && !programs.has(programStr)) {
            programs.add(programStr);
            results.push(programId);
          }
        }
      } else if ("instructions" in message) {
        // Legacy transaction
        const legacyMessage = message as { instructions: Array<{ programIdIndex: number }> };
        for (const ix of legacyMessage.instructions) {
          const programId = accountKeys[ix.programIdIndex];
          const programStr = programId.toBase58();

          if (!systemPrograms.has(programStr) && !programs.has(programStr)) {
            programs.add(programStr);
            results.push(programId);
          }
        }
      }
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Check if wallet has any recent activity
 */
export async function hasRecentActivity(
  connection: Connection,
  wallet: PublicKey,
  afterSlot?: bigint
): Promise<boolean> {
  const signatures = await connection.getSignaturesForAddress(wallet, {
    limit: 1,
  });

  if (signatures.length === 0) return false;

  if (afterSlot !== undefined) {
    return BigInt(signatures[0].slot) > afterSlot;
  }

  return true;
}

/**
 * Get transaction count for wallet (limited to recent history)
 */
export async function getTransactionCount(
  connection: Connection,
  wallet: PublicKey,
  options?: TxLookupOptions
): Promise<number> {
  const transactions = await getWalletTransactions(connection, wallet, {
    ...options,
    limit: options?.limit ?? 1000,
  });
  return transactions.length;
}
