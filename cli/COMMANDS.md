# Priven CLI Commands

Privacy-preserving pool queries on Solana via MagicBlock TEE.

## Installation

```bash
npm install -g @priven/cli
# or
yarn global add @priven/cli
```

## Command Overview

| Command | Description |
|---------|-------------|
| `priven query` | Execute a privacy-preserving pool query |
| `priven pools list` | List Raydium V4 pools from mainnet |
| `priven pools get` | Get details for a specific pool |
| `priven pools stats` | Show pool statistics |
| `priven tee verify` | Verify TEE integrity (Intel TDX) |
| `priven tee info` | Display TEE configuration |
| `priven config show` | Display current configuration |
| `priven config init` | Initialize configuration file |

---

## `priven query`

Execute a privacy-preserving pool query. Fetches pools from **mainnet**, executes query on **devnet**.

### Usage

```bash
priven query [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--filter <expr>` | Filter expression (can be used multiple times) | **Required** |
| `--min-tvl <lamports>` | Minimum TVL threshold (deprecated, use --filter) | - |
| `--max-tvl <lamports>` | Maximum TVL threshold (deprecated, use --filter) | - |
| `--rpc-url <url>` | Devnet RPC URL for query execution | From config |
| `--mainnet-rpc <url>` | Mainnet RPC URL for pool fetching | QuickNode or public |
| `--wallet <path>` | Path to wallet keypair | From config |
| `--program-id <pubkey>` | Priven program ID | From config |
| `--max-pools <n>` | Maximum pools to include | 5 |
| `--timeout <ms>` | TEE execution timeout | 30000 |
| `--output <format>` | Output format: `json` or `table` | table |
| `--dry-run` | Show what would be done without executing | - |

### Filter Expressions

Format: `TYPE:OP:VALUE`

**Types:**
- `tvl` - Total Value Locked (tokenA + tokenB reserves)
- `balance` - Token balance
- `volume_24h` - 24-hour volume
- `fee_rate` - Fee rate
- `price` - Token price
- `apy` - Annual percentage yield
- `reserve_a` - Token A reserve
- `reserve_b` - Token B reserve
- `ratio` - Reserve ratio (basis points)

**Operations:**
- `gte` - Greater than or equal (>=)
- `lte` - Less than or equal (<=)
- `eq` - Equal (==)
- `neq` - Not equal (!=)

### Examples

```bash
# Find pools with TVL between 1M and 10M lamports
priven query --filter tvl:gte:1000000 --filter tvl:lte:10000000

# Dry run to see what would happen
priven query --filter tvl:gte:1000000 --filter tvl:lte:10000000 --dry-run

# Custom RPC and output format
priven query --filter tvl:gte:5000000 \
  --mainnet-rpc https://your-quicknode-endpoint.com \
  --output json

# Multiple filters (max 4)
priven query \
  --filter tvl:gte:1000000 \
  --filter tvl:lte:50000000 \
  --filter reserve_a:gte:500000
```

---

## `priven pools list`

List Raydium V4 pools from Solana mainnet.

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
# List top 20 pools by TVL
priven pools list

# List top 50 pools with minimum 10M TVL
priven pools list --limit 50 --min-tvl 10000000

# JSON output for scripting
priven pools list --output json --limit 10
```

---

## `priven pools get`

Get detailed information for a specific pool.

### Usage

```bash
priven pools get <address> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `address` | Pool address (base58 public key) | Yes |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Mainnet RPC URL | QuickNode or public |
| `--output <format>` | Output format: `json` or `table` | table |

### Examples

```bash
# Get pool details
priven pools get 7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX

# JSON output
priven pools get 7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX --output json
```

---

## `priven pools stats`

Show Raydium pool statistics from mainnet.

### Usage

```bash
priven pools stats [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Mainnet RPC URL | QuickNode or public |

### Examples

```bash
# Show pool statistics
priven pools stats
```

**Output includes:**
- Total pool count
- Total TVL
- Average TVL
- Min/Max pool TVL

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

## `priven tee info`

Display TEE configuration and validator information.

### Usage

```bash
priven tee info
```

### Examples

```bash
priven tee info
```

**Output includes:**
- MagicBlock RPC endpoints (devnet, mainnet, tee)
- Delegation program ID
- TEE validator public keys (TEE, US, EU, ASIA)
- Current configuration

---

## `priven config show`

Display the current Priven CLI configuration.

### Usage

```bash
priven config show
```

### Configuration Sources (priority order)

1. Environment variables (`PRIVEN_*`)
2. Config file (`.privenrc`, `.privenrc.json`, `priven.config.js`)
3. Default values

---

## `priven config init`

Initialize a `.privenrc` configuration file in the current directory.

### Usage

```bash
priven config init [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing config file |

### Examples

```bash
# Create new config file
priven config init

# Overwrite existing config
priven config init --force
```

### Default Configuration

```json
{
  "rpcUrl": "https://api.devnet.solana.com",
  "network": "devnet",
  "programId": "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM",
  "wallet": "~/.config/solana/id.json",
  "defaultMaxPools": 5,
  "teeRpc": "https://tee.magicblock.app"
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PRIVEN_RPC_URL` | Override RPC URL |
| `PRIVEN_NETWORK` | Override network (devnet/mainnet) |
| `PRIVEN_PROGRAM_ID` | Override program ID |
| `PRIVEN_WALLET` | Override wallet path |
| `PRIVEN_TEE_RPC` | Override TEE RPC endpoint |
| `QUICKNODE_MAINNET_RPC` | QuickNode mainnet endpoint for pool fetching |
| `QUICKNODE_DEVNET_RPC` | QuickNode devnet endpoint |

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Mainnet   │────▶│  Raydium    │
│  (priven)   │     │  (pools)    │     │  V4 Pools   │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       │ Encrypted predicate
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Devnet    │────▶│  MagicBlock │────▶│  Intel TDX  │
│  (execute)  │     │    TEE      │     │   Enclave   │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Privacy guarantees:**
- Predicate encrypted client-side (X25519 + AES-256-GCM)
- Decryption only in TEE (Intel TDX enclave)
- Results encrypted back to client
- On-chain observers see only ciphertext
