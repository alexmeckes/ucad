import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

const projectRoot = resolve(__dirname, "../..");

const alias = {
  "@ucad/contracts": resolve(projectRoot, "packages/contracts/src/index.ts"),
  "@ucad/storage-sqlite": resolve(projectRoot, "packages/storage-sqlite/src/index.ts"),
  "@ucad/policy-engine": resolve(projectRoot, "packages/policy-engine/src/index.ts"),
  "@ucad/workspace-manager": resolve(projectRoot, "packages/workspace-manager/src/index.ts"),
  "@ucad/review-engine": resolve(projectRoot, "packages/review-engine/src/index.ts"),
  "@ucad/adapter-sdk": resolve(projectRoot, "packages/adapter-sdk/src/index.ts"),
  "@ucad/harness-sdk-stdio": resolve(projectRoot, "packages/harness-sdk-stdio/src/index.ts"),
  "@ucad/codex-cli-adapter": resolve(projectRoot, "packages/adapters/codex-cli/src/index.ts"),
  "@ucad/claude-cli-adapter": resolve(projectRoot, "packages/adapters/claude-cli/src/index.ts"),
  "@ucad/gemini-cli-adapter": resolve(projectRoot, "packages/adapters/gemini-cli/src/index.ts"),
  "@ucad/orchestrator": resolve(projectRoot, "packages/orchestrator/src/index.ts")
};

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: {
        external: ["better-sqlite3", "node-pty"]
      }
    }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    plugins: [react()],
    resolve: { alias }
  }
});
