#!/usr/bin/env node

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const argPath = process.argv[2];
const outputPath = path.resolve(cwd, argPath ?? "harnesses/my-harness.mjs");

const usage = () => {
  process.stdout.write("Usage: pnpm scaffold:harness [output-path]\n");
};

const fileExists = async (filePath) => {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
};

const template = `#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { StdioHarnessServer } from "@ucad/harness-sdk-stdio";

const server = new StdioHarnessServer();
const sessions = new Map();

const emit = (sessionId, projectId, type, payload = {}) => {
  server.notify("event", {
    eventId: randomUUID(),
    timestampIso: new Date().toISOString(),
    sessionId,
    projectId,
    type,
    payload
  });
};

server.register("session.start", (params) => {
  const sessionId = String(params?.sessionId ?? "");
  const projectId = String(params?.projectId ?? "unknown-project");
  sessions.set(sessionId, { projectId, state: "RUNNING" });
  emit(sessionId, projectId, "session_state_changed", { state: "RUNNING" });
  return { ok: true };
});

server.register("session.turn", (params) => {
  const sessionId = String(params?.sessionId ?? "");
  const runtime = sessions.get(sessionId);
  if (!runtime) {
    throw new Error("session not found");
  }

  const content = String(params?.content ?? "");
  emit(sessionId, runtime.projectId, "assistant_message", {
    message: "Harness received: " + content
  });
  return { ok: true };
});

server.register("session.interrupt", (params) => {
  const sessionId = String(params?.sessionId ?? "");
  const runtime = sessions.get(sessionId);
  if (!runtime) {
    throw new Error("session not found");
  }
  emit(sessionId, runtime.projectId, "session_state_changed", { state: "INTERRUPTED" });
  return { ok: true };
});

server.register("session.resume", (params) => {
  const sessionId = String(params?.sessionId ?? "");
  const runtime = sessions.get(sessionId);
  if (!runtime) {
    throw new Error("session not found");
  }
  emit(sessionId, runtime.projectId, "session_state_changed", { state: "RUNNING" });
  return { ok: true };
});

server.register("session.stop", (params) => {
  const sessionId = String(params?.sessionId ?? "");
  const runtime = sessions.get(sessionId);
  if (!runtime) {
    throw new Error("session not found");
  }
  emit(sessionId, runtime.projectId, "session_state_changed", { state: "COMPLETED" });
  sessions.delete(sessionId);
  return { ok: true };
});

server.start();
`;

const run = async () => {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  if (await fileExists(outputPath)) {
    process.stderr.write(`Refusing to overwrite existing file: ${outputPath}\n`);
    process.stderr.write("Provide a different path.\n");
    process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, template, "utf8");

  process.stdout.write(`Scaffolded harness: ${outputPath}\n`);
  process.stdout.write("Adapter config example:\n");
  process.stdout.write(
    `${JSON.stringify(
      {
        type: "harness_stdio",
        id: "my-harness",
        name: "My Harness",
        command: "node",
        args: [outputPath]
      },
      null,
      2
    )}\n`
  );
};

void run();
