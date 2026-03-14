import path from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: path.resolve(__dirname),
  testMatch: ["*.e2e.spec.ts"],
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  }
});
