import type { Predicate, PredicateV1, PredicateV2, Filter, EncryptedPredicate, QueryResult } from "./types";
import { FilterType, FilterOp } from "./types";
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
/**
 * Create a simple TVL range predicate (V1 style, but returns V2)
 *
 * @param minTvl - Minimum TVL in lamports
 * @param maxTvl - Maximum TVL in lamports
 * @returns V2 predicate with two TVL filters
 */
export declare function createTvlPredicate(minTvl: bigint, maxTvl: bigint): PredicateV2;
/**
 * Create a V2 predicate from an array of filters
 *
 * @param filters - Array of filters (max 4)
 * @returns V2 predicate
 */
export declare function createPredicate(filters: Filter[]): PredicateV2;
/**
 * Create a single filter
 *
 * @param type - Filter type (TVL, RESERVE_A, etc.)
 * @param op - Comparison operation (GTE, LTE, EQ, NEQ)
 * @param value - Value to compare against
 * @returns Filter object
 */
export declare function createFilter(type: FilterType, op: FilterOp, value: bigint): Filter;
/**
 * Convert legacy V1 predicate to V2 format
 *
 * @param predicate - V1 predicate with minTvl/maxTvl
 * @returns Equivalent V2 predicate
 */
export declare function convertV1ToV2(predicate: PredicateV1): PredicateV2;
export { FilterType, FilterOp } from "./types";
/**
 * Fluent builder for creating V2 predicates
 *
 * @example
 * ```typescript
 * const predicate = new PredicateBuilder()
 *   .tvlBetween(1_000_000n, 10_000_000n)
 *   .minReserveRatio(40)
 *   .build();
 * ```
 */
export declare class PredicateBuilder {
    private filters;
    /**
     * Add TVL range filter (min <= TVL <= max)
     */
    tvlBetween(min: bigint, max: bigint): this;
    /**
     * Add minimum TVL filter (TVL >= min)
     */
    minTvl(min: bigint): this;
    /**
     * Add maximum TVL filter (TVL <= max)
     */
    maxTvl(max: bigint): this;
    /**
     * Add balance range filter (min <= balance <= max)
     * For token account queries where balance is stored in tokenAReserve
     */
    balanceBetween(min: bigint, max: bigint): this;
    /**
     * Add minimum balance filter
     */
    minBalance(min: bigint): this;
    /**
     * Add reserve ratio filter (ratio >= percent)
     * Ratio is (reserveA / (reserveA + reserveB)) * 10000 in basis points
     * @param percent - Minimum ratio percentage (0-100)
     */
    minReserveRatio(percent: number): this;
    /**
     * Add reserve ratio filter (ratio <= percent)
     * @param percent - Maximum ratio percentage (0-100)
     */
    maxReserveRatio(percent: number): this;
    /**
     * Add reserve A filter
     */
    minReserveA(min: bigint): this;
    /**
     * Add reserve B filter
     */
    minReserveB(min: bigint): this;
    /**
     * Add a custom filter
     */
    addFilter(type: FilterType, op: FilterOp, value: bigint): this;
    /**
     * Build the V2 predicate
     * @throws Error if more than 4 filters
     */
    build(): PredicateV2;
}
//# sourceMappingURL=encryption.d.ts.map