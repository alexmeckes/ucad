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
  sessionId: string | null;
  model: string | null;
}

/**
 * Gemini CLI adapter using non-interactive prompt mode (`gemini -p`).
 *
 * Uses `gemini -p "prompt" -o stream-json` for structured JSONL output.
 * Conversation continuity via `gemini -r <session_id> -p "prompt"`.
 */
export class GeminiCliAdapter implements AgentAdapter {
  private sessions = new Map<string, SessionRuntime>();

  metadata() {
    return {
      id: "gemini-cli",
      name: "Gemini CLI",
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
      await execFileAsync("which", ["gemini"]);
    } catch {
      binaryFound = false;
      detail = "CLI binary not found in PATH: gemini";
    }

    let authStatus: AdapterDiagnostics["authStatus"] = "unknown";
    if (binaryFound) {
      try {
        const start = Date.now();
        await execFileAsync("gemini", ["--version"], { timeout: 5000 });
        latencyMs = Date.now() - start;
      } catch {
        // version check failed
      }
    }

    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      authStatus = "authenticated";
    }

    return {
      adapterId: "gemini-cli",
      command: "gemini",
      binaryFound,
      authStatus,
      latencyMs,
      healthy: binaryFound,
      detail,
      installHintCommand: "npm install -g @google/gemini-cli",
      authHintCommand: "gemini auth login",
    };
  }

  async start(req: StartSessionRequest): Promise<void> {
    const queue = new AsyncQueue<AdapterEvent>();

    const model = (req.metadata?.model as string) || null;
    this.sessions.set(req.sessionId, {
      queue,
      projectId: req.projectId,
      workspaceRoot: req.workspaceRoot,
      isFirstTurn: true,
      activeProcess: null,
      sessionId: null,
      model,
    });

    queue.push(
      this.makeEvent(req.sessionId, req.projectId, "session_state_changed", {
        state: "RUNNING",
      })
    );
    queue.push(
      this.makeEvent(req.sessionId, req.projectId, "assistant_message", {
        message: `Gemini CLI session started in ${path.basename(req.workspaceRoot)}`,
      })
    );
  }

  async sendTurn(req: UserTurnRequest): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found for gemini-cli: ${req.sessionId}`);
    }

    session.queue.push(
      this.makeEvent(req.sessionId, session.projectId, "command_started", {
        command: "gemini -p",
        turnId: req.turnId,
      })
    );

    // Build args for non-interactive mode with stream-json output
    const args = ["-p", req.content, "-o", "stream-json"];

    if (session.model) {
      args.push("-m", session.model);
    }

    // Resume previous conversation
    if (!session.isFirstTurn && session.sessionId) {
      args.push("-r", session.sessionId);
    }

    session.isFirstTurn = false;

    const env = { ...process.env } as Record<string, string>;

    console.log(`[gemini-cli] spawn: gemini ${args.join(" ")}`);
    console.log(`[gemini-cli] cwd: ${session.workspaceRoot}`);

    const childProc = spawn("gemini", args, {
      cwd: session.workspaceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    session.activeProcess = childProc;
    console.log(`[gemini-cli] process spawned, pid=${childProc.pid}`);

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
      console.log(`[gemini-cli] process exited, code=${code}, signal=${signal}`);

      // Process remaining buffer
      if (stdoutBuf.trim()) {
        this.processOutputLine(stdoutBuf, req.sessionId, session);
      }

      if (stderrBuf.trim()) {
        // Filter out noisy stderr (credential loading messages)
        const meaningful = stderrBuf
          .split("\n")
          .filter((l) => !l.includes("Loaded cached credentials"))
          .join("\n")
          .trim();
        if (meaningful) {
          console.log(`[gemini-cli] stderr: ${meaningful.slice(0, 500)}`);
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
      console.error(`[gemini-cli] spawn error: ${err.message}`);
      session.queue.push(
        this.makeEvent(req.sessionId, session.projectId, "error", {
          message: `Failed to spawn gemini: ${err.message}`,
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

      // Capture session ID for resume on subsequent turns
      if (parsed.type === "init" && parsed.session_id) {
        session.sessionId = parsed.session_id as string;
        console.log(`[gemini-cli] session_id: ${session.sessionId}`);
      }

      // Assistant message - the actual response text
      if (
        parsed.type === "message" &&
        parsed.role === "assistant" &&
        parsed.content
      ) {
        session.queue.push(
          this.makeEvent(sessionId, session.projectId, "assistant_message", {
            message: parsed.content as string,
          })
        );
      }

      // Tool use events
      if (parsed.type === "tool_use") {
        session.queue.push(
          this.makeEvent(sessionId, session.projectId, "tool_call_requested", {
            toolName: (parsed.name as string) ?? "unknown",
            args: parsed.input ?? {},
          })
        );
      }

      if (parsed.type === "tool_result") {
        session.queue.push(
          this.makeEvent(sessionId, session.projectId, "tool_call_result", {
            toolName: (parsed.name as string) ?? "unknown",
            result: parsed.output ?? "",
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
      sourceAdapterId: "gemini-cli",
      type,
      payload,
    };
  }
}

export const createGeminiCliAdapter = (): GeminiCliAdapter => new GeminiCliAdapter();
