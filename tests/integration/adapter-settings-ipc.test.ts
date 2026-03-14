import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentAdapter, AdapterSettingsState } from "@ucad/contracts";
import { registerAdapterSettingsIpc } from "../../apps/desktop/src/main/adapter-settings-ipc";

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>;

class FakeIpcMain {
  readonly handlers = new Map<string, IpcHandler>();

  handle(channel: string, listener: IpcHandler): void {
    this.handlers.set(channel, listener);
  }

  async invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`Handler not registered: ${channel}`);
    }
    return (await handler({}, ...args)) as T;
  }
}

class FakeAdapterController {
  public calls: string[][] = [];

  setExternalAdapters(adapters: AgentAdapter[]): void {
    this.calls.push(adapters.map((adapter) => adapter.metadata().id).sort());
  }
}

describe("adapter settings IPC handlers", () => {
  it("reads and saves external adapters through registered IPC handlers", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ucad-adapter-ipc-"));
    const configPath = path.join(tempRoot, "adapters.json");

    const ipcMain = new FakeIpcMain();
    const orchestrator = new FakeAdapterController();

    registerAdapterSettingsIpc({
      ipcMain,
      configPath,
      orchestrator,
      env: {}
    });

    const initial = await ipcMain.invoke<AdapterSettingsState>("settings.adapters.get");
    expect(initial.configPath).toBe(configPath);
    expect(initial.adapters).toEqual([]);
    expect(initial.loadedAdapterIds).toEqual([]);
    expect(initial.note).toBe("Using default adapter config path.");

    const saved = await ipcMain.invoke<AdapterSettingsState>("settings.adapters.save", {
      adapters: [
        {
          type: "cli",
          id: "custom-cli",
          name: "Custom CLI",
          command: "custom",
          args: ["--interactive"],
          authEnvVars: ["CUSTOM_TOKEN"],
          installHintCommand: "brew install custom"
        },
        {
          type: "harness_stdio",
          id: "custom-harness",
          name: "Custom Harness",
          command: "node",
          args: ["./harness.mjs"],
          timeoutMs: 12000,
          rpcMethods: {
            start: "session.start",
            sendTurn: "session.turn"
          }
        }
      ]
    });

    expect(saved.loadedAdapterIds.sort()).toEqual(["custom-cli", "custom-harness"]);
    expect(orchestrator.calls).toEqual([["custom-cli", "custom-harness"]]);

    const reread = await ipcMain.invoke<AdapterSettingsState>("settings.adapters.get");
    expect(reread.adapters).toHaveLength(2);
    expect(reread.adapters[0]).toMatchObject({
      type: "cli",
      id: "custom-cli",
      authEnvVars: ["CUSTOM_TOKEN"]
    });
    expect(reread.adapters[1]).toMatchObject({
      type: "harness_stdio",
      id: "custom-harness",
      timeoutMs: 12000
    });

    await rm(tempRoot, { recursive: true, force: true });
  });
});
