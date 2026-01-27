#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Priven CLI - Privacy-preserving pool queries on Solana
 *
 * Commands:
 *   priven query      Execute a private query
 *   priven pools      List available pools
 *   priven tee        TEE verification
 */
const index_1 = require("../src/index");
const cli = (0, index_1.createCli)();
cli.parse(process.argv);
