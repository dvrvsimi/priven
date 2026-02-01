/**
 * Shared test helpers and utilities
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { Priven } from "../target/types/priven";
import * as fs from "fs";
import * as os from "os";

// QuickNode devnet RPC (for program interactions)
export const QUICKNODE_DEVNET_RPC =
  process.env.QUICKNODE_DEVNET_RPC || "https://api.devnet.solana.com";

// QuickNode mainnet RPC (for Raydium pool fetching - V4 pools only exist on mainnet)
export const QUICKNODE_MAINNET_RPC =
  process.env.QUICKNODE_MAINNET_RPC || "https://api.mainnet-beta.solana.com";

// MagicBlock TEE Validator (devnet)
export const TEE_VALIDATOR = new PublicKey(
  "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"
);

// Seeds
export const QUERY_SEED = Buffer.from("query");
export const RESULT_SEED = Buffer.from("result");
export const CONFIG_SEED = Buffer.from("config");

// Constants matching lib.rs
export const MAX_POOLS = 5;

/**
 * Read keypair from JSON file
 */
export function readKpJson(path: string): Keypair {
  const file = fs.readFileSync(path);
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
}

/**
 * Get default admin keypair
 */
export function getAdmin(): Keypair {
  return readKpJson(`${os.homedir()}/.config/solana/id.json`);
}

/**
 * Set up Anchor provider with QuickNode
 */
export function setupProvider(): {
  connection: Connection;
  provider: AnchorProvider;
  program: Program<Priven>;
  admin: Keypair;
} {
  const connection = new Connection(QUICKNODE_DEVNET_RPC, "confirmed");
  const admin = getAdmin();
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const program = anchor.workspace.Priven as Program<Priven>;
  return { connection, provider, program, admin };
}

/**
 * Create a raw V2 predicate buffer (80 bytes for on-chain storage)
 * Format: [version: u8][filter_count: u8][filters: 11 bytes each][padding][nonce: 12][tag: 16]
 *
 * For unencrypted testing, we create the plaintext structure padded to 80 bytes
 */
export function createRawPredicate(minTvl: bigint, maxTvl: bigint): Uint8Array {
  const ENCRYPTED_SIZE = 80;
  const buffer = new ArrayBuffer(ENCRYPTED_SIZE);
  const view = new DataView(buffer);

  // V2 format: version=2, filter_count=2 (min TVL >= X, max TVL <= Y)
  view.setUint8(0, 2);  // version
  view.setUint8(1, 2);  // filter_count

  // Filter 1: TVL >= minTvl
  // [type: u8][op: u8][field: u8][value: u64 LE] = 11 bytes
  view.setUint8(2, 0);  // type = TVL (0)
  view.setUint8(3, 0);  // op = GTE (0)
  view.setUint8(4, 0);  // field = 0
  view.setBigUint64(5, minTvl, true);  // value

  // Filter 2: TVL <= maxTvl
  view.setUint8(13, 0);  // type = TVL (0)
  view.setUint8(14, 1);  // op = LTE (1)
  view.setUint8(15, 0);  // field = 0
  view.setBigUint64(16, maxTvl, true);  // value

  // Rest is padding + mock nonce/tag (program handles this gracefully)
  return new Uint8Array(buffer);
}

/**
 * Create a V2 predicate with Balance filter (for token account queries)
 */
export function createBalancePredicate(minBalance: bigint, maxBalance: bigint): Uint8Array {
  const ENCRYPTED_SIZE = 80;
  const buffer = new ArrayBuffer(ENCRYPTED_SIZE);
  const view = new DataView(buffer);

  view.setUint8(0, 2);  // version = 2
  view.setUint8(1, 2);  // filter_count = 2

  // Filter 1: Balance >= minBalance
  view.setUint8(2, 1);  // type = BALANCE (1)
  view.setUint8(3, 0);  // op = GTE (0)
  view.setUint8(4, 0);  // field = 0
  view.setBigUint64(5, minBalance, true);

  // Filter 2: Balance <= maxBalance
  view.setUint8(13, 1);  // type = BALANCE (1)
  view.setUint8(14, 1);  // op = LTE (1)
  view.setUint8(15, 0);  // field = 0
  view.setBigUint64(16, maxBalance, true);

  return new Uint8Array(buffer);
}

// =============================================================================
// NATIVE TEE EXECUTOR - Crypto runs natively (x86), not on-chain (BPF)
// =============================================================================

import { BN } from "@coral-xyz/anchor";
import { decryptResult } from "../client/src/encryption";

const ENCRYPTED_RESULT_SIZE = 189;

/**
 * Execute query NATIVELY - full crypto in Node.js, only storage on-chain
 *
 * This avoids the 1.4M CU limit by doing ALL crypto outside BPF:
 * - Native: decrypt predicate, evaluate pools, encrypt result (0 CUs)
 * - On-chain: submit_result just stores the bytes (~8k CUs)
 *
 * @param l1Program - L1 program (for fetching state)
 * @param erProgram - ER program (for submitting result to delegated account)
 * @param teePrivateKey - TEE's X25519 private key (PKCS8 format from generateKeyPair)
 */
export async function executeQueryNative(
  l1Program: Program<Priven>,
  erProgram: Program<Priven>,
  queryStatePda: PublicKey,
  wallet: Keypair,
  teePrivateKey: Uint8Array
): Promise<{ matchCount: number; encryptedResult: Uint8Array }> {
  // 1. Fetch query state from L1
  const queryState = await l1Program.account.queryState.fetch(queryStatePda);
  console.log("  [Native] Fetched query state");

  // 2. Decrypt predicate using ON-CHAIN data (proper E2E flow)
  const encryptedPredicate = new Uint8Array(queryState.encryptedPredicate);
  const userPubkey = new Uint8Array(queryState.userPubkey);

  const predicate = await decryptPredicateNative(encryptedPredicate, teePrivateKey, userPubkey);
  console.log("  [Native] Decrypted predicate, version:", predicate.version, "filters:", predicate.filters.length);

  // 3. Evaluate pools NATIVELY
  const pools = queryState.pools.slice(0, queryState.poolCount);
  const matches = evaluatePoolsNative(pools, predicate);
  console.log("  [Native] Evaluated pools, matches:", matches.length);

  // 4. Encrypt result NATIVELY
  const encryptedResult = await encryptResultNative(
    matches,
    new Uint8Array(queryState.userPubkey),
    teePrivateKey
  );
  console.log("  [Native] Encrypted result, length:", encryptedResult.length);

  // 5. Build padded result for on-chain storage
  const resultData = new Uint8Array(ENCRYPTED_RESULT_SIZE);
  resultData.set(encryptedResult.slice(0, ENCRYPTED_RESULT_SIZE));

  // 6. Submit to ER (account is delegated there) - just storage, ~8k CUs!
  const { Transaction } = await import("@solana/web3.js");

  const ix = await erProgram.methods
    .submitResult(
      Array.from(resultData) as number[],
      encryptedResult.length,
      true,
      queryState.owner,
      new BN(queryState.queryId.toString())
    )
    .accountsPartial({
      caller: wallet.publicKey,
      queryState: queryStatePda,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await erProgram.provider.connection.getLatestBlockhash()).blockhash;
  tx.sign(wallet);

  const sig = await erProgram.provider.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await erProgram.provider.connection.confirmTransaction(sig, "confirmed");

  // Get logs
  const txInfo = await erProgram.provider.connection.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (txInfo?.meta?.logMessages) {
    console.log("  [TX Logs]:", txInfo.meta.logMessages.slice(-5).join(" | "));
  }

  return { matchCount: matches.length, encryptedResult };
}

/**
 * Test decryption (exported for verification)
 */
export async function testDecryptPredicate(
  encrypted: Uint8Array,
  teePrivateKeyPkcs8: Uint8Array,
  userPublicKey: Uint8Array
): Promise<{ version: number; filters: any[] }> {
  return decryptPredicateNative(encrypted, teePrivateKeyPkcs8, userPublicKey);
}

/**
 * Decrypt predicate using Web Crypto (X25519 ECDH + AES-256-GCM)
 */
async function decryptPredicateNative(
  encrypted: Uint8Array,
  teePrivateKeyPkcs8: Uint8Array,
  userPublicKey: Uint8Array
): Promise<{ version: number; filters: { type: number; op: number; value: bigint }[] }> {
  // Parse: [ciphertext][nonce:12][tag:16]
  if (encrypted.length < 29) throw new Error("Encrypted predicate too short");

  const dataLen = encrypted.length - 28;
  const ciphertext = encrypted.slice(0, dataLen);
  const nonce = encrypted.slice(dataLen, dataLen + 12);
  const tag = encrypted.slice(dataLen + 12);

  // X25519 ECDH + HKDF + AES-GCM decrypt
  const teePrivateKey = await crypto.subtle.importKey("pkcs8", teePrivateKeyPkcs8, { name: "X25519" }, false, ["deriveBits"]);
  const userPubKey = await crypto.subtle.importKey("raw", userPublicKey, { name: "X25519" }, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "X25519", public: userPubKey }, teePrivateKey, 256);
  const sharedSecret = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("priven-v1") },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const ctWithTag = new Uint8Array(ciphertext.length + 16);
  ctWithTag.set(ciphertext);
  ctWithTag.set(tag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aesKey, ctWithTag);
  const bytes = new Uint8Array(plaintext);

  // Parse V1 or V2 predicate
  if (bytes[0] === 2) {
    const filters = [];
    for (let i = 0; i < bytes[1]; i++) {
      const off = 2 + i * 11;
      filters.push({
        type: bytes[off],
        op: bytes[off + 1],
        value: new DataView(bytes.buffer).getBigUint64(off + 3, true),
      });
    }
    return { version: 2, filters };
  }
  // V1: min_tvl, max_tvl
  const view = new DataView(bytes.buffer);
  return {
    version: 1,
    filters: [
      { type: 0, op: 0, value: view.getBigUint64(0, true) },  // TVL >= min
      { type: 0, op: 1, value: view.getBigUint64(8, true) },  // TVL <= max
    ]
  };
}

/**
 * Encrypt result using Web Crypto (X25519 ECDH + AES-256-GCM)
 */
async function encryptResultNative(
  matches: PublicKey[],
  userPublicKey: Uint8Array,
  teePrivateKeyPkcs8: Uint8Array
): Promise<Uint8Array> {
  // Build plaintext: [count:1][addresses:32*count]
  const plaintext = new Uint8Array(1 + matches.length * 32);
  plaintext[0] = matches.length;
  matches.forEach((addr, i) => plaintext.set(addr.toBytes(), 1 + i * 32));

  // Import keys
  const teePrivateKey = await crypto.subtle.importKey("pkcs8", teePrivateKeyPkcs8, { name: "X25519" }, false, ["deriveBits"]);
  const userPubKey = await crypto.subtle.importKey("raw", userPublicKey, { name: "X25519" }, false, []);

  // X25519 ECDH
  const sharedBits = await crypto.subtle.deriveBits({ name: "X25519", public: userPubKey }, teePrivateKey, 256);

  // HKDF
  const sharedSecret = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("priven-v1") },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Generate nonce from hash of plaintext (deterministic for reproducibility)
  const hashBuf = await crypto.subtle.digest("SHA-256", plaintext);
  const nonce = new Uint8Array(hashBuf).slice(0, 12);

  // AES-GCM encrypt
  const ctWithTag = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  // Format: [ciphertext][nonce:12][tag:16]
  const ct = ctWithTag.slice(0, ctWithTag.length - 16);
  const tag = ctWithTag.slice(ctWithTag.length - 16);
  const result = new Uint8Array(ct.length + 28);
  result.set(ct);
  result.set(nonce, ct.length);
  result.set(tag, ct.length + 12);
  return result;
}

/**
 * Evaluate pools against predicate
 */
function evaluatePoolsNative(
  pools: { address: PublicKey; tokenAReserve: BN; tokenBReserve: BN }[],
  predicate: { version: number; filters: any[] }
): PublicKey[] {
  return pools.filter(pool => {
    const tvl = BigInt(pool.tokenAReserve.toString()) + BigInt(pool.tokenBReserve.toString());
    return predicate.filters.every((f: any) => {
      const val = f.type === 0 ? tvl : BigInt(pool.tokenAReserve.toString());
      return f.op === 0 ? val >= f.value : f.op === 1 ? val <= f.value : f.op === 2 ? val === f.value : val !== f.value;
    });
  }).map(p => p.address);
}
