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
exports.registerPoolsCommand = registerPoolsCommand;
const web3_js_1 = require("@solana/web3.js");
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../config");
const wallet_1 = require("../utils/wallet");
const output_1 = require("../utils/output");
const progress_1 = require("../utils/progress");
function registerPoolsCommand(program) {
    const pools = program
        .command("pools")
        .description("Pool discovery commands");
    pools
        .command("list")
        .description("List available pools")
        .option("--rpc-url <url>", "Solana RPC URL")
        .option("--wallet <path>", "Path to wallet keypair (for token accounts)")
        .option("--network <network>", "Network: devnet or mainnet", "devnet")
        .option("--min-tvl <lamports>", "Minimum TVL filter")
        .option("--limit <n>", "Maximum number of pools to show", "20")
        .option("--output <format>", "Output format: json or table", "table")
        .action(async (options) => {
        await listPools(options);
    });
    pools
        .command("get <address>")
        .description("Get detailed info for a specific pool")
        .option("--rpc-url <url>", "Solana RPC URL")
        .option("--output <format>", "Output format: json or table", "table")
        .action(async (address, options) => {
        await getPool(address, options);
    });
    pools
        .command("stats")
        .description("Show pool statistics")
        .option("--rpc-url <url>", "Solana RPC URL")
        .option("--network <network>", "Network: devnet or mainnet", "devnet")
        .action(async (options) => {
        await showPoolStats(options);
    });
}
async function listPools(options) {
    const spinner = (0, progress_1.createSpinner)("Fetching pools...");
    try {
        const config = await (0, config_1.loadConfig)();
        const network = options.network || config.network;
        const limit = parseInt(options.limit || "20");
        const minTvl = options.minTvl ? BigInt(options.minTvl) : 0n;
        const outputFormat = (options.output || "table");
        console.log();
        console.log(chalk_1.default.bold("Pool Discovery"));
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log(`  Network:     ${chalk_1.default.cyan(network)}`);
        if (minTvl > 0n) {
            console.log(`  Min TVL:     ${chalk_1.default.yellow((0, output_1.formatNumber)(minTvl))}`);
        }
        console.log(`  Limit:       ${chalk_1.default.cyan(limit)}`);
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log();
        spinner.start();
        let pools = [];
        if (network === "devnet") {
            // On devnet, fetch token accounts from wallet
            const rpcUrl = options.rpcUrl || config.rpcUrl;
            const walletPath = options.wallet || config.wallet;
            const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
            const wallet = (0, wallet_1.loadWallet)(walletPath);
            spinner.text = `Fetching token accounts for ${wallet.publicKey.toBase58().slice(0, 8)}...`;
            const { fetchTokenAccountsByOwner } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
            const accounts = await fetchTokenAccountsByOwner(connection, wallet.publicKey);
            const filteredAccounts = accounts
                .filter((a) => a.balance >= minTvl)
                .sort((a, b) => {
                // Sort by balance descending
                if (b.balance > a.balance)
                    return 1;
                if (b.balance < a.balance)
                    return -1;
                return 0;
            })
                .slice(0, limit);
            pools = filteredAccounts.map((a) => ({
                address: a.address.toBase58(),
                tvl: (0, output_1.formatNumber)(a.balance),
                tokenAReserve: (0, output_1.formatNumber)(a.balance),
                tokenBReserve: "0",
            }));
            spinner.succeed(`Found ${accounts.length} token accounts (showing ${pools.length})`);
        }
        else {
            // On mainnet, fetch Raydium pools with retry
            const rpcUrl = options.rpcUrl ||
                process.env.QUICKNODE_MAINNET_RPC ||
                "https://api.mainnet-beta.solana.com";
            const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
            spinner.text = "Fetching Raydium V4 pools (with retry)...";
            const { fetchRaydiumPoolsWithRetry, calculateTVL } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
            const raydiumPools = await fetchRaydiumPoolsWithRetry(connection, {
                status: 1, // Only active pools
                minTvlPrefilter: minTvl,
            });
            // Sort by TVL descending
            raydiumPools.sort((a, b) => {
                const tvlA = calculateTVL(a);
                const tvlB = calculateTVL(b);
                if (tvlB > tvlA)
                    return 1;
                if (tvlB < tvlA)
                    return -1;
                return 0;
            });
            pools = raydiumPools.slice(0, limit).map((p) => {
                const tvl = BigInt(p.tokenAReserve.toString()) + BigInt(p.tokenBReserve.toString());
                return {
                    address: p.address.toBase58(),
                    tvl: (0, output_1.formatNumber)(tvl),
                    tokenAReserve: (0, output_1.formatNumber)(BigInt(p.tokenAReserve.toString())),
                    tokenBReserve: (0, output_1.formatNumber)(BigInt(p.tokenBReserve.toString())),
                };
            });
            spinner.succeed(`Found ${raydiumPools.length} active Raydium pools (showing ${pools.length})`);
        }
        console.log();
        (0, output_1.outputPools)(pools, outputFormat);
        // Summary
        if (pools.length > 0) {
            console.log();
            console.log(chalk_1.default.gray(`Use 'priven pools get <address>' for detailed info`));
        }
    }
    catch (error) {
        spinner.fail("Failed to fetch pools");
        (0, output_1.outputError)(error.message || String(error));
        if (error.message?.includes("rate")) {
            console.log(chalk_1.default.gray("\nTry again in a few seconds (rate limited)"));
        }
        process.exit(1);
    }
}
async function getPool(address, options) {
    const spinner = (0, progress_1.createSpinner)("Fetching pool info...");
    try {
        const config = await (0, config_1.loadConfig)();
        const rpcUrl = options.rpcUrl || config.rpcUrl;
        const outputFormat = (options.output || "table");
        // Validate address
        let poolPubkey;
        try {
            poolPubkey = new web3_js_1.PublicKey(address);
        }
        catch {
            (0, output_1.outputError)("Invalid pool address");
            process.exit(1);
        }
        console.log();
        console.log(chalk_1.default.bold("Pool Details"));
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log(`  Address:     ${chalk_1.default.cyan(address)}`);
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log();
        spinner.start();
        const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
        const { getMultiplePools, RAYDIUM_V4_PROGRAM_ID } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
        // Try to fetch as Raydium pool
        const pools = await getMultiplePools(connection, [poolPubkey]);
        if (pools.length > 0) {
            const pool = pools[0];
            const tvl = BigInt(pool.tokenAReserve.toString()) + BigInt(pool.tokenBReserve.toString());
            spinner.succeed("Pool found");
            console.log();
            if (outputFormat === "json") {
                console.log(JSON.stringify({
                    address: pool.address.toBase58(),
                    type: "Raydium V4",
                    tokenAReserve: pool.tokenAReserve.toString(),
                    tokenBReserve: pool.tokenBReserve.toString(),
                    tvl: tvl.toString(),
                }, null, 2));
            }
            else {
                console.log(chalk_1.default.bold("  Pool Information:"));
                console.log(`    ${chalk_1.default.cyan("Address:")}      ${pool.address.toBase58()}`);
                console.log(`    ${chalk_1.default.cyan("Type:")}         Raydium V4 AMM`);
                console.log(`    ${chalk_1.default.cyan("Token A:")}      ${(0, output_1.formatNumber)(BigInt(pool.tokenAReserve.toString()))}`);
                console.log(`    ${chalk_1.default.cyan("Token B:")}      ${(0, output_1.formatNumber)(BigInt(pool.tokenBReserve.toString()))}`);
                console.log(`    ${chalk_1.default.cyan("TVL:")}          ${(0, output_1.formatNumber)(tvl)}`);
                console.log(`    ${chalk_1.default.cyan("Program:")}      ${RAYDIUM_V4_PROGRAM_ID.toBase58()}`);
            }
        }
        else {
            // Try as token account
            const accountInfo = await connection.getAccountInfo(poolPubkey);
            if (accountInfo) {
                spinner.succeed("Account found");
                console.log();
                if (outputFormat === "json") {
                    console.log(JSON.stringify({
                        address: address,
                        owner: accountInfo.owner.toBase58(),
                        lamports: accountInfo.lamports,
                        dataSize: accountInfo.data.length,
                        executable: accountInfo.executable,
                    }, null, 2));
                }
                else {
                    console.log(chalk_1.default.bold("  Account Information:"));
                    console.log(`    ${chalk_1.default.cyan("Address:")}      ${address}`);
                    console.log(`    ${chalk_1.default.cyan("Owner:")}        ${accountInfo.owner.toBase58()}`);
                    console.log(`    ${chalk_1.default.cyan("Lamports:")}     ${(0, output_1.formatNumber)(BigInt(accountInfo.lamports))}`);
                    console.log(`    ${chalk_1.default.cyan("Data Size:")}    ${accountInfo.data.length} bytes`);
                    console.log(`    ${chalk_1.default.cyan("Executable:")}   ${accountInfo.executable}`);
                }
            }
            else {
                spinner.fail("Pool/account not found");
                (0, output_1.outputError)("Account does not exist on chain");
                process.exit(1);
            }
        }
        console.log();
    }
    catch (error) {
        spinner.fail("Failed to fetch pool");
        (0, output_1.outputError)(error.message || String(error));
        process.exit(1);
    }
}
async function showPoolStats(options) {
    const spinner = (0, progress_1.createSpinner)("Gathering pool statistics...");
    try {
        const config = await (0, config_1.loadConfig)();
        const network = options.network || config.network;
        console.log();
        console.log(chalk_1.default.bold("Pool Statistics"));
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log(`  Network:     ${chalk_1.default.cyan(network)}`);
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log();
        spinner.start();
        if (network === "mainnet") {
            const rpcUrl = options.rpcUrl ||
                process.env.QUICKNODE_MAINNET_RPC ||
                "https://api.mainnet-beta.solana.com";
            const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
            spinner.text = "Fetching Raydium pools...";
            const { fetchRaydiumPoolsWithRetry, calculateTVL, RAYDIUM_V4_PROGRAM_ID } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
            const pools = await fetchRaydiumPoolsWithRetry(connection, { status: 1 });
            // Calculate statistics
            let totalTvl = 0n;
            let minPoolTvl = BigInt(Number.MAX_SAFE_INTEGER);
            let maxPoolTvl = 0n;
            for (const pool of pools) {
                const tvl = calculateTVL(pool);
                totalTvl += tvl;
                if (tvl < minPoolTvl)
                    minPoolTvl = tvl;
                if (tvl > maxPoolTvl)
                    maxPoolTvl = tvl;
            }
            const avgTvl = pools.length > 0 ? totalTvl / BigInt(pools.length) : 0n;
            spinner.succeed("Statistics gathered");
            console.log();
            console.log(chalk_1.default.bold("  Raydium V4 Statistics:"));
            console.log(`    ${chalk_1.default.cyan("Program ID:")}    ${RAYDIUM_V4_PROGRAM_ID.toBase58()}`);
            console.log(`    ${chalk_1.default.cyan("Total Pools:")}   ${chalk_1.default.green(pools.length.toLocaleString())}`);
            console.log(`    ${chalk_1.default.cyan("Total TVL:")}     ${chalk_1.default.green((0, output_1.formatNumber)(totalTvl))}`);
            console.log(`    ${chalk_1.default.cyan("Average TVL:")}   ${(0, output_1.formatNumber)(avgTvl)}`);
            console.log(`    ${chalk_1.default.cyan("Min Pool TVL:")} ${(0, output_1.formatNumber)(minPoolTvl)}`);
            console.log(`    ${chalk_1.default.cyan("Max Pool TVL:")} ${(0, output_1.formatNumber)(maxPoolTvl)}`);
        }
        else {
            // Devnet - show token account stats
            const rpcUrl = options.rpcUrl || config.rpcUrl;
            const walletPath = config.wallet;
            const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
            const wallet = (0, wallet_1.loadWallet)(walletPath);
            spinner.text = "Fetching token accounts...";
            const { fetchTokenAccountsByOwner, TOKEN_PROGRAM_ID } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
            const accounts = await fetchTokenAccountsByOwner(connection, wallet.publicKey);
            let totalBalance = 0n;
            for (const account of accounts) {
                totalBalance += account.balance;
            }
            spinner.succeed("Statistics gathered");
            console.log();
            console.log(chalk_1.default.bold("  Token Account Statistics:"));
            console.log(`    ${chalk_1.default.cyan("Wallet:")}         ${wallet.publicKey.toBase58().slice(0, 20)}...`);
            console.log(`    ${chalk_1.default.cyan("Token Program:")}  ${TOKEN_PROGRAM_ID.toBase58()}`);
            console.log(`    ${chalk_1.default.cyan("Total Accounts:")} ${chalk_1.default.green(accounts.length.toLocaleString())}`);
            console.log(`    ${chalk_1.default.cyan("Total Balance:")}  ${chalk_1.default.green((0, output_1.formatNumber)(totalBalance))}`);
            (0, output_1.outputInfo)("Note: Devnet uses token accounts as mock pools for testing");
        }
        console.log();
    }
    catch (error) {
        spinner.fail("Failed to gather statistics");
        (0, output_1.outputError)(error.message || String(error));
        process.exit(1);
    }
}
