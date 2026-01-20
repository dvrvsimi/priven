# Priven

**Privacy-preserving RPC Layer for Solana**

Priven provides verifiable, privacy-preserving read and simulation access to Solana state by decoupling user identity from query semantics.

## Features

- 🔒 **Private Reads** - Query accounts without revealing intent to the RPC
- ✅ **Verifiable Responses** - Merkle proofs ensure data integrity
- ⚡ **Low Latency** - Minimal overhead (<50ms) over standard RPC calls
- wincode for deserialization

## Architecture

```
Client SDK → Private RPC Proxy → QuickNode RPC
     ↑              |
     └── Proof ────←┘
```

1. Client generates a **commitment** (hash) of the query
2. Proxy validates commitment and forwards to QuickNode
3. Response includes **Merkle proof** of account state
4. Client **verifies** the proof locally

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
