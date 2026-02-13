/**
 * TEE Encryption Module - AES-256-GCM
 *
 * Provides encryption/decryption for MagicBlock TEE-based queries.
 * Uses Web Crypto API for AES-256-GCM + X25519 key exchange.
 */
import { PublicKey } from "@solana/web3.js";
import type {
  Predicate,
  Filter,
  EncryptedPredicate,
  QueryResult,
} from "./types";
import {
  QueryType,
  FilterType,
  FilterOp,
  ENCRYPTED_PREDICATE_SIZE,
  MAX_FILTERS,
} from "./types";

const AES_NONCE_SIZE = 12;
const AES_TAG_SIZE = 16;
const FILTER_SIZE = 11;

/**
 * Encrypt a predicate for TEE evaluation using AES-256-GCM
 */
export async function encryptPredicate(
  predicate: Predicate,
  teePublicKey: Uint8Array
): Promise<EncryptedPredicate> {
  const keyPair: any = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"]
  );

  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKey = new Uint8Array(publicKeyRaw);

  const teeKey = await crypto.subtle.importKey(
    "raw",
    teePublicKey,
    { name: "X25519" },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: teeKey },
    keyPair.privateKey,
    256
  );

  const sharedSecret = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("priven-v2"),
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const nonce = crypto.getRandomValues(new Uint8Array(AES_NONCE_SIZE));
  const plaintext = serializePredicate(predicate);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    plaintext
  );

  const encrypted = new Uint8Array(ciphertextWithTag);
  const ctLen = encrypted.length - AES_TAG_SIZE;

  const ciphertext = new Uint8Array(ENCRYPTED_PREDICATE_SIZE);
  ciphertext.set(encrypted.slice(0, ctLen), 0);
  ciphertext.set(nonce, ctLen);
  ciphertext.set(encrypted.slice(ctLen), ctLen + AES_NONCE_SIZE);

  const privateKey = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
  );

  return { ciphertext, publicKey, privateKey };
}

/**
 * Decrypt query results from TEE
 */
export async function decryptResult(
  encryptedResult: Uint8Array,
  privateKey: Uint8Array,
  teePublicKey: Uint8Array
): Promise<QueryResult> {
  if (encryptedResult.length < 29) {
    throw new Error(`Invalid encrypted result: too short`);
  }

  const dataLen = encryptedResult.length - 28;
  const ciphertextData = encryptedResult.slice(0, dataLen);
  const nonce = encryptedResult.slice(dataLen, dataLen + 12);
  const tag = encryptedResult.slice(dataLen + 12);

  const userPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKey,
    { name: "X25519" },
    false,
    ["deriveBits"]
  );

  const teeKey = await crypto.subtle.importKey(
    "raw",
    teePublicKey,
    { name: "X25519" },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: teeKey },
    userPrivateKey,
    256
  );

  const sharedSecret = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("priven-v2"),
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const ciphertextWithTag = new Uint8Array(ciphertextData.length + 16);
  ciphertextWithTag.set(ciphertextData, 0);
  ciphertextWithTag.set(tag, ciphertextData.length);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    ciphertextWithTag
  );

  return parseQueryResult(new Uint8Array(plaintext));
}

/**
 * Serialize predicate to bytes
 * Format: [query_type: u8][filter_count: u8][filters: Filter[]]
 * Each filter: [type: u8][op: u8][reserved: u8][value: u64 LE] = 11 bytes
 * Total: 1 + 1 + (4 * 11) = 46 bytes, padded to 52 bytes
 */
function serializePredicate(predicate: Predicate): Uint8Array {
  if (predicate.filters.length > MAX_FILTERS) {
    throw new Error(`Too many filters: ${predicate.filters.length} (max ${MAX_FILTERS})`);
  }

  const PLAINTEXT_SIZE = 52;
  const buffer = new ArrayBuffer(PLAINTEXT_SIZE);
  const view = new DataView(buffer);

  // Byte 0: query type (default to CPMM_POOLS for backward compatibility)
  view.setUint8(0, predicate.queryType ?? QueryType.CPMM_POOLS);
  // Byte 1: filter count
  view.setUint8(1, predicate.filters.length);

  // Filters start at offset 2
  for (let i = 0; i < predicate.filters.length; i++) {
    const filter = predicate.filters[i];
    const offset = 2 + i * FILTER_SIZE;

    view.setUint8(offset, filter.type);
    view.setUint8(offset + 1, filter.op);
    view.setUint8(offset + 2, 0);
    view.setBigUint64(offset + 3, filter.value, true);
  }

  return new Uint8Array(buffer);
}

function parseQueryResult(plaintext: Uint8Array): QueryResult {
  const matches: PublicKey[] = [];

  if (plaintext.length < 1) {
    return { matches, matchCount: 0 };
  }

  const matchCount = plaintext[0];
  const MAX_MATCHES = 20;

  for (let i = 0; i < matchCount && i < MAX_MATCHES; i++) {
    const offset = 1 + i * 32;
    if (offset + 32 <= plaintext.length) {
      const addressBytes = plaintext.slice(offset, offset + 32);
      if (!addressBytes.every((b) => b === 0)) {
        matches.push(new PublicKey(addressBytes));
      }
    }
  }

  return { matches, matchCount };
}

export async function generateKeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  const keyPair: any = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"]
  );

  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );
  const privateKey = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
  );

  return { publicKey, privateKey };
}

export function createPredicate(filters: Filter[], queryType?: QueryType): Predicate {
  if (filters.length > MAX_FILTERS) {
    throw new Error(`Too many filters: ${filters.length} (max ${MAX_FILTERS})`);
  }
  return { queryType: queryType ?? QueryType.CPMM_POOLS, filters };
}

export function createFilter(type: FilterType, op: FilterOp, value: bigint): Filter {
  return { type, op, value };
}

export class PredicateBuilder {
  private filters: Filter[] = [];
  private queryType: QueryType = QueryType.CPMM_POOLS;

  // ============================================================================
  // CPMM Pool Methods
  // ============================================================================

  tvlBetween(min: bigint, max: bigint): this {
    this.queryType = QueryType.CPMM_POOLS;
    this.filters.push({ type: FilterType.TVL, op: FilterOp.GTE, value: min });
    this.filters.push({ type: FilterType.TVL, op: FilterOp.LTE, value: max });
    return this;
  }

  minTvl(min: bigint): this {
    this.queryType = QueryType.CPMM_POOLS;
    this.filters.push({ type: FilterType.TVL, op: FilterOp.GTE, value: min });
    return this;
  }

  maxTvl(max: bigint): this {
    this.queryType = QueryType.CPMM_POOLS;
    this.filters.push({ type: FilterType.TVL, op: FilterOp.LTE, value: max });
    return this;
  }

  minReserve0(min: bigint): this {
    this.queryType = QueryType.CPMM_POOLS;
    this.filters.push({ type: FilterType.RESERVE_0, op: FilterOp.GTE, value: min });
    return this;
  }

  minReserve1(min: bigint): this {
    this.queryType = QueryType.CPMM_POOLS;
    this.filters.push({ type: FilterType.RESERVE_1, op: FilterOp.GTE, value: min });
    return this;
  }

  // ============================================================================
  // Token Balance Methods
  // ============================================================================

  tokenBalance(tokenMintValue: bigint): this {
    this.queryType = QueryType.TOKEN_BALANCE;
    this.filters.push({ type: FilterType.TOKEN_MINT, op: FilterOp.EQ, value: tokenMintValue });
    return this;
  }

  minBalance(min: bigint): this {
    this.filters.push({ type: FilterType.MIN_BALANCE, op: FilterOp.GTE, value: min });
    return this;
  }

  maxBalance(max: bigint): this {
    this.filters.push({ type: FilterType.MAX_BALANCE, op: FilterOp.LTE, value: max });
    return this;
  }

  // ============================================================================
  // Token Ownership Methods
  // ============================================================================

  tokenOwnership(tokenMintValue: bigint): this {
    this.queryType = QueryType.TOKEN_OWNERSHIP;
    this.filters.push({ type: FilterType.TOKEN_MINT, op: FilterOp.EQ, value: tokenMintValue });
    return this;
  }

  // ============================================================================
  // Transaction Lookup Methods
  // ============================================================================

  walletTransactions(walletValue: bigint): this {
    this.queryType = QueryType.TX_LOOKUP;
    this.filters.push({ type: FilterType.WALLET_ADDRESS, op: FilterOp.EQ, value: walletValue });
    return this;
  }

  withProgram(programValue: bigint): this {
    this.filters.push({ type: FilterType.PROGRAM_ID, op: FilterOp.EQ, value: programValue });
    return this;
  }

  afterSlot(slot: bigint): this {
    this.filters.push({ type: FilterType.AFTER_SLOT, op: FilterOp.GTE, value: slot });
    return this;
  }

  beforeSlot(slot: bigint): this {
    this.filters.push({ type: FilterType.BEFORE_SLOT, op: FilterOp.LTE, value: slot });
    return this;
  }

  // ============================================================================
  // Generic Methods
  // ============================================================================

  setQueryType(type: QueryType): this {
    this.queryType = type;
    return this;
  }

  addFilter(type: FilterType, op: FilterOp, value: bigint): this {
    this.filters.push({ type, op, value });
    return this;
  }

  build(): Predicate {
    return createPredicate(this.filters, this.queryType);
  }
}

// ============================================================================
// Query Builder Helpers
// ============================================================================

/**
 * Create a token balance query predicate
 * Finds wallets holding tokens within the specified balance range
 */
export function createTokenBalanceQuery(
  tokenMintBytes: Uint8Array,
  minBalance?: bigint,
  maxBalance?: bigint
): Predicate {
  const filters: Filter[] = [];

  // Token mint as first 8 bytes (truncated for storage in u64)
  const mintValue = bytesToBigInt(tokenMintBytes.slice(0, 8));
  filters.push({ type: FilterType.TOKEN_MINT, op: FilterOp.EQ, value: mintValue });

  if (minBalance !== undefined) {
    filters.push({ type: FilterType.MIN_BALANCE, op: FilterOp.GTE, value: minBalance });
  }
  if (maxBalance !== undefined) {
    filters.push({ type: FilterType.MAX_BALANCE, op: FilterOp.LTE, value: maxBalance });
  }

  return { queryType: QueryType.TOKEN_BALANCE, filters };
}

/**
 * Create a token ownership query predicate
 * Finds all holders of a specific token
 */
export function createTokenOwnershipQuery(
  tokenMintBytes: Uint8Array
): Predicate {
  const mintValue = bytesToBigInt(tokenMintBytes.slice(0, 8));
  return {
    queryType: QueryType.TOKEN_OWNERSHIP,
    filters: [{ type: FilterType.TOKEN_MINT, op: FilterOp.EQ, value: mintValue }],
  };
}

/**
 * Create a transaction lookup query predicate
 * Checks if a wallet has interacted with a program
 */
export function createTxLookupQuery(
  walletBytes: Uint8Array,
  programBytes?: Uint8Array,
  options?: { afterSlot?: bigint; beforeSlot?: bigint }
): Predicate {
  const filters: Filter[] = [];

  const walletValue = bytesToBigInt(walletBytes.slice(0, 8));
  filters.push({ type: FilterType.WALLET_ADDRESS, op: FilterOp.EQ, value: walletValue });

  if (programBytes) {
    const programValue = bytesToBigInt(programBytes.slice(0, 8));
    filters.push({ type: FilterType.PROGRAM_ID, op: FilterOp.EQ, value: programValue });
  }

  if (options?.afterSlot !== undefined) {
    filters.push({ type: FilterType.AFTER_SLOT, op: FilterOp.GTE, value: options.afterSlot });
  }
  if (options?.beforeSlot !== undefined) {
    filters.push({ type: FilterType.BEFORE_SLOT, op: FilterOp.LTE, value: options.beforeSlot });
  }

  return { queryType: QueryType.TX_LOOKUP, filters };
}

/**
 * Convert first 8 bytes to bigint (LE)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < Math.min(8, bytes.length); i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

export { QueryType, FilterType, FilterOp } from "./types";
