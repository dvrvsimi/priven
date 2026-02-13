# @priven/client

Privacy-preserving pool queries on Solana using MagicBlock TEE.

## Installation

```bash
npm install @priven/client
```

## Quick Start

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { PrivenSession, discoverCpmmPools, FilterType, FilterOp } from "@priven/client";

// Setup
const connection = new Connection("https://api.devnet.solana.com");
const wallet = Keypair.fromSecretKey(/* your keypair */);

// Discover CPMM pools from mainnet
const mainnetConn = new Connection("https://api.mainnet-beta.solana.com");
const pools = await discoverCpmmPools(mainnetConn, { limit: 20 });

// Build predicate (v2 format)
const predicate = {
  filters: [
    { type: FilterType.TVL, op: FilterOp.GTE, value: BigInt(1_000_000) },
    { type: FilterType.TVL, op: FilterOp.LTE, value: BigInt(50_000_000) },
  ]
};

// Execute private query via session
const session = await PrivenSession.open(program, wallet, connection);
const result = await session.query(predicate, pools);
await session.close();

console.log("Matching pools:", result.matches);
```

## Features

- **Private Queries**: Search criteria encrypted with X25519 + AES-256-GCM
- **TEE Execution**: Queries run inside MagicBlock's Intel TDX enclave
- **CPMM Integration**: Query 200k+ Raydium CPMM pools on mainnet
- **Session Management**: Group queries for lifecycle and stats tracking
- **Merkle Anchoring**: Verifiable proof of TEE execution on L1

## Predicate Format (v2)

```typescript
import { FilterType, FilterOp, Predicate } from "@priven/client";

const predicate: Predicate = {
  filters: [
    { type: FilterType.TVL, op: FilterOp.GTE, value: BigInt(1_000_000) },
    { type: FilterType.RESERVE_0, op: FilterOp.LTE, value: BigInt(100_000_000) },
  ]
};
```

### Filter Types (CPMM)

| FilterType | Description | Offset |
|------------|-------------|--------|
| `TOKEN_MINT_0` | First token mint | 168 |
| `TOKEN_MINT_1` | Second token mint | 200 |
| `AMM_CONFIG` | AMM configuration | 8 |
| `STATUS` | Pool status | 329 |
| `RESERVE_0` | Token 0 reserve (from vault) | - |
| `RESERVE_1` | Token 1 reserve (from vault) | - |
| `TVL` | Total value locked | - |
| `LP_SUPPLY` | LP token supply | 333 |
| `OPEN_TIME` | Pool open time | 373 |

### Filter Operations

| FilterOp | Description |
|----------|-------------|
| `GTE` | Greater than or equal |
| `LTE` | Less than or equal |
| `EQ` | Equal |
| `NEQ` | Not equal |

## Pool Discovery

```typescript
import { discoverCpmmPools, discoverCpmmPoolsWithRetry } from "@priven/client";

// Simple discovery
const pools = await discoverCpmmPools(connection, { limit: 100 });

// With retry logic
const pools = await discoverCpmmPoolsWithRetry(connection, {
  tokenMint: new PublicKey("..."), // Optional: filter by token
  limit: 50,
});
```

## Session-Based API

Sessions provide lifecycle management and stats tracking:

```typescript
import { PrivenSession } from "@priven/client";

// Open session (creates on-chain account)
const session = await PrivenSession.open(program, wallet, connection);

// Execute queries within session
const result1 = await session.query(predicate1, pools);
const result2 = await session.query(predicate2, pools);

// Close session (returns rent)
await session.close();
```

## Direct Encryption

```typescript
import { encryptPredicate, decryptResult } from "@priven/client";

// Encrypt predicate for TEE
const encrypted = await encryptPredicate(predicate, teePublicKey);
// encrypted.ciphertext - send to chain
// encrypted.publicKey - user's ephemeral public key
// encrypted.privateKey - keep secret for decryption

// Decrypt result from TEE
const result = await decryptResult(
  encryptedResult,
  encrypted.privateKey,
  teePublicKey
);
```

## Constants

```typescript
import {
  PRIVEN_PROGRAM_ID,
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_SIZE,
  QUERY_SEED,
  SESSION_SEED,
  ANCHOR_SEED,
} from "@priven/client";
```

## Types

```typescript
import type {
  Predicate,
  Filter,
  QueryResult,
  QueryOptions,
  QueryExecutedEvent,
  QuerySessionAccount,
  MerkleAnchorAccount,
} from "@priven/client";
```

## License

MIT
