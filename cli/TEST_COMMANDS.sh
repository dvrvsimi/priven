#!/bin/bash
# Priven CLI Test Commands
# Run each command to verify all options work correctly

# Set the CLI path
CLI="node /Users/mac/projects/priven/cli/dist/bin/priven.js"

echo "=============================================="
echo "PRIVEN CLI - FULL TEST SUITE"
echo "=============================================="

# ============================================
# CONFIG COMMANDS
# ============================================
echo ""
echo "=== CONFIG COMMANDS ==="
echo ""

echo "--- config show ---"
$CLI config show

echo ""
echo "--- config init (will fail if exists) ---"
$CLI config init

echo ""
echo "--- config init --force ---"
$CLI config init --force

# ============================================
# POOLS COMMANDS
# ============================================
echo ""
echo "=== POOLS COMMANDS ==="
echo ""

echo "--- pools list (default) ---"
$CLI pools list --limit 3

echo ""
echo "--- pools list --limit 5 ---"
$CLI pools list --limit 5

echo ""
echo "--- pools list --min-tvl 1000000000 --limit 3 ---"
$CLI pools list --min-tvl 1000000000 --limit 3

echo ""
echo "--- pools list --output json --limit 2 ---"
$CLI pools list --output json --limit 2

echo ""
echo "--- pools list --output table --limit 3 ---"
$CLI pools list --output table --limit 3

echo ""
echo "--- pools stats ---"
$CLI pools stats

echo ""
echo "--- pools get <address> (using first pool from list) ---"
# Get a real pool address first
POOL_ADDR=$($CLI pools list --output json --limit 1 | grep -o '"address":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$POOL_ADDR" ]; then
  echo "Testing with pool: $POOL_ADDR"
  $CLI pools get $POOL_ADDR
else
  echo "Could not get pool address, using hardcoded example"
  $CLI pools get 7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX
fi

echo ""
echo "--- pools get <address> --output json ---"
if [ -n "$POOL_ADDR" ]; then
  $CLI pools get $POOL_ADDR --output json
fi

# ============================================
# TEE COMMANDS
# ============================================
echo ""
echo "=== TEE COMMANDS ==="
echo ""

echo "--- tee info ---"
$CLI tee info

echo ""
echo "--- tee verify (may fail on network issues) ---"
$CLI tee verify || echo "(TEE verify failed - this is expected if network unavailable)"

echo ""
echo "--- tee verify --network devnet ---"
$CLI tee verify --network devnet || echo "(TEE verify failed - expected)"

echo ""
echo "--- tee verify --network mainnet ---"
$CLI tee verify --network mainnet || echo "(TEE verify failed - expected)"

# ============================================
# QUERY COMMANDS
# ============================================
echo ""
echo "=== QUERY COMMANDS ==="
echo ""

echo "--- query --dry-run (single filter) ---"
$CLI query --filter tvl:gte:1000000 --dry-run

echo ""
echo "--- query --dry-run (two filters) ---"
$CLI query --filter tvl:gte:1000000 --filter tvl:lte:10000000 --dry-run

echo ""
echo "--- query --dry-run (three filters) ---"
$CLI query --filter tvl:gte:1000000 --filter tvl:lte:50000000 --filter reserve_a:gte:500000 --dry-run

echo ""
echo "--- query --dry-run (four filters - max) ---"
$CLI query --filter tvl:gte:1000000 --filter tvl:lte:50000000 --filter reserve_a:gte:500000 --filter reserve_b:gte:500000 --dry-run

echo ""
echo "--- query --dry-run --max-pools 10 ---"
$CLI query --filter tvl:gte:1000000 --filter tvl:lte:10000000 --max-pools 10 --dry-run

echo ""
echo "--- query --dry-run --timeout 60000 ---"
$CLI query --filter tvl:gte:1000000 --filter tvl:lte:10000000 --timeout 60000 --dry-run

echo ""
echo "--- query --dry-run --output json ---"
$CLI query --filter tvl:gte:1000000 --filter tvl:lte:10000000 --output json --dry-run

echo ""
echo "--- query --dry-run --output table ---"
$CLI query --filter tvl:gte:1000000 --filter tvl:lte:10000000 --output table --dry-run

echo ""
echo "--- query with legacy --min-tvl --max-tvl (deprecated) ---"
$CLI query --min-tvl 1000000 --max-tvl 10000000 --dry-run

echo ""
echo "--- query error: no filters ---"
$CLI query --dry-run 2>&1 || echo "(Expected error - no filters)"

echo ""
echo "--- query error: too many filters (5+) ---"
$CLI query --filter tvl:gte:1 --filter tvl:lte:2 --filter reserve_a:gte:3 --filter reserve_b:gte:4 --filter balance:gte:5 --dry-run 2>&1 || echo "(Expected error - max 4 filters)"

echo ""
echo "--- query error: invalid filter format ---"
$CLI query --filter invalid --dry-run 2>&1 || echo "(Expected error - invalid filter)"

echo ""
echo "--- query error: invalid filter type ---"
$CLI query --filter unknowntype:gte:1000 --dry-run 2>&1 || echo "(Expected error - unknown type)"

echo ""
echo "--- query error: invalid filter op ---"
$CLI query --filter tvl:invalidop:1000 --dry-run 2>&1 || echo "(Expected error - invalid op)"

echo ""
echo "--- query error: mixing --filter with --min-tvl/--max-tvl ---"
$CLI query --filter tvl:gte:1000000 --min-tvl 1000000 --max-tvl 10000000 --dry-run 2>&1 || echo "(Expected error - cannot mix)"

# ============================================
# HELP COMMANDS
# ============================================
echo ""
echo "=== HELP COMMANDS ==="
echo ""

echo "--- priven --help ---"
$CLI --help

echo ""
echo "--- priven query --help ---"
$CLI query --help

echo ""
echo "--- priven pools --help ---"
$CLI pools --help

echo ""
echo "--- priven tee --help ---"
$CLI tee --help

echo ""
echo "--- priven config --help ---"
$CLI config --help

echo ""
echo "=============================================="
echo "TEST SUITE COMPLETE"
echo "=============================================="
