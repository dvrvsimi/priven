/**
 * priven query - Execute a privacy-preserving pool query
 *
 * Uses PrivenClient to execute the full TEE flow:
 * 1. Fetch pools from QuickNode
 * 2. Encrypt predicate (AES-256-GCM)
 * 3. Submit query to L1 (creates QueryState)
 * 4. Delegate QueryState to TEE
 * 5. Execute query in TEE
 * 6. Commit and fetch results
 *
 * Supports both V1 (--min-tvl/--max-tvl) and V2 (--filter) predicates.
 */
import { Command } from "commander";
export declare function registerQueryCommand(program: Command): void;
