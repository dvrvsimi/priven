# Priven - Private RPC Layer for Solana

**Privacy-Preserving Queries Using Intel TDX TEE**

Priven enables private queries on Solana without revealing your search criteria to anyone—not validators, not RPC providers, only you see your filter criteria and results.

## Query Types

| Type | Description | Example Use Case |
|------|-------------|------------------|
| **CPMM Pools** | Filter Raydium pools by TVL/reserves | DeFi trading strategies |
| **Token Balance** | Find wallets holding >= X of token Y | Whale tracking |
| **Token Ownership** | Find all holders of token Y | Airdrop targeting |
| **Transaction Lookup** | Check wallet interactions with programs | Compliance, wallet profiling |

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Client    │     │   Solana L1  │     │   TEE        │     │   RPC        │
│    (CLI)     │     │   (devnet)   │     │ (Intel TDX)  │     │  (mainnet)   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │  1. Fetch data     │                    │                    │
       │  ───────────────────────────────────────────────────────────►│
       │  ◄───────────────────────────────────────────────────────────│
       │                    │                    │                    │
       │  2. Encrypt        │                    │                    │
       │     predicate      │                    │                    │
       │  (X25519+AES-GCM)  │                    │                    │
       │                    │                    │                    │
       │  3. Submit query   │                    │                    │
       │  ─────────────────►│                    │                    │
       │                    │                    │                    │
       │  4. TEE executes   │                    │                    │
       │                    │◄───────────────────│                    │
       │                    │  decrypt, evaluate │                    │
       │                    │  encrypt result    │                    │
       │                    │───────────────────►│                    │
       │                    │                    │                    │
       │  5. Fetch +        │                    │                    │
       │     decrypt result │                    │                    │
       │  ◄─────────────────│                    │                    │
```

## Privacy Model

| Observer | What They See |
|----------|---------------|
| L1 Validators | Encrypted 80-byte ciphertext only |
| RPC Providers | Generic account fetches (public data) |
| TEE Operator | Nothing (Intel TDX hardware isolation) |
| Network Observers | Encrypted query + encrypted result |
| **Only You** | Plaintext criteria + matching results |

## Installation

```bash
# Install CLI globally
npm install -g @priven/cli

# Or use from source
git clone https://github.com/priven/priven
cd priven
npm install
```

## Quick Start

```bash
# Initialize config
priven config init

# List available pools (public data)
priven pools list --limit 10

# Private pool query
priven query --filter tvl:gte:1000000

# Private token balance query
priven tokens balance EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --min 1000000000

# Check wallet interactions (private)
priven tx check <WALLET> --program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
```

## TEE Execution Options

Priven requires a Trusted Execution Environment to maintain privacy. Three options:

### Option 1: Local Execution (Development)

For testing and development, run queries locally. **No privacy guarantees** - you execute the query yourself.

```bash
priven query --filter tvl:gte:1000000 --local
```

Requires your wallet to be set as `tee_validator` in the program config.

### Option 2: MagicBlock TEE (Partnership)

MagicBlock provides TEE infrastructure via Ephemeral Rollups. Requires:
- MagicBlock partnership to run Priven executor in their TEE
- Their TEE validator key in your program config

```bash
priven query --filter tvl:gte:1000000
# Delegates to MagicBlock TEE, waits for execution
```

### Option 3: Self-Hosted Intel TDX

Run your own TEE on Intel TDX hardware:

**Cloud Options:**
- Azure Confidential VMs (DCesv5/ECesv5 series)
- GCP Confidential VMs (N2D with SEV-SNP/TDX)
- AWS Nitro Enclaves

**Requirements:**
1. Intel 4th Gen Xeon Scalable (Sapphire Rapids) or newer
2. TDX enabled in BIOS/firmware
3. DCAP attestation setup
4. TEE executor service deployed

```bash
# Deploy TEE executor (inside confidential VM)
cd tee-executor
npm install
npm start

# Register TEE's public key as validator
priven config update --tee-validator <TEE_PUBKEY>
```

## Project Structure

```
priven/
├── programs/priven/       # Anchor on-chain program
├── client/                # TypeScript SDK
│   ├── src/
│   │   ├── client.ts      # PrivenClient
│   │   ├── encryption.ts  # X25519 + AES-256-GCM
│   │   ├── pools.ts       # Raydium pool discovery
│   │   ├── tokens.ts      # Token account discovery
│   │   ├── transactions.ts # Transaction lookup
│   │   └── tee.ts         # TEE session management
├── cli/                   # Command-line interface
├── webhook/               # QuickNode Streams webhook (monitoring)
├── tests/                 # Integration tests
└── scripts/               # Deployment & migration scripts
```

## Client SDK

```typescript
import { createPrivenClient, createPredicate, FilterType, FilterOp } from '@priven/client';

const client = await createPrivenClient(connection, wallet);

// Build predicate
const predicate = createPredicate([
  { type: FilterType.TVL, op: FilterOp.GTE, value: 1_000_000n },
  { type: FilterType.TVL, op: FilterOp.LTE, value: 10_000_000n },
]);

// Execute private query
const matchingPools = await client.query(predicate);

// Or with local execution (development)
const matchingPools = await client.queryLocal(predicate);
```

## Environment Variables

```env
# Solana RPCs
QUICKNODE_DEVNET_RPC=https://your-endpoint.solana-devnet.quiknode.pro/xxx
QUICKNODE_MAINNET_RPC=https://your-endpoint.solana-mainnet.quiknode.pro/xxx

# TEE Configuration
TEE_ECDH_PUBKEY_HEX=<32-byte-hex-pubkey-for-encryption>
```

## On-Chain Program

Deployed to Solana devnet:
- **Program ID:** `EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM`

### Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize` | Set up program config (admin, TEE validator) |
| `submit_query` | Submit encrypted query with data addresses |
| `delegate_query` | Delegate query state to TEE |
| `submit_result` | TEE submits encrypted result |
| `close_query` | Close completed query, reclaim rent |
| `open_session` | Open query session for batching |
| `close_session` | Close session, reclaim rent |
| `anchor_batch` | Post Merkle root of query batch |

## Testing

```bash
# Run all tests
anchor test --skip-deploy

# Run specific test suite
npx mocha tests/query-types.ts --timeout 60000
npx mocha tests/core.ts --timeout 60000
npx mocha tests/tee.ts --timeout 120000
```

## Security Considerations

1. **Predicate Privacy**: Filter criteria encrypted with X25519 ECDH + AES-256-GCM
2. **Result Privacy**: Results encrypted back to client's ephemeral key
3. **TEE Trust**: Requires trust in Intel TDX and TEE operator
4. **On-Chain Visibility**: Only 80-byte ciphertext visible on-chain
5. **RPC Privacy**: Data fetched via standard RPC (public), only filters are private

## Limitations

- **Transaction Lookup**: Limited to ~100 most recent transactions (no indexer)
- **Token Discovery**: Large token holder sets may hit RPC limits
- **TEE Availability**: Requires TEE infrastructure to be running
- **Devnet Only**: Currently deployed to Solana devnet

## License

MIT

## Acknowledgements

- [Solana](https://solana.com) - L1 blockchain
- [MagicBlock](https://magicblock.gg) - Ephemeral Rollups + TEE
- [QuickNode](https://quicknode.com) - RPC infrastructure