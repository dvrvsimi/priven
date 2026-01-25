# Priven - Private Pool Queries on Solana

**Privacy-Preserving DeFi Queries Using Multi-Party Computation**

Priven enables private queries of Raydium liquidity pools without revealing your search criteria to anyone—not even the MPC nodes computing your results.

## Features

- **Private Search Criteria** - Your predicate (TVL range, filters) never visible to anyone
- **Verifiable Results** - BLS signatures ensure computation integrity
- **QuickNode Integration** - Fast, reliable Solana data access
- **MPC Privacy** - Arcium's threshold computation keeps secrets distributed

## Architecture

```
CLIENT
  1. Fetch pools from QuickNode
  2. Encrypt predicate (min_tvl, max_tvl)
  3. Submit query to Solana
         |
         v
MXE PROGRAM (On-chain)
  1. Read pool account data
  2. Queue computation with encrypted predicate
         |
         v
ARCIUM MPC CLUSTER
  1. Secret-share predicate (no node sees plaintext)
  2. Evaluate: tvl >= min && tvl <= max
  3. Encrypt results to user's key
         |
         v
CLIENT
  1. Retrieve encrypted result
  2. Decrypt locally
  3. See matching pool addresses
```

## QuickNode Integration

Priven demonstrates meaningful use of QuickNode RPC for privacy-preserving DeFi:

### Core RPC Methods Used

**1. getProgramAccounts** - Fetch all Raydium V4 pools
```typescript
const pools = await connection.getProgramAccounts(RAYDIUM_V4_PROGRAM, {
  filters: [{ dataSize: 752 }], // V4 pool size
  commitment: "confirmed",
});
```

**2. getMultipleAccounts** - Batch fetch selected pool data
```typescript
const accounts = await connection.getMultipleAccountsInfo(
  poolAddresses,
  "confirmed"
);
```

**3. getAccountInfo** - Retrieve MXE encryption keys
```typescript
const mxePublicKey = await getMXEPublicKey(connection, programId);
```

### Privacy Model

- **QuickNode sees:** Generic pool data requests (public anyway)
- **MPC nodes see:** Secret shares of your search criteria (never reconstructed)
- **Network sees:** An encrypted query transaction
- **Only you see:** Which pools match your criteria

This demonstrates how public data sources (QuickNode) can be combined with private computation (Arcium MPC) to enable privacy-preserving DeFi applications.

## Quick Start

### SDK Usage

```bash
npm install priven-sdk
```

```typescript
import { PrivenClient } from 'priven-sdk';
import { PublicKey } from '@solana/web3.js';

const client = new PrivenClient({
  proxyUrl: 'https://priven-proxy.fly.dev',
});

// Private account read
const result = await client.getAccountInfo(
  new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
);

console.log('Data:', result.data);
console.log('Verified:', result.verified);
console.log('Slot:', result.slot);
```

### Running the Proxy

```bash
cd proxy
cp .env.example .env
# Edit .env with your QuickNode RPC URL
cargo run
```

## Supported Methods

| Method | Status | Description |
|--------|--------|-------------|
| `getAccountInfo` | ✅ Ready | Single account read |
| `getMultipleAccounts` | ✅ Ready | Batch account reads |
| `simulateTransaction` | ✅ Ready | Transaction simulation |

## Security Model

### Cryptographically Guaranteed

- ✅ Response integrity via Merkle proofs
- ✅ Commitment binding (client can't change query after commit)
- ✅ Transport privacy via TLS

### Operationally Assumed

- Proxy does not log queries (auditable, open source)
- QuickNode executes correctly (inherent to any RPC usage)
- IP anonymity is out of scope (can add Tor/relay later)

## Project Structure

```
priven/
├── packages/
│   └── priven-sdk/       # TypeScript client SDK
├── proxy/                # Rust RPC proxy
├── demo/                 # Demo web app
├── plan.md              # Implementation plan
└── README.md            # This file
```

## Development

### Prerequisites

- Rust 1.75+
- Node.js 18+
- QuickNode API key

### Build

```bash
# Build proxy
cd proxy
cargo build --release

# Build SDK
cd packages/priven-sdk
npm install
npm run build
```

### Test

```bash
# Test proxy
cd proxy
cargo test

# Test SDK
cd packages/priven-sdk
npm test
```

## License

MIT

## Acknowledgements

Built for the Solana Privacy Hack with support from QuickNode.
