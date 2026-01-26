/**
 * TEE Encryption Module - AES-256-GCM
 *
 * Provides encryption/decryption for MagicBlock TEE-based queries.
 * Uses Web Crypto API for AES-256-GCM + X25519 key exchange.
 */
import { PublicKey } from "@solana/web3.js";
import type { Predicate, EncryptedPredicate, QueryResult } from "./types";

// AES-GCM constants
const AES_KEY_SIZE = 32; // 256 bits
const AES_NONCE_SIZE = 12; // 96 bits (standard for GCM)
const AES_TAG_SIZE = 16; // 128 bits

/**
 * Encrypt a predicate for TEE evaluation using AES-256-GCM
 *
 * Uses X25519 ECDH for key exchange, derives AES key via HKDF
 *
 * @param predicate - User's search criteria (min_tvl, max_tvl)
 * @param teePublicKey - TEE's X25519 public key (32 bytes)
 * @returns Encrypted predicate with ephemeral public key and nonce
 */
export async function encryptPredicate(
  predicate: Predicate,
  teePublicKey: Uint8Array
): Promise<EncryptedPredicate> {
  // Generate ephemeral X25519 keypair
  // Note: TypeScript doesn't know X25519 returns CryptoKeyPair, so cast to any
  const keyPair: any = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"]
  );

  // Export public key
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKey = new Uint8Array(publicKeyRaw);

  // Import TEE's public key
  const teeKey = await crypto.subtle.importKey(
    "raw",
    teePublicKey,
    { name: "X25519" },
    false,
    []
  );

  // Derive shared secret via ECDH
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: teeKey },
    keyPair.privateKey,
    256
  );

  // Derive AES key from shared secret using HKDF
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
      salt: new Uint8Array(32), // Zero salt for simplicity
      info: new TextEncoder().encode("priven-tee-v1"),
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Generate random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(AES_NONCE_SIZE));

  // Serialize predicate: [min_tvl: u64, max_tvl: u64] = 16 bytes
  const plaintext = serializePredicate(predicate);

  // Encrypt with AES-256-GCM
  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    plaintext
  );

  // Format: [ciphertext: 16 bytes] [nonce: 12 bytes] [tag: 16 bytes]
  // Note: WebCrypto returns ciphertext+tag concatenated
  const ciphertext = new Uint8Array(44); // 16 + 12 + 16
  const encrypted = new Uint8Array(ciphertextWithTag);

  // Split ciphertext and tag (WebCrypto appends tag to ciphertext)
  ciphertext.set(encrypted.slice(0, 16), 0); // ciphertext
  ciphertext.set(nonce, 16); // nonce
  ciphertext.set(encrypted.slice(16), 28); // tag

  const privateKey = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
  );

  return {
    ciphertext,
    publicKey,
    privateKey,
  };
}

/**
 * Decrypt query results from TEE using AES-256-GCM
 *
 * @param encryptedResult - Raw encrypted result from QueryResult account
 * @param privateKey - User's ephemeral X25519 private key (PKCS8 format)
 * @param teePublicKey - TEE's X25519 public key used for encryption
 * @returns Decrypted query results with matching pool addresses
 */
export async function decryptResult(
  encryptedResult: Uint8Array,
  privateKey: Uint8Array,
  teePublicKey: Uint8Array
): Promise<QueryResult> {
  // Parse encrypted result structure:
  // [match_count: 1] [addresses: 32*5] [nonce: 12] [tag: 16]
  // Total: 189 bytes max

  if (encryptedResult.length < 29) {
    // Minimum: 1 + 0 + 12 + 16
    throw new Error(
      `Invalid encrypted result: too short (${encryptedResult.length} bytes)`
    );
  }

  // Find where nonce starts (end - 28: 12 nonce + 16 tag)
  const dataLen = encryptedResult.length - 28;
  const ciphertextData = encryptedResult.slice(0, dataLen);
  const nonce = encryptedResult.slice(dataLen, dataLen + 12);
  const tag = encryptedResult.slice(dataLen + 12);

  // Import private key
  const userPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKey,
    { name: "X25519" },
    false,
    ["deriveBits"]
  );

  // Import TEE public key
  const teeKey = await crypto.subtle.importKey(
    "raw",
    teePublicKey,
    { name: "X25519" },
    false,
    []
  );

  // Derive shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: teeKey },
    userPrivateKey,
    256
  );

  // Derive AES key
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
      info: new TextEncoder().encode("priven-tee-v1"),
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // Reconstruct ciphertext+tag for WebCrypto (it expects them concatenated)
  const ciphertextWithTag = new Uint8Array(ciphertextData.length + 16);
  ciphertextWithTag.set(ciphertextData, 0);
  ciphertextWithTag.set(tag, ciphertextData.length);

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    ciphertextWithTag
  );

  return parseQueryResult(new Uint8Array(plaintext));
}

/**
 * Serialize predicate to bytes for AES encryption
 *
 * Format: [min_tvl: u64 LE] [max_tvl: u64 LE] = 16 bytes
 */
function serializePredicate(predicate: Predicate): Uint8Array {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);

  // Write as little-endian u64
  view.setBigUint64(0, predicate.minTvl, true);
  view.setBigUint64(8, predicate.maxTvl, true);

  return new Uint8Array(buffer);
}

/**
 * Parse decrypted QueryResult from bytes
 *
 * Format: [match_count: u8] [addresses: 32 * match_count]
 */
function parseQueryResult(plaintext: Uint8Array): QueryResult {
  const matches: PublicKey[] = [];

  if (plaintext.length < 1) {
    return { matches, matchCount: 0 };
  }

  const matchCount = plaintext[0];
  const MAX_MATCHES = 5;

  for (let i = 0; i < matchCount && i < MAX_MATCHES; i++) {
    const offset = 1 + i * 32;
    if (offset + 32 <= plaintext.length) {
      const addressBytes = plaintext.slice(offset, offset + 32);

      // Skip zero addresses (padding)
      if (!isZeroAddress(addressBytes)) {
        matches.push(new PublicKey(addressBytes));
      }
    }
  }

  return {
    matches,
    matchCount,
  };
}

/**
 * Check if address is all zeros (padding)
 */
function isZeroAddress(address: Uint8Array): boolean {
  return address.every((byte) => byte === 0);
}

/**
 * Generate a random X25519 keypair for TEE communication
 */
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
