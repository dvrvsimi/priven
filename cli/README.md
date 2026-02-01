# @priven/cli

Command-line interface for privacy-preserving pool queries on Solana via MagicBlock TEE.

## Installation

```bash
npm install -g @priven/cli
```

## Quick Start

```bash
# Initialize config
priven config init

# List Raydium pools
priven pools list --limit 10

# Execute a private query
priven query --filter tvl:gte:1000000 --filter tvl:lte:10000000

# Verify TEE integrity
priven tee verify
```

## Commands

### `priven query`

Execute a privacy-preserving pool query.

```bash
priven query --filter tvl:gte:1000000 --filter tvl:lte:10000000
priven query --filter tvl:gte:5000000 --dry-run
priven query --filter tvl:gte:1000000 --max-pools 10 --output json
```

**Filter format**: `TYPE:OP:VALUE`

| Type | Description |
|------|-------------|
| `tvl` | Total Value Locked |
| `balance` | Token balance |
| `reserve_a` | Token A reserve |
| `reserve_b` | Token B reserve |
| `ratio` | Reserve ratio (basis points) |

| Op | Description |
|----|-------------|
| `gte` | Greater than or equal |
| `lte` | Less than or equal |
| `eq` | Equal |
| `neq` | Not equal |

### `priven pools`

Discover Raydium V4 pools from mainnet.

```bash
priven pools list                    # List top pools by TVL
priven pools list --limit 50         # Show more pools
priven pools list --min-tvl 10000000 # Filter by minimum TVL
priven pools get <address>           # Get pool details
priven pools stats                   # Show pool statistics
```

### `priven tee`

TEE verification commands.

```bash
priven tee info                  # Show TEE configuration
priven tee verify                # Verify TEE integrity
priven tee verify --network mainnet
```

### `priven config`

Configuration management.

```bash
priven config show               # Display current config
priven config init               # Create .privenrc file
priven config init --force       # Overwrite existing config
```

## Configuration

Create a `.privenrc` file or set environment variables:

```json
{
  "rpcUrl": "https://api.devnet.solana.com",
  "network": "devnet",
  "programId": "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM",
  "wallet": "~/.config/solana/id.json"
}
```

Environment variables (override config file):
- `PRIVEN_RPC_URL`
- `PRIVEN_NETWORK`
- `PRIVEN_PROGRAM_ID`
- `PRIVEN_WALLET`
- `QUICKNODE_MAINNET_RPC` - for pool fetching
- `QUICKNODE_DEVNET_RPC` - for query execution

## License

MIT
