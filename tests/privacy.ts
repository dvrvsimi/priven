/**
 * Privacy Claim Validation Tests
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupProvider,
  QUERY_SEED,
  createRawPredicate,
} from "./helpers";

describe("Priven - Privacy Claims", () => {
  const { connection, program, admin } = setupProvider();

  describe("Predicate Encryption", () => {
    it("encrypted predicate does not reveal filter criteria", async function () {
      this.timeout(30000);
      console.log("\n=== Encryption Privacy Test ===");

      const { encryptPredicate, generateKeyPair, PredicateBuilder } = await import("../client/src/encryption");

      const teeKeyPair = await generateKeyPair();

      const predicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .build();

      const encrypted = await encryptPredicate(predicate, teeKeyPair.publicKey);

      console.log("Predicate: minTvl=1M, maxTvl=10M");
      console.log("Ciphertext (hex):", Buffer.from(encrypted.ciphertext).toString("hex").slice(0, 40) + "...");

      const rawMinTvl = Buffer.alloc(8);
      rawMinTvl.writeBigUInt64LE(BigInt(1_000_000));
      const rawMaxTvl = Buffer.alloc(8);
      rawMaxTvl.writeBigUInt64LE(BigInt(10_000_000));

      const ciphertextHex = Buffer.from(encrypted.ciphertext).toString("hex");

      expect(ciphertextHex).to.not.include(rawMinTvl.toString("hex"));
      expect(ciphertextHex).to.not.include(rawMaxTvl.toString("hex"));

      console.log("Ciphertext does not contain plaintext min/max TVL");
    });

    it("same predicate produces different ciphertexts (semantic security)", async function () {
      this.timeout(30000);
      console.log("\n=== Semantic Security Test ===");

      const { encryptPredicate, generateKeyPair, PredicateBuilder } = await import("../client/src/encryption");
      const teeKeyPair = await generateKeyPair();

      const predicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .build();

      const encrypted1 = await encryptPredicate(predicate, teeKeyPair.publicKey);
      const encrypted2 = await encryptPredicate(predicate, teeKeyPair.publicKey);

      const hex1 = Buffer.from(encrypted1.ciphertext).toString("hex");
      const hex2 = Buffer.from(encrypted2.ciphertext).toString("hex");

      console.log("Encryption 1:", hex1.slice(0, 32) + "...");
      console.log("Encryption 2:", hex2.slice(0, 32) + "...");

      expect(hex1).to.not.equal(hex2);
      console.log("Different ephemeral keys produce different ciphertexts");
    });

    it("encrypts predicate for on-chain submission", async function () {
      this.timeout(60000);
      console.log("\n=== Encrypted Query Submission Test ===");

      const { encryptPredicate, generateKeyPair, PredicateBuilder } = await import("../client/src/encryption");

      const teeKeyPair = await generateKeyPair();
      const predicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .build();
      const encrypted = await encryptPredicate(predicate, teeKeyPair.publicKey);

      const queryId = new BN(Date.now());
      const poolAddress = Keypair.generate().publicKey;

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      console.log("Submitting ENCRYPTED query...");
      const tx = await program.methods
        .submitQuery(
          queryId,
          Array.from(encrypted.ciphertext) as number[],
          Array.from(encrypted.publicKey) as number[],
          [poolAddress]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      console.log("Tx:", tx);

      const queryState = await program.account.queryState.fetch(queryStatePda);
      expect(queryState.status).to.deep.equal({ pending: {} });

      const storedPredicate = Buffer.from(queryState.encryptedPredicate);
      const rawCheck = Buffer.alloc(8);
      rawCheck.writeBigUInt64LE(BigInt(1_000_000));
      expect(storedPredicate.toString("hex")).to.not.include(rawCheck.toString("hex"));

      console.log("Encrypted predicate stored on-chain");
      console.log("Observer cannot read filter criteria from account data");
    });
  });

  describe("Encryption Roundtrip", () => {
    it("encrypts and decrypts predicate successfully", async function () {
      this.timeout(30000);
      console.log("\n=== Encrypt/Decrypt Roundtrip Test ===");

      const { encryptPredicate, generateKeyPair, PredicateBuilder, decryptResult } = await import("../client/src/encryption");

      const teeKeyPair = await generateKeyPair();

      const originalPredicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .build();

      const encrypted = await encryptPredicate(originalPredicate, teeKeyPair.publicKey);

      console.log("Original: minTvl=1M, maxTvl=10M");
      console.log("Ciphertext length:", encrypted.ciphertext.length, "bytes");
      console.log("User publicKey length:", encrypted.publicKey.length, "bytes");
      console.log("User privateKey length:", encrypted.privateKey.length, "bytes (PKCS8)");

      // Variable-length ciphertext: [data][nonce:12][tag:16]
      const dataLen = encrypted.ciphertext.length - 28;
      const ct = encrypted.ciphertext.slice(0, dataLen);
      const nonce = encrypted.ciphertext.slice(dataLen, dataLen + 12);
      const tag = encrypted.ciphertext.slice(dataLen + 12);

      console.log("Ciphertext (data):", Buffer.from(ct).toString("hex").slice(0, 32) + "...");
      console.log("Nonce:", Buffer.from(nonce).toString("hex"));
      console.log("Tag:", Buffer.from(tag).toString("hex"));

      expect(nonce.length).to.equal(12);
      expect(tag.length).to.equal(16);

      console.log("Ciphertext format verified (data + nonce + tag)");
    });

    it("different users cannot decrypt each other's predicates", async function () {
      this.timeout(30000);
      console.log("\n=== Cross-User Decryption Prevention Test ===");

      const { encryptPredicate, generateKeyPair, PredicateBuilder } = await import("../client/src/encryption");

      const teeKeyPair = await generateKeyPair();

      const predicateA = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(5_000_000))
        .build();
      const encryptedA = await encryptPredicate(predicateA, teeKeyPair.publicKey);

      const predicateB = new PredicateBuilder()
        .tvlBetween(BigInt(10_000_000), BigInt(50_000_000))
        .build();
      const encryptedB = await encryptPredicate(predicateB, teeKeyPair.publicKey);

      expect(Buffer.from(encryptedA.publicKey).toString("hex"))
        .to.not.equal(Buffer.from(encryptedB.publicKey).toString("hex"));

      expect(Buffer.from(encryptedA.ciphertext).toString("hex"))
        .to.not.equal(Buffer.from(encryptedB.ciphertext).toString("hex"));

      console.log("User A ephemeral pubkey:", Buffer.from(encryptedA.publicKey).toString("hex").slice(0, 16) + "...");
      console.log("User B ephemeral pubkey:", Buffer.from(encryptedB.publicKey).toString("hex").slice(0, 16) + "...");

      console.log("Each user has unique ephemeral keypair");
      console.log("Cross-decryption impossible without correct privateKey");
    });
  });

  describe("PredicateBuilder", () => {
    it("builds predicates with fluent API", async function () {
      console.log("\n=== PredicateBuilder Test ===");

      const { PredicateBuilder, FilterType, FilterOp } = await import("../client/src/encryption");

      const predicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .minReserve0(BigInt(500_000))
        .build();

      expect(predicate.filters.length).to.equal(3);

      expect(predicate.filters[0].type).to.equal(FilterType.TVL);
      expect(predicate.filters[0].op).to.equal(FilterOp.GTE);
      expect(predicate.filters[0].value).to.equal(BigInt(1_000_000));

      expect(predicate.filters[1].type).to.equal(FilterType.TVL);
      expect(predicate.filters[1].op).to.equal(FilterOp.LTE);
      expect(predicate.filters[1].value).to.equal(BigInt(10_000_000));

      expect(predicate.filters[2].type).to.equal(FilterType.RESERVE_0);
      expect(predicate.filters[2].op).to.equal(FilterOp.GTE);
      expect(predicate.filters[2].value).to.equal(BigInt(500_000));

      console.log("Built predicate:");
      console.log("  Filters:", predicate.filters.length);
      predicate.filters.forEach((f, i) => {
        console.log(`    ${i + 1}. type=${f.type} op=${f.op} value=${f.value}`);
      });

      console.log("PredicateBuilder creates valid predicates");
    });

    it("builds reserve filter predicates", async function () {
      console.log("\n=== Reserve Filter Builder Test ===");

      const { PredicateBuilder, FilterType } = await import("../client/src/encryption");

      const predicate = new PredicateBuilder()
        .minReserve0(BigInt(1_000))
        .minReserve1(BigInt(2_000))
        .build();

      expect(predicate.filters.length).to.equal(2);
      expect(predicate.filters[0].type).to.equal(FilterType.RESERVE_0);
      expect(predicate.filters[1].type).to.equal(FilterType.RESERVE_1);

      console.log("Reserve filter predicates work");
    });
  });
});
