import { randomUUID } from "node:crypto";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { AsyncQueue } from "@ucad/adapter-sdk";
import type {
  AdapterDiagnostics,
  AdapterCapabilities,
  AdapterEvent,
  AdapterKind,
  AgentAdapter,
  SessionRef,
  StartSessionRequest,
  UserTurnRequest,
} from "@ucad/contracts";

const execFileAsync = promisify(execFile);

interface SessionRuntime {
  queue: AsyncQueue<AdapterEvent>;
  projectId: string;
  workspaceRoot: string;
  isFirstTurn: boolean;
  activeProcess: ChildProcess | null;
  threadId: string | null;
  model: string | null;
  effort: string | null;
}

/**
 * Codex CLI adapter using non-interactive exec mode (`codex exec --json`).
 *
 * Uses `codex exec --json` for structured JSONL output.
 * Conversation continuity via `codex exec resume <thread_id>`.
 */
export class CodexCliAdapter implements AgentAdapter {
  private sessions = new Map<string, SessionRuntime>();

  metadata() {
    return {
      id: "codex-cli",
      name: "Codex CLI",
      kind: "cli" as AdapterKind,
    };
  }

  capabilities(): AdapterCapabilities {
    return {
      structuredEvents: true,
      structuredTools: false,
      supportsForkHints: false,
      supportsResume: false,
      supportsInterrupt: true,
      supportsPatch: false,
      supportsMcpPassthrough: false,
    };
  }

  async diagnostics(): Promise<AdapterDiagnostics> {
    let binaryFound = true;
    let latencyMs: number | null = null;
    let detail: string | undefined;

    try {
      await execFileAsync("which", ["codex"]);
    } catch {
      binaryFound = false;
      detail = "CLI binary not found in PATH: codex";
    }

    let authStatus: AdapterDiagnostics["authStatus"] = "unknown";
    if (binaryFound) {
      try {
        const start = Date.now();
        await execFileAsync("codex", ["--version"], { timeout: 5000 });
        latencyMs = Date.now() - start;
      } catch (error) {
        const start = Date.now();
        latencyMs = Date.now() - start;
      }
    }

    if (process.env.OPENAI_API_KEY) {
      authStatus = "authenticated";
    }

    return {
      adapterId: "codex-cli",
      command: "codex",
      binaryFound,
      authStatus,
      latencyMs,
      healthy: binaryFound,
      detail,
      installHintCommand: "npm install -g @openai/codex",
      authHintCommand: "codex login",
    };
  }

  async start(req: StartSessionRequest): Promise<void> {
    const queue = new AsyncQueue<AdapterEvent>();

    const model = (req.metadata?.model as string) || null;
    const effort = (req.metadata?.effort as string) || null;
    this.sessions.set(req.sessionId, {
      queue,
      projectId: req.projectId,
      workspaceRoot: req.workspaceRoot,
      isFirstTurn: true,
      activeProcess: null,
      threadId: null,
      model,
      effort,
    });

    queue.push(
      this.makeEvent(req.sessionId, req.projectId, "session_state_changed", {
        state: "RUNNING",
      })
    );
    queue.push(
      this.makeEvent(req.sessionId, req.projectId, "assistant_message", {
        message: `Codex CLI session started in ${path.basename(req.workspaceRoot)}`,
      })
    );
  }

  async sendTurn(req: UserTurnRequest): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found for codex-cli: ${req.sessionId}`);
    }

    session.queue.push(
      this.makeEvent(req.sessionId, session.projectId, "command_started", {
        command: "codex exec",
        turnId: req.turnId,
      })
    );

    // Build args for non-interactive exec mode with JSONL output
    let args: string[];

    const modelArgs = session.model ? ["-m", session.model] : [];
    const effortArgs = session.effort ? ["-c", `model_reasoning_effort="${session.effort}"`] : [];

    if (!session.isFirstTurn && session.threadId) {
      // Resume previous conversation
      args = ["exec", "--json", "--skip-git-repo-check", ...modelArgs, ...effortArgs, "resume", session.threadId, req.content];
    } else {
      args = ["exec", "--json", "--skip-git-repo-check", ...modelArgs, ...effortArgs, req.content];
    }

    session.isFirstTurn = false;

    const env = { ...process.env } as Record<string, string>;

    // Find git root - codex requires being run from a git repo root
    let cwd = session.workspaceRoot;
    try {
      const { stdout: gitRoot } = await execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 3000 });
      cwd = gitRoot.trim();
    } catch {
      // Not a git repo - codex will fail, but let it report the error
    }

    console.log(`[codex-cli] spawn: codex ${args.join(" ")}`);
    console.log(`[codex-cli] cwd: ${cwd}`);

    const childProc = spawn("codex", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    session.activeProcess = childProc;
    console.log(`[codex-cli] process spawned, pid=${childProc.pid}`);

    let stdoutBuf = "";
    let stderrBuf = "";

    childProc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuf += text;

      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        this.processOutputLine(line, req.sessionId, session);
      }
    });

    childProc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    childProc.on("close", (code, signal) => {
      console.log(`[codex-cli] process exited, code=${code}, signal=${signal}`);

      // Process remaining buffer
      if (stdoutBuf.trim()) {
        this.processOutputLine(stdoutBuf, req.sessionId, session);
      }

      if (stderrBuf.trim()) {
        // Filter out noisy stderr (MCP errors, rollout warnings)
        const meaningful = stderrBuf
          .split("\n")
          .filter((l) => !l.includes("ERROR rmcp::") && !l.includes("ERROR codex_core::rollout"))
          .join("\n")
          .trim();
        if (meaningful) {
          console.log(`[codex-cli] stderr: ${meaningful.slice(0, 500)}`);
        }
      }

      session.queue.push(
        this.makeEvent(req.sessionId, session.projectId, "command_finished", {
          exitCode: code ?? 0,
          signal: signal ? 1 : 0,
        })
      );
      session.activeProcess = null;
    });

    childProc.on("error", (err) => {
      console.error(`[codex-cli] spawn error: ${err.message}`);
      session.queue.push(
        this.makeEvent(req.sessionId, session.projectId, "error", {
          message: `Failed to spawn codex: ${err.message}`,
        })
      );
      session.queue.push(
        this.makeEvent(req.sessionId, session.projectId, "command_finished", {
          exitCode: 1,
          signal: 0,
        })
      );
      session.activeProcess = null;
    });
  }

  private processOutputLine(
    line: string,
    sessionId: string,
    session: SessionRuntime
  ): void {
    try {
      const parsed = JSON.parse(line);

      // Capture thread ID for resume on subsequent turns
      if (parsed.type === "thread.started" && parsed.thread_id) {
        session.threadId = parsed.thread_id as string;
        console.log(`[codex-cli] thread_id: ${session.threadId}`);
      }

      // Agent message - the actual response text
      if (
        parsed.type === "item.completed" &&
        parsed.item?.type === "agent_message" &&
        parsed.item?.text
      ) {
        session.queue.push(
          this.makeEvent(sessionId, session.projectId, "assistant_message", {
            message: parsed.item.text as string,
          })
        );
      }

      // Reasoning (thinking)
      if (
        parsed.type === "item.completed" &&
        parsed.item?.type === "reasoning" &&
        parsed.item?.text
      ) {
        session.queue.push(
          this.makeEvent(sessionId, session.projectId, "assistant_message", {
            message: `*${parsed.item.text as string}*`,
          })
        );
      }

      // Tool use
      if (
        parsed.type === "item.completed" &&
        parsed.item?.type === "tool_call"
      ) {
        session.queue.push(
          this.makeEvent(sessionId, session.projectId, "tool_call_requested", {
            toolName: (parsed.item.name as string) ?? "unknown",
            args: parsed.item.arguments ?? {},
          })
        );
      }

      // Tool result
      if (
        parsed.type === "item.completed" &&
        parsed.item?.type === "tool_call_output"
      ) {
        session.queue.push(
          this.makeEvent(sessionId, session.projectId, "tool_call_result", {
            toolName: "unknown",
            result: parsed.item.output ?? "",
          })
        );
      }
    } catch {
      // Not valid JSON - ignore
    }
  }

  async interrupt(req: SessionRef): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) return;

    if (session.activeProcess) {
      session.activeProcess.kill("SIGINT");
    }
    session.queue.push(
      this.makeEvent(req.sessionId, session.projectId, "session_state_changed", {
        state: "INTERRUPTED",
      })
    );
  }

  async resume(req: SessionRef): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Unable to resume missing session ${req.sessionId}`);
    }
    session.queue.push(
      this.makeEvent(req.sessionId, session.projectId, "assistant_message", {
        message: "Session resumed. Send a message to continue.",
      })
    );
  }

  async stop(req: SessionRef): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) return;

    if (session.activeProcess) {
      session.activeProcess.kill();
    }
    session.queue.push(
      this.makeEvent(req.sessionId, session.projectId, "session_state_changed", {
        state: "COMPLETED",
      })
    );
    session.queue.close();
    this.sessions.delete(req.sessionId);
  }

  async *streamEvents(req: SessionRef): AsyncIterable<AdapterEvent> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Unable to stream missing session ${req.sessionId}`);
    }
    yield* session.queue;
  }

  private makeEvent(
    sessionId: string,
    projectId: string,
    type: AdapterEvent["type"],
    payload: Record<string, unknown>
  ): AdapterEvent {
    return {
      eventId: randomUUID(),
      sessionId,
      projectId,
      timestampIso: new Date().toISOString(),
      sourceAdapterId: "codex-cli",
      type,
      payload,
    };
  }
}

export const createCodexCliAdapter = (): CodexCliAdapter => new CodexCliAdapter();
