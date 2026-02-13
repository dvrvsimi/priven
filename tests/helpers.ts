/**
 * Shared test helpers and utilities
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env"), override: true });

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
export const CONFIG_SEED = Buffer.from("config");
export const SESSION_SEED = Buffer.from("session");
export const ANCHOR_SEED = Buffer.from("anchor");

// Constants matching lib.rs
export const MAX_POOLS = 20;

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
 * Query type discriminator (matches client/src/types.ts QueryType)
 */
export enum QueryType {
  CPMM_POOLS = 0,
  TOKEN_BALANCE = 1,
  TOKEN_OWNERSHIP = 2,
  TX_LOOKUP = 3,
}

/**
 * Create a raw predicate buffer (80 bytes for on-chain storage)
 * Format: [query_type: u8][filter_count: u8][filters: 11 bytes each][padding]
 *
 * For unencrypted testing, we create the plaintext structure padded to 80 bytes
 */
export function createRawPredicate(
  minTvl: bigint,
  maxTvl: bigint,
  queryType: QueryType = QueryType.CPMM_POOLS
): Uint8Array {
  const ENCRYPTED_SIZE = 80;
  const buffer = new ArrayBuffer(ENCRYPTED_SIZE);
  const view = new DataView(buffer);

  // v3 format: query_type at offset 0, filter_count at offset 1
  view.setUint8(0, queryType);  // query_type
  view.setUint8(1, 2);          // filter_count

  // Filter 1: TVL >= minTvl (starts at offset 2)
  // [type: u8][op: u8][reserved: u8][value: u64 LE] = 11 bytes
  view.setUint8(2, 6);  // type = TVL (6 in CPMM FilterType)
  view.setUint8(3, 0);  // op = GTE (0)
  view.setUint8(4, 0);  // reserved
  view.setBigUint64(5, minTvl, true);

  // Filter 2: TVL <= maxTvl (starts at offset 13)
  view.setUint8(13, 6);  // type = TVL (6)
  view.setUint8(14, 1);  // op = LTE (1)
  view.setUint8(15, 0);  // reserved
  view.setBigUint64(16, maxTvl, true);

  return new Uint8Array(buffer);
}

// =============================================================================
// NATIVE TEE EXECUTOR - Crypto runs natively (x86), not on-chain (BPF)
// =============================================================================

import { BN } from "@coral-xyz/anchor";

/**
 * Execute query NATIVELY - full crypto in Node.js, only event emission on-chain
 *
 * This avoids CU limits by doing ALL crypto outside BPF:
 * - Native: decrypt predicate, evaluate pools, encrypt result (0 CUs)
 * - On-chain: submit_result emits event with result (~8k CUs)
 */
export async function executeQueryNative(
  l1Program: Program<Priven>,
  erProgram: Program<Priven>,
  queryStatePda: PublicKey,
  wallet: Keypair,
  teePrivateKey: Uint8Array
): Promise<{ matchCount: number; encryptedResult: Uint8Array }> {
  const queryState = await l1Program.account.queryState.fetch(queryStatePda);
  console.log("  [Native] Fetched query state");

  const encryptedPredicate = new Uint8Array(queryState.encryptedPredicate);
  const userPubkey = new Uint8Array(queryState.userPubkey);

  const predicate = await decryptPredicateNative(encryptedPredicate, teePrivateKey, userPubkey);
  console.log("  [Native] Decrypted predicate, filters:", predicate.filters.length);

  // Evaluate using pool addresses (TEE fetches actual data via RPC)
  // For tests, we just return matching addresses based on mock logic
  const poolAddresses = queryState.poolAddresses.slice(0, queryState.poolCount);
  const matches = poolAddresses; // In real TEE, this would fetch and evaluate
  console.log("  [Native] Mock evaluation, matches:", matches.length);

  const encryptedResult = await encryptResultNative(
    matches,
    new Uint8Array(queryState.userPubkey),
    teePrivateKey
  );
  console.log("  [Native] Encrypted result, length:", encryptedResult.length);

  const { Transaction } = await import("@solana/web3.js");

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], erProgram.programId);

  // Compute result hash
  const resultHashBuffer = await crypto.subtle.digest("SHA-256", encryptedResult);
  const resultHash = new Uint8Array(resultHashBuffer);

  const ix = await erProgram.methods
    .submitResult(
      Buffer.from(encryptedResult),
      matches.length,
      true,
      Array.from(resultHash) as number[],
      queryState.owner,
      new BN(queryState.queryId.toString())
    )
    .accountsPartial({
      caller: wallet.publicKey,
      queryState: queryStatePda,
      config: configPda,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await erProgram.provider.connection.getLatestBlockhash()).blockhash;
  tx.sign(wallet);

  const sig = await erProgram.provider.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await erProgram.provider.connection.confirmTransaction(sig, "confirmed");

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
 * Decrypt predicate using Web Crypto (X25519 ECDH + AES-256-GCM)
 */
async function decryptPredicateNative(
  encrypted: Uint8Array,
  teePrivateKeyPkcs8: Uint8Array,
  userPublicKey: Uint8Array
): Promise<{ filters: { type: number; op: number; value: bigint }[] }> {
  if (encrypted.length < 29) throw new Error("Encrypted predicate too short");

  const dataLen = encrypted.length - 28;
  const ciphertext = encrypted.slice(0, dataLen);
  const nonce = encrypted.slice(dataLen, dataLen + 12);
  const tag = encrypted.slice(dataLen + 12);

  const teePrivateKey = await crypto.subtle.importKey("pkcs8", teePrivateKeyPkcs8, { name: "X25519" }, false, ["deriveBits"]);
  const userPubKey = await crypto.subtle.importKey("raw", userPublicKey, { name: "X25519" }, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "X25519", public: userPubKey }, teePrivateKey, 256);
  const sharedSecret = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("priven-v2") },
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

  // Parse predicate: [filter_count:1][filters:11*n]
  const filterCount = bytes[0];
  const filters = [];
  for (let i = 0; i < filterCount; i++) {
    const off = 1 + i * 11;
    filters.push({
      type: bytes[off],
      op: bytes[off + 1],
      value: new DataView(bytes.buffer).getBigUint64(off + 3, true),
    });
  }
  return { filters };
}

/**
 * Encrypt result using Web Crypto (X25519 ECDH + AES-256-GCM)
 */
async function encryptResultNative(
  matches: PublicKey[],
  userPublicKey: Uint8Array,
  teePrivateKeyPkcs8: Uint8Array
): Promise<Uint8Array> {
  const plaintext = new Uint8Array(1 + matches.length * 32);
  plaintext[0] = matches.length;
  matches.forEach((addr, i) => plaintext.set(addr.toBytes(), 1 + i * 32));

  const teePrivateKey = await crypto.subtle.importKey("pkcs8", teePrivateKeyPkcs8, { name: "X25519" }, false, ["deriveBits"]);
  const userPubKey = await crypto.subtle.importKey("raw", userPublicKey, { name: "X25519" }, false, []);

  const sharedBits = await crypto.subtle.deriveBits({ name: "X25519", public: userPubKey }, teePrivateKey, 256);
  const sharedSecret = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("priven-v2") },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const hashBuf = await crypto.subtle.digest("SHA-256", plaintext);
  const nonce = new Uint8Array(hashBuf).slice(0, 12);

  const ctWithTag = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const ct = ctWithTag.slice(0, ctWithTag.length - 16);
  const tag = ctWithTag.slice(ctWithTag.length - 16);
  const result = new Uint8Array(ct.length + 28);
  result.set(ct);
  result.set(nonce, ct.length);
  result.set(tag, ct.length + 12);
  return result;
}
