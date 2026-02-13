# Priven CLI Commands

Privacy-preserving RPC layer for Solana via MagicBlock TEE.

## Installation

```bash
npm install -g @priven/cli
# or
yarn global add @priven/cli
```

## Command Overview

| Command | Description |
|---------|-------------|
| `priven query` | Execute a privacy-preserving CPMM pool query |
| `priven tokens balance` | Find wallets holding tokens within a balance range |
| `priven tokens holders` | Find all holders of a specific token |
| `priven tx check` | Check if a wallet has interacted with a program |
| `priven tx activity` | Check if a wallet has recent activity |
| `priven pools list` | List Raydium CPMM pools from mainnet |
| `priven pools get` | Get details for a specific pool |
| `priven pools stats` | Show pool statistics |
| `priven session open` | Open a query session |
| `priven session list` | List active sessions |
| `priven session close` | Close a session and reclaim rent |
| `priven anchor status` | Show Merkle anchor status |
| `priven tee verify` | Verify TEE integrity (Intel TDX) |
| `priven tee info` | Display TEE configuration |
| `priven config show` | Display current configuration |
| `priven config init` | Initialize configuration file |

---

## Query Types

Priven supports four query types, all executed privately in the TEE:

| Type | Command | Description |
|------|---------|-------------|
| CPMM Pools | `priven query` | Query Raydium CPMM pools by TVL, reserves, etc. |
| Token Balance | `priven tokens balance` | Find wallets by token holdings |
| Token Ownership | `priven tokens holders` | Find all holders of a token |
| Transaction Lookup | `priven tx check` | Check wallet/program interactions |

---

## `priven query`

Execute a privacy-preserving CPMM pool query. Fetches pools from **mainnet**, executes query on **devnet**.

### Usage

```bash
priven query [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--filter <expr>` | Filter expression (can be used multiple times) | **Required** |
| `--rpc-url <url>` | Devnet RPC URL for query execution | From config |
| `--mainnet-rpc <url>` | Mainnet RPC URL for pool fetching | QuickNode or public |
| `--wallet <path>` | Path to wallet keypair | From config |
| `--program-id <pubkey>` | Priven program ID | From config |
| `--max-pools <n>` | Maximum pools to include | 5 |
| `--timeout <ms>` | TEE execution timeout | 30000 |
| `--output <format>` | Output format: `json` or `table` | table |
| `--dry-run` | Show what would be done without executing | - |
| `--local` | Execute locally instead of TEE (development mode) | - |

### Filter Expressions

Format: `TYPE:OP:VALUE`

**Types (CPMM):**
- `token_mint_0` - First token mint
- `token_mint_1` - Second token mint
- `amm_config` - AMM configuration
- `status` - Pool status
- `reserve_0` - First token reserve
- `reserve_1` - Second token reserve
- `tvl` - Total Value Locked
- `lp_supply` - LP token supply
- `open_time` - Pool open time

**Operations:**
- `gte` - Greater than or equal (>=)
- `lte` - Less than or equal (<=)
- `eq` - Equal (==)
- `neq` - Not equal (!=)

### Examples

```bash
# Find pools with TVL >= 1B lamports
priven query --filter tvl:gte:1000000000

# Find pools with TVL between 1M and 10M
priven query --filter tvl:gte:1000000 --filter tvl:lte:10000000

# Dry run to see what would happen
priven query --filter tvl:gte:1000000 --dry-run

# Multiple filters (max 4)
priven query \
  --filter tvl:gte:1000000 \
  --filter reserve_0:gte:500000

# Local execution (development mode - no TEE)
priven query --filter tvl:gte:1000000 --local
```

### Execution Modes

| Mode | Command | Privacy | Use Case |
|------|---------|---------|----------|
| TEE | `priven query ...` | Full (requires TEE infrastructure) | Production |
| Local | `priven query ... --local` | None (you execute) | Development/Testing |
| Dry Run | `priven query ... --dry-run` | N/A (no execution) | Preview |

---

## `priven tokens balance`

Find wallets holding tokens within a balance range. Privacy-preserving - RPC providers don't see your query criteria.

### Usage

```bash
priven tokens balance <mint> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `mint` | Token mint address (base58 public key) | Yes |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--min <amount>` | Minimum token balance (smallest units) | - |
| `--max <amount>` | Maximum token balance (smallest units) | - |
| `--limit <n>` | Maximum results to return | 100 |
| `--rpc-url <url>` | Devnet RPC URL | From config |
| `--mainnet-rpc <url>` | Mainnet RPC URL | QuickNode or public |
| `--wallet <path>` | Path to wallet keypair | From config |
| `--timeout <ms>` | TEE execution timeout | 30000 |
| `--output <format>` | Output format: `json` or `table` | table |
| `--dry-run` | Show what would be done without executing | - |

### Examples

```bash
# Find wallets holding >= 1000 USDC (6 decimals)
priven tokens balance EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --min 1000000000

# Find wallets holding between 100-1000 tokens
priven tokens balance <MINT> --min 100000000 --max 1000000000

# Dry run
priven tokens balance EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --min 1000000000 --dry-run
```

### Use Cases

- **Whale tracking**: Find wallets with large token holdings
- **Airdrop targeting**: Identify holders meeting specific criteria
- **Market analysis**: Understand token distribution

---

## `priven tokens holders`

Find all holders of a specific token. Privacy-preserving ownership query.

### Usage

```bash
priven tokens holders <mint> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `mint` | Token mint address (base58 public key) | Yes |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <n>` | Maximum holders to return | 100 |
| `--rpc-url <url>` | Devnet RPC URL | From config |
| `--mainnet-rpc <url>` | Mainnet RPC URL | QuickNode or public |
| `--wallet <path>` | Path to wallet keypair | From config |
| `--timeout <ms>` | TEE execution timeout | 30000 |
| `--output <format>` | Output format: `json` or `table` | table |
| `--dry-run` | Show what would be done without executing | - |

### Examples

```bash
# Find all USDC holders (up to 100)
priven tokens holders EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Limit to 50 holders
priven tokens holders EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --limit 50

# Dry run
priven tokens holders EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --dry-run
```

### Use Cases

- **Community analysis**: Understand token holder demographics
- **Airdrop lists**: Generate holder snapshots privately
- **Governance**: Identify voting power distribution

---

## `priven tx check`

Check if a wallet has interacted with a specific program. Privacy-preserving transaction history lookup.

### Usage

```bash
priven tx check <wallet> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `wallet` | Wallet address to check | Yes |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--program <pubkey>` | Program ID to check interaction with | - |
| `--after-slot <slot>` | Only check transactions after this slot | - |
| `--before-slot <slot>` | Only check transactions before this slot | - |
| `--rpc-url <url>` | Devnet RPC URL | From config |
| `--mainnet-rpc <url>` | Mainnet RPC URL | QuickNode or public |
| `--wallet <path>` | Path to wallet keypair | From config |
| `--timeout <ms>` | TEE execution timeout | 30000 |
| `--output <format>` | Output format: `json` or `table` | table |
| `--dry-run` | Show what would be done without executing | - |

### Examples

```bash
# Check if wallet has used Token Program
priven tx check 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM \
  --program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

# Check interactions after a specific slot
priven tx check <WALLET> --program <PROGRAM> --after-slot 250000000

# Dry run
priven tx check <WALLET> --program <PROGRAM> --dry-run
```

### Use Cases

- **Compliance**: Check if wallet has interacted with specific protocols
- **Due diligence**: Verify wallet activity patterns
- **Eligibility**: Check program interaction for airdrops/rewards

### Limitations

- Limited to ~100 most recent transactions (no indexer)
- For full history, use a transaction indexer

---

## `priven tx activity`

Check if a wallet has any recent transaction activity.

### Usage

```bash
priven tx activity <wallet> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `wallet` | Wallet address to check | Yes |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--after-slot <slot>` | Only check activity after this slot | - |
| `--limit <n>` | Maximum transactions to check | 100 |
| `--rpc-url <url>` | Devnet RPC URL | From config |
| `--mainnet-rpc <url>` | Mainnet RPC URL | QuickNode or public |
| `--wallet <path>` | Path to wallet keypair | From config |
| `--timeout <ms>` | TEE execution timeout | 30000 |
| `--output <format>` | Output format: `json` or `table` | table |
| `--dry-run` | Show what would be done without executing | - |

### Examples

```bash
# Check if wallet is active
priven tx activity 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM

# Check activity after specific slot
priven tx activity <WALLET> --after-slot 250000000

# Dry run
priven tx activity <WALLET> --dry-run
```

### Use Cases

- **Dead wallet detection**: Identify inactive wallets
- **Activity verification**: Confirm wallet is being used
- **Filtering**: Exclude inactive addresses from lists

---

## `priven pools list`

List Raydium CPMM pools from Solana mainnet.

### Usage

```bash
priven pools list [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Mainnet RPC URL | QuickNode or public |
| `--min-tvl <lamports>` | Minimum TVL filter | - |
| `--limit <n>` | Maximum pools to display | 20 |
| `--output <format>` | Output format: `json` or `table` | table |

### Examples

```bash
# List top 20 pools
priven pools list

# List top 50 pools with minimum 10M TVL
priven pools list --limit 50 --min-tvl 10000000

# JSON output
priven pools list --output json --limit 10
```

---

## `priven session open`

Open a query session for grouping multiple queries.

### Usage

```bash
priven session open [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Devnet RPC URL | From config |
| `--wallet <path>` | Path to wallet keypair | From config |

### Examples

```bash
# Open a new session
priven session open
```

---

## `priven session list`

List active query sessions.

### Usage

```bash
priven session list [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Devnet RPC URL | From config |
| `--wallet <path>` | Path to wallet keypair | From config |
| `--output <format>` | Output format: `json` or `table` | table |

### Examples

```bash
# List all active sessions
priven session list
```

---

## `priven session close`

Close a session and reclaim rent.

### Usage

```bash
priven session close <session_id> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `session_id` | Session ID to close | Yes |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Devnet RPC URL | From config |
| `--wallet <path>` | Path to wallet keypair | From config |

### Examples

```bash
# Close session and get rent back
priven session close 1234567890
```

---

## `priven anchor status`

Show Merkle anchoring status for query verification.

### Usage

```bash
priven anchor status [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Devnet RPC URL | From config |

### Examples

```bash
# Show anchor status
priven anchor status
```

**Output includes:**
- Current epoch
- Latest Merkle root
- Query count
- Anchor slot

---

## `priven tee verify`

Verify TEE integrity using Intel TDX remote attestation.

### Usage

```bash
priven tee verify [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--network <network>` | Network: `devnet` or `mainnet` | devnet |

### Examples

```bash
# Verify TEE on devnet
priven tee verify

# Verify TEE on mainnet
priven tee verify --network mainnet
```

---

## `priven config show`

Display the current Priven CLI configuration.

### Usage

```bash
priven config show
```

### Configuration Sources (priority order)

1. Environment variables (`PRIVEN_*`)
2. Config file (`.privenrc`, `.privenrc.json`)
3. Default values

---

## `priven config init`

Initialize a `.privenrc` configuration file.

### Usage

```bash
priven config init [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing config file |

### Default Configuration

```json
{
  "network": "devnet",
  "programId": "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM",
  "wallet": "~/.config/solana/id.json"
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `QUICKNODE_MAINNET_RPC` | QuickNode mainnet endpoint (for pool/token data) |
| `QUICKNODE_DEVNET_RPC` | QuickNode devnet endpoint |
| `PRIVEN_RPC_URL` | Override devnet RPC URL |
| `PRIVEN_PROGRAM_ID` | Override program ID |
| `PRIVEN_WALLET` | Override wallet path |
| `TEE_ECDH_PUBKEY_HEX` | TEE X25519 public key for encryption |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Query Types                              │
├─────────────────────────────────────────────────────────────┤
│  CPMM_POOLS (0)    │  Pool queries (TVL, reserves)         │
│  TOKEN_BALANCE (1) │  Wallet token holdings                │
│  TOKEN_OWNERSHIP(2)│  Token holder discovery               │
│  TX_LOOKUP (3)     │  Transaction/program interactions     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Mainnet   │────▶│  Data       │
│  (priven)   │     │   (data)    │     │  (pools,    │
└─────────────┘     └─────────────┘     │  tokens,tx) │
       │                                └─────────────┘
       │ Encrypted predicate (80 bytes)
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Devnet    │────▶│    TEE      │────▶│  Intel TDX  │
│  (submit)   │     │  Executor   │     │   Enclave   │
└─────────────┘     └─────────────┘     └─────────────┘
```

## TEE Execution Options

| Option | Description | Privacy |
|--------|-------------|---------|
| **MagicBlock TEE** | Their infrastructure runs executor | Full (Intel TDX) |
| **Self-Hosted TDX** | Your Intel TDX VM runs executor | Full (you control) |
| **Local (`--local`)** | Your machine executes | None (development only) |

For production privacy, you need either MagicBlock partnership or your own Intel TDX infrastructure.
See main README for setup instructions.

**Privacy guarantees (with TEE):**
- Predicate encrypted client-side (X25519 + AES-256-GCM)
- Query type, filters, thresholds hidden from RPC
- Decryption only in TEE (Intel TDX enclave)
- Results encrypted back to client
- On-chain observers see only 80-byte ciphertext
