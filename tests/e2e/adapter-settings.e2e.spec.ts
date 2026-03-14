import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

const REPO_ROOT = path.resolve(__dirname, "../..");
const MAIN_ENTRY = path.join(REPO_ROOT, "apps/desktop/out/main/index.js");

const checkNativeDepsForElectron = (): { ok: boolean; reason?: string } => {
  try {
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@ucad/desktop",
        "exec",
        "electron",
        "-e",
        "try { require('better-sqlite3'); require('node-pty'); process.exit(0); } catch (error) { console.error(error && error.message ? error.message : String(error)); process.exit(1); }"
      ],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    return { ok: true };
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error && Buffer.isBuffer((error as { stderr?: unknown }).stderr)
        ? (error as { stderr: Buffer }).stderr.toString("utf8").trim()
        : "";
    return {
      ok: false,
      reason: stderr || (error instanceof Error ? error.message : "unknown native module error")
    };
  }
};

const nativePreflight = process.env.UCAD_RUN_E2E === "1" ? checkNativeDepsForElectron() : { ok: true };

test.skip(
  process.env.UCAD_RUN_E2E !== "1",
  "Set UCAD_RUN_E2E=1 to execute Electron E2E tests in a local desktop-capable environment."
);
test.skip(
  !nativePreflight.ok,
  `Electron native modules are not ready. Run 'pnpm rebuild:native:electron'. ${nativePreflight.reason ?? ""}`.trim()
);

const launchDesktop = async (
  homePath: string,
  adapterConfigPath: string
): Promise<{ app: ElectronApplication; page: Page }> => {
  const startupLogPath = path.join(homePath, ".ucad", "logs", "startup-e2e.log");

  const app = await electron.launch({
    args: [MAIN_ENTRY],
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: homePath,
      UCAD_ADAPTER_CONFIG_PATH: adapterConfigPath,
      UCAD_USE_MOCK_ADAPTERS: "1",
      UCAD_DISABLE_CLEANUP_TIMER: "1",
      UCAD_E2E_SAFE_MODE: "1",
      UCAD_STARTUP_DIAGNOSTICS: "1",
      UCAD_STARTUP_LOG_PATH: startupLogPath,
      UCAD_RENDERER_LOAD_TIMEOUT_MS: "20000"
    }
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
};

test("adapter settings persist advanced fields across save, reload, and restart", async () => {
  const runRoot = await mkdtemp(path.join(os.tmpdir(), "ucad-e2e-adapter-settings-"));
  const homePath = path.join(runRoot, "home");
  const adapterConfigPath = path.join(runRoot, "adapters.json");
  const keepTempArtifacts = process.env.UCAD_E2E_KEEP_TMP === "1";
  await mkdir(homePath, { recursive: true });

  let app: ElectronApplication | null = null;

  try {
    let page: Page;
    ({ app, page } = await launchDesktop(homePath, adapterConfigPath));

    await expect(page.getByTestId("adapter-settings-panel")).toBeVisible();
    await expect(page.getByTestId("adapter-settings-config-path")).toContainText(adapterConfigPath);

    await page.getByTestId("new-adapter-type").selectOption("cli");
    await page.getByTestId("new-adapter-id").fill("cli-e2e");
    await page.getByTestId("new-adapter-name").fill("CLI E2E");
    await page.getByTestId("new-adapter-command").fill("fake-cli");
    await page.getByTestId("new-adapter-args").fill("--json, --verbose");
    await page.getByTestId("add-adapter-btn").click();

    await page.getByTestId("new-adapter-type").selectOption("harness_stdio");
    await page.getByTestId("new-adapter-id").fill("harness-e2e");
    await page.getByTestId("new-adapter-name").fill("Harness E2E");
    await page.getByTestId("new-adapter-command").fill("node");
    await page.getByTestId("new-adapter-args").fill("/tmp/harness-e2e.mjs");
    await page.getByTestId("add-adapter-btn").click();

    await expect(page.getByTestId("adapter-row-0")).toBeVisible();
    await expect(page.getByTestId("adapter-row-1")).toBeVisible();

    await page.getByTestId("adapter-version-0").fill("1.2.3");
    await page.getByTestId("adapter-cli-version-args-0").fill("--version");
    await page.getByTestId("adapter-cli-auth-env-vars-0").fill("TOKEN_A, TOKEN_B");
    await page.getByTestId("adapter-cli-auth-status-0").selectOption("unauthenticated");
    await page.getByTestId("adapter-cli-auth-probe-command-0").fill("fake-cli auth status");
    await page.getByTestId("adapter-cli-auth-probe-args-0").fill("--json");
    await page.getByTestId("adapter-cli-auth-unauth-patterns-0").fill("not authenticated, login required");
    await page.getByTestId("adapter-cli-install-hint-0").fill("brew install fake-cli");
    await page.getByTestId("adapter-cli-auth-hint-0").fill("fake-cli login");
    await page.getByTestId("adapter-capability-0-structuredEvents").check();
    await page.getByTestId("adapter-capability-0-supportsPatch").check();

    await page.getByTestId("adapter-version-1").fill("0.9.0");
    await page.getByTestId("adapter-harness-event-method-1").fill("agent.event");
    await page.getByTestId("adapter-harness-timeout-1").fill("15000");
    await page.getByTestId("adapter-harness-rpc-start-1").fill("custom.start");
    await page.getByTestId("adapter-harness-rpc-sendTurn-1").fill("custom.turn");
    await page.getByTestId("adapter-harness-rpc-interrupt-1").fill("custom.interrupt");
    await page.getByTestId("adapter-harness-rpc-resume-1").fill("custom.resume");
    await page.getByTestId("adapter-harness-rpc-stop-1").fill("custom.stop");
    await page.getByTestId("adapter-capability-1-supportsMcpPassthrough").check();

    await page.getByTestId("save-adapter-settings-btn").click();
    await expect(page.getByTestId("adapter-settings-success")).toContainText("saved");
    await expect(page.getByTestId("adapter-settings-loaded-ids")).toContainText("cli-e2e");
    await expect(page.getByTestId("adapter-settings-loaded-ids")).toContainText("harness-e2e");

    const persisted = JSON.parse(await readFile(adapterConfigPath, "utf8")) as {
      adapters: Array<Record<string, unknown>>;
    };
    expect(persisted.adapters).toHaveLength(2);

    const cliAdapter = persisted.adapters.find((adapter) => adapter.id === "cli-e2e");
    const harnessAdapter = persisted.adapters.find((adapter) => adapter.id === "harness-e2e");

    expect(cliAdapter).toMatchObject({
      type: "cli",
      id: "cli-e2e",
      version: "1.2.3",
      command: "fake-cli",
      args: ["--json", "--verbose"],
      versionArgs: ["--version"],
      authEnvVars: ["TOKEN_A", "TOKEN_B"],
      authStatusWhenEnvMissing: "unauthenticated",
      authProbeCommand: "fake-cli auth status",
      authProbeArgs: ["--json"],
      authProbeUnauthenticatedPatterns: ["not authenticated", "login required"],
      installHintCommand: "brew install fake-cli",
      authHintCommand: "fake-cli login"
    });
    expect(harnessAdapter).toMatchObject({
      type: "harness_stdio",
      id: "harness-e2e",
      version: "0.9.0",
      command: "node",
      args: ["/tmp/harness-e2e.mjs"],
      eventNotificationMethod: "agent.event",
      timeoutMs: 15000,
      rpcMethods: {
        start: "custom.start",
        sendTurn: "custom.turn",
        interrupt: "custom.interrupt",
        resume: "custom.resume",
        stop: "custom.stop"
      }
    });

    await page.getByTestId("reload-adapter-settings-btn").click();
    await expect(page.getByTestId("adapter-id-0")).toHaveValue("cli-e2e");
    await expect(page.getByTestId("adapter-id-1")).toHaveValue("harness-e2e");
    await expect(page.getByTestId("adapter-cli-auth-status-0")).toHaveValue("unauthenticated");
    await expect(page.getByTestId("adapter-harness-rpc-start-1")).toHaveValue("custom.start");

    await app.close();
    app = null;

    ({ app, page } = await launchDesktop(homePath, adapterConfigPath));

    await expect(page.getByTestId("adapter-settings-panel")).toBeVisible();
    await expect(page.getByTestId("adapter-id-0")).toHaveValue("cli-e2e");
    await expect(page.getByTestId("adapter-version-0")).toHaveValue("1.2.3");
    await expect(page.getByTestId("adapter-cli-auth-status-0")).toHaveValue("unauthenticated");
    await expect(page.getByTestId("adapter-cli-auth-env-vars-0")).toHaveValue("TOKEN_A, TOKEN_B");
    await expect(page.getByTestId("adapter-id-1")).toHaveValue("harness-e2e");
    await expect(page.getByTestId("adapter-harness-event-method-1")).toHaveValue("agent.event");
    await expect(page.getByTestId("adapter-harness-timeout-1")).toHaveValue("15000");
    await expect(page.getByTestId("adapter-harness-rpc-start-1")).toHaveValue("custom.start");
    await expect(page.getByTestId("adapter-settings-loaded-ids")).toContainText("cli-e2e");
    await expect(page.getByTestId("adapter-settings-loaded-ids")).toContainText("harness-e2e");
  } finally {
    if (app) {
      await app.close();
    }
    if (!keepTempArtifacts) {
      await rm(runRoot, { recursive: true, force: true });
    } else {
      console.log(`[ucad-e2e] keeping temp dir: ${runRoot}`);
    }
  }
});
