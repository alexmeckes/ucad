import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AdapterEvent } from "@ucad/contracts";
import { StdioHarnessAdapter } from "@ucad/harness-sdk-stdio";

const takeNext = async (iterator: AsyncIterator<AdapterEvent>, timeoutMs = 3000): Promise<AdapterEvent> => {
  return new Promise<AdapterEvent>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for harness event")), timeoutMs);
    void iterator
      .next()
      .then((result) => {
        clearTimeout(timer);
        if (result.done || !result.value) {
          reject(new Error("Harness event stream ended unexpectedly"));
          return;
        }
        resolve(result.value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

describe("StdioHarnessAdapter", () => {
  it("streams harness notifications as unified events", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ucad-harness-test-"));
    const harnessScript = path.join(tempRoot, "harness.mjs");

    await writeFile(
      harnessScript,
      `
import readline from "node:readline";
const out = (payload) => process.stdout.write(JSON.stringify(payload) + "\\n");
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  let msg = null;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const params = msg.params ?? {};
  if (msg.method === "session.start") {
    out({ jsonrpc: "2.0", id: msg.id, result: { ok: true } });
    out({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "session_state_changed",
        payload: { state: "RUNNING", source: "harness" }
      }
    });
    return;
  }

  if (msg.method === "session.turn") {
    out({ jsonrpc: "2.0", id: msg.id, result: { ok: true } });
    out({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "assistant_message",
        payload: { message: "echo:" + String(params.content ?? "") }
      }
    });
    return;
  }

  if (msg.method === "session.stop") {
    out({ jsonrpc: "2.0", id: msg.id, result: { ok: true } });
    process.exit(0);
    return;
  }

  out({
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: "Method not found: " + String(msg.method) }
  });
});
`,
      "utf8"
    );

    const adapter = new StdioHarnessAdapter({
      id: "local-harness",
      name: "Local Harness",
      command: process.execPath,
      args: [harnessScript]
    });

    const sessionId = "session-harness-test";
    const projectId = "project-harness-test";
    await adapter.start({
      sessionId,
      projectId,
      adapterId: "local-harness",
      mode: "LOCAL",
      workspaceRoot: tempRoot
    });

    const iterator = adapter.streamEvents({ sessionId })[Symbol.asyncIterator]();
    const runningEvent = await takeNext(iterator);
    expect(runningEvent.type).toBe("session_state_changed");
    expect(runningEvent.payload.state).toBe("RUNNING");

    await adapter.sendTurn({
      sessionId,
      turnId: "turn-1",
      content: "hello harness"
    });
    const assistantEvent = await takeNext(iterator);
    expect(assistantEvent.type).toBe("assistant_message");
    expect(assistantEvent.payload.message).toBe("echo:hello harness");

    await adapter.stop({ sessionId });
    await rm(tempRoot, { recursive: true, force: true });
  });
});
