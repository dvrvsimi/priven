"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredicateBuilder = exports.FilterOp = exports.FilterType = void 0;
exports.encryptPredicate = encryptPredicate;
exports.decryptResult = decryptResult;
exports.generateKeyPair = generateKeyPair;
exports.createTvlPredicate = createTvlPredicate;
exports.createPredicate = createPredicate;
exports.createFilter = createFilter;
exports.convertV1ToV2 = convertV1ToV2;
/**
 * TEE Encryption Module - AES-256-GCM
 *
 * Provides encryption/decryption for MagicBlock TEE-based queries.
 * Uses Web Crypto API for AES-256-GCM + X25519 key exchange.
 *
 * Supports both V1 (legacy min/max TVL) and V2 (flexible filters) predicates.
 */
const web3_js_1 = require("@solana/web3.js");
const types_1 = require("./types");
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
async function encryptPredicate(predicate, teePublicKey) {
    // Generate ephemeral X25519 keypair
    // Note: TypeScript doesn't know X25519 returns CryptoKeyPair, so cast to any
    const keyPair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    // Export public key
    const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const publicKey = new Uint8Array(publicKeyRaw);
    // Import TEE's public key
    const teeKey = await crypto.subtle.importKey("raw", teePublicKey, { name: "X25519" }, false, []);
    // Derive shared secret via ECDH
    const sharedBits = await crypto.subtle.deriveBits({ name: "X25519", public: teeKey }, keyPair.privateKey, 256);
    // Derive AES key from shared secret using HKDF
    const sharedSecret = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey({
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32), // Zero salt for simplicity
        info: new TextEncoder().encode("priven-v1"),
    }, sharedSecret, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    // Generate random nonce
    const nonce = crypto.getRandomValues(new Uint8Array(AES_NONCE_SIZE));
    // Serialize predicate based on version
    const plaintext = serializePredicate(predicate);
    const isV2 = (0, types_1.isPredicateV2)(predicate);
    // Encrypt with AES-256-GCM
    const ciphertextWithTag = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext);
    // V1 format: [ciphertext: 16 bytes] [nonce: 12 bytes] [tag: 16 bytes] = 44 bytes
    // V2 format: [ciphertext: 52 bytes padded] [nonce: 12 bytes] [tag: 16 bytes] = 80 bytes
    const encrypted = new Uint8Array(ciphertextWithTag);
    const ctLen = encrypted.length - AES_TAG_SIZE; // Subtract tag
    // Calculate output size
    const outputSize = isV2 ? types_1.ENCRYPTED_PREDICATE_SIZE : types_1.ENCRYPTED_PREDICATE_SIZE_V1;
    const ciphertext = new Uint8Array(outputSize);
    // Split ciphertext and tag (WebCrypto appends tag to ciphertext)
    ciphertext.set(encrypted.slice(0, ctLen), 0); // ciphertext
    ciphertext.set(nonce, ctLen); // nonce
    ciphertext.set(encrypted.slice(ctLen), ctLen + AES_NONCE_SIZE); // tag
    const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
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
async function decryptResult(encryptedResult, privateKey, teePublicKey) {
    // Parse encrypted result structure:
    // [match_count: 1] [addresses: 32*5] [nonce: 12] [tag: 16]
    // Total: 189 bytes max
    if (encryptedResult.length < 29) {
        // Minimum: 1 + 0 + 12 + 16
        throw new Error(`Invalid encrypted result: too short (${encryptedResult.length} bytes)`);
    }
    // Find where nonce starts (end - 28: 12 nonce + 16 tag)
    const dataLen = encryptedResult.length - 28;
    const ciphertextData = encryptedResult.slice(0, dataLen);
    const nonce = encryptedResult.slice(dataLen, dataLen + 12);
    const tag = encryptedResult.slice(dataLen + 12);
    // Import private key
    const userPrivateKey = await crypto.subtle.importKey("pkcs8", privateKey, { name: "X25519" }, false, ["deriveBits"]);
    // Import TEE public key
    const teeKey = await crypto.subtle.importKey("raw", teePublicKey, { name: "X25519" }, false, []);
    // Derive shared secret
    const sharedBits = await crypto.subtle.deriveBits({ name: "X25519", public: teeKey }, userPrivateKey, 256);
    // Derive AES key
    const sharedSecret = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey({
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: new TextEncoder().encode("priven-v1"),
    }, sharedSecret, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    // Reconstruct ciphertext+tag for WebCrypto (it expects them concatenated)
    const ciphertextWithTag = new Uint8Array(ciphertextData.length + 16);
    ciphertextWithTag.set(ciphertextData, 0);
    ciphertextWithTag.set(tag, ciphertextData.length);
    // Decrypt
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, ciphertextWithTag);
    return parseQueryResult(new Uint8Array(plaintext));
}
/**
 * Serialize predicate to bytes for AES encryption
 * Detects V1 vs V2 and calls appropriate serializer
 */
function serializePredicate(predicate) {
    if ((0, types_1.isPredicateV2)(predicate)) {
        return serializePredicateV2(predicate);
    }
    return serializePredicateV1(predicate);
}
/**
 * Serialize V1 predicate to bytes
 * Format: [min_tvl: u64 LE] [max_tvl: u64 LE] = 16 bytes
 */
function serializePredicateV1(predicate) {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    // Write as little-endian u64
    view.setBigUint64(0, predicate.minTvl, true);
    view.setBigUint64(8, predicate.maxTvl, true);
    return new Uint8Array(buffer);
}
/**
 * Serialize V2 predicate to bytes
 * Format: [version: u8][filter_count: u8][filters: Filter[]]
 * Each filter: [type: u8][op: u8][field: u8][value: u64 LE] = 11 bytes
 * Total: 2 + (11 * 4) = 46 bytes (padded to 52 bytes for alignment)
 */
function serializePredicateV2(predicate) {
    if (predicate.filters.length > types_1.MAX_FILTERS) {
        throw new Error(`Too many filters: ${predicate.filters.length} (max ${types_1.MAX_FILTERS})`);
    }
    // V2 plaintext: version(1) + count(1) + filters(11*4) = 46 bytes
    // Pad to 52 bytes so encrypted output fits nicely in 80 bytes
    const PLAINTEXT_SIZE = 52;
    const buffer = new ArrayBuffer(PLAINTEXT_SIZE);
    const view = new DataView(buffer);
    // Version byte
    view.setUint8(0, 2);
    // Filter count
    view.setUint8(1, predicate.filters.length);
    // Serialize each filter (11 bytes each)
    for (let i = 0; i < predicate.filters.length; i++) {
        const filter = predicate.filters[i];
        const offset = 2 + i * types_1.FILTER_SIZE;
        view.setUint8(offset, filter.type);
        view.setUint8(offset + 1, filter.op);
        view.setUint8(offset + 2, filter.field ?? 0);
        view.setBigUint64(offset + 3, filter.value, true); // little-endian
    }
    return new Uint8Array(buffer);
}
/**
 * Parse decrypted QueryResult from bytes
 *
 * Format: [match_count: u8] [addresses: 32 * match_count]
 */
function parseQueryResult(plaintext) {
    const matches = [];
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
                matches.push(new web3_js_1.PublicKey(addressBytes));
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
function isZeroAddress(address) {
    return address.every((byte) => byte === 0);
}
/**
 * Generate a random X25519 keypair for TEE communication
 */
async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
    return { publicKey, privateKey };
}
// ============================================================================
// HELPER FUNCTIONS FOR CREATING PREDICATES
// ============================================================================
/**
 * Create a simple TVL range predicate (V1 style, but returns V2)
 *
 * @param minTvl - Minimum TVL in lamports
 * @param maxTvl - Maximum TVL in lamports
 * @returns V2 predicate with two TVL filters
 */
function createTvlPredicate(minTvl, maxTvl) {
    return {
        version: 2,
        filters: [
            { type: types_1.FilterType.TVL, op: types_1.FilterOp.GTE, value: minTvl },
            { type: types_1.FilterType.TVL, op: types_1.FilterOp.LTE, value: maxTvl },
        ],
    };
}
/**
 * Create a V2 predicate from an array of filters
 *
 * @param filters - Array of filters (max 4)
 * @returns V2 predicate
 */
function createPredicate(filters) {
    if (filters.length > types_1.MAX_FILTERS) {
        throw new Error(`Too many filters: ${filters.length} (max ${types_1.MAX_FILTERS})`);
    }
    return {
        version: 2,
        filters,
    };
}
/**
 * Create a single filter
 *
 * @param type - Filter type (TVL, RESERVE_A, etc.)
 * @param op - Comparison operation (GTE, LTE, EQ, NEQ)
 * @param value - Value to compare against
 * @returns Filter object
 */
function createFilter(type, op, value) {
    return { type, op, value };
}
/**
 * Convert legacy V1 predicate to V2 format
 *
 * @param predicate - V1 predicate with minTvl/maxTvl
 * @returns Equivalent V2 predicate
 */
function convertV1ToV2(predicate) {
    return createTvlPredicate(predicate.minTvl, predicate.maxTvl);
}
// Re-export types for convenience
var types_2 = require("./types");
Object.defineProperty(exports, "FilterType", { enumerable: true, get: function () { return types_2.FilterType; } });
Object.defineProperty(exports, "FilterOp", { enumerable: true, get: function () { return types_2.FilterOp; } });
// ============================================================================
// PREDICATE BUILDER (Fluent API)
// ============================================================================
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
class PredicateBuilder {
    constructor() {
        this.filters = [];
    }
    /**
     * Add TVL range filter (min <= TVL <= max)
     */
    tvlBetween(min, max) {
        this.filters.push({ type: types_1.FilterType.TVL, op: types_1.FilterOp.GTE, value: min });
        this.filters.push({ type: types_1.FilterType.TVL, op: types_1.FilterOp.LTE, value: max });
        return this;
    }
    /**
     * Add minimum TVL filter (TVL >= min)
     */
    minTvl(min) {
        this.filters.push({ type: types_1.FilterType.TVL, op: types_1.FilterOp.GTE, value: min });
        return this;
    }
    /**
     * Add maximum TVL filter (TVL <= max)
     */
    maxTvl(max) {
        this.filters.push({ type: types_1.FilterType.TVL, op: types_1.FilterOp.LTE, value: max });
        return this;
    }
    /**
     * Add balance range filter (min <= balance <= max)
     * For token account queries where balance is stored in tokenAReserve
     */
    balanceBetween(min, max) {
        this.filters.push({ type: types_1.FilterType.BALANCE, op: types_1.FilterOp.GTE, value: min });
        this.filters.push({ type: types_1.FilterType.BALANCE, op: types_1.FilterOp.LTE, value: max });
        return this;
    }
    /**
     * Add minimum balance filter
     */
    minBalance(min) {
        this.filters.push({ type: types_1.FilterType.BALANCE, op: types_1.FilterOp.GTE, value: min });
        return this;
    }
    /**
     * Add reserve ratio filter (ratio >= percent)
     * Ratio is (reserveA / (reserveA + reserveB)) * 10000 in basis points
     * @param percent - Minimum ratio percentage (0-100)
     */
    minReserveRatio(percent) {
        const bps = BigInt(Math.floor(percent * 100));
        this.filters.push({ type: types_1.FilterType.RATIO, op: types_1.FilterOp.GTE, value: bps });
        return this;
    }
    /**
     * Add reserve ratio filter (ratio <= percent)
     * @param percent - Maximum ratio percentage (0-100)
     */
    maxReserveRatio(percent) {
        const bps = BigInt(Math.floor(percent * 100));
        this.filters.push({ type: types_1.FilterType.RATIO, op: types_1.FilterOp.LTE, value: bps });
        return this;
    }
    /**
     * Add reserve A filter
     */
    minReserveA(min) {
        this.filters.push({ type: types_1.FilterType.RESERVE_A, op: types_1.FilterOp.GTE, value: min });
        return this;
    }
    /**
     * Add reserve B filter
     */
    minReserveB(min) {
        this.filters.push({ type: types_1.FilterType.RESERVE_B, op: types_1.FilterOp.GTE, value: min });
        return this;
    }
    /**
     * Add a custom filter
     */
    addFilter(type, op, value) {
        this.filters.push({ type, op, value });
        return this;
    }
    /**
     * Build the V2 predicate
     * @throws Error if more than 4 filters
     */
    build() {
        return createPredicate(this.filters);
    }
}
exports.PredicateBuilder = PredicateBuilder;
