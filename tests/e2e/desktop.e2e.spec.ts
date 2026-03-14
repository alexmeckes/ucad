import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

const runGit = (cwd: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8"
  }).toString();

const initProjectRepo = async (projectRoot: string): Promise<void> => {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, "file-a.txt"), "alpha\nbeta\ngamma\n", "utf8");
  await writeFile(path.join(projectRoot, "file-b.txt"), "uno\ndos\ntres\n", "utf8");
  await writeFile(path.join(projectRoot, "README.md"), "# UCAD E2E\n", "utf8");

  runGit(projectRoot, ["init"]);
  runGit(projectRoot, ["config", "user.name", "UCAD E2E"]);
  runGit(projectRoot, ["config", "user.email", "ucad-e2e@example.com"]);
  runGit(projectRoot, ["add", "."]);
  runGit(projectRoot, ["commit", "-m", "initial"]);
};

const launchDesktop = async (homePath: string): Promise<{ app: ElectronApplication; page: Page }> => {
  const startupLogPath = path.join(homePath, ".ucad", "logs", "startup-e2e.log");
  const app = await electron.launch({
    args: [MAIN_ENTRY],
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: homePath,
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

const selectSessionByAdapter = async (page: Page, adapterIdText: string): Promise<void> => {
  const optionLocator = page.locator("[data-testid='session-select'] option");
  const count = await optionLocator.count();

  for (let i = 0; i < count; i += 1) {
    const option = optionLocator.nth(i);
    const text = (await option.textContent()) ?? "";
    const value = await option.getAttribute("value");
    if (value && text.includes(adapterIdText)) {
      await page.getByTestId("session-select").selectOption(value);
      return;
    }
  }

  throw new Error(`Could not find session option containing ${adapterIdText}`);
};

const extractPatchForFile = (diffText: string, filePath: string): string => {
  const lines = diffText.split("\n");
  const output: string[] = [];
  let capture = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (capture) {
        break;
      }
      capture = line.includes(` a/${filePath} `) && line.includes(` b/${filePath}`);
    }

    if (capture) {
      output.push(line);
    }
  }

  return output.length > 0 ? `${output.join("\n").trimEnd()}\n` : "";
};

test("desktop app supports multi-adapter sessions, forking, permissions, review staging, and restart recovery", async () => {
  const runRoot = await mkdtemp(path.join(os.tmpdir(), "ucad-e2e-"));
  const homePath = path.join(runRoot, "home");
  const projectRoot = path.join(runRoot, "project");
  const keepTempArtifacts = process.env.UCAD_E2E_KEEP_TMP === "1";
  await mkdir(homePath, { recursive: true });
  await initProjectRepo(projectRoot);

  let app: ElectronApplication | null = null;

  try {
    ({ app } = await launchDesktop(homePath));
    const page = await app.firstWindow();

    await page.getByTestId("project-name-input").fill("E2E Project");
    await page.getByTestId("project-path-input").fill(projectRoot);
    await page.getByTestId("create-project-btn").click();
    await expect(page.getByTestId("project-item").first()).toBeVisible();

    await page.getByTestId("adapter-select").selectOption("codex-cli");
    await page.getByTestId("mode-select").selectOption("LOCAL");
    await page.getByTestId("start-session-btn").click();
    await expect(page.locator("[data-testid='session-select'] option")).toHaveCount(2);
    const localCodexSessionId = await page.getByTestId("session-select").inputValue();

    await page.getByTestId("turn-input").fill("hello from codex");
    await page.getByTestId("send-turn-btn").click();
    await expect(page.getByTestId("events-list")).toContainText("assistant_message");

    await page.getByTestId("adapter-select").selectOption("claude-cli");
    await page.getByTestId("start-session-btn").click();
    await expect(page.locator("[data-testid='session-select'] option")).toHaveCount(3);

    await selectSessionByAdapter(page, "codex-cli");
    await page.getByTestId("fork-session-btn").click();
    await expect(page.locator("[data-testid='session-select'] option")).toHaveCount(4);

    await page.getByTestId("turn-input").fill("/run rm -rf ./tmp");
    await page.getByTestId("send-turn-btn").click();
    await expect(page.getByTestId("permission-panel")).toBeVisible();
    await page.getByTestId("permission-deny-btn").click();
    await expect(page.locator("[data-testid='permission-panel']")).toHaveCount(0);

    await page.getByTestId("turn-input").fill("/run rm -rf ./tmp");
    await page.getByTestId("send-turn-btn").click();
    await expect(page.getByTestId("permission-panel")).toBeVisible();
    await page.getByTestId("permission-allow-once-btn").click();
    await expect(page.locator("[data-testid='permission-panel']")).toHaveCount(0);

    await writeFile(path.join(projectRoot, "file-a.txt"), "alpha\nbeta-updated\ngamma\n", "utf8");
    await writeFile(path.join(projectRoot, "file-b.txt"), "uno\ndos-updated\ntres\n", "utf8");
    expect(runGit(projectRoot, ["diff", "--name-only"])).toContain("file-a.txt");
    expect(runGit(projectRoot, ["diff", "--name-only"])).toContain("file-b.txt");

    await page.getByTestId("session-select").selectOption(localCodexSessionId);
    await expect(page.getByTestId("session-workspace-path")).toContainText(projectRoot);
    await page.getByTestId("diff-scope-select").selectOption("uncommitted");
    await page.getByTestId("load-diff-btn").click();

    await expect.poll(async () => page.getByTestId("diff-textarea").inputValue(), {
      timeout: 10_000
    }).toContain("file-a.txt");
    const combinedPatch = await page.getByTestId("diff-textarea").inputValue();
    expect(combinedPatch).toContain("file-a.txt");
    expect(combinedPatch).toContain("file-b.txt");

    const fileAPatch = extractPatchForFile(combinedPatch, "file-a.txt");
    expect(fileAPatch.length).toBeGreaterThan(0);

    await page.getByTestId("diff-textarea").fill(fileAPatch);
    await page.getByTestId("stage-patch-btn").click();

    const stagedNames = runGit(projectRoot, ["diff", "--cached", "--name-only"]);
    expect(stagedNames).toContain("file-a.txt");
    expect(stagedNames).not.toContain("file-b.txt");

    const graphNodeCount = await page.locator("[data-testid='session-graph-node']").count();
    await app.close();
    app = null;

    ({ app } = await launchDesktop(homePath));
    const pageAfterRestart = await app.firstWindow();

    await expect(pageAfterRestart.getByTestId("project-item").first()).toBeVisible();
    await expect(pageAfterRestart.locator("[data-testid='session-graph-node']")).toHaveCount(graphNodeCount);
    await expect(pageAfterRestart.getByTestId("session-graph")).toContainText("INTERRUPTED");
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
