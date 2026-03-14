#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const runFullE2E = process.env.UCAD_RUN_E2E === "1";

const runPnpm = (args) => {
  execFileSync("pnpm", args, {
    stdio: "inherit",
    env: process.env
  });
};

let testFailure = null;

try {
  if (runFullE2E) {
    runPnpm(["rebuild:native:electron"]);
  }

  runPnpm(["--filter", "@ucad/desktop", "build"]);
  runPnpm(["exec", "playwright", "test", "-c", "tests/e2e/playwright.config.ts"]);
} catch (error) {
  testFailure = error;
} finally {
  if (runFullE2E) {
    try {
      runPnpm(["rebuild:native:node"]);
    } catch (restoreError) {
      if (!testFailure) {
        throw restoreError;
      }
      process.stderr.write(
        `[ucad] warning: failed to restore Node native modules after e2e: ${
          restoreError instanceof Error ? restoreError.message : String(restoreError)
        }\n`
      );
    }
  }
}

if (testFailure) {
  throw testFailure;
}
