# @priven/sdk

Privacy-preserving pool queries on Solana using MagicBlock TEE.

## Installation

```bash
npm install @priven/sdk
```

## Quick Start

```typescript
import { createPrivenClient, PredicateBuilder } from "@priven/sdk";
import { Connection, Keypair } from "@solana/web3.js";

// Setup
const connection = new Connection("https://api.devnet.solana.com");
const wallet = Keypair.fromSecretKey(/* your keypair */);

// Create client
const client = await createPrivenClient(connection, wallet);

// Build encrypted predicate
const predicate = new PredicateBuilder()
  .tvlBetween(BigInt(1_000_000), BigInt(10_000_000))
  .build();

// Execute private query
const matchingPools = await client.query(predicate);
console.log("Matching pools:", matchingPools);
```

## Features

- **Private Queries**: Search criteria encrypted with X25519 + AES-256-GCM
- **TEE Execution**: Queries run inside MagicBlock's Intel TDX enclave
- **Raydium Integration**: Query 700k+ Raydium V4 pools on mainnet
- **Flexible Filters**: TVL, balance, volume, reserves, and more

## Predicate Builder

```typescript
import { PredicateBuilder } from "@priven/sdk";

const predicate = new PredicateBuilder()
  .tvlBetween(BigInt(1_000_000), BigInt(50_000_000))
  .minReserveRatio(40) // 40% minimum balance ratio
  .build();
```

### Available Filters

| Method | Description |
|--------|-------------|
| `tvlBetween(min, max)` | Filter by Total Value Locked |
| `balanceBetween(min, max)` | Filter by token balance |
| `minReserveRatio(percent)` | Minimum reserve ratio (0-100) |
| `addFilter(type, op, value)` | Custom filter |

## Direct Encryption

```typescript
import { encryptPredicate, decryptResult } from "@priven/sdk";

// Encrypt a predicate
const encrypted = await encryptPredicate(predicate, teePublicKey);

// Decrypt results
const result = await decryptResult(encryptedResult, privateKey, teePublicKey);
```

## Pool Fetching

```typescript
import { fetchRaydiumPoolsWithRetry, calculateTVL } from "@priven/sdk";

const pools = await fetchRaydiumPoolsWithRetry(connection, {
  status: 6, // Active pools only
  minTvlPrefilter: BigInt(1_000_000),
});

pools.forEach(pool => {
  console.log(pool.address.toBase58(), calculateTVL(pool));
});
```

## License

MIT
