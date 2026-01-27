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
exports.registerConfigCommand = registerConfigCommand;
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../config");
const output_1 = require("../utils/output");
function registerConfigCommand(program) {
    const config = program
        .command("config")
        .description("Configuration commands");
    config
        .command("show")
        .description("Display current configuration")
        .action(async () => {
        await showConfig();
    });
    config
        .command("init")
        .description("Initialize a .privenrc configuration file")
        .option("--force", "Overwrite existing config file")
        .action(async (options) => {
        await initConfig(options);
    });
}
async function showConfig() {
    try {
        const config = await (0, config_1.loadConfig)();
        console.log();
        console.log(chalk_1.default.bold("Priven Configuration"));
        console.log(chalk_1.default.gray("─".repeat(50)));
        console.log();
        const entries = [
            ["RPC URL", config.rpcUrl],
            ["Network", config.network],
            ["Program ID", config.programId],
            ["Wallet", config.wallet],
            ["TEE RPC", config.teeRpc],
            ["Max Pools", String(config.defaultMaxPools)],
        ];
        for (const [key, value] of entries) {
            const displayValue = value.length > 60 ? value.slice(0, 57) + "..." : value;
            console.log(`  ${chalk_1.default.cyan(key.padEnd(12))} ${displayValue}`);
        }
        console.log();
        console.log(chalk_1.default.gray("Configuration sources (in order of priority):"));
        console.log(chalk_1.default.gray("  1. Environment variables (PRIVEN_*)"));
        console.log(chalk_1.default.gray("  2. Config file (.privenrc, .privenrc.json, priven.config.js)"));
        console.log(chalk_1.default.gray("  3. Default values"));
        console.log();
    }
    catch (error) {
        (0, output_1.outputError)(`Failed to load configuration: ${error}`);
        process.exit(1);
    }
}
async function initConfig(options) {
    const fs = await Promise.resolve().then(() => __importStar(require("fs")));
    const path = await Promise.resolve().then(() => __importStar(require("path")));
    const configPath = path.resolve(process.cwd(), ".privenrc");
    // Check if file exists
    if (fs.existsSync(configPath) && !options.force) {
        (0, output_1.outputError)(`Config file already exists: ${configPath}`);
        console.log(chalk_1.default.gray("Use --force to overwrite"));
        process.exit(1);
    }
    const defaultConfig = {
        rpcUrl: "https://api.devnet.solana.com",
        network: "devnet",
        programId: "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM",
        wallet: "~/.config/solana/id.json",
        defaultMaxPools: 5,
        teeRpc: "https://tee.magicblock.app",
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + "\n");
    console.log();
    console.log(chalk_1.default.green("✓"), `Created config file: ${configPath}`);
    console.log();
    console.log(chalk_1.default.gray("Edit this file to customize your Priven CLI settings."));
    console.log(chalk_1.default.gray("You can also use environment variables (PRIVEN_*) to override."));
    console.log();
}
