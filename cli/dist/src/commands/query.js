"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerQueryCommand = registerQueryCommand;
const web3_js_1 = require("@solana/web3.js");
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../config");
const wallet_1 = require("../utils/wallet");
const output_1 = require("../utils/output");
const progress_1 = require("../utils/progress");
// Filter type mapping (matches SDK FilterType enum)
const FILTER_TYPES = {
    tvl: 0,
    balance: 1,
    volume_24h: 2,
    fee_rate: 3,
    price: 4,
    apy: 5,
    reserve_a: 6,
    reserve_b: 7,
    ratio: 8,
    mint: 9,
    program: 10,
    slot_age: 11,
};
// Filter operation mapping (matches SDK FilterOp enum)
const FILTER_OPS = {
    gte: 0, // >=
    lte: 1, // <=
    eq: 2, // ==
    neq: 3, // !=
};
/**
 * Parse a filter expression like "tvl:gte:1000000" into a Filter object
 */
function parseFilterExpression(expr) {
    const parts = expr.toLowerCase().split(":");
    if (parts.length !== 3) {
        throw new Error(`Invalid filter format: "${expr}". Expected TYPE:OP:VALUE (e.g., tvl:gte:1000000)`);
    }
    const [typeName, opName, valueStr] = parts;
    const type = FILTER_TYPES[typeName];
    if (type === undefined) {
        throw new Error(`Unknown filter type: "${typeName}". Valid types: ${Object.keys(FILTER_TYPES).join(", ")}`);
    }
    const op = FILTER_OPS[opName];
    if (op === undefined) {
        throw new Error(`Unknown filter operation: "${opName}". Valid ops: ${Object.keys(FILTER_OPS).join(", ")}`);
    }
    let value;
    try {
        value = BigInt(valueStr);
    }
    catch {
        throw new Error(`Invalid value: "${valueStr}". Must be a valid integer.`);
    }
    return { type, op, value };
}
/**
 * Collect multiple --filter options into an array
 */
function collectFilters(value, previous) {
    return previous.concat([value]);
}
function registerQueryCommand(program) {
    program
        .command("query")
        .description("Execute a privacy-preserving pool query")
        .option("--min-tvl <lamports>", "Minimum TVL threshold (V1 predicate, deprecated)")
        .option("--max-tvl <lamports>", "Maximum TVL threshold (V1 predicate, deprecated)")
        .option("--filter <expr>", "Filter expression: TYPE:OP:VALUE (e.g., tvl:gte:1000000). Can be used multiple times.", collectFilters, [])
        .option("--rpc-url <url>", "Solana RPC URL (default: from config)")
        .option("--wallet <path>", "Path to wallet keypair (default: from config)")
        .option("--program-id <pubkey>", "Priven program ID (default: from config)")
        .option("--max-pools <n>", "Maximum pools to include (default: 5)")
        .option("--timeout <ms>", "TEE execution timeout in ms (default: 30000)")
        .option("--output <format>", "Output format: json or table", "table")
        .option("--dry-run", "Show what would be done without executing")
        .action(async (options) => {
        await executeQuery(options);
    });
}
async function executeQuery(options) {
    try {
        // Load configuration
        const config = await (0, config_1.loadConfig)();
        const rpcUrl = options.rpcUrl || config.rpcUrl;
        const walletPath = options.wallet || config.wallet;
        const programId = options.programId || config.programId;
        const maxPools = parseInt(options.maxPools || String(config.defaultMaxPools));
        const timeout = parseInt(options.timeout || "30000");
        const outputFormat = (options.output || "table");
        // Determine predicate type (V2 filters or V1 min/max TVL)
        const hasFilters = options.filter && options.filter.length > 0;
        const hasLegacyTvl = options.minTvl && options.maxTvl;
        if (!hasFilters && !hasLegacyTvl) {
            (0, output_1.outputError)("Must specify either --filter or both --min-tvl and --max-tvl");
            console.log(chalk_1.default.gray("\nExamples:"));
            console.log(chalk_1.default.gray("  priven query --filter tvl:gte:1000000 --filter tvl:lte:10000000"));
            console.log(chalk_1.default.gray("  priven query --min-tvl 1000000 --max-tvl 10000000 (deprecated)"));
            process.exit(1);
        }
        if (hasFilters && hasLegacyTvl) {
            (0, output_1.outputError)("Cannot mix --filter with --min-tvl/--max-tvl. Use one or the other.");
            process.exit(1);
        }
        // Parse predicate
        let predicateDescription;
        let parsedFilters = [];
        if (hasFilters) {
            // V2 predicate with filters
            for (const expr of options.filter) {
                try {
                    parsedFilters.push(parseFilterExpression(expr));
                }
                catch (error) {
                    (0, output_1.outputError)(error.message);
                    process.exit(1);
                }
            }
            if (parsedFilters.length > 4) {
                (0, output_1.outputError)("Maximum 4 filters allowed");
                process.exit(1);
            }
            predicateDescription = `V2: ${parsedFilters.length} filter(s)`;
        }
        else {
            // V1 legacy predicate
            const minTvl = BigInt(options.minTvl);
            const maxTvl = BigInt(options.maxTvl);
            if (minTvl > maxTvl) {
                (0, output_1.outputError)("min-tvl cannot be greater than max-tvl");
                process.exit(1);
            }
            // Convert to V2 format internally
            parsedFilters = [
                { type: FILTER_TYPES.tvl, op: FILTER_OPS.gte, value: minTvl },
                { type: FILTER_TYPES.tvl, op: FILTER_OPS.lte, value: maxTvl },
            ];
            predicateDescription = `TVL ${minTvl.toLocaleString()} - ${maxTvl.toLocaleString()} (V1)`;
            console.log(chalk_1.default.yellow("\nNote: --min-tvl/--max-tvl is deprecated. Use --filter instead."));
        }
        // Show configuration
        console.log();
        console.log(chalk_1.default.bold("Priven Private Query"));
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log(`  RPC URL:     ${chalk_1.default.cyan(rpcUrl.slice(0, 50))}${rpcUrl.length > 50 ? "..." : ""}`);
        console.log(`  Program ID:  ${chalk_1.default.cyan(programId.slice(0, 20))}...`);
        console.log(`  Network:     ${chalk_1.default.cyan(config.network)}`);
        console.log(`  Predicate:   ${chalk_1.default.yellow(predicateDescription)}`);
        for (const f of parsedFilters) {
            const typeName = Object.keys(FILTER_TYPES).find((k) => FILTER_TYPES[k] === f.type) || "?";
            const opName = Object.keys(FILTER_OPS).find((k) => FILTER_OPS[k] === f.op) || "?";
            console.log(`               ${chalk_1.default.gray(`${typeName}:${opName}:${f.value}`)}`);
        }
        console.log(`  Max Pools:   ${chalk_1.default.cyan(maxPools)}`);
        console.log(`  Timeout:     ${chalk_1.default.cyan(timeout)}ms`);
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log();
        if (options.dryRun) {
            (0, output_1.outputInfo)("Dry run - no transactions will be submitted");
            console.log();
            console.log(chalk_1.default.bold("Query Flow:"));
            console.log(`  ${chalk_1.default.cyan("1.")} Fetch pools from QuickNode RPC`);
            console.log(`  ${chalk_1.default.cyan("2.")} Encrypt predicate with X25519 + AES-256-GCM`);
            console.log(`  ${chalk_1.default.cyan("3.")} Submit encrypted query to Solana L1`);
            console.log(`  ${chalk_1.default.cyan("4.")} Delegate QueryState to MagicBlock TEE`);
            console.log(`  ${chalk_1.default.cyan("5.")} Execute query inside Intel TDX enclave`);
            console.log(`  ${chalk_1.default.cyan("6.")} Commit result and decrypt locally`);
            console.log();
            console.log(chalk_1.default.gray("Privacy guarantees:"));
            console.log(chalk_1.default.gray("  • Predicate encrypted - observers cannot see filter criteria"));
            console.log(chalk_1.default.gray("  • TEE execution - decryption happens in hardware enclave"));
            console.log(chalk_1.default.gray("  • Result encrypted - only you can decrypt matching pools"));
            return;
        }
        // Load wallet
        const wallet = (0, wallet_1.loadWallet)(walletPath);
        console.log(`  Wallet:      ${chalk_1.default.cyan(wallet.publicKey.toBase58().slice(0, 20))}...`);
        console.log();
        // Create connection and check balance
        const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`  Balance:     ${chalk_1.default.cyan((balance / 1e9).toFixed(4))} SOL`);
        if (balance < 10000000) {
            (0, output_1.outputError)(`Insufficient balance (need at least 0.01 SOL for fees)`);
            process.exit(1);
        }
        console.log();
        // Import client SDK
        const { createPrivenClient, PRIVEN_TEE_PROGRAM_ID } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
        // Create client
        const spinner = (0, progress_1.createSpinner)("Initializing Priven client...");
        spinner.start();
        let client;
        try {
            client = await createPrivenClient(connection, wallet, new web3_js_1.PublicKey(programId));
            spinner.succeed("Client initialized");
        }
        catch (error) {
            spinner.fail("Failed to initialize client");
            if (error.message?.includes("Failed to fetch program IDL")) {
                (0, output_1.outputError)(`Program not deployed or IDL not available at ${programId}`);
                console.log(chalk_1.default.gray("\nMake sure:"));
                console.log(chalk_1.default.gray("  1. The program is deployed to the network"));
                console.log(chalk_1.default.gray("  2. The IDL is uploaded with 'anchor idl init'"));
            }
            else {
                (0, output_1.outputError)(error.message || String(error));
            }
            process.exit(1);
        }
        // Initialize TEE session
        const teeSpinner = (0, progress_1.createSpinner)("Initializing TEE session...");
        teeSpinner.start();
        try {
            await client.initTeeSession();
            teeSpinner.succeed("TEE session initialized (Intel TDX verified)");
        }
        catch (error) {
            teeSpinner.warn("TEE session initialized (integrity NOT verified)");
            console.log(chalk_1.default.yellow("  Proceeding with caution..."));
        }
        // Execute the query
        console.log();
        console.log(chalk_1.default.bold("Executing private query..."));
        console.log();
        // Build V2 predicate from parsed filters
        const { createPredicate } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
        const filters = parsedFilters.map((f) => ({
            type: f.type,
            op: f.op,
            value: f.value,
        }));
        const predicate = createPredicate(filters);
        try {
            const matchingPools = await client.query(predicate, {
                maxPools,
                timeout,
            });
            console.log();
            (0, output_1.outputSuccess)("Query completed successfully");
            // Output results
            (0, output_1.outputQueryResults)({
                queryId: Date.now().toString(),
                status: "Completed",
                matchCount: matchingPools.length,
                pools: matchingPools.map((p) => p.toBase58()),
            }, outputFormat);
        }
        catch (error) {
            console.log();
            (0, output_1.outputError)(`Query failed: ${error.message || error}`);
            // Provide helpful error messages
            if (error.message?.includes("Timeout")) {
                console.log(chalk_1.default.gray("\nTry increasing the timeout with --timeout <ms>"));
            }
            else if (error.message?.includes("No Raydium pools")) {
                console.log(chalk_1.default.gray("\nNo pools available. Check your RPC endpoint."));
            }
            else if (error.message?.includes("insufficient")) {
                console.log(chalk_1.default.gray("\nInsufficient SOL for transaction fees."));
            }
            process.exit(1);
        }
    }
    catch (error) {
        (0, output_1.outputError)(`Query failed: ${error.message || error}`);
        process.exit(1);
    }
}
