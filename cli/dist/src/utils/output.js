"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.outputPools = outputPools;
exports.outputQueryResults = outputQueryResults;
exports.outputError = outputError;
exports.outputSuccess = outputSuccess;
exports.outputWarning = outputWarning;
exports.outputInfo = outputInfo;
exports.formatNumber = formatNumber;
exports.formatLamports = formatLamports;
/**
 * Output formatting utilities
 */
const cli_table3_1 = __importDefault(require("cli-table3"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Output pools in the requested format
 */
function outputPools(pools, format) {
    if (format === "json") {
        console.log(JSON.stringify(pools, null, 2));
        return;
    }
    if (pools.length === 0) {
        console.log(chalk_1.default.yellow("No pools found matching criteria"));
        return;
    }
    const table = new cli_table3_1.default({
        head: [
            chalk_1.default.cyan("Address"),
            chalk_1.default.cyan("TVL"),
            chalk_1.default.cyan("Token A Reserve"),
            chalk_1.default.cyan("Token B Reserve"),
        ],
        colWidths: [46, 20, 20, 20],
    });
    for (const pool of pools) {
        table.push([
            pool.address,
            pool.tvl,
            pool.tokenAReserve,
            pool.tokenBReserve,
        ]);
    }
    console.log(table.toString());
    console.log(chalk_1.default.gray(`\nTotal: ${pools.length} pools`));
}
/**
 * Output query results in the requested format
 */
function outputQueryResults(result, format) {
    if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log();
    console.log(chalk_1.default.green.bold("Query Results"));
    console.log(chalk_1.default.gray("─".repeat(50)));
    console.log(`  Query ID:     ${chalk_1.default.cyan(result.queryId)}`);
    console.log(`  Status:       ${chalk_1.default.green(result.status)}`);
    console.log(`  Match Count:  ${chalk_1.default.yellow(result.matchCount)}`);
    console.log();
    if (result.pools.length > 0) {
        console.log(chalk_1.default.white.bold("  Matching Pools:"));
        for (const pool of result.pools) {
            console.log(`    ${chalk_1.default.cyan("•")} ${pool}`);
        }
    }
    else {
        console.log(chalk_1.default.yellow("  No pools matched the predicate"));
    }
    console.log();
}
/**
 * Output an error message
 */
function outputError(message) {
    console.error(chalk_1.default.red.bold("Error:"), message);
}
/**
 * Output a success message
 */
function outputSuccess(message) {
    console.log(chalk_1.default.green.bold("✓"), message);
}
/**
 * Output a warning message
 */
function outputWarning(message) {
    console.log(chalk_1.default.yellow.bold("⚠"), message);
}
/**
 * Output info message
 */
function outputInfo(message) {
    console.log(chalk_1.default.blue("ℹ"), message);
}
/**
 * Format a number with commas
 */
function formatNumber(num) {
    return num.toLocaleString();
}
/**
 * Format lamports as SOL
 */
function formatLamports(lamports) {
    const sol = Number(lamports) / 1e9;
    return `${sol.toFixed(4)} SOL`;
}
