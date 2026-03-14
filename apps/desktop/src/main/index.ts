import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { AgentAdapter } from "@ucad/contracts";
import { UcadOrchestrator } from "@ucad/orchestrator";
import { createMockAdapters } from "./mock-adapters";
import {
  buildExternalAdapters,
  defaultExternalAdapterConfigPath,
  readExternalAdapterConfig
} from "./external-adapters";
import { registerAdapterSettingsIpc } from "./adapter-settings-ipc";
import { createStartupDiagnostics, resolveStartupLogPath } from "./startup-diagnostics";

const e2eSafeMode = process.env.UCAD_E2E_SAFE_MODE === "1";
const useMockAdapters = process.env.UCAD_USE_MOCK_ADAPTERS === "1";
const startupDiagnostics = createStartupDiagnostics({
  enabled: process.env.UCAD_STARTUP_DIAGNOSTICS === "1" || e2eSafeMode,
  logFilePath: resolveStartupLogPath(process.env)
});

const toErrorPayload = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return {
    message: String(error)
  };
};

const parsePositiveMs = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const rendererLoadTimeoutMs = parsePositiveMs(process.env.UCAD_RENDERER_LOAD_TIMEOUT_MS) ?? (e2eSafeMode ? 30_000 : 0);

startupDiagnostics.wireProcessHandlers();
startupDiagnostics.log("process_boot", {
  platform: process.platform,
  cwd: process.cwd(),
  argv: process.argv,
  electronVersion: process.versions.electron ?? "unknown",
  nodeVersion: process.version,
  e2eSafeMode,
  startupLogPath: startupDiagnostics.logFilePath,
  rendererLoadTimeoutMs
});

if (e2eSafeMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  startupDiagnostics.log("e2e_safe_mode_applied", {
    switches: ["disable-gpu", "disable-software-rasterizer", "disable-dev-shm-usage"]
  });
}

const loadBuiltInAdapters = async (): Promise<AgentAdapter[]> => {
  const [{ CodexCliAdapter }, { ClaudeCliAdapter }, { GeminiCliAdapter }] = await Promise.all([
    import("@ucad/codex-cli-adapter"),
    import("@ucad/claude-cli-adapter"),
    import("@ucad/gemini-cli-adapter")
  ]);

  return [new CodexCliAdapter(), new ClaudeCliAdapter(), new GeminiCliAdapter()];
};

const orchestrator = new UcadOrchestrator({
  dbPath: process.env.UCAD_DB_PATH,
  adapters: useMockAdapters ? createMockAdapters() : [],
  cleanupIntervalMs: process.env.UCAD_DISABLE_CLEANUP_TIMER === "1" ? 0 : undefined
});

let mainWindow: BrowserWindow | null = null;
const externalAdapterConfigPath = defaultExternalAdapterConfigPath(process.env.UCAD_ADAPTER_CONFIG_PATH);

const resolvePreloadPath = (): string => {
  const preloadCandidates = [
    path.join(__dirname, "../preload/index.mjs"),
    path.join(__dirname, "../preload/index.js")
  ];

  for (const candidate of preloadCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return preloadCandidates[0];
};

const createWindow = (): void => {
  startupDiagnostics.log("window_create_start", {
    e2eSafeMode
  });

  const preloadPath = resolvePreloadPath();
  startupDiagnostics.log("window_preload_path_resolved", {
    preloadPath,
    exists: existsSync(preloadPath)
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    show: !e2eSafeMode,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  startupDiagnostics.log("window_created", {
    visible: !e2eSafeMode
  });

  let loadWatchdog: NodeJS.Timeout | null = null;
  const clearLoadWatchdog = (): void => {
    if (!loadWatchdog) {
      return;
    }
    clearTimeout(loadWatchdog);
    loadWatchdog = null;
  };

  if (rendererLoadTimeoutMs > 0) {
    loadWatchdog = setTimeout(() => {
      startupDiagnostics.log("renderer_load_watchdog_timeout", {
        timeoutMs: rendererLoadTimeoutMs,
        isLoading: mainWindow?.webContents.isLoading() ?? false,
        hasMainWindow: Boolean(mainWindow)
      });
    }, rendererLoadTimeoutMs);
  }

  mainWindow.webContents.on("did-finish-load", () => {
    clearLoadWatchdog();
    startupDiagnostics.log("renderer_did_finish_load", {
      url: mainWindow?.webContents.getURL() ?? "unknown"
    });
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    clearLoadWatchdog();
    startupDiagnostics.log("renderer_did_fail_load", {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    startupDiagnostics.log("renderer_process_gone", {
      reason: details.reason,
      exitCode: details.exitCode
    });
  });

  mainWindow.on("unresponsive", () => {
    startupDiagnostics.log("window_unresponsive");
  });

  mainWindow.on("closed", () => {
    clearLoadWatchdog();
    startupDiagnostics.log("window_closed");
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const loadPromise = process.env.ELECTRON_RENDERER_URL
    ? mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    : mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  startupDiagnostics.log("window_load_requested", {
    mode: process.env.ELECTRON_RENDERER_URL ? "url" : "file"
  });

  void loadPromise
    .then(() => {
      startupDiagnostics.log("window_load_promise_resolved");
    })
    .catch((error) => {
      startupDiagnostics.log("window_load_promise_rejected", {
        error: toErrorPayload(error)
      });
    });

};

app.on("child-process-gone", (_event, details) => {
  startupDiagnostics.log("child_process_gone", {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    serviceName: details.serviceName,
    name: details.name
  });
});

app.on("web-contents-created", (_event, contents) => {
  startupDiagnostics.log("web_contents_created", {
    id: contents.id,
    type: contents.getType()
  });
});

app.on("before-quit", () => {
  startupDiagnostics.log("before_quit");
  void startupDiagnostics.flush();
  orchestrator.dispose();
});

app
  .whenReady()
  .then(async () => {
    startupDiagnostics.log("app_when_ready");

    if (!useMockAdapters) {
      startupDiagnostics.log("builtin_adapters_load_start");
      const builtInAdapters = await loadBuiltInAdapters();
      for (const adapter of builtInAdapters) {
        orchestrator.registerAdapter(adapter);
      }
      startupDiagnostics.log("builtin_adapters_loaded", {
        count: builtInAdapters.length
      });
    } else {
      startupDiagnostics.log("builtin_adapters_mock_mode", {
        count: orchestrator.listAdapters().length
      });
    }

    const externalConfig = await readExternalAdapterConfig(externalAdapterConfigPath);
    const externalAdapters = buildExternalAdapters(externalConfig);
    startupDiagnostics.log("external_adapters_loaded", {
      configPath: externalAdapterConfigPath,
      adapterCount: externalAdapters.length
    });
    if (externalAdapters.length > 0) {
      orchestrator.setExternalAdapters(externalAdapters);
    }

    await orchestrator.initialize();
    startupDiagnostics.log("orchestrator_initialized");
    createWindow();

    orchestrator.onEvent((event) => {
      const payloadPreview = event.type === "command_output"
        ? JSON.stringify((event.payload.output as string)?.slice(0, 200))
        : JSON.stringify(event.payload).slice(0, 200);
      console.log(`[ucad-event] type=${event.type} session=${event.sessionId.slice(0, 8)} payload=${payloadPreview}`);
      mainWindow?.webContents.send("orchestrator:event", event);
    });

    ipcMain.handle("health.get", async () => orchestrator.getHealth());
    ipcMain.handle("app.launchContext", async () => ({ cwd: process.cwd() }));
    ipcMain.handle("adapter.list", async () => orchestrator.listAdapters());
    registerAdapterSettingsIpc({
      ipcMain,
      configPath: externalAdapterConfigPath,
      orchestrator,
      env: process.env
    });

    ipcMain.handle("project.create", async (_, req) => orchestrator.createProject(req));
    ipcMain.handle("project.list", async () => orchestrator.listProjects());

    ipcMain.handle("session.list", async (_, req) => orchestrator.listSessions(req.projectId));
    ipcMain.handle("session.events", async (_, req) => orchestrator.listSessionEvents(req.sessionId));

    ipcMain.handle("session.create", async (_, req) => orchestrator.createSession(req));
    ipcMain.handle("session.sendTurn", async (_, req) => {
      console.log(`[ucad-sendTurn] session=${req.sessionId.slice(0, 8)} content="${req.content.slice(0, 50)}"`);
      const result = await orchestrator.sendTurn(req);
      console.log(`[ucad-sendTurn] result=`, JSON.stringify(result));
      return result;
    });
    ipcMain.handle("session.fork", async (_, req) => orchestrator.forkSession(req));
    ipcMain.handle("session.interrupt", async (_, req) => orchestrator.interruptSession(req.sessionId));

    ipcMain.handle("permission.resolve", async (_, req) => orchestrator.resolvePermission(req));

    ipcMain.handle("review.getDiff", async (_, req) => orchestrator.getDiff(req));
    ipcMain.handle("review.stage", async (_, req) => orchestrator.stageReview(req));
    ipcMain.handle("review.revert", async (_, req) => orchestrator.revertReview(req));

    ipcMain.handle("session.generateId", async () => randomUUID());

    app.on("activate", () => {
      startupDiagnostics.log("app_activate", {
        windowCount: BrowserWindow.getAllWindows().length
      });
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch(async (error) => {
    startupDiagnostics.log("app_startup_failed", {
      error: toErrorPayload(error)
    });
    await startupDiagnostics.flush();
    throw error;
  });

app.on("window-all-closed", () => {
  startupDiagnostics.log("window_all_closed", {
    platform: process.platform
  });
  void startupDiagnostics.flush();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
