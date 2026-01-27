"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_MINTS = exports.TOKEN_ACCOUNT_SIZE = exports.TOKEN_PROGRAM_ID = void 0;
exports.fetchTokenAccounts = fetchTokenAccounts;
exports.fetchTokenAccountsByOwner = fetchTokenAccountsByOwner;
exports.toPoolData = toPoolData;
exports.fetchTokenAccountsWithRetry = fetchTokenAccountsWithRetry;
/**
 * SPL Token Account Fetching for Priven
 *
 * Fetches token accounts via QuickNode RPC for use in private queries.
 * Works on both devnet and mainnet (unlike Raydium V4 which is mainnet-only).
 *
 * Privacy angle: The predicate filters by balance threshold, which reveals
 * trading intent (e.g., "show me accounts with >10K tokens" = accumulation).
 * TEE execution hides this threshold from observers.
 */
const web3_js_1 = require("@solana/web3.js");
/**
 * SPL Token Program ID
 */
exports.TOKEN_PROGRAM_ID = new web3_js_1.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
/**
 * SPL Token account size (165 bytes)
 */
exports.TOKEN_ACCOUNT_SIZE = 165;
/**
 * Token account layout offsets
 * Based on SPL Token standard layout
 */
const TOKEN_ACCOUNT_OFFSETS = {
    mint: 0, // Pubkey (32 bytes)
    owner: 32, // Pubkey (32 bytes)
    amount: 64, // u64 (8 bytes)
    delegate: 72, // COption<Pubkey> (4 + 32 bytes)
    state: 108, // AccountState (1 byte)
    isNative: 109, // COption<u64> (4 + 8 bytes)
    delegatedAmount: 121, // u64 (8 bytes)
    closeAuthority: 129, // COption<Pubkey> (4 + 32 bytes)
};
/**
 * Fetch SPL Token accounts from QuickNode RPC
 *
 * Maps token accounts to PoolData format for compatibility with Priven:
 * - address = token account pubkey
 * - tokenAReserve = token balance
 * - tokenBReserve = 0 (unused)
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param filters - Optional filters
 * @param commitment - Confirmation level
 * @returns Array of token accounts as PoolData
 */
async function fetchTokenAccounts(connection, filters, commitment = "confirmed") {
    console.log("Fetching SPL Token accounts...");
    const programFilters = [
        { dataSize: exports.TOKEN_ACCOUNT_SIZE },
    ];
    // Filter by mint (on-chain filter)
    if (filters?.mint) {
        programFilters.push({
            memcmp: {
                offset: TOKEN_ACCOUNT_OFFSETS.mint,
                bytes: filters.mint.toBase58(),
            },
        });
    }
    // Filter by owner (on-chain filter)
    if (filters?.owner) {
        programFilters.push({
            memcmp: {
                offset: TOKEN_ACCOUNT_OFFSETS.owner,
                bytes: filters.owner.toBase58(),
            },
        });
    }
    try {
        const accounts = await connection.getProgramAccounts(exports.TOKEN_PROGRAM_ID, {
            filters: programFilters,
            commitment,
        });
        console.log(`Found ${accounts.length} token accounts`);
        // Parse accounts
        let parsed = accounts
            .map((acc) => parseTokenAccountToPoolData(acc.pubkey, acc.account))
            .filter((p) => p !== null);
        // Apply balance filter client-side
        if (filters?.minBalance !== undefined) {
            parsed = parsed.filter((p) => p.tokenAReserve >= filters.minBalance);
            console.log(`Filtered to ${parsed.length} accounts with balance >= ${filters.minBalance}`);
        }
        return parsed;
    }
    catch (error) {
        console.error("Error fetching token accounts:", error);
        throw new Error(`Failed to fetch token accounts: ${error}`);
    }
}
/**
 * Fetch token accounts by owner using getTokenAccountsByOwner
 *
 * Faster than getProgramAccounts when filtering by owner.
 *
 * @param connection - Solana connection
 * @param owner - Owner wallet public key
 * @param mint - Optional: filter by specific mint
 * @param commitment - Confirmation level
 * @returns Array of token accounts
 */
async function fetchTokenAccountsByOwner(connection, owner, mint, commitment = "confirmed") {
    console.log(`Fetching token accounts for owner: ${owner.toBase58()}`);
    const filter = mint
        ? { mint }
        : { programId: exports.TOKEN_PROGRAM_ID };
    const accounts = await connection.getTokenAccountsByOwner(owner, filter, {
        commitment,
    });
    console.log(`Found ${accounts.value.length} token accounts`);
    return accounts.value.map((acc) => {
        const data = acc.account.data;
        return {
            address: acc.pubkey,
            mint: new web3_js_1.PublicKey(data.subarray(0, 32)),
            owner: new web3_js_1.PublicKey(data.subarray(32, 64)),
            balance: data.readBigUInt64LE(TOKEN_ACCOUNT_OFFSETS.amount),
        };
    });
}
/**
 * Convert TokenAccountData to PoolData format
 */
function toPoolData(account) {
    return {
        address: account.address,
        tokenAReserve: account.balance,
        tokenBReserve: 0n,
    };
}
/**
 * Parse a token account into PoolData format
 */
function parseTokenAccountToPoolData(pubkey, accountInfo) {
    try {
        const data = accountInfo.data;
        if (data.length !== exports.TOKEN_ACCOUNT_SIZE) {
            return null;
        }
        // Read balance at offset 64
        const balance = data.readBigUInt64LE(TOKEN_ACCOUNT_OFFSETS.amount);
        return {
            address: pubkey,
            tokenAReserve: balance,
            tokenBReserve: 0n,
        };
    }
    catch {
        return null;
    }
}
/**
 * Fetch token accounts with retry logic
 */
async function fetchTokenAccountsWithRetry(connection, filters, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.log(`Retry attempt ${attempt + 1} after ${delay}ms...`);
                await new Promise((r) => setTimeout(r, delay));
            }
            return await fetchTokenAccounts(connection, filters);
        }
        catch (error) {
            lastError = error;
            console.warn(`Attempt ${attempt + 1} failed:`, error);
        }
    }
    throw lastError || new Error("Failed to fetch token accounts after retries");
}
/**
 * Well-known token mints for testing
 */
exports.KNOWN_MINTS = {
    /** Wrapped SOL (exists on all networks) */
    WSOL: new web3_js_1.PublicKey("So11111111111111111111111111111111111111112"),
    /** USDC on mainnet */
    USDC_MAINNET: new web3_js_1.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    /** USDC-Dev on devnet */
    USDC_DEVNET: new web3_js_1.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
};
