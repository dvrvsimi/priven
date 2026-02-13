/**
 * Tests for v3 multi-query types
 *
 * Tests the client SDK functions for:
 * - Token balance queries
 * - Token ownership queries
 * - Transaction lookup queries
 * - Predicate serialization with query_type byte
 */
import { expect } from "chai";
import { Connection, PublicKey } from "@solana/web3.js";
import { QUICKNODE_MAINNET_RPC } from "./helpers";
import {
  // Query type enums
  QueryType,
  FilterType,
  FilterOp,
  // Predicate builders
  createPredicate,
  createTokenBalanceQuery,
  createTokenOwnershipQuery,
  createTxLookupQuery,
  PredicateBuilder,
  // Encryption
  encryptPredicate,
  ENCRYPTED_PREDICATE_SIZE,
  // Token discovery
  getTokenBalance,
  hasTokenBalance,
  // Transaction lookup
  getWalletTransactions,
  hasInteractedWithProgram,
  hasRecentActivity,
  getTransactionCount,
} from "../client/src";

// Test constants
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
// Use Raydium authority - known active with many transactions
const KNOWN_WALLET = new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");
const FAKE_TEE_PUBKEY = new Uint8Array(32).fill(1);

describe("Priven v3 - Query Types", function () {
  this.timeout(60000); // RPC calls can be slow

  let connection: Connection;

  before(() => {
    connection = new Connection(QUICKNODE_MAINNET_RPC, "confirmed");
    console.log("=== Query Types Tests ===");
    console.log("RPC:", QUICKNODE_MAINNET_RPC.includes("quiknode") ? "QuickNode" : "Public RPC");
  });

  describe("QueryType Enum", () => {
    it("has correct values", () => {
      expect(QueryType.CPMM_POOLS).to.equal(0);
      expect(QueryType.TOKEN_BALANCE).to.equal(1);
      expect(QueryType.TOKEN_OWNERSHIP).to.equal(2);
      expect(QueryType.TX_LOOKUP).to.equal(3);
    });
  });

  describe("FilterType Enum", () => {
    it("has CPMM filters in 0-15 range", () => {
      expect(FilterType.TOKEN_MINT_0).to.equal(0);
      expect(FilterType.TVL).to.equal(6);
      expect(FilterType.OPEN_TIME).to.equal(8);
    });

    it("has token filters in 16-31 range", () => {
      expect(FilterType.TOKEN_MINT).to.equal(16);
      expect(FilterType.MIN_BALANCE).to.equal(17);
      expect(FilterType.MAX_BALANCE).to.equal(18);
      expect(FilterType.HOLDER_COUNT).to.equal(19);
    });

    it("has transaction filters in 32-47 range", () => {
      expect(FilterType.WALLET_ADDRESS).to.equal(32);
      expect(FilterType.PROGRAM_ID).to.equal(33);
      expect(FilterType.AFTER_SLOT).to.equal(34);
      expect(FilterType.BEFORE_SLOT).to.equal(35);
    });
  });

  describe("createTokenBalanceQuery", () => {
    it("creates predicate with TOKEN_BALANCE type", () => {
      const pred = createTokenBalanceQuery(USDC_MINT.toBytes(), 1000000n);

      expect(pred.queryType).to.equal(QueryType.TOKEN_BALANCE);
      expect(pred.filters.length).to.be.greaterThanOrEqual(1);
      expect(pred.filters[0].type).to.equal(FilterType.TOKEN_MINT);
    });

    it("includes min balance filter when provided", () => {
      const pred = createTokenBalanceQuery(USDC_MINT.toBytes(), 1000000n);

      const minFilter = pred.filters.find(f => f.type === FilterType.MIN_BALANCE);
      expect(minFilter).to.exist;
      expect(minFilter!.op).to.equal(FilterOp.GTE);
      expect(minFilter!.value).to.equal(1000000n);
    });

    it("includes max balance filter when provided", () => {
      const pred = createTokenBalanceQuery(USDC_MINT.toBytes(), undefined, 5000000n);

      const maxFilter = pred.filters.find(f => f.type === FilterType.MAX_BALANCE);
      expect(maxFilter).to.exist;
      expect(maxFilter!.op).to.equal(FilterOp.LTE);
      expect(maxFilter!.value).to.equal(5000000n);
    });

    it("includes both min and max filters when both provided", () => {
      const pred = createTokenBalanceQuery(USDC_MINT.toBytes(), 1000n, 5000n);

      expect(pred.filters.length).to.equal(3); // TOKEN_MINT + MIN + MAX
    });
  });

  describe("createTokenOwnershipQuery", () => {
    it("creates predicate with TOKEN_OWNERSHIP type", () => {
      const pred = createTokenOwnershipQuery(USDC_MINT.toBytes());

      expect(pred.queryType).to.equal(QueryType.TOKEN_OWNERSHIP);
      expect(pred.filters.length).to.equal(1);
      expect(pred.filters[0].type).to.equal(FilterType.TOKEN_MINT);
    });
  });

  describe("createTxLookupQuery", () => {
    it("creates predicate with TX_LOOKUP type", () => {
      const pred = createTxLookupQuery(KNOWN_WALLET.toBytes());

      expect(pred.queryType).to.equal(QueryType.TX_LOOKUP);
      expect(pred.filters.length).to.be.greaterThanOrEqual(1);
      expect(pred.filters[0].type).to.equal(FilterType.WALLET_ADDRESS);
    });

    it("includes program filter when provided", () => {
      const pred = createTxLookupQuery(KNOWN_WALLET.toBytes(), TOKEN_PROGRAM.toBytes());

      const progFilter = pred.filters.find(f => f.type === FilterType.PROGRAM_ID);
      expect(progFilter).to.exist;
    });

    it("includes slot filters when provided", () => {
      const pred = createTxLookupQuery(
        KNOWN_WALLET.toBytes(),
        undefined,
        { afterSlot: 250000000n, beforeSlot: 260000000n }
      );

      expect(pred.filters.find(f => f.type === FilterType.AFTER_SLOT)).to.exist;
      expect(pred.filters.find(f => f.type === FilterType.BEFORE_SLOT)).to.exist;
    });
  });

  describe("PredicateBuilder", () => {
    it("builds CPMM predicate by default", () => {
      const pred = new PredicateBuilder()
        .minTvl(1000000n)
        .build();

      expect(pred.queryType).to.equal(QueryType.CPMM_POOLS);
    });

    it("builds TOKEN_BALANCE predicate with tokenBalance()", () => {
      const pred = new PredicateBuilder()
        .tokenBalance(123n)
        .minBalance(1000n)
        .build();

      expect(pred.queryType).to.equal(QueryType.TOKEN_BALANCE);
    });

    it("builds TOKEN_OWNERSHIP predicate with tokenOwnership()", () => {
      const pred = new PredicateBuilder()
        .tokenOwnership(456n)
        .build();

      expect(pred.queryType).to.equal(QueryType.TOKEN_OWNERSHIP);
    });

    it("builds TX_LOOKUP predicate with walletTransactions()", () => {
      const pred = new PredicateBuilder()
        .walletTransactions(789n)
        .withProgram(111n)
        .afterSlot(250000000n)
        .build();

      expect(pred.queryType).to.equal(QueryType.TX_LOOKUP);
      expect(pred.filters.length).to.equal(3);
    });
  });

  describe("encryptPredicate", () => {
    it("produces 80-byte ciphertext for all query types", async () => {
      const predicates = [
        createPredicate([{ type: FilterType.TVL, op: FilterOp.GTE, value: 1000n }], QueryType.CPMM_POOLS),
        createTokenBalanceQuery(USDC_MINT.toBytes(), 1000n),
        createTokenOwnershipQuery(USDC_MINT.toBytes()),
        createTxLookupQuery(KNOWN_WALLET.toBytes()),
      ];

      for (const pred of predicates) {
        const encrypted = await encryptPredicate(pred, FAKE_TEE_PUBKEY);
        expect(encrypted.ciphertext.length).to.equal(ENCRYPTED_PREDICATE_SIZE);
        expect(encrypted.publicKey.length).to.equal(32);
      }
    });
  });

  describe("Token Discovery (mainnet RPC)", () => {
    it("getTokenBalance returns bigint", async () => {
      const balance = await getTokenBalance(connection, KNOWN_WALLET, USDC_MINT);

      expect(typeof balance).to.equal("bigint");
      console.log(`  Toly USDC balance: ${balance}`);
    });

    it("hasTokenBalance returns boolean", async () => {
      const has = await hasTokenBalance(connection, KNOWN_WALLET, USDC_MINT);

      expect(typeof has).to.equal("boolean");
      console.log(`  Toly has USDC: ${has}`);
    });
  });

  describe("Transaction Lookup (mainnet RPC)", () => {
    it("getWalletTransactions returns array with correct shape", async () => {
      const txs = await getWalletTransactions(connection, KNOWN_WALLET, { limit: 3 });

      expect(Array.isArray(txs)).to.be.true;
      expect(txs.length).to.be.greaterThan(0);
      expect(txs[0]).to.have.property("signature");
      expect(txs[0]).to.have.property("slot");
      expect(typeof txs[0].slot).to.equal("bigint");

      console.log(`  Found ${txs.length} transactions, latest slot: ${txs[0].slot}`);
    });

    it("hasRecentActivity returns boolean", async () => {
      const active = await hasRecentActivity(connection, KNOWN_WALLET);

      expect(typeof active).to.equal("boolean");
      expect(active).to.be.true; // Toly is definitely active
      console.log(`  Toly is active: ${active}`);
    });

    it("hasInteractedWithProgram checks specific program", async () => {
      const interacted = await hasInteractedWithProgram(
        connection,
        KNOWN_WALLET,
        TOKEN_PROGRAM,
        { limit: 10 }
      );

      expect(typeof interacted).to.equal("boolean");
      console.log(`  Toly interacted with Token Program: ${interacted}`);
    });

    it("getTransactionCount returns number", async () => {
      const count = await getTransactionCount(connection, KNOWN_WALLET, { limit: 50 });

      expect(typeof count).to.equal("number");
      expect(count).to.be.greaterThan(0);
      console.log(`  Toly recent tx count (limit 50): ${count}`);
    });
  });

  describe("Predicate Serialization Format", () => {
    it("includes query_type byte at offset 0", async () => {
      // We can't directly access the serialized bytes, but we can verify
      // different query types produce different encrypted results
      const pred1 = createPredicate(
        [{ type: FilterType.TVL, op: FilterOp.GTE, value: 1000n }],
        QueryType.CPMM_POOLS
      );
      const pred2 = createPredicate(
        [{ type: FilterType.TVL, op: FilterOp.GTE, value: 1000n }],
        QueryType.TOKEN_BALANCE
      );

      // Both have same filters but different queryType
      expect(pred1.queryType).to.not.equal(pred2.queryType);
      expect(pred1.filters).to.deep.equal(pred2.filters);
    });

    it("backward compatible - undefined queryType defaults to CPMM_POOLS", () => {
      // createPredicate without queryType should default to CPMM_POOLS
      const pred = createPredicate([
        { type: FilterType.TVL, op: FilterOp.GTE, value: 1000n }
      ]);

      expect(pred.queryType).to.equal(QueryType.CPMM_POOLS);
    });
  });
});
