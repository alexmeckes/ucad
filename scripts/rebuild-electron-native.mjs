#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireModule = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function resolveElectronVersion() {
  try {
    return requireModule("electron/package.json").version;
  } catch {
    const desktopRequire = createRequire(
      path.join(repoRoot, "apps", "desktop", "package.json")
    );
    return desktopRequire("electron/package.json").version;
  }
}

const electronVersion = resolveElectronVersion();

process.stdout.write(`[ucad] rebuilding native modules for Electron ${electronVersion}\n`);
process.stdout.write("[ucad] target modules: better-sqlite3, node-pty\n");

execFileSync(
  "pnpm",
  [
    "--filter",
    "@ucad/desktop",
    "rebuild",
    "better-sqlite3",
    "node-pty",
    "--config.runtime=electron",
    `--config.target=${electronVersion}`,
    "--config.disturl=https://electronjs.org/headers",
    "--config.build_from_source=true"
  ],
  {
    stdio: "inherit",
    env: process.env
  }
);

process.stdout.write("[ucad] native rebuild complete\n");
