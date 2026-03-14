import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface StartupDiagnosticsOptions {
  enabled: boolean;
  logFilePath?: string;
}

export interface StartupDiagnostics {
  enabled: boolean;
  logFilePath: string;
  log: (event: string, data?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  wireProcessHandlers: () => void;
}

const asAbsolutePath = (input: string): string => {
  return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
};

const serializeUnknown = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  return value;
};

export const resolveStartupLogPath = (env: NodeJS.ProcessEnv = process.env): string => {
  if (env.UCAD_STARTUP_LOG_PATH && env.UCAD_STARTUP_LOG_PATH.trim().length > 0) {
    return asAbsolutePath(env.UCAD_STARTUP_LOG_PATH.trim());
  }

  return path.join(os.homedir(), ".ucad", "logs", "startup.log");
};

export const createStartupDiagnostics = (options: StartupDiagnosticsOptions): StartupDiagnostics => {
  const logFilePath = options.logFilePath ? asAbsolutePath(options.logFilePath) : resolveStartupLogPath(process.env);
  const enabled = options.enabled;

  let queue: Promise<void> = Promise.resolve();
  let directoryReady = false;
  let processHandlersWired = false;
  const safeStringify = (value: Record<string, unknown>): string => {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, innerValue) => {
      if (typeof innerValue === "object" && innerValue !== null) {
        if (seen.has(innerValue)) {
          return "[Circular]";
        }
        seen.add(innerValue);
      }
      return serializeUnknown(innerValue);
    });
  };

  const write = (entry: Record<string, unknown>): void => {
    if (!enabled) {
      return;
    }

    queue = queue
      .then(async () => {
        if (!directoryReady) {
          await mkdir(path.dirname(logFilePath), { recursive: true });
          directoryReady = true;
        }
        await appendFile(logFilePath, `${safeStringify(entry)}\n`, "utf8");
      })
      .catch(() => {
        // Diagnostics are best effort and should never block startup.
      });
  };

  const log = (event: string, data?: Record<string, unknown>): void => {
    const payload: Record<string, unknown> = {
      timestampIso: new Date().toISOString(),
      pid: process.pid,
      event
    };
    if (data && Object.keys(data).length > 0) {
      payload.data = serializeUnknown(data) as Record<string, unknown>;
    }
    write(payload);
  };

  const wireProcessHandlers = (): void => {
    if (!enabled || processHandlersWired) {
      return;
    }
    processHandlersWired = true;

    process.on("uncaughtException", (error) => {
      log("uncaught_exception", {
        error: serializeUnknown(error)
      });
    });

    process.on("unhandledRejection", (reason) => {
      log("unhandled_rejection", {
        reason: serializeUnknown(reason)
      });
    });
  };

  return {
    enabled,
    logFilePath,
    log,
    flush: async () => queue,
    wireProcessHandlers
  };
};
