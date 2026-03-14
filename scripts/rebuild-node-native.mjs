#!/usr/bin/env node

import { execFileSync } from "node:child_process";

process.stdout.write("[ucad] rebuilding native modules for current Node runtime\n");
process.stdout.write("[ucad] target modules: better-sqlite3, node-pty\n");

execFileSync(
  "pnpm",
  [
    "--filter",
    "@ucad/desktop",
    "rebuild",
    "better-sqlite3",
    "node-pty",
    "--config.build_from_source=true"
  ],
  {
    stdio: "inherit",
    env: process.env
  }
);

process.stdout.write("[ucad] node native rebuild complete\n");
