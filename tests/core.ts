/**
 * Core Priven Tests - Initialize, Submit Query, Basic Flow
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupProvider,
  TEE_VALIDATOR,
  MAX_POOLS,
  QUERY_SEED,
  CONFIG_SEED,
  createRawPredicate,
  createBalancePredicate,
} from "./helpers";

describe("Priven - Core", () => {
  const { connection, program, admin } = setupProvider();
  let configPda: PublicKey;

  before(async () => {
    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      program.programId
    );
    console.log("=== Priven Core Tests ===");
    console.log("Program ID:", program.programId.toBase58());
    console.log("Config PDA:", configPda.toBase58());
    console.log("Wallet:", admin.publicKey.toBase58());

    const balance = await connection.getBalance(admin.publicKey);
    console.log("Balance:", balance / 1e9, "SOL");
  });

  describe("initialize", () => {
    it("initializes or verifies program config", async () => {
      try {
        const existingConfig = await program.account.queryConfig.fetch(configPda);
        console.log("Config already initialized:");
        console.log("  Admin:", existingConfig.admin.toBase58());
        console.log("  TEE Validator:", existingConfig.teeValidator.toBase58());
        console.log("  Max Pools:", existingConfig.maxPools);
        return;
      } catch {
        // Config doesn't exist, initialize
      }

      console.log("Initializing config with TEE validator...");
      const tx = await program.methods
        .initialize(TEE_VALIDATOR, MAX_POOLS, new BN(1000))
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      console.log("Initialize tx:", tx);

      const config = await program.account.queryConfig.fetch(configPda);
      expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(config.teeValidator.toBase58()).to.equal(TEE_VALIDATOR.toBase58());
    });
  });

  describe("submit query", () => {
    const pool1 = Keypair.generate();
    const pool2 = Keypair.generate();
    const pool3 = Keypair.generate();
    const pool4 = Keypair.generate();
    const pool5 = Keypair.generate();

    const mockPools = [
      { address: pool1.publicKey, tokenAReserve: new BN(2_000_000), tokenBReserve: new BN(3_000_000) },
      { address: pool2.publicKey, tokenAReserve: new BN(200_000), tokenBReserve: new BN(300_000) },
      { address: pool3.publicKey, tokenAReserve: new BN(4_000_000), tokenBReserve: new BN(4_000_000) },
      { address: pool4.publicKey, tokenAReserve: new BN(7_000_000), tokenBReserve: new BN(8_000_000) },
      { address: pool5.publicKey, tokenAReserve: new BN(1_500_000), tokenBReserve: new BN(1_500_000) },
    ];

    it("submits query with mock pools", async () => {
      const queryId = new BN(Date.now());

      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const userPubkey = new Uint8Array(32);
      crypto.getRandomValues(userPubkey);

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      console.log("\n=== Submit Query ===");
      console.log("Query ID:", queryId.toString());
      console.log("Predicate: TVL between 1M and 10M");

      console.log("\nPools:");
      mockPools.forEach((p, i) => {
        const tvl = p.tokenAReserve.add(p.tokenBReserve).toNumber();
        const match = tvl >= 1_000_000 && tvl <= 10_000_000;
        console.log(`  ${i + 1}. TVL=${tvl} ${match ? "✓ MATCH" : "✗"}`);
      });

      const tx = await program.methods
        .submitQuery(
          queryId,
          Array.from(predicate) as number[],
          Array.from(userPubkey) as number[],
          mockPools
        )
        .accounts({
          user: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      console.log("\nSubmit tx:", tx);

      const queryState = await program.account.queryState.fetch(queryStatePda);
      expect(queryState.status).to.deep.equal({ pending: {} });
      expect(queryState.poolCount).to.equal(5);

      console.log("✓ Query submitted to L1 successfully");
    });
  });

  describe("V2 Balance Filter", () => {
    it("submits query with Balance filter for token accounts", async function () {
      this.timeout(60000);
      console.log("\n=== V2 Balance Filter Test ===");

      const mockAccounts = [
        { address: Keypair.generate().publicKey, tokenAReserve: new BN(500_000), tokenBReserve: new BN(0) },
        { address: Keypair.generate().publicKey, tokenAReserve: new BN(2_000_000), tokenBReserve: new BN(0) },
        { address: Keypair.generate().publicKey, tokenAReserve: new BN(5_000_000), tokenBReserve: new BN(0) },
        { address: Keypair.generate().publicKey, tokenAReserve: new BN(15_000_000), tokenBReserve: new BN(0) },
      ];

      const queryId = new BN(Date.now());
      const predicate = createBalancePredicate(BigInt(1_000_000), BigInt(10_000_000));
      const userPubkey = new Uint8Array(32);
      crypto.getRandomValues(userPubkey);

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      console.log("Predicate: Balance between 1M and 10M");
      console.log("Token accounts:");
      mockAccounts.forEach((a, i) => {
        const balance = a.tokenAReserve.toNumber();
        const match = balance >= 1_000_000 && balance <= 10_000_000;
        console.log(`  ${i + 1}. balance=${balance} ${match ? "✓ MATCH" : "✗"}`);
      });

      const tx = await program.methods
        .submitQuery(
          queryId,
          Array.from(predicate) as number[],
          Array.from(userPubkey) as number[],
          mockAccounts
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      console.log("\nSubmit tx:", tx);

      const queryState = await program.account.queryState.fetch(queryStatePda);
      expect(queryState.status).to.deep.equal({ pending: {} });

      const storedPredicate = queryState.encryptedPredicate;
      expect(storedPredicate[0]).to.equal(2);
      expect(storedPredicate[1]).to.equal(2);
      expect(storedPredicate[2]).to.equal(1);

      console.log("✓ V2 Balance filter predicate stored on-chain");
    });
  });

  describe("Input Validation", () => {
    it("rejects empty pool list", async function () {
      this.timeout(30000);
      console.log("\n=== Empty Pool Validation ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));

      try {
        await program.methods
          .submitQuery(queryId, Array.from(predicate) as number[], Array.from(new Uint8Array(32)) as number[], [])
          .accounts({ user: admin.publicKey })
          .signers([admin])
          .rpc();

        expect.fail("Should reject empty pool list");
      } catch (e: any) {
        expect(e.message).to.include("NoPoolsProvided");
        console.log("✓ Empty pool list rejected");
      }
    });

    it("rejects more than MAX_POOLS", async function () {
      this.timeout(30000);
      console.log("\n=== Max Pools Validation ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));

      const tooManyPools = Array(6).fill(null).map(() => ({
        address: Keypair.generate().publicKey,
        tokenAReserve: new BN(1_000_000),
        tokenBReserve: new BN(1_000_000),
      }));

      try {
        await program.methods
          .submitQuery(queryId, Array.from(predicate) as number[], Array.from(new Uint8Array(32)) as number[], tooManyPools)
          .accounts({ user: admin.publicKey })
          .signers([admin])
          .rpc();

        expect.fail("Should reject >5 pools");
      } catch (e: any) {
        expect(e.message).to.include("TooManyPools");
        console.log("✓ Too many pools rejected (max 5)");
      }
    });
  });

  describe("Event Emission", () => {
    it("emits QuerySubmitted event on submit", async function () {
      this.timeout(60000);
      console.log("\n=== Event Emission Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const mockPool = {
        address: Keypair.generate().publicKey,
        tokenAReserve: new BN(5_000_000),
        tokenBReserve: new BN(5_000_000),
      };

      const tx = await program.methods
        .submitQuery(
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [mockPool]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      const txDetails = await connection.getTransaction(tx, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      const logs = txDetails?.meta?.logMessages || [];
      const hasEventLog = logs.some(log => log.includes("Program data:"));
      expect(hasEventLog).to.be.true;

      console.log("✓ QuerySubmitted event emitted");
    });
  });

  describe("Query Expiration", () => {
    it("rejects expire_query on fresh query (not expired)", async function () {
      this.timeout(60000);
      console.log("\n=== Query Expiration Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const mockPool = {
        address: Keypair.generate().publicKey,
        tokenAReserve: new BN(5_000_000),
        tokenBReserve: new BN(5_000_000),
      };

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods
        .submitQuery(
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [mockPool]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      try {
        await program.methods
          .expireQuery()
          .accountsPartial({
            caller: admin.publicKey,
            queryState: queryStatePda,
          })
          .signers([admin])
          .rpc();

        expect.fail("Should reject expiration of fresh query");
      } catch (e: any) {
        expect(e.message).to.include("QueryNotExpired");
        console.log("✓ Fresh query cannot be expired (timeout = 1 hour)");
      }
    });
  });
});
