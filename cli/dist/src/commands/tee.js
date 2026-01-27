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
exports.registerTeeCommand = registerTeeCommand;
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../config");
const output_1 = require("../utils/output");
const progress_1 = require("../utils/progress");
function registerTeeCommand(program) {
    const tee = program
        .command("tee")
        .description("TEE verification commands");
    tee
        .command("verify")
        .description("Verify TEE integrity (Intel TDX attestation)")
        .option("--network <network>", "Network: devnet or mainnet", "devnet")
        .action(async (options) => {
        await verifyTee(options);
    });
    tee
        .command("info")
        .description("Display TEE configuration info")
        .action(async () => {
        await showTeeInfo();
    });
}
async function verifyTee(options) {
    const spinner = (0, progress_1.createSpinner)("Verifying TEE integrity...");
    try {
        const config = await (0, config_1.loadConfig)();
        const network = options.network || config.network;
        console.log();
        console.log(chalk_1.default.bold("TEE Integrity Verification"));
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log(`  Network:     ${chalk_1.default.cyan(network)}`);
        console.log(`  TEE RPC:     ${chalk_1.default.cyan(config.teeRpc)}`);
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log();
        spinner.start();
        // Import TEE verification from SDK
        const { verifyTeeRpcIntegrity } = await Promise.resolve().then(() => __importStar(require("@magicblock-labs/ephemeral-rollups-sdk")));
        const { MAGICBLOCK_RPC, TEE_VALIDATORS } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
        const teeRpc = config.teeRpc || MAGICBLOCK_RPC.tee;
        // Verify TEE integrity
        const verified = await verifyTeeRpcIntegrity(teeRpc);
        if (verified) {
            spinner.succeed("TEE integrity verified (Intel TDX attestation passed)");
            console.log();
            (0, output_1.outputSuccess)("TEE is trustworthy");
            console.log();
            console.log(chalk_1.default.gray("  The TEE endpoint has been verified using Intel TDX remote attestation."));
            console.log(chalk_1.default.gray("  Your encrypted predicates will be processed securely."));
        }
        else {
            spinner.warn("TEE integrity verification failed");
            console.log();
            (0, output_1.outputWarning)("TEE attestation could not be verified");
            console.log();
            console.log(chalk_1.default.yellow("  Warning: The TEE endpoint could not be verified."));
            console.log(chalk_1.default.yellow("  Proceed with caution - your predicates may not be fully protected."));
        }
        // Show validator info
        console.log();
        console.log(chalk_1.default.bold("TEE Validators:"));
        console.log(`  ${chalk_1.default.cyan("TEE:")}   ${TEE_VALIDATORS.TEE.toBase58()}`);
        console.log(`  ${chalk_1.default.cyan("US:")}    ${TEE_VALIDATORS.US.toBase58()}`);
        console.log(`  ${chalk_1.default.cyan("EU:")}    ${TEE_VALIDATORS.EU.toBase58()}`);
        console.log(`  ${chalk_1.default.cyan("ASIA:")}  ${TEE_VALIDATORS.ASIA.toBase58()}`);
        console.log();
    }
    catch (error) {
        spinner.fail("TEE verification failed");
        (0, output_1.outputError)(`${error}`);
        process.exit(1);
    }
}
async function showTeeInfo() {
    try {
        const config = await (0, config_1.loadConfig)();
        console.log();
        console.log(chalk_1.default.bold("TEE Configuration"));
        console.log(chalk_1.default.gray("─".repeat(50)));
        const { MAGICBLOCK_RPC, TEE_VALIDATORS, DELEGATION_PROGRAM_ID } = await Promise.resolve().then(() => __importStar(require("@priven/client")));
        console.log();
        console.log(chalk_1.default.bold("Endpoints:"));
        console.log(`  ${chalk_1.default.cyan("Devnet:")}   ${MAGICBLOCK_RPC.devnet}`);
        console.log(`  ${chalk_1.default.cyan("Mainnet:")}  ${MAGICBLOCK_RPC.mainnet}`);
        console.log(`  ${chalk_1.default.cyan("TEE:")}      ${MAGICBLOCK_RPC.tee}`);
        console.log();
        console.log(chalk_1.default.bold("Program IDs:"));
        console.log(`  ${chalk_1.default.cyan("Delegation:")}  ${DELEGATION_PROGRAM_ID.toBase58()}`);
        console.log();
        console.log(chalk_1.default.bold("Validators:"));
        console.log(`  ${chalk_1.default.cyan("TEE:")}   ${TEE_VALIDATORS.TEE.toBase58()}`);
        console.log(`  ${chalk_1.default.cyan("US:")}    ${TEE_VALIDATORS.US.toBase58()}`);
        console.log(`  ${chalk_1.default.cyan("EU:")}    ${TEE_VALIDATORS.EU.toBase58()}`);
        console.log(`  ${chalk_1.default.cyan("ASIA:")}  ${TEE_VALIDATORS.ASIA.toBase58()}`);
        console.log();
        console.log(chalk_1.default.bold("Current Config:"));
        console.log(`  ${chalk_1.default.cyan("TEE RPC:")}    ${config.teeRpc}`);
        console.log(`  ${chalk_1.default.cyan("Network:")}    ${config.network}`);
        console.log(`  ${chalk_1.default.cyan("Program ID:")} ${config.programId}`);
        console.log();
    }
    catch (error) {
        (0, output_1.outputError)(`${error}`);
        process.exit(1);
    }
}
