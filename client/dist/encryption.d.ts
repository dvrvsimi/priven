import type { Predicate, EncryptedPredicate, QueryResult } from "./types";
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
export declare function encryptPredicate(predicate: Predicate, mxePublicKey: Uint8Array): Promise<EncryptedPredicate>;
/**
 * Decrypt MPC results
 *
 * @param encryptedResult - Raw encrypted result from QueryResultAccount
 * @param privateKey - User's x25519 private key (ephemeral, from encryption)
 * @returns Decrypted query results with matching pool addresses
 */
export declare function decryptResult(encryptedResult: Uint8Array, privateKey: Uint8Array): QueryResult;
//# sourceMappingURL=encryption.d.ts.map