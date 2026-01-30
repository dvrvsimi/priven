# Priven - Private Pool Queries on Solana

**Privacy-Preserving DeFi Queries Using MagicBlock TEE**

Priven enables private queries of Raydium liquidity pools without revealing your search criteria to anyone—not validators, not observers, only you see your filter criteria.

## Features

- **Private Search Criteria** - Your predicate (TVL range, filters) encrypted end-to-end
- **TEE Execution** - MagicBlock Ephemeral Rollups with Intel TDX attestation
- **QuickNode Integration** - RPC for pool data, Streams for real-time events
- **End-to-End Encryption** - Only you can decrypt the results

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Client    │     │   Solana L1  │     │  MagicBlock  │     │   QuickNode  │
│     SDK      │     │   Program    │     │     TEE      │     │   RPC/Streams│
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │  1. Encrypt        │                    │                    │
       │     predicate      │                    │                    │
       │                    │                    │                    │
       │  2. Fetch pools    │                    │                    │
       │  ───────────────────────────────────────────────────────────►│
       │  ◄───────────────────────────────────────────────────────────│
       │                    │                    │                    │
       │  3. Submit query   │                    │                    │
       │  ─────────────────►│                    │                    │
       │                    │                    │                    │
       │  4. Delegate to    │                    │                    │
       │     TEE ──────────►│───────────────────►│                    │
       │                    │                    │                    │
       │                    │                    │  5. Fetch state    │
       │                    │                    │  ──────────────────►
       │                    │                    │  ◄──────────────────
       │                    │                    │                    │
       │                    │                    │  6. Decrypt        │
       │                    │                    │     predicate      │
       │                    │                    │                    │
       │                    │                    │  7. Evaluate       │
       │                    │                    │     pools          │
       │                    │                    │                    │
       │                    │                    │  8. Encrypt        │
       │                    │                    │     result         │
       │                    │                    │                    │
       │                    │  9. Store result   │                    │
       │                    │◄───────────────────│                    │
       │                    │                    │                    │
       │  10. Fetch +       │                    │                    │
       │      decrypt ◄─────│                    │                    │
       │      result        │                    │                    │
       │                    │                    │                    │
```

## QuickNode Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                     QuickNode Integration                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │   RPC Calls  │     │   Streams    │     │  Functions   │     │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘     │
│         │                    │                    │             │
│  getProgramAccounts    QuerySubmitted        Priority Fees      │
│  getMultipleAccounts   QueryExecuted         Smart Routing      │
│  getAccountInfo        Real-time events                         │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │  pools.ts    │     │  webhook/    │     │ quicknode.ts │     │
│  │  tokens.ts   │     │  server      │     │              │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Streams Event Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Solana L1   │────▶│ QuickNode Stream│────▶│   Webhook    │
│  (events)    │     │ (filter/notify) │     │ (TEE trigger)│
└──────────────┘     └─────────────────┘     └──────────────┘
       │                                            │
       │  QuerySubmitted                            │
       │  QueryExecuted                             ▼
       │                                    ┌──────────────┐
       │                                    │ TEE Executor │
       │                                    │   Service    │
       │                                    └──────────────┘
```

## Privacy Model

| Observer | What They See |
|----------|---------------|
| L1 Validators | Encrypted ciphertext only |
| QuickNode | Generic RPC calls (public data) |
| TEE Operator | Nothing (Intel TDX enclave) |
| Network Observers | Encrypted query + encrypted result |
| **Only You** | Plaintext criteria + matching pools |

## Quick Start

### Prerequisites

- Node.js 20+
- Rust 1.75+ / Anchor 0.30+
- Solana CLI
- QuickNode account

### Environment Setup

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Solana RPCs
QUICKNODE_DEVNET_RPC=https://your-endpoint.quiknode.pro
QUICKNODE_MAINNET_RPC=https://your-endpoint.quiknode.pro

# QuickNode Streams
QUICKNODE_API_KEY=your-api-key
QUICKNODE_STREAM_ID=your-stream-id
```

### Install & Run

```bash
npm install
cd client && npm install && npm run build

# Run tests
anchor test --skip-deploy
```

## Client SDK

```typescript
import { PrivenClient } from 'priven-client';

const client = new PrivenClient(connection, wallet);

// Private query - only you know the filter criteria
const matchingPools = await client.query({
  minTvl: BigInt(1_000_000),
  maxTvl: BigInt(10_000_000),
});
```

## Project Structure

```
priven/
├── programs/
│   └── priven/             # Anchor program
├── client/
│   └── src/
│       ├── client.ts       # PrivenClient SDK
│       ├── encryption.ts   # X25519 + AES-GCM
│       ├── tee.ts          # MagicBlock integration
│       └── pools.ts        # Raydium pool fetching
├── cli/                    # Command-line interface
├── tests/                  # Integration tests
├── webhook/                # QuickNode Streams server
└── README.md
```

## License

MIT

## Acknowledgements

Built for the Solana Hackathon with:
- [QuickNode](https://quicknode.com) - RPC and Streams
- [MagicBlock](https://magicblock.gg) - Ephemeral Rollups + TEE
