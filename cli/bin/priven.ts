#!/usr/bin/env node
/**
 * Priven CLI - Privacy-preserving pool queries on Solana
 *
 * Main commands:
 *   priven query      Execute a private query
 *   priven pools      List available pools
 *   priven tee        TEE verification
 */
import { config } from "dotenv";
config({ path: require("path").resolve(__dirname, "../../../.env") });

import { createCli } from "../src/index";

const cli = createCli();
cli.parse(process.argv);
