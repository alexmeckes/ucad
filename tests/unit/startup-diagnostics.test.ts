import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStartupDiagnostics, resolveStartupLogPath } from "../../apps/desktop/src/main/startup-diagnostics";

describe("startup diagnostics", () => {
  it("writes structured startup logs when enabled", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ucad-startup-diagnostics-"));
    const logPath = path.join(tempRoot, "logs", "startup.log");

    const diagnostics = createStartupDiagnostics({
      enabled: true,
      logFilePath: logPath
    });

    diagnostics.log("event_a", {
      value: 1
    });
    diagnostics.log("event_b", {
      value: 2
    });
    await diagnostics.flush();

    const raw = await readFile(logPath, "utf8");
    const lines = raw
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { event: string; data?: Record<string, unknown> });

    expect(lines).toHaveLength(2);
    expect(lines[0].event).toBe("event_a");
    expect(lines[0].data?.value).toBe(1);
    expect(lines[1].event).toBe("event_b");

    await rm(tempRoot, { recursive: true, force: true });
  });

  it("is a no-op when disabled and resolves default/override log path", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ucad-startup-diagnostics-off-"));
    const logPath = path.join(tempRoot, "logs", "startup.log");

    const diagnostics = createStartupDiagnostics({
      enabled: false,
      logFilePath: logPath
    });
    diagnostics.log("ignored");
    await diagnostics.flush();

    await expect(access(logPath)).rejects.toThrow();
    expect(resolveStartupLogPath({ UCAD_STARTUP_LOG_PATH: logPath })).toBe(logPath);
    expect(resolveStartupLogPath({})).toContain(path.join(".ucad", "logs", "startup.log"));

    await rm(tempRoot, { recursive: true, force: true });
  });
});
