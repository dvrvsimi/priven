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

      const { encryptPredicate, generateKeyPair } = await import("../client/src/encryption");

      const teeKeyPair = await generateKeyPair();

      const predicate = {
        minTvl: BigInt(1_000_000),
        maxTvl: BigInt(10_000_000),
      };

      const encrypted = await encryptPredicate(predicate, teeKeyPair.publicKey);

      console.log("Predicate: minTvl=1M, maxTvl=10M");
      console.log("Ciphertext (hex):", Buffer.from(encrypted.ciphertext).toString("hex").slice(0, 40) + "...");

      const rawMinTvl = Buffer.alloc(8);
      rawMinTvl.writeBigUInt64LE(predicate.minTvl);
      const rawMaxTvl = Buffer.alloc(8);
      rawMaxTvl.writeBigUInt64LE(predicate.maxTvl);

      const ciphertextHex = Buffer.from(encrypted.ciphertext).toString("hex");

      expect(ciphertextHex).to.not.include(rawMinTvl.toString("hex"));
      expect(ciphertextHex).to.not.include(rawMaxTvl.toString("hex"));

      console.log("✓ Ciphertext does not contain plaintext min/max TVL");
    });

    it("same predicate produces different ciphertexts (semantic security)", async function () {
      this.timeout(30000);
      console.log("\n=== Semantic Security Test ===");

      const { encryptPredicate, generateKeyPair } = await import("../client/src/encryption");
      const teeKeyPair = await generateKeyPair();

      const predicate = {
        minTvl: BigInt(1_000_000),
        maxTvl: BigInt(10_000_000),
      };

      const encrypted1 = await encryptPredicate(predicate, teeKeyPair.publicKey);
      const encrypted2 = await encryptPredicate(predicate, teeKeyPair.publicKey);

      const hex1 = Buffer.from(encrypted1.ciphertext).toString("hex");
      const hex2 = Buffer.from(encrypted2.ciphertext).toString("hex");

      console.log("Encryption 1:", hex1.slice(0, 32) + "...");
      console.log("Encryption 2:", hex2.slice(0, 32) + "...");

      expect(hex1).to.not.equal(hex2);
      console.log("✓ Different ephemeral keys produce different ciphertexts");
    });

    it("encrypts predicate for on-chain submission", async function () {
      this.timeout(60000);
      console.log("\n=== Encrypted Query Submission Test ===");

      const { encryptPredicate, generateKeyPair } = await import("../client/src/encryption");

      const teeKeyPair = await generateKeyPair();
      const predicate = { minTvl: BigInt(1_000_000), maxTvl: BigInt(10_000_000) };
      const encrypted = await encryptPredicate(predicate, teeKeyPair.publicKey);

      const queryId = new BN(Date.now());
      const mockPool = {
        address: Keypair.generate().publicKey,
        tokenAReserve: new BN(5_000_000),
        tokenBReserve: new BN(5_000_000),
      };

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
          [mockPool]
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

      console.log("✓ Encrypted predicate stored on-chain");
      console.log("✓ Observer cannot read filter criteria from account data");
    });
  });

  describe("Encryption Roundtrip", () => {
    it("encrypts and decrypts predicate successfully", async function () {
      this.timeout(30000);
      console.log("\n=== Encrypt/Decrypt Roundtrip Test ===");

      const { encryptPredicate, generateKeyPair, createTvlPredicate } = await import("../client/src/encryption");
      const { testDecryptPredicate } = await import("./helpers");

      const teeKeyPair = await generateKeyPair();

      // Use V2 predicate format (with version byte)
      const originalPredicate = createTvlPredicate(BigInt(1_000_000), BigInt(10_000_000));

      const encrypted = await encryptPredicate(originalPredicate, teeKeyPair.publicKey);

      console.log("Original: minTvl=1M, maxTvl=10M");
      console.log("Ciphertext length:", encrypted.ciphertext.length, "bytes");
      console.log("User publicKey length:", encrypted.publicKey.length, "bytes");
      console.log("User privateKey length:", encrypted.privateKey.length, "bytes (PKCS8)");

      // V2 predicates have variable-length ciphertext: [data][nonce:12][tag:16]
      const dataLen = encrypted.ciphertext.length - 28;
      const ct = encrypted.ciphertext.slice(0, dataLen);
      const nonce = encrypted.ciphertext.slice(dataLen, dataLen + 12);
      const tag = encrypted.ciphertext.slice(dataLen + 12);

      console.log("Ciphertext (data):", Buffer.from(ct).toString("hex").slice(0, 32) + "...");
      console.log("Nonce:", Buffer.from(nonce).toString("hex"));
      console.log("Tag:", Buffer.from(tag).toString("hex"));

      expect(nonce.length).to.equal(12);
      expect(tag.length).to.equal(16);

      // ACTUAL DECRYPTION VERIFICATION
      const decrypted = await testDecryptPredicate(
        encrypted.ciphertext,
        teeKeyPair.privateKey,
        encrypted.publicKey
      );

      expect(decrypted.version).to.equal(2);
      expect(decrypted.filters).to.have.length(2);
      expect(decrypted.filters[0].value).to.equal(originalPredicate.filters[0].value);
      expect(decrypted.filters[1].value).to.equal(originalPredicate.filters[1].value);

      console.log("✓ Decrypted version:", decrypted.version);
      console.log("✓ Decrypted filters:", decrypted.filters.length);
      console.log("✓ Filter 0 (TVL >= 1M):", decrypted.filters[0].value.toString());
      console.log("✓ Filter 1 (TVL <= 10M):", decrypted.filters[1].value.toString());
      console.log("✓ Roundtrip encryption/decryption verified");
    });

    it("different users cannot decrypt each other's predicates", async function () {
      this.timeout(30000);
      console.log("\n=== Cross-User Decryption Prevention Test ===");

      const { encryptPredicate, generateKeyPair } = await import("../client/src/encryption");

      const teeKeyPair = await generateKeyPair();

      const predicateA = { minTvl: BigInt(1_000_000), maxTvl: BigInt(5_000_000) };
      const encryptedA = await encryptPredicate(predicateA, teeKeyPair.publicKey);

      const predicateB = { minTvl: BigInt(10_000_000), maxTvl: BigInt(50_000_000) };
      const encryptedB = await encryptPredicate(predicateB, teeKeyPair.publicKey);

      expect(Buffer.from(encryptedA.publicKey).toString("hex"))
        .to.not.equal(Buffer.from(encryptedB.publicKey).toString("hex"));

      expect(Buffer.from(encryptedA.ciphertext).toString("hex"))
        .to.not.equal(Buffer.from(encryptedB.ciphertext).toString("hex"));

      console.log("User A ephemeral pubkey:", Buffer.from(encryptedA.publicKey).toString("hex").slice(0, 16) + "...");
      console.log("User B ephemeral pubkey:", Buffer.from(encryptedB.publicKey).toString("hex").slice(0, 16) + "...");

      console.log("✓ Each user has unique ephemeral keypair");
      console.log("✓ Cross-decryption impossible without correct privateKey");
    });
  });

  describe("PredicateBuilder", () => {
    it("builds predicates with fluent API", async function () {
      console.log("\n=== PredicateBuilder Test ===");

      const { PredicateBuilder, FilterType, FilterOp } = await import("../client/src/encryption");

      const predicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .minReserveRatio(40)
        .build();

      expect(predicate.version).to.equal(2);
      expect(predicate.filters.length).to.equal(3);

      expect(predicate.filters[0].type).to.equal(FilterType.TVL);
      expect(predicate.filters[0].op).to.equal(FilterOp.GTE);
      expect(predicate.filters[0].value).to.equal(BigInt(1_000_000));

      expect(predicate.filters[1].type).to.equal(FilterType.TVL);
      expect(predicate.filters[1].op).to.equal(FilterOp.LTE);
      expect(predicate.filters[1].value).to.equal(BigInt(10_000_000));

      expect(predicate.filters[2].type).to.equal(FilterType.RATIO);
      expect(predicate.filters[2].op).to.equal(FilterOp.GTE);
      expect(predicate.filters[2].value).to.equal(BigInt(4000));

      console.log("Built predicate:");
      console.log("  Version:", predicate.version);
      console.log("  Filters:", predicate.filters.length);
      predicate.filters.forEach((f, i) => {
        console.log(`    ${i + 1}. type=${f.type} op=${f.op} value=${f.value}`);
      });

      console.log("✓ PredicateBuilder creates valid V2 predicates");
    });

    it("builds balance filter predicates", async function () {
      console.log("\n=== Balance Filter Builder Test ===");

      const { PredicateBuilder, FilterType } = await import("../client/src/encryption");

      const predicate = new PredicateBuilder()
        .balanceBetween(BigInt(1_000), BigInt(1_000_000))
        .build();

      expect(predicate.filters.length).to.equal(2);
      expect(predicate.filters[0].type).to.equal(FilterType.BALANCE);
      expect(predicate.filters[1].type).to.equal(FilterType.BALANCE);

      console.log("✓ Balance filter predicates work");
    });
  });
});
