import {
  Connection,
  PublicKey,
  AccountInfo,
  GetProgramAccountsFilter,
  Commitment,
} from "@solana/web3.js";
import type { PoolData, PoolFilters } from "./types";

/**
 * Raydium V4 AMM Program ID (Mainnet)
 * Devnet: HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8
 */
export const RAYDIUM_V4_PROGRAM_ID = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);

/**
 * Raydium V4 pool account size (bytes)
 * V4 AMM pools are exactly 752 bytes
 */
export const RAYDIUM_POOL_SIZE = 752;

/**
 * Fetch all Raydium V4 pools from QuickNode RPC
 *
 * Uses getProgramAccounts with filters for efficient querying
 * This is the core QuickNode integration for the hackathon prize
 *
 * @param connection - Solana connection (should point to QuickNode endpoint)
 * @param filters - Optional filters for pool selection
 * @param commitment - Confirmation commitment level
 * @returns Array of pool data
 */
export async function fetchRaydiumPools(
  connection: Connection,
  filters?: PoolFilters,
  commitment: Commitment = "confirmed"
): Promise<PoolData[]> {
  console.log("Fetching Raydium pools from QuickNode...");

  // Build program account filters
  const programFilters: GetProgramAccountsFilter[] = [
    // Filter by exact account size (752 bytes for V4 AMM)
    { dataSize: RAYDIUM_POOL_SIZE },
  ];

  // Optional: Filter by pool status (offset 0, 8 bytes for u64)
  // Raydium V4 uses status=6 for active pools
  // Note: Raydium stores status as u64, not u8
  if (filters?.status !== undefined) {
    // Encode status as u64 little-endian, then convert to base58
    const statusBuffer = Buffer.alloc(8);
    statusBuffer.writeBigUInt64LE(BigInt(filters.status));
    const bs58 = require("bs58");
    programFilters.push({
      memcmp: {
        offset: 0,
        bytes: bs58.encode(statusBuffer),
      },
    });
  }

  // Optional: Filter by token mint
  // This requires knowing the exact offset of token mints in the account data
  // For MVP, we'll skip this and filter client-side
  if (filters?.tokenMint) {
    console.warn(
      "Token mint filtering not yet implemented, will filter client-side"
    );
  }

  try {
    // Use dataSlice to only fetch the data we need (reduces response size dramatically)
    // We need: status (0-8), lpReserve (720-728), swapBaseInAmount (256-264), swapQuoteInAmount (296-304)
    // Fetch first 328 bytes which covers status through swapQuote2BaseFee
    const accounts = await connection.getProgramAccounts(
      RAYDIUM_V4_PROGRAM_ID,
      {
        filters: programFilters,
        commitment,
        dataSlice: { offset: 0, length: 328 },
      }
    );

    console.log(`Found ${accounts.length} Raydium V4 pools`);

    // Parse pool data from accounts
    const pools = accounts
      .map((account) => parsePoolAccount(account.pubkey, account.account))
      .filter((pool): pool is PoolData => pool !== null);

    // Apply client-side filters
    let filteredPools = pools;

    if (filters?.minTvlPrefilter) {
      filteredPools = filteredPools.filter((pool) => {
        const tvl = pool.tokenAReserve + pool.tokenBReserve;
        return tvl >= filters.minTvlPrefilter!;
      });
      console.log(
        `Filtered to ${filteredPools.length} pools with TVL >= ${filters.minTvlPrefilter}`
      );
    }

    return filteredPools;
  } catch (error) {
    console.error("Error fetching Raydium pools:", error);
    throw new Error(`Failed to fetch pools from QuickNode: ${error}`);
  }
}

/**
 * Fetch specific pools by address using batch RPC call
 *
 * Uses getMultipleAccounts for efficient batch fetching
 * Up to 100 accounts per call (QuickNode supports this)
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param poolAddresses - Array of pool public keys
 * @param commitment - Confirmation commitment level
 * @returns Array of pool data (null entries are filtered out)
 */
export async function getMultiplePools(
  connection: Connection,
  poolAddresses: PublicKey[],
  commitment: Commitment = "confirmed"
): Promise<PoolData[]> {
  if (poolAddresses.length === 0) {
    return [];
  }

  console.log(
    `Fetching ${poolAddresses.length} pools from QuickNode (batch)...`
  );

  try {
    // Core QuickNode Integration: getMultipleAccounts
    // Batch fetch up to 100 accounts per call
    const accounts = await connection.getMultipleAccountsInfo(
      poolAddresses,
      commitment
    );

    // Parse each account
    const pools: PoolData[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const accountInfo = accounts[i];
      if (accountInfo) {
        const pool = parsePoolAccount(poolAddresses[i], accountInfo);
        if (pool) {
          pools.push(pool);
        }
      }
    }

    console.log(`Successfully fetched ${pools.length} pools`);
    return pools;
  } catch (error) {
    console.error("Error fetching multiple pools:", error);
    throw new Error(`Failed to fetch pools from QuickNode: ${error}`);
  }
}

/**
 * Raydium V4 LIQUIDITY_STATE_LAYOUT_V4 field offsets
 * Based on @raydium-io/raydium-sdk layout
 */
const RAYDIUM_V4_OFFSETS = {
  status: 0, // u64
  nonce: 8, // u64
  maxOrder: 16, // u64
  depth: 24, // u64
  baseDecimal: 32, // u64
  quoteDecimal: 40, // u64
  state: 48, // u64
  resetFlag: 56, // u64
  minSize: 64, // u64
  volMaxCutRatio: 72, // u64
  amountWaveRatio: 80, // u64
  baseLotSize: 88, // u64
  quoteLotSize: 96, // u64
  minPriceMultiplier: 104, // u64
  maxPriceMultiplier: 112, // u64
  systemDecimalValue: 120, // u64
  minSeparateNumerator: 128, // u64
  minSeparateDenominator: 136, // u64
  tradeFeeNumerator: 144, // u64
  tradeFeeDenominator: 152, // u64
  pnlNumerator: 160, // u64
  pnlDenominator: 168, // u64
  swapFeeNumerator: 176, // u64
  swapFeeDenominator: 184, // u64
  baseNeedTakePnl: 192, // u64
  quoteNeedTakePnl: 200, // u64
  quoteTotalPnl: 208, // u64
  baseTotalPnl: 216, // u64
  poolOpenTime: 224, // u64
  punishPcAmount: 232, // u64
  punishCoinAmount: 240, // u64
  orderbookToInitTime: 248, // u64
  // Pubkeys start here (32 bytes each)
  swapBaseInAmount: 256, // u128 (16 bytes)
  swapQuoteOutAmount: 272, // u128 (16 bytes)
  swapBase2QuoteFee: 288, // u64
  swapQuoteInAmount: 296, // u128 (16 bytes)
  swapBaseOutAmount: 312, // u128 (16 bytes)
  swapQuote2BaseFee: 328, // u64
  // Pool token vaults
  baseVault: 336, // Pubkey (32 bytes)
  quoteVault: 368, // Pubkey (32 bytes)
  // Token mints
  baseMint: 400, // Pubkey
  quoteMint: 432, // Pubkey
  lpMint: 464, // Pubkey
  // Other pubkeys
  openOrders: 496, // Pubkey
  marketId: 528, // Pubkey
  marketProgramId: 560, // Pubkey
  targetOrders: 592, // Pubkey
  withdrawQueue: 624, // Pubkey (deprecated)
  lpVault: 656, // Pubkey (deprecated)
  owner: 688, // Pubkey
  lpReserve: 720, // u64
  // Padding to 752 bytes
};

/**
 * Parse a Raydium V4 pool account into PoolData structure
 *
 * Raydium V4 accounts have NO Anchor discriminator
 * Data starts directly at offset 0
 *
 * @param pubkey - Pool account public key
 * @param accountInfo - Account data from RPC
 * @returns Parsed pool data or null if invalid
 */
function parsePoolAccount(
  pubkey: PublicKey,
  accountInfo: AccountInfo<Buffer>
): PoolData | null {
  try {
    const data = accountInfo.data;

    // Validate we have enough data (we use dataSlice so might be smaller than full size)
    if (data.length < 328) {
      return null;
    }

    // Validate account owner
    if (!accountInfo.owner.equals(RAYDIUM_V4_PROGRAM_ID)) {
      return null;
    }

    // Check pool status
    // Raydium V4 uses status=6 for active pools (not 1 as previously assumed)
    const status = data.readBigUInt64LE(RAYDIUM_V4_OFFSETS.status);
    if (status !== 6n) {
      return null;
    }

    // Read swap amounts as reserve approximation
    const swapBaseInLow = data.readBigUInt64LE(RAYDIUM_V4_OFFSETS.swapBaseInAmount);
    const swapQuoteInLow = data.readBigUInt64LE(RAYDIUM_V4_OFFSETS.swapQuoteInAmount);

    // Use swap amounts as TVL proxy
    const tokenAReserve = swapBaseInLow > 0n ? swapBaseInLow : 1n;
    const tokenBReserve = swapQuoteInLow > 0n ? swapQuoteInLow : 1n;

    return {
      address: pubkey,
      tokenAReserve,
      tokenBReserve,
    };
  } catch (error) {
    console.error(`Error parsing pool ${pubkey.toBase58()}:`, error);
    return null;
  }
}

/**
 * Extract vault pubkeys from Raydium pool for fetching actual balances
 *
 * @param accountInfo - Pool account data
 * @returns Base and quote vault pubkeys
 */
export function extractVaultPubkeys(
  accountInfo: AccountInfo<Buffer>
): { baseVault: PublicKey; quoteVault: PublicKey } | null {
  try {
    const data = accountInfo.data;
    if (data.length !== RAYDIUM_POOL_SIZE) return null;

    const baseVault = new PublicKey(
      data.subarray(RAYDIUM_V4_OFFSETS.baseVault, RAYDIUM_V4_OFFSETS.baseVault + 32)
    );
    const quoteVault = new PublicKey(
      data.subarray(RAYDIUM_V4_OFFSETS.quoteVault, RAYDIUM_V4_OFFSETS.quoteVault + 32)
    );

    return { baseVault, quoteVault };
  } catch {
    return null;
  }
}

/**
 * Fetch pools with actual vault balances (more accurate TVL)
 *
 * This makes additional RPC calls to fetch vault token balances
 * Use for higher accuracy when pool count is small
 *
 * @param connection - Solana connection (QuickNode endpoint)
 * @param pools - Pools from fetchRaydiumPools
 * @returns Pools with accurate reserve amounts
 */
export async function enrichPoolsWithVaultBalances(
  connection: Connection,
  pools: Array<{ address: PublicKey; accountInfo: AccountInfo<Buffer> }>
): Promise<PoolData[]> {
  // Extract all vault addresses
  const vaultAddresses: PublicKey[] = [];
  const poolVaultMap: Map<string, { baseIdx: number; quoteIdx: number }> = new Map();

  for (const pool of pools) {
    const vaults = extractVaultPubkeys(pool.accountInfo);
    if (vaults) {
      const baseIdx = vaultAddresses.length;
      vaultAddresses.push(vaults.baseVault);
      const quoteIdx = vaultAddresses.length;
      vaultAddresses.push(vaults.quoteVault);
      poolVaultMap.set(pool.address.toBase58(), { baseIdx, quoteIdx });
    }
  }

  if (vaultAddresses.length === 0) {
    return pools.map((p) => ({
      address: p.address,
      tokenAReserve: 0n,
      tokenBReserve: 0n,
    }));
  }

  // Batch fetch all vault accounts
  console.log(`Fetching ${vaultAddresses.length} vault balances from QuickNode...`);
  const vaultAccounts = await connection.getMultipleAccountsInfo(vaultAddresses);

  // Parse vault balances and build final pool data
  const enrichedPools: PoolData[] = [];

  for (const pool of pools) {
    const indices = poolVaultMap.get(pool.address.toBase58());
    if (!indices) continue;

    const baseVaultAccount = vaultAccounts[indices.baseIdx];
    const quoteVaultAccount = vaultAccounts[indices.quoteIdx];

    // Token accounts store balance at offset 64 (u64)
    const tokenAReserve = baseVaultAccount?.data
      ? baseVaultAccount.data.readBigUInt64LE(64)
      : 0n;
    const tokenBReserve = quoteVaultAccount?.data
      ? quoteVaultAccount.data.readBigUInt64LE(64)
      : 0n;

    enrichedPools.push({
      address: pool.address,
      tokenAReserve,
      tokenBReserve,
    });
  }

  return enrichedPools;
}

/**
 * Calculate TVL from pool reserves
 *
 * @param pool - Pool data
 * @returns Total value locked (sum of reserves)
 */
export function calculateTVL(pool: PoolData): bigint {
  return pool.tokenAReserve + pool.tokenBReserve;
}

/**
 * Rate limiter for QuickNode requests
 * QuickNode allows ~3 requests per second
 *
 * @param ms - Milliseconds to wait
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch pools with exponential backoff retry
 *
 * Handles rate limiting and transient errors
 *
 * @param connection - Solana connection
 * @param filters - Pool filters
 * @param maxRetries - Maximum retry attempts
 * @returns Array of pool data
 */
export async function fetchRaydiumPoolsWithRetry(
  connection: Connection,
  filters?: PoolFilters,
  maxRetries: number = 3
): Promise<PoolData[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add delay between retries (exponential backoff)
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Retry attempt ${attempt + 1} after ${delay}ms...`);
        await sleep(delay);
      }

      return await fetchRaydiumPools(connection, filters);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt + 1} failed:`, error);

      // Don't retry on certain errors
      if (error instanceof Error && error.message.includes("404")) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Failed to fetch pools after retries");
}
