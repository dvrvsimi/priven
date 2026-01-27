#!/usr/bin/env node
/**
 * Priven CLI - Privacy-preserving pool queries on Solana
 *
 * Commands:
 *   priven query      Execute a private query
 *   priven pools      List available pools
 *   priven tee        TEE verification
 */
import { createCli } from "../src/index";

const cli = createCli();
cli.parse(process.argv);
