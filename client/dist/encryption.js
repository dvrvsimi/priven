import { RescueCipher, x25519 } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
/**
 * Encrypt a predicate for private MPC evaluation
 *
 * Uses x25519 key exchange with MXE + Rescue cipher
 * Result is always exactly 32 bytes (Arcium requirement)
 *
 * @param predicate - User's search criteria (min_tvl, max_tvl)
 * @param mxePublicKey - MXE's x25519 public key (from on-chain)
 * @returns Encrypted predicate with ephemeral public key and nonce
 */
export async function encryptPredicate(predicate, mxePublicKey) {
    // Generate ephemeral x25519 keypair for this query
    const privateKey = x25519.utils.randomPrivateKey();
    const publicKey = x25519.getPublicKey(privateKey);
    // Derive shared secret with MXE
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    // Create Rescue cipher with shared secret
    const cipher = new RescueCipher(sharedSecret);
    // Generate random nonce (u128)
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = bytesToBigInt(nonceBytes);
    // Serialize predicate to field elements
    // Circuit expects: [min_tvl, max_tvl]
    const plaintext = serializePredicate(predicate);
    // Encrypt with Rescue cipher
    // RescueCipher.encrypt expects Uint8Array nonce, returns number[][]
    const ciphertexts = cipher.encrypt(plaintext, nonceBytes);
    // Validate ciphertext is exactly 32 bytes (Arcium requirement)
    if (ciphertexts[0].length !== 32) {
        throw new Error(`Invalid ciphertext length: expected 32 bytes, got ${ciphertexts[0].length}`);
    }
    return {
        ciphertext: new Uint8Array(ciphertexts[0]),
        publicKey,
        nonce,
    };
}
/**
 * Decrypt MPC results
 *
 * @param encryptedResult - Raw encrypted result from QueryResultAccount
 * @param privateKey - User's x25519 private key (ephemeral, from encryption)
 * @returns Decrypted query results with matching pool addresses
 */
export function decryptResult(encryptedResult, privateKey) {
    // Parse encrypted result structure:
    // - encryption_key: [u8; 32]  (MPC's ephemeral key)
    // - nonce: u128 (16 bytes)
    // - ciphertexts: variable length (161 x 32-byte blocks)
    if (encryptedResult.length < 48) {
        throw new Error(`Invalid encrypted result: too short (${encryptedResult.length} bytes)`);
    }
    const encryptionKey = encryptedResult.slice(0, 32);
    const nonceBytes = encryptedResult.slice(32, 48);
    const ciphertextBytes = encryptedResult.slice(48);
    // Derive shared secret with MPC's encryption key
    const sharedSecret = x25519.getSharedSecret(privateKey, encryptionKey);
    const cipher = new RescueCipher(sharedSecret);
    // Decrypt ciphertexts
    // RescueCipher.decrypt expects (ciphertext: number[][], nonce: Uint8Array)
    // Convert ciphertextBytes into array of 32-byte chunks
    const ciphertextChunks = [];
    for (let i = 0; i < ciphertextBytes.length; i += 32) {
        const chunk = Array.from(ciphertextBytes.slice(i, i + 32));
        ciphertextChunks.push(chunk);
    }
    // Try decryption with original nonce
    let plaintext;
    try {
        plaintext = cipher.decrypt(ciphertextChunks, nonceBytes);
    }
    catch (err) {
        // Try with incremented nonce (Arcium convention)
        const incrementedNonce = new Uint8Array(16);
        let carry = 1;
        for (let i = 0; i < 16; i++) {
            const sum = nonceBytes[i] + carry;
            incrementedNonce[i] = sum & 0xFF;
            carry = sum >> 8;
        }
        plaintext = cipher.decrypt(ciphertextChunks, incrementedNonce);
    }
    // Parse QueryResult struct:
    // - matches: [[u8; 32]; 5] = 160 bytes (5 pool addresses)
    // - match_count: u8 = 1 byte
    // Total: 161 bytes
    return parseQueryResult(plaintext);
}
/**
 * Serialize predicate to field elements for Rescue encryption
 *
 * Circuit expects: [min_tvl (u64), max_tvl (u64)]
 */
function serializePredicate(predicate) {
    return [predicate.minTvl, predicate.maxTvl];
}
/**
 * Parse decrypted QueryResult from field elements
 *
 * Structure:
 * - matches: [[u8; 32]; 5] - 5 pool addresses (32 bytes each)
 * - match_count: u8 - Number of actual matches
 */
function parseQueryResult(plaintext) {
    const matches = [];
    const MAX_MATCHES = 5;
    // Each address is 32 bytes = 4 field elements (assuming u64 field elements)
    // But Rescue works with field elements, need to convert back to bytes
    // Extract match_count (last element)
    const matchCount = Number(plaintext[plaintext.length - 1] & 0xffn);
    // Parse pool addresses from plaintext
    // The circuit returns: matches (5 x 32 bytes) + match_count (1 byte)
    // We need to reconstruct the 32-byte addresses from field elements
    for (let i = 0; i < matchCount && i < MAX_MATCHES; i++) {
        // Each address is 32 bytes
        // Extract bytes from field elements
        const addressBytes = new Uint8Array(32);
        const startIdx = i * 4; // Assuming 4 field elements per address (8 bytes each)
        for (let j = 0; j < 4; j++) {
            const fieldElement = plaintext[startIdx + j];
            const bytes = bigIntToBytes(fieldElement, 8);
            addressBytes.set(bytes, j * 8);
        }
        // Skip zero addresses (padding)
        if (!isZeroAddress(addressBytes)) {
            matches.push(new PublicKey(addressBytes));
        }
    }
    return {
        matches,
        matchCount,
    };
}
/**
 * Convert bytes to BigInt (little-endian)
 */
function bytesToBigInt(bytes) {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
        result += BigInt(bytes[i]) << BigInt(i * 8);
    }
    return result;
}
/**
 * Convert BigInt to bytes (little-endian)
 */
function bigIntToBytes(value, length) {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = Number((value >> BigInt(i * 8)) & 0xffn);
    }
    return bytes;
}
/**
 * Check if address is all zeros (padding)
 */
function isZeroAddress(address) {
    return address.every((byte) => byte === 0);
}
