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
  conversationId: string | null;
  model: string | null;
  effort: string | null;
}

/**
 * Claude CLI adapter using non-interactive print mode (`claude -p`).
 *
 * Instead of spawning an interactive TUI via PTY (which produces unparseable
 * terminal rendering output), this adapter runs `claude -p --output-format stream-json`
 * for each user turn. This gives structured JSON output that can be parsed into
 * proper assistant_message events.
 *
 * Conversation continuity is maintained via `--resume <id>` (if a session ID
 * is captured from the first turn's output) or `--continue` as fallback.
 */
export class ClaudeCliAdapter implements AgentAdapter {
  private sessions = new Map<string, SessionRuntime>();

  metadata() {
    return {
      id: "claude-cli",
      name: "Claude CLI",
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
      await execFileAsync("which", ["claude"]);
    } catch {
      binaryFound = false;
      detail = "CLI binary not found in PATH: claude";
    }

    let authStatus: AdapterDiagnostics["authStatus"] = "unknown";
    if (binaryFound) {
      try {
        const start = Date.now();
        await execFileAsync("claude", ["auth", "status"], { timeout: 5000 });
        latencyMs = Date.now() - start;
        authStatus = "authenticated";
      } catch (error) {
        const start = Date.now();
        latencyMs = Date.now() - start;
        const msg = this.getErrorText(error);
        if (/not logged in|unauthorized|authentication|login required/i.test(msg)) {
          authStatus = "unauthenticated";
        }
      }
    }

    if (authStatus === "unknown" && process.env.ANTHROPIC_API_KEY) {
      authStatus = "authenticated";
    }

    return {
      adapterId: "claude-cli",
      command: "claude",
      binaryFound,
      authStatus,
      latencyMs,
      healthy: binaryFound && authStatus !== "unauthenticated",
      detail,
      installHintCommand: "npm install -g @anthropic-ai/claude-code",
      authHintCommand: "claude login",
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
      conversationId: null,
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
        message: `Claude CLI session started in ${path.basename(req.workspaceRoot)}`,
      })
    );
  }

  async sendTurn(req: UserTurnRequest): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found for claude-cli: ${req.sessionId}`);
    }

    session.queue.push(
      this.makeEvent(req.sessionId, session.projectId, "command_started", {
        command: "claude -p",
        turnId: req.turnId,
      })
    );

    // Build args for non-interactive print mode with streaming JSON
    // Note: stream-json requires --verbose when used with -p
    const args = ["-p", "--verbose", "--output-format", "stream-json"];

    if (session.model) {
      args.push("--model", session.model);
    }

    if (session.effort) {
      args.push("--effort", session.effort);
    }

    // Continue conversation from previous turn
    if (!session.isFirstTurn) {
      if (session.conversationId) {
        args.push("--resume", session.conversationId);
      } else {
        args.push("--continue");
      }
    }

    args.push(req.content);
    session.isFirstTurn = false;

    // Remove CLAUDECODE env var to avoid "cannot launch inside another session" error
    const env = { ...process.env } as Record<string, string>;
    delete env.CLAUDECODE;

    console.log(`[claude-cli] spawn: claude ${args.join(" ")}`);
    console.log(`[claude-cli] cwd: ${session.workspaceRoot}`);

    const childProc = spawn("claude", args, {
      cwd: session.workspaceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"], // close stdin, pipe stdout/stderr
    });

    // Close stdin immediately so claude doesn't wait for input
    session.activeProcess = childProc;
    console.log(`[claude-cli] process spawned, pid=${childProc.pid}`);

    let stdoutBuf = "";
    let stderrBuf = "";

    childProc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuf += text;

      // Process complete lines as they arrive for real-time streaming
      const lines = stdoutBuf.split("\n");
      // Keep the last incomplete line in the buffer
      stdoutBuf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        this.processOutputLine(line, req.sessionId, session);
        const extracted = this.extractTextFromLine(line);
        if (extracted) {
          session.queue.push(
            this.makeEvent(req.sessionId, session.projectId, "assistant_message", {
              message: extracted,
            })
          );
        }
      }
    });

    childProc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    childProc.on("close", (code, signal) => {
      console.log(`[claude-cli] process exited, code=${code}, signal=${signal}`);
      console.log(`[claude-cli] remaining stdout: ${stdoutBuf.slice(0, 500)}`);
      if (stderrBuf.trim()) {
        console.log(`[claude-cli] stderr: ${stderrBuf.slice(0, 500)}`);
      }

      // Process any remaining buffered stdout
      if (stdoutBuf.trim()) {
        this.processOutputLine(stdoutBuf, req.sessionId, session);
        const extracted = this.extractTextFromLine(stdoutBuf);
        if (extracted) {
          session.queue.push(
            this.makeEvent(req.sessionId, session.projectId, "assistant_message", {
              message: extracted,
            })
          );
        }
      }

      if (stderrBuf.trim()) {
        session.queue.push(
          this.makeEvent(req.sessionId, session.projectId, "error", {
            message: stderrBuf.trim(),
          })
        );
      }

      if (code !== 0 && code !== null) {
        session.queue.push(
          this.makeEvent(req.sessionId, session.projectId, "error", {
            message: `claude -p exited with code ${code}`,
          })
        );
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
      console.error(`[claude-cli] spawn error: ${err.message}`);
      session.queue.push(
        this.makeEvent(req.sessionId, session.projectId, "error", {
          message: `Failed to spawn claude: ${err.message}`,
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

  /**
   * Process a JSON line from stream-json output for structured events.
   */
  private processOutputLine(
    line: string,
    sessionId: string,
    session: SessionRuntime
  ): void {
    try {
      const parsed = JSON.parse(line);

      // Capture conversation/session ID for --resume on subsequent turns
      if (parsed.session_id && !session.conversationId) {
        session.conversationId = parsed.session_id as string;
      }

      // Handle tool use events
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
            result: parsed.content ?? "",
          })
        );
      }
    } catch {
      // Not valid JSON - ignore (handled in extractTextFromLine)
    }
  }

  /**
   * Extract text content from a stream-json output line.
   * Handles multiple possible JSON formats from claude -p --output-format stream-json.
   */
  private extractTextFromLine(line: string): string {
    try {
      const parsed = JSON.parse(line);

      // Format: Anthropic API streaming - content_block_delta
      if (
        parsed.type === "content_block_delta" &&
        parsed.delta?.type === "text_delta"
      ) {
        return (parsed.delta.text as string) ?? "";
      }

      // Format: assistant message with content array
      if (parsed.type === "assistant" && Array.isArray(parsed.message?.content)) {
        return (parsed.message.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("");
      }

      // Format: simple text event
      if (parsed.type === "text") {
        return (parsed.content as string) ?? (parsed.text as string) ?? "";
      }

      // Note: "result" type also contains the text in parsed.result, but we skip it
      // here to avoid duplicating the text already extracted from the "assistant" event.

      return "";
    } catch {
      // Not valid JSON - treat as plain text output (fallback for non-JSON modes)
      return line.trim() ? line + "\n" : "";
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
      sourceAdapterId: "claude-cli",
      type,
      payload,
    };
  }

  private getErrorText(error: unknown): string {
    if (!error || typeof error !== "object") return "Unknown error";
    const e = error as { message?: string; stdout?: string | Buffer; stderr?: string | Buffer };
    return [
      e.message ?? "",
      typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? "",
      typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "",
    ].join("\n");
  }
}

export const createClaudeCliAdapter = (): ClaudeCliAdapter => new ClaudeCliAdapter();
