import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pty from "node-pty";
import type {
  AdapterDiagnostics,
  AdapterCapabilities,
  AdapterEvent,
  AdapterKind,
  AgentAdapter,
  SessionRef,
  StartSessionRequest,
  UserTurnRequest
} from "@ucad/contracts";
import { AsyncQueue } from "./async-queue";

interface SessionRuntime {
  ptyProcess: pty.IPty;
  queue: AsyncQueue<AdapterEvent>;
  projectId: string;
}

const execFileAsync = promisify(execFile);

export interface CliAdapterOptions {
  id: string;
  name: string;
  command: string;
  args?: string[];
  version?: string;
  versionArgs?: string[];
  authEnvVars?: string[];
  authStatusWhenEnvMissing?: "unauthenticated" | "unknown";
  authProbeCommand?: string;
  authProbeArgs?: string[];
  authProbeUnauthenticatedPatterns?: string[];
  installHintCommand?: string;
  authHintCommand?: string;
}

export abstract class BaseCliAdapter implements AgentAdapter {
  protected readonly id: string;
  protected readonly name: string;
  protected readonly command: string;
  protected readonly args: string[];
  protected readonly version?: string;
  protected readonly versionArgs: string[];
  protected readonly authEnvVars: string[];
  protected readonly authStatusWhenEnvMissing: "unauthenticated" | "unknown";
  protected readonly authProbeCommand?: string;
  protected readonly authProbeArgs: string[];
  protected readonly authProbeUnauthenticatedPatterns: RegExp[];
  protected readonly installHintCommand?: string;
  protected readonly authHintCommand?: string;
  protected readonly sessions = new Map<string, SessionRuntime>();

  constructor(options: CliAdapterOptions) {
    this.id = options.id;
    this.name = options.name;
    this.command = options.command;
    this.args = options.args ?? [];
    this.version = options.version;
    this.versionArgs = options.versionArgs ?? ["--version"];
    this.authEnvVars = options.authEnvVars ?? [];
    this.authStatusWhenEnvMissing = options.authStatusWhenEnvMissing ?? "unknown";
    this.authProbeCommand = options.authProbeCommand;
    this.authProbeArgs = options.authProbeArgs ?? [];
    this.authProbeUnauthenticatedPatterns = (options.authProbeUnauthenticatedPatterns ?? []).map((pattern) => new RegExp(pattern, "i"));
    this.installHintCommand = options.installHintCommand;
    this.authHintCommand = options.authHintCommand;
  }

  metadata(): { id: string; name: string; kind: AdapterKind; version?: string } {
    return {
      id: this.id,
      name: this.name,
      kind: "cli",
      version: this.version
    };
  }

  capabilities(): AdapterCapabilities {
    return {
      structuredEvents: false,
      structuredTools: false,
      supportsForkHints: true,
      supportsResume: false,
      supportsInterrupt: true,
      supportsPatch: false,
      supportsMcpPassthrough: false
    };
  }

  async diagnostics(): Promise<AdapterDiagnostics> {
    const adapterId = this.id;
    let binaryFound = true;
    let latencyMs: number | null = null;
    let detail: string | undefined;

    try {
      await execFileAsync("which", [this.command]);
    } catch {
      binaryFound = false;
      detail = `CLI binary not found in PATH: ${this.command}`;
    }

    const authStatus = await this.resolveAuthStatus();

    if (binaryFound) {
      const start = Date.now();
      try {
        await execFileAsync(this.command, this.versionArgs, {
          timeout: 5000
        });
        latencyMs = Date.now() - start;
      } catch (error) {
        latencyMs = Date.now() - start;
        const message = error instanceof Error ? error.message : "Version probe failed";
        detail = detail ? `${detail}; ${message}` : message;
      }
    }

    const healthy = binaryFound && authStatus !== "unauthenticated";
    return {
      adapterId,
      command: this.command,
      binaryFound,
      authStatus,
      latencyMs,
      healthy,
      detail,
      installHintCommand: this.installHintCommand,
      authHintCommand: this.authHintCommand
    };
  }

  protected async resolveAuthStatus(): Promise<AdapterDiagnostics["authStatus"]> {
    if (this.authProbeCommand) {
      try {
        await execFileAsync(this.authProbeCommand, this.authProbeArgs, {
          timeout: 5000
        });
        return "authenticated";
      } catch (error) {
        const message = this.getErrorText(error);
        if (this.authProbeUnauthenticatedPatterns.some((pattern) => pattern.test(message))) {
          return "unauthenticated";
        }
      }
    }

    if (this.authEnvVars.length > 0) {
      const hasAnyAuthVar = this.authEnvVars.some((key) => Boolean(process.env[key]));
      return hasAnyAuthVar ? "authenticated" : this.authStatusWhenEnvMissing;
    }

    return "unknown";
  }

  private getErrorText(error: unknown): string {
    if (!error || typeof error !== "object") {
      return "Unknown error";
    }

    const maybeErr = error as { message?: string; stdout?: string | Buffer; stderr?: string | Buffer };
    const parts = [
      maybeErr.message ?? "",
      typeof maybeErr.stdout === "string" ? maybeErr.stdout : maybeErr.stdout?.toString() ?? "",
      typeof maybeErr.stderr === "string" ? maybeErr.stderr : maybeErr.stderr?.toString() ?? ""
    ];
    return parts.join("\n");
  }

  async start(req: StartSessionRequest): Promise<void> {
    const queue = new AsyncQueue<AdapterEvent>();

    const ptyProcess = pty.spawn(this.command, this.args, {
      name: "xterm-color",
      cols: 120,
      rows: 40,
      cwd: req.workspaceRoot,
      env: process.env as Record<string, string>,
      useConpty: false
    });

    const runtime: SessionRuntime = {
      ptyProcess,
      queue,
      projectId: req.projectId
    };

    ptyProcess.onData((data) => {
      runtime.queue.push(this.makeEvent(req.sessionId, req.projectId, "command_output", {
        output: data
      }));
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      runtime.queue.push(
        this.makeEvent(req.sessionId, req.projectId, "command_finished", {
          exitCode,
          signal
        })
      );
      runtime.queue.close();
      this.sessions.delete(req.sessionId);
    });

    this.sessions.set(req.sessionId, runtime);
    runtime.queue.push(this.makeEvent(req.sessionId, req.projectId, "session_state_changed", { state: "RUNNING" }));
    runtime.queue.push(
      this.makeEvent(req.sessionId, req.projectId, "assistant_message", {
        message: `${this.name} session started in ${path.basename(req.workspaceRoot)}`
      })
    );
  }

  async sendTurn(req: UserTurnRequest): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found for adapter ${this.id}: ${req.sessionId}`);
    }

    session.queue.push(
      this.makeEvent(req.sessionId, session.projectId, "command_started", {
        command: "user_turn",
        turnId: req.turnId
      })
    );

    session.ptyProcess.write(`${req.content}${os.EOL}`);
  }

  async interrupt(req: SessionRef): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      return;
    }

    session.ptyProcess.write("\u0003");
    session.queue.push(this.makeEvent(req.sessionId, session.projectId, "session_state_changed", { state: "INTERRUPTED" }));
  }

  async resume(req: SessionRef): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Unable to resume missing session ${req.sessionId}`);
    }

    session.queue.push(this.makeEvent(req.sessionId, session.projectId, "assistant_message", { message: "Resume is adapter-dependent for CLI sessions" }));
  }

  async stop(req: SessionRef): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      return;
    }

    session.ptyProcess.kill();
    session.queue.push(this.makeEvent(req.sessionId, session.projectId, "session_state_changed", { state: "COMPLETED" }));
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

  protected makeEvent(
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
      sourceAdapterId: this.id,
      type,
      payload
    };
  }
}
