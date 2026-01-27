"use strict";
/**
 * Priven SDK - Privacy-Preserving Pool Queries on Solana
 *
 * Query Raydium liquidity pools privately using MagicBlock TEE
 * Powered by QuickNode RPC and MagicBlock's Private Ephemeral Rollups
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Keypair = exports.Connection = exports.PublicKey = exports.KNOWN_MINTS = exports.TOKEN_PROGRAM_ID = exports.toPoolData = exports.fetchTokenAccountsWithRetry = exports.fetchTokenAccountsByOwner = exports.fetchTokenAccounts = exports.RAYDIUM_POOL_SIZE = exports.RAYDIUM_V4_PROGRAM_ID = exports.calculateTVL = exports.getMultiplePools = exports.fetchRaydiumPoolsWithRetry = exports.fetchRaydiumPools = exports.TEE_VALIDATORS = exports.MAGICBLOCK_RPC = exports.MAGIC_PROGRAM_ID = exports.PERMISSION_PROGRAM_ID = exports.DELEGATION_PROGRAM_ID = exports.waitForCommit = exports.isDelegated = exports.isSessionValid = exports.getTeeRpcUrl = exports.createBaseConnection = exports.createTeeConnection = exports.createTeeSession = exports.PredicateBuilder = exports.convertV1ToV2 = exports.createFilter = exports.createPredicate = exports.createTvlPredicate = exports.generateKeyPair = exports.decryptResult = exports.encryptPredicate = exports.FILTER_SIZE = exports.MAX_FILTERS = exports.ENCRYPTED_PREDICATE_SIZE_V1 = exports.ENCRYPTED_PREDICATE_SIZE = exports.isPredicateV2 = exports.isPredicateV1 = exports.FilterOp = exports.FilterType = exports.PRIVEN_TEE_PROGRAM_ID = exports.PRIVEN_PROGRAM_ID = exports.createPrivenClient = exports.PrivenClient = void 0;
// Main client
var client_1 = require("./client");
Object.defineProperty(exports, "PrivenClient", { enumerable: true, get: function () { return client_1.PrivenClient; } });
Object.defineProperty(exports, "createPrivenClient", { enumerable: true, get: function () { return client_1.createPrivenClient; } });
Object.defineProperty(exports, "PRIVEN_PROGRAM_ID", { enumerable: true, get: function () { return client_1.PRIVEN_PROGRAM_ID; } });
Object.defineProperty(exports, "PRIVEN_TEE_PROGRAM_ID", { enumerable: true, get: function () { return client_1.PRIVEN_TEE_PROGRAM_ID; } });
// Type guards and enums
var types_1 = require("./types");
Object.defineProperty(exports, "FilterType", { enumerable: true, get: function () { return types_1.FilterType; } });
Object.defineProperty(exports, "FilterOp", { enumerable: true, get: function () { return types_1.FilterOp; } });
Object.defineProperty(exports, "isPredicateV1", { enumerable: true, get: function () { return types_1.isPredicateV1; } });
Object.defineProperty(exports, "isPredicateV2", { enumerable: true, get: function () { return types_1.isPredicateV2; } });
Object.defineProperty(exports, "ENCRYPTED_PREDICATE_SIZE", { enumerable: true, get: function () { return types_1.ENCRYPTED_PREDICATE_SIZE; } });
Object.defineProperty(exports, "ENCRYPTED_PREDICATE_SIZE_V1", { enumerable: true, get: function () { return types_1.ENCRYPTED_PREDICATE_SIZE_V1; } });
Object.defineProperty(exports, "MAX_FILTERS", { enumerable: true, get: function () { return types_1.MAX_FILTERS; } });
Object.defineProperty(exports, "FILTER_SIZE", { enumerable: true, get: function () { return types_1.FILTER_SIZE; } });
// Encryption utilities
var encryption_1 = require("./encryption");
Object.defineProperty(exports, "encryptPredicate", { enumerable: true, get: function () { return encryption_1.encryptPredicate; } });
Object.defineProperty(exports, "decryptResult", { enumerable: true, get: function () { return encryption_1.decryptResult; } });
Object.defineProperty(exports, "generateKeyPair", { enumerable: true, get: function () { return encryption_1.generateKeyPair; } });
Object.defineProperty(exports, "createTvlPredicate", { enumerable: true, get: function () { return encryption_1.createTvlPredicate; } });
Object.defineProperty(exports, "createPredicate", { enumerable: true, get: function () { return encryption_1.createPredicate; } });
Object.defineProperty(exports, "createFilter", { enumerable: true, get: function () { return encryption_1.createFilter; } });
Object.defineProperty(exports, "convertV1ToV2", { enumerable: true, get: function () { return encryption_1.convertV1ToV2; } });
Object.defineProperty(exports, "PredicateBuilder", { enumerable: true, get: function () { return encryption_1.PredicateBuilder; } });
// TEE utilities
var tee_1 = require("./tee");
Object.defineProperty(exports, "createTeeSession", { enumerable: true, get: function () { return tee_1.createTeeSession; } });
Object.defineProperty(exports, "createTeeConnection", { enumerable: true, get: function () { return tee_1.createTeeConnection; } });
Object.defineProperty(exports, "createBaseConnection", { enumerable: true, get: function () { return tee_1.createBaseConnection; } });
Object.defineProperty(exports, "getTeeRpcUrl", { enumerable: true, get: function () { return tee_1.getTeeRpcUrl; } });
Object.defineProperty(exports, "isSessionValid", { enumerable: true, get: function () { return tee_1.isSessionValid; } });
Object.defineProperty(exports, "isDelegated", { enumerable: true, get: function () { return tee_1.isDelegated; } });
Object.defineProperty(exports, "waitForCommit", { enumerable: true, get: function () { return tee_1.waitForCommit; } });
Object.defineProperty(exports, "DELEGATION_PROGRAM_ID", { enumerable: true, get: function () { return tee_1.DELEGATION_PROGRAM_ID; } });
Object.defineProperty(exports, "PERMISSION_PROGRAM_ID", { enumerable: true, get: function () { return tee_1.PERMISSION_PROGRAM_ID; } });
Object.defineProperty(exports, "MAGIC_PROGRAM_ID", { enumerable: true, get: function () { return tee_1.MAGIC_PROGRAM_ID; } });
Object.defineProperty(exports, "MAGICBLOCK_RPC", { enumerable: true, get: function () { return tee_1.MAGICBLOCK_RPC; } });
Object.defineProperty(exports, "TEE_VALIDATORS", { enumerable: true, get: function () { return tee_1.TEE_VALIDATORS; } });
// Pool fetching (QuickNode integration)
var pools_1 = require("./pools");
Object.defineProperty(exports, "fetchRaydiumPools", { enumerable: true, get: function () { return pools_1.fetchRaydiumPools; } });
Object.defineProperty(exports, "fetchRaydiumPoolsWithRetry", { enumerable: true, get: function () { return pools_1.fetchRaydiumPoolsWithRetry; } });
Object.defineProperty(exports, "getMultiplePools", { enumerable: true, get: function () { return pools_1.getMultiplePools; } });
Object.defineProperty(exports, "calculateTVL", { enumerable: true, get: function () { return pools_1.calculateTVL; } });
Object.defineProperty(exports, "RAYDIUM_V4_PROGRAM_ID", { enumerable: true, get: function () { return pools_1.RAYDIUM_V4_PROGRAM_ID; } });
Object.defineProperty(exports, "RAYDIUM_POOL_SIZE", { enumerable: true, get: function () { return pools_1.RAYDIUM_POOL_SIZE; } });
// Token account fetching (works on devnet)
var tokens_1 = require("./tokens");
Object.defineProperty(exports, "fetchTokenAccounts", { enumerable: true, get: function () { return tokens_1.fetchTokenAccounts; } });
Object.defineProperty(exports, "fetchTokenAccountsByOwner", { enumerable: true, get: function () { return tokens_1.fetchTokenAccountsByOwner; } });
Object.defineProperty(exports, "fetchTokenAccountsWithRetry", { enumerable: true, get: function () { return tokens_1.fetchTokenAccountsWithRetry; } });
Object.defineProperty(exports, "toPoolData", { enumerable: true, get: function () { return tokens_1.toPoolData; } });
Object.defineProperty(exports, "TOKEN_PROGRAM_ID", { enumerable: true, get: function () { return tokens_1.TOKEN_PROGRAM_ID; } });
Object.defineProperty(exports, "KNOWN_MINTS", { enumerable: true, get: function () { return tokens_1.KNOWN_MINTS; } });
// Re-export commonly used Solana types
var web3_js_1 = require("@solana/web3.js");
Object.defineProperty(exports, "PublicKey", { enumerable: true, get: function () { return web3_js_1.PublicKey; } });
Object.defineProperty(exports, "Connection", { enumerable: true, get: function () { return web3_js_1.Connection; } });
Object.defineProperty(exports, "Keypair", { enumerable: true, get: function () { return web3_js_1.Keypair; } });
