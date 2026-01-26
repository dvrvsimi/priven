import type { Predicate, EncryptedPredicate, QueryResult } from "./types";
/**
 * Encrypt a predicate for TEE evaluation using AES-256-GCM
 *
 * Uses X25519 ECDH for key exchange, derives AES key via HKDF
 *
 * @param predicate - User's search criteria (min_tvl, max_tvl)
 * @param teePublicKey - TEE's X25519 public key (32 bytes)
 * @returns Encrypted predicate with ephemeral public key and nonce
 */
export declare function encryptPredicate(predicate: Predicate, teePublicKey: Uint8Array): Promise<EncryptedPredicate>;
/**
 * Decrypt query results from TEE using AES-256-GCM
 *
 * @param encryptedResult - Raw encrypted result from QueryResult account
 * @param privateKey - User's ephemeral X25519 private key (PKCS8 format)
 * @param teePublicKey - TEE's X25519 public key used for encryption
 * @returns Decrypted query results with matching pool addresses
 */
export declare function decryptResult(encryptedResult: Uint8Array, privateKey: Uint8Array, teePublicKey: Uint8Array): Promise<QueryResult>;
/**
 * Generate a random X25519 keypair for TEE communication
 */
export declare function generateKeyPair(): Promise<{
    publicKey: Uint8Array;
    privateKey: Uint8Array;
}>;
//# sourceMappingURL=encryption.d.ts.map