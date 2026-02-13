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
  SESSION_SEED,
  ANCHOR_SEED,
  createRawPredicate,
} from "./helpers";

describe("Priven - Core", () => {
  const { connection, program, admin } = setupProvider();
  let configPda: PublicKey;
  // Default session ID for tests (no session account required for basic tests)
  const defaultSessionId = new BN(0);

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
    const poolAddresses = [
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    ];

    it("submits query with pool addresses", async () => {
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
      console.log("Pool count:", poolAddresses.length);

      const tx = await program.methods
        .submitQuery(
          defaultSessionId,
          queryId,
          Array.from(predicate) as number[],
          Array.from(userPubkey) as number[],
          poolAddresses
        )
        .accounts({
          user: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      console.log("Submit tx:", tx);

      const queryState = await program.account.queryState.fetch(queryStatePda);
      expect(queryState.status).to.deep.equal({ pending: {} });
      expect(queryState.poolCount).to.equal(5);
      expect(queryState.poolAddresses.length).to.equal(5);

      console.log("Query submitted to L1 successfully");
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
          .submitQuery(defaultSessionId, queryId, Array.from(predicate) as number[], Array.from(new Uint8Array(32)) as number[], [])
          .accounts({ user: admin.publicKey })
          .signers([admin])
          .rpc();

        expect.fail("Should reject empty pool list");
      } catch (e: any) {
        expect(e.message).to.include("NoPoolsProvided");
        console.log("Empty pool list rejected");
      }
    });

    it("rejects more than MAX_POOLS", async function () {
      this.timeout(30000);
      console.log("\n=== Max Pools Validation ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));

      const tooManyPools = Array(21).fill(null).map(() => Keypair.generate().publicKey);

      try {
        await program.methods
          .submitQuery(defaultSessionId, queryId, Array.from(predicate) as number[], Array.from(new Uint8Array(32)) as number[], tooManyPools)
          .accounts({ user: admin.publicKey })
          .signers([admin])
          .rpc();

        expect.fail("Should reject >20 pools");
      } catch (e: any) {
        expect(e.message).to.include("TooManyPools");
        console.log("Too many pools rejected (max 20)");
      }
    });
  });

  describe("Event Emission", () => {
    it("emits QuerySubmitted event on submit", async function () {
      this.timeout(60000);
      console.log("\n=== Event Emission Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const poolAddress = Keypair.generate().publicKey;

      const tx = await program.methods
        .submitQuery(
          defaultSessionId,
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [poolAddress]
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

      console.log("QuerySubmitted event emitted");
    });
  });

  describe("Query Expiration", () => {
    it("rejects expire_query on fresh query (not expired)", async function () {
      this.timeout(60000);
      console.log("\n=== Query Expiration Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const poolAddress = Keypair.generate().publicKey;

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods
        .submitQuery(
          defaultSessionId,
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [poolAddress]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      try {
        await program.methods
          .expireQuery()
          .accountsPartial({
            caller: admin.publicKey,
            owner: admin.publicKey,
            queryState: queryStatePda,
          })
          .signers([admin])
          .rpc();

        expect.fail("Should reject expiration of fresh query");
      } catch (e: any) {
        expect(e.message).to.include("QueryNotExpired");
        console.log("Fresh query cannot be expired (timeout = 1 hour)");
      }
    });
  });

  describe("Close Query", () => {
    it("closes completed query and returns rent", async function () {
      this.timeout(60000);
      console.log("\n=== Close Query Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const poolAddress = Keypair.generate().publicKey;

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Submit query
      await program.methods
        .submitQuery(
          defaultSessionId,
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [poolAddress]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      // First, update config to set admin as TEE validator (for testing only)
      await program.methods
        .updateConfig(admin.publicKey, null, null)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
        })
        .signers([admin])
        .rpc();

      // Submit result (marks as completed)
      await program.methods
        .submitResult(
          Buffer.from(new Uint8Array(50)),
          0,
          true,
          Array.from(new Uint8Array(32)) as number[], // result_hash
          admin.publicKey,
          queryId
        )
        .accountsPartial({
          caller: admin.publicKey,
          queryState: queryStatePda,
          config: configPda,
        })
        .signers([admin])
        .rpc();

      const balanceBefore = await connection.getBalance(admin.publicKey);

      // Close query
      await program.methods
        .closeQuery()
        .accounts({
          owner: admin.publicKey,
          queryState: queryStatePda,
        })
        .signers([admin])
        .rpc();

      const balanceAfter = await connection.getBalance(admin.publicKey);
      expect(balanceAfter).to.be.greaterThan(balanceBefore);

      // Verify account is closed
      const accountInfo = await connection.getAccountInfo(queryStatePda);
      expect(accountInfo).to.be.null;

      console.log("Query closed, rent returned");
    });
  });

  describe("Security Validations", () => {
    it("rejects submit_result from unauthorized caller", async function () {
      this.timeout(60000);
      console.log("\n=== Unauthorized Caller Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const poolAddress = Keypair.generate().publicKey;

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Submit query
      await program.methods
        .submitQuery(
          defaultSessionId,
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [poolAddress]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      // Set TEE validator to a different key (not admin)
      const realTeeValidator = Keypair.generate();
      await program.methods
        .updateConfig(realTeeValidator.publicKey, null, null)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
        })
        .signers([admin])
        .rpc();

      // Try to submit result as admin (not the TEE validator)
      try {
        await program.methods
          .submitResult(
            Buffer.from(new Uint8Array(50)),
            0,
            true,
            Array.from(new Uint8Array(32)) as number[], // result_hash
            admin.publicKey,
            queryId
          )
          .accountsPartial({
            caller: admin.publicKey,
            queryState: queryStatePda,
            config: configPda,
          })
          .signers([admin])
          .rpc();

        expect.fail("Should reject unauthorized caller");
      } catch (e: any) {
        expect(e.message).to.include("UnauthorizedTeeValidator");
        console.log("Unauthorized caller rejected");
      }

      // Restore admin as TEE validator for other tests
      await program.methods
        .updateConfig(admin.publicKey, null, null)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
        })
        .signers([admin])
        .rpc();
    });

    it("rejects oversized encrypted_result", async function () {
      this.timeout(60000);
      console.log("\n=== Oversized Result Test ===");

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const poolAddress = Keypair.generate().publicKey;

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Submit query
      await program.methods
        .submitQuery(
          defaultSessionId,
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [poolAddress]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      // Ensure admin is TEE validator
      await program.methods
        .updateConfig(admin.publicKey, null, null)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
        })
        .signers([admin])
        .rpc();

      // Try to submit oversized result (MAX_ENCRYPTED_RESULT_SIZE = 669)
      const oversizedResult = new Uint8Array(700);
      try {
        await program.methods
          .submitResult(
            Buffer.from(oversizedResult),
            0,
            true,
            Array.from(new Uint8Array(32)) as number[], // result_hash
            admin.publicKey,
            queryId
          )
          .accountsPartial({
            caller: admin.publicKey,
            queryState: queryStatePda,
            config: configPda,
          })
          .signers([admin])
          .rpc();

        expect.fail("Should reject oversized result");
      } catch (e: any) {
        expect(e.message).to.include("ResultTooLarge");
        console.log("Oversized result rejected (700 bytes > 669 max)");
      }
    });

    it("respects config.max_pools not hardcoded constant", async function () {
      this.timeout(60000);
      console.log("\n=== Config Max Pools Test ===");

      // First check current config
      const config = await program.account.queryConfig.fetch(configPda);
      console.log("Current config.max_pools:", config.maxPools);

      // Set max_pools to 3 (lower than default)
      await program.methods
        .updateConfig(null, 3, null)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
        })
        .signers([admin])
        .rpc();

      const queryId = new BN(Date.now());
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));

      // Try to submit with 5 pools (more than config.max_pools=3)
      const fivePools = Array(5).fill(null).map(() => Keypair.generate().publicKey);

      try {
        await program.methods
          .submitQuery(
            defaultSessionId,
            queryId,
            Array.from(predicate) as number[],
            Array.from(new Uint8Array(32)) as number[],
            fivePools
          )
          .accounts({ user: admin.publicKey })
          .signers([admin])
          .rpc();

        expect.fail("Should reject pools exceeding config.max_pools");
      } catch (e: any) {
        expect(e.message).to.include("TooManyPools");
        console.log("Rejected 5 pools when config.max_pools=3");
      }

      // Restore max_pools to 20
      await program.methods
        .updateConfig(null, 20, null)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
        })
        .signers([admin])
        .rpc();

      console.log("Config max_pools enforcement verified");
    });
  });

  describe("Sessions", () => {
    it("opens and closes a session", async function () {
      this.timeout(60000);
      console.log("\n=== Session Open/Close Test ===");

      const sessionId = new BN(Date.now());
      const [sessionPda] = PublicKey.findProgramAddressSync(
        [SESSION_SEED, admin.publicKey.toBuffer(), sessionId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Open session
      const openTx = await program.methods
        .openSession(sessionId)
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      console.log("Session opened:", openTx);

      // Verify session exists
      const session = await program.account.querySession.fetch(sessionPda);
      expect(session.owner.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(session.sessionId.toString()).to.equal(sessionId.toString());
      expect(session.queryCount.toNumber()).to.equal(0);

      console.log("Session verified - owner:", session.owner.toBase58());

      // Close session
      const closeTx = await program.methods
        .closeSession()
        .accounts({
          owner: admin.publicKey,
          session: sessionPda,
        })
        .signers([admin])
        .rpc();

      console.log("Session closed:", closeTx);

      // Verify session is closed
      const sessionInfo = await connection.getAccountInfo(sessionPda);
      expect(sessionInfo).to.be.null;

      console.log("Session lifecycle complete");
    });

    it("submits query within session and tracks stats", async function () {
      this.timeout(60000);
      console.log("\n=== Session Query Stats Test ===");

      const sessionId = new BN(Date.now());
      const [sessionPda] = PublicKey.findProgramAddressSync(
        [SESSION_SEED, admin.publicKey.toBuffer(), sessionId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Open session
      await program.methods
        .openSession(sessionId)
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      // Submit query within session
      const queryId = new BN(Date.now() * 1000);
      const predicate = createRawPredicate(BigInt(1_000_000), BigInt(10_000_000));
      const poolAddress = Keypair.generate().publicKey;

      const [queryStatePda] = PublicKey.findProgramAddressSync(
        [QUERY_SEED, admin.publicKey.toBuffer(), queryId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods
        .submitQuery(
          sessionId,
          queryId,
          Array.from(predicate) as number[],
          Array.from(new Uint8Array(32)) as number[],
          [poolAddress]
        )
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      // Verify query has session_id
      const queryState = await program.account.queryState.fetch(queryStatePda);
      expect(queryState.sessionId.toString()).to.equal(sessionId.toString());

      console.log("Query submitted with session_id:", queryState.sessionId.toString());

      // Clean up
      await program.methods
        .closeSession()
        .accounts({
          owner: admin.publicKey,
          session: sessionPda,
        })
        .signers([admin])
        .rpc();

      console.log("Session query stats test complete");
    });

    it("rejects expire_session on fresh session", async function () {
      this.timeout(60000);
      console.log("\n=== Session Expiration Test ===");

      const sessionId = new BN(Date.now());
      const [sessionPda] = PublicKey.findProgramAddressSync(
        [SESSION_SEED, admin.publicKey.toBuffer(), sessionId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Open session
      await program.methods
        .openSession(sessionId)
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .rpc();

      // Try to expire immediately
      try {
        await program.methods
          .expireSession()
          .accountsPartial({
            caller: admin.publicKey,
            owner: admin.publicKey,
            session: sessionPda,
          })
          .signers([admin])
          .rpc();

        expect.fail("Should reject expiration of fresh session");
      } catch (e: any) {
        expect(e.message).to.include("SessionNotExpired");
        console.log("Fresh session cannot be expired (timeout = 1 hour)");
      }

      // Clean up
      await program.methods
        .closeSession()
        .accounts({
          owner: admin.publicKey,
          session: sessionPda,
        })
        .signers([admin])
        .rpc();
    });
  });

  describe("Merkle Anchoring", () => {
    let anchorPda: PublicKey;

    before(async () => {
      [anchorPda] = PublicKey.findProgramAddressSync([ANCHOR_SEED], program.programId);
    });

    it("initializes Merkle anchor", async function () {
      this.timeout(60000);
      console.log("\n=== Initialize Anchor Test ===");

      try {
        // Check if anchor already exists
        await program.account.merkleAnchor.fetch(anchorPda);
        console.log("Anchor already initialized");
        return;
      } catch {
        // Anchor doesn't exist, initialize
      }

      const tx = await program.methods
        .initializeAnchor()
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      console.log("Initialize anchor tx:", tx);

      const anchor = await program.account.merkleAnchor.fetch(anchorPda);
      expect(anchor.authority.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(anchor.epoch.toNumber()).to.equal(0);
      expect(anchor.queryCount.toNumber()).to.equal(0);

      console.log("Anchor initialized with authority:", anchor.authority.toBase58());
    });

    it("posts batch with Merkle root", async function () {
      this.timeout(60000);
      console.log("\n=== Anchor Batch Test ===");

      // Get current anchor state
      let anchor = await program.account.merkleAnchor.fetch(anchorPda);
      const initialEpoch = anchor.epoch.toNumber();

      // Create a mock Merkle root
      const merkleRoot = new Uint8Array(32);
      crypto.getRandomValues(merkleRoot);
      const queryCount = new BN(10);

      const tx = await program.methods
        .anchorBatch(Array.from(merkleRoot) as number[], queryCount)
        .accounts({
          caller: admin.publicKey,
          anchor: anchorPda,
        })
        .signers([admin])
        .rpc();

      console.log("Anchor batch tx:", tx);

      // Verify anchor updated
      anchor = await program.account.merkleAnchor.fetch(anchorPda);
      expect(anchor.epoch.toNumber()).to.equal(initialEpoch + 1);
      expect(anchor.queryCount.toNumber()).to.equal(10);
      expect(anchor.latestRoot).to.deep.equal(Array.from(merkleRoot));

      console.log("Batch anchored - epoch:", anchor.epoch.toNumber());
    });

    it("rejects anchor_batch from unauthorized caller", async function () {
      this.timeout(60000);
      console.log("\n=== Unauthorized Anchor Test ===");

      const unauthorizedUser = Keypair.generate();

      // Fund the unauthorized user
      const airdropSig = await connection.requestAirdrop(unauthorizedUser.publicKey, 1e9);
      await connection.confirmTransaction(airdropSig);

      const merkleRoot = new Uint8Array(32);
      const queryCount = new BN(5);

      try {
        await program.methods
          .anchorBatch(Array.from(merkleRoot) as number[], queryCount)
          .accounts({
            caller: unauthorizedUser.publicKey,
            anchor: anchorPda,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Should reject unauthorized anchor batch");
      } catch (e: any) {
        expect(e.message).to.include("Unauthorized");
        console.log("Unauthorized anchor batch rejected");
      }
    });
  });
});
