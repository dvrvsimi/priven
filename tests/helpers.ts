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
  "https://prettiest-withered-dew.solana-devnet.quiknode.pro/REDACTED_TOKEN/";

// QuickNode mainnet RPC (for Raydium pool fetching - V4 pools only exist on mainnet)
export const QUICKNODE_MAINNET_RPC =
  "https://orbital-nameless-gadget.solana-mainnet.quiknode.pro/d47e3bccd5b7218a357976d410b6e02f2d6cbc4e/";

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
