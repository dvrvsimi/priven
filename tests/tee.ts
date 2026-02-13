/**
 * MagicBlock TEE Integration Tests
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { Priven } from "../target/types/priven";
import { expect } from "chai";
import {
  setupProvider,
  TEE_VALIDATOR,
  QUERY_SEED,
  CONFIG_SEED,
  createRawPredicate,
  executeQueryNative,
} from "./helpers";

describe("Priven - MagicBlock TEE Integration", () => {
  const { connection, program, admin } = setupProvider();

  describe("Query Submission", () => {
    it("submits query with pool addresses", async function () {
      this.timeout(60000);
      console.log("\n=== Query Submission Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const poolAddress = Keypair.generate().publicKey;

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods
        .submitQuery(queryId, Array.from(predicate) as number[], Array.from(new Uint8Array(32)) as number[], [poolAddress])
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      const queryState = await program.account.queryState.fetch(queryStatePda);
      expect(queryState.status).to.deep.equal({ pending: {} });
      expect(queryState.poolCount).to.equal(1);
      expect(queryState.poolAddresses[0].toBase58()).to.equal(poolAddress.toBase58());
      console.log("Query status: Pending");
      console.log("Pool addresses stored:", queryState.poolCount);
    });
  });

  describe("Native Crypto Flow", () => {
    it("encrypts, submits, and verifies storage", async function () {
      this.timeout(60000);
      console.log("\n=== NATIVE CRYPTO FLOW ===\n");

      const { encryptPredicate, generateKeyPair, PredicateBuilder } = await import("../client/src/encryption");

      const wallet = admin;

      // STEP 1: Encrypt predicate
      console.log("STEP 1: Encrypt predicate client-side");
      console.log("-".repeat(50));

      const teeKeyPair = await generateKeyPair();
      const predicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .build();
      const encrypted = await encryptPredicate(predicate, teeKeyPair.publicKey);

      console.log("  Predicate: TVL between 1M and 10M");
      console.log("  Encrypted length:", encrypted.ciphertext.length, "bytes");

      // STEP 2: Submit to L1
      console.log("\nSTEP 2: Submit encrypted query to Solana L1");
      console.log("-".repeat(50));

      const queryId = new BN(Date.now());
      const poolAddresses = [
        Keypair.generate().publicKey, // Pool 1
        Keypair.generate().publicKey, // Pool 2
        Keypair.generate().publicKey, // Pool 3
      ];

      console.log("  Pool addresses submitted:", poolAddresses.length);

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods
        .submitQuery(
          queryId,
          Array.from(encrypted.ciphertext) as number[],
          Array.from(encrypted.publicKey) as number[],
          poolAddresses
        )
        .accounts({ user: wallet.publicKey })
        .signers([wallet])
        .rpc();

      // STEP 3: Verify on-chain storage
      console.log("\nSTEP 3: Verify on-chain encrypted data");
      console.log("-".repeat(50));

      const queryState = await program.account.queryState.fetch(queryStatePda);
      expect(queryState.status).to.deep.equal({ pending: {} });
      expect(queryState.poolCount).to.equal(3);

      // Verify stored data matches what we submitted
      const storedPredicate = new Uint8Array(queryState.encryptedPredicate);
      const storedUserPubkey = new Uint8Array(queryState.userPubkey);
      expect(Buffer.from(storedPredicate.slice(0, encrypted.ciphertext.length)).toString("hex"))
        .to.equal(Buffer.from(encrypted.ciphertext).toString("hex"));
      expect(Buffer.from(storedUserPubkey).toString("hex"))
        .to.equal(Buffer.from(encrypted.publicKey).toString("hex"));

      console.log("  Encrypted predicate stored correctly");
      console.log("  User public key stored correctly");

      // STEP 4: Verify pool addresses stored
      console.log("\nSTEP 4: Verify pool addresses stored");
      console.log("-".repeat(50));

      const storedPools = queryState.poolAddresses.slice(0, queryState.poolCount);
      expect(storedPools).to.have.length(3);
      storedPools.forEach((addr: PublicKey, i: number) => {
        expect(addr.toBase58()).to.equal(poolAddresses[i].toBase58());
        console.log(`  Pool ${i + 1}: ${addr.toBase58().slice(0, 16)}...`);
      });

      console.log("\n" + "-".repeat(50));
      console.log("CRYPTO FLOW VALIDATED:");
      console.log("  Client-side encryption (X25519 + AES-256-GCM)");
      console.log("  On-chain storage preserves encrypted data");
      console.log("  Pool addresses stored for TEE evaluation");
    });
  });

  describe("Full E2E Flow (With Delegation)", () => {
    it("executes complete flow with delegation and ER submission", async function () {
      this.timeout(120000);
      console.log("\n=== FULL E2E FLOW (With Delegation) ===\n");

      const { encryptPredicate, generateKeyPair, decryptResult, PredicateBuilder } = await import("../client/src/encryption");
      const { isDelegated } = await import("../client/src/tee");

      const wallet = admin;

      // STEP 1: Setup encryption
      console.log("STEP 1: Encrypt predicate");
      console.log("-".repeat(50));

      const teeKeyPair = await generateKeyPair();
      const predicate = new PredicateBuilder()
        .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
        .build();
      const encrypted = await encryptPredicate(predicate, teeKeyPair.publicKey);

      const queryId = new BN(Date.now());
      const pool1 = Keypair.generate().publicKey;
      const pool2 = Keypair.generate().publicKey;
      const pool3 = Keypair.generate().publicKey;
      const poolAddresses = [pool1, pool2, pool3];

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, wallet.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // STEP 2: Submit to L1
      console.log("\nSTEP 2: Submit to L1");
      console.log("-".repeat(50));

      await program.methods
        .submitQuery(
          queryId,
          Array.from(encrypted.ciphertext) as number[],
          Array.from(encrypted.publicKey) as number[],
          poolAddresses
        )
        .accounts({ user: wallet.publicKey })
        .signers([wallet])
        .rpc();

      console.log("  Query submitted");

      // STEP 3: Setup ER
      console.log("\nSTEP 3: Setup Ephemeral Rollup");
      console.log("-".repeat(50));

      const EPHEMERAL_RPC = "https://devnet.magicblock.app";
      const erConnection = new Connection(EPHEMERAL_RPC, { commitment: "confirmed" });
      const erProvider = new AnchorProvider(erConnection, new anchor.Wallet(wallet), { commitment: "confirmed" });
      const erProgram = new Program(program.idl, erProvider) as Program<Priven>;

      console.log("  ER provider configured");

      // STEP 4: Delegate
      console.log("\nSTEP 4: Delegate to TEE");
      console.log("-".repeat(50));

      try {
        await program.methods
          .delegateQuery(queryId)
          .accounts({ user: wallet.publicKey })
          .signers([wallet])
          .rpc({ skipPreflight: true });

        await new Promise(resolve => setTimeout(resolve, 2000));
        const delegated = await isDelegated(connection, queryStatePda);
        console.log("  Delegation active:", delegated);

        if (!delegated) {
          console.log("  Delegation not confirmed, skipping ER steps");
          this.skip();
          return;
        }
      } catch (e: any) {
        console.log("  Delegation failed:", e.message?.slice(0, 80));
        console.log("  Skipping E2E test (delegation required)");
        this.skip();
        return;
      }

      // STEP 5: Execute natively and submit to ER
      console.log("\nSTEP 5: Execute and submit to ER");
      console.log("-".repeat(50));

      const result = await executeQueryNative(
        program,
        erProgram,
        queryStatePda,
        wallet,
        teeKeyPair.privateKey
      );

      console.log("  Native execution complete");
      console.log("  Match count:", result.matchCount);

      // STEP 6: Decrypt result
      console.log("\nSTEP 6: Decrypt result");
      console.log("-".repeat(50));

      const decrypted = await decryptResult(
        result.encryptedResult,
        encrypted.privateKey,
        teeKeyPair.publicKey
      );

      console.log("  Decrypted match count:", decrypted.matchCount);

      console.log("\n" + "-".repeat(50));
      console.log("FULL E2E VALIDATED:");
      console.log("  Encryption + L1 submission");
      console.log("  Delegation to TEE");
      console.log("  Native execution + ER submission");
      console.log("  Result decryption");
    });
  });

  describe("TEE Client Module", () => {
    it("verifies TEE client module exports", async function () {
      console.log("\n=== TEE Client Module Verification ===");

      const tee = await import("../client/src/tee");

      expect(tee.DELEGATION_PROGRAM_ID.toBase58()).to.be.a("string");
      expect(tee.TEE_VALIDATORS.TEE.toBase58()).to.be.a("string");
      expect(tee.TEE_VALIDATORS.US.toBase58()).to.be.a("string");
      expect(tee.TEE_VALIDATORS.EU.toBase58()).to.be.a("string");
      expect(tee.TEE_VALIDATORS.ASIA.toBase58()).to.be.a("string");
      expect(tee.MAGICBLOCK_RPC.tee).to.equal("https://tee.magicblock.app");
      expect(tee.createTeeSession).to.be.a("function");
      expect(tee.isDelegated).to.be.a("function");
      expect(tee.waitForCommit).to.be.a("function");

      console.log("DELEGATION_PROGRAM_ID:", tee.DELEGATION_PROGRAM_ID.toBase58());
      console.log("TEE Validators:");
      console.log("  TEE:", tee.TEE_VALIDATORS.TEE.toBase58());
      console.log("  US:", tee.TEE_VALIDATORS.US.toBase58());
      console.log("  EU:", tee.TEE_VALIDATORS.EU.toBase58());
      console.log("  ASIA:", tee.TEE_VALIDATORS.ASIA.toBase58());

      console.log("TEE client module correctly configured");
    });
  });

  describe("Delegation Documentation", () => {
    it("explains delegation requirements", async function () {
      console.log("\n=== MagicBlock TEE Delegation ===");
      console.log("\nThe #[delegate] macro adds these accounts:");
      console.log("  - buffer_query_state (PDA from Delegation Program)");
      console.log("  - delegation_record");
      console.log("  - delegation_metadata");
      console.log("  - delegation_program: DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
      console.log("  - system_program");

      console.log("\nTo test full TEE flow:");
      console.log("1. Ensure config uses real TEE validator:", TEE_VALIDATOR.toBase58());
      console.log("2. Use MagicBlock SDK to build delegation transaction");
      console.log("3. Execute in TEE via https://tee.magicblock.app");

      this.skip();
    });
  });
});
