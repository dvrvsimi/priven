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

# List Raydium CPMM pools (200k+ pools on mainnet)
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
| `token_mint_0` | First token mint |
| `token_mint_1` | Second token mint |
| `reserve_0` | Token 0 reserve |
| `reserve_1` | Token 1 reserve |
| `lp_supply` | LP token supply |
| `status` | Pool status |
| `open_time` | Pool open time |

| Op | Description |
|----|-------------|
| `gte` | Greater than or equal |
| `lte` | Less than or equal |
| `eq` | Equal |
| `neq` | Not equal |

### `priven pools`

Discover Raydium CPMM pools from mainnet.

```bash
priven pools list                    # List pools
priven pools list --limit 50         # Show more pools
priven pools get <address>           # Get pool details
priven pools stats                   # Show pool statistics
```

### `priven session`

Session management (optional - queries work without sessions).

```bash
priven session open                  # Open a new query session
priven session list                  # List your active sessions
priven session close <session-id>    # Close session, return rent
priven session expire <session-id>   # Expire timed-out session
```

Sessions group queries for lifecycle management and stats tracking. They are optional - queries work without them using `session_id=0`.

### `priven anchor`

Merkle anchoring commands (TEE operator/admin).

```bash
priven anchor status                 # View current anchor state
priven anchor init                   # Initialize anchor (admin only)
priven anchor batch <root> <count>   # Post Merkle batch (operator)
```

Anchoring provides verifiable proof that queries were processed by the TEE. The TEE operator posts Merkle roots of query result hashes to L1.

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
