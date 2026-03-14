import { randomUUID } from "node:crypto";
import type {
  AdapterCapabilities,
  AdapterDiagnostics,
  AdapterEvent,
  AdapterKind,
  AgentAdapter,
  SessionRef,
  StartSessionRequest,
  UserTurnRequest
} from "@ucad/contracts";

class SimpleAsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly resolvers: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) {
      return;
    }

    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ done: false, value });
      return;
    }

    this.values.push(value);
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      if (resolver) {
        resolver({ done: true, value: undefined });
      }
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        if (this.values.length > 0) {
          const value = this.values.shift() as T;
          return { done: false, value };
        }

        if (this.closed) {
          return { done: true, value: undefined };
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      }
    };
  }
}

interface MockRuntime {
  queue: SimpleAsyncQueue<AdapterEvent>;
  projectId: string;
}

class MockCliAdapter implements AgentAdapter {
  private readonly sessions = new Map<string, MockRuntime>();

  constructor(
    private readonly id: string,
    private readonly name: string,
    private readonly command: string
  ) {}

  metadata(): { id: string; name: string; kind: AdapterKind; version?: string } {
    return {
      id: this.id,
      name: this.name,
      kind: "cli",
      version: "mock"
    };
  }

  capabilities(): AdapterCapabilities {
    return {
      structuredEvents: true,
      structuredTools: false,
      supportsForkHints: true,
      supportsResume: true,
      supportsInterrupt: true,
      supportsPatch: false,
      supportsMcpPassthrough: false
    };
  }

  async diagnostics(): Promise<AdapterDiagnostics> {
    return {
      adapterId: this.id,
      command: this.command,
      binaryFound: true,
      authStatus: "authenticated",
      latencyMs: 1,
      healthy: true,
      installHintCommand: `echo "${this.command} is mocked in UCAD_USE_MOCK_ADAPTERS mode"`,
      authHintCommand: `echo "${this.command} auth is mocked in UCAD_USE_MOCK_ADAPTERS mode"`
    };
  }

  async start(req: StartSessionRequest): Promise<void> {
    const queue = new SimpleAsyncQueue<AdapterEvent>();
    this.sessions.set(req.sessionId, {
      queue,
      projectId: req.projectId
    });

    queue.push(this.makeEvent(req.sessionId, req.projectId, "session_state_changed", { state: "RUNNING" }));
    queue.push(
      this.makeEvent(req.sessionId, req.projectId, "assistant_message", {
        message: `${this.name} mock session started`
      })
    );
  }

  async sendTurn(req: UserTurnRequest): Promise<void> {
    const runtime = this.sessions.get(req.sessionId);
    if (!runtime) {
      throw new Error(`Session not found for mock adapter ${this.id}: ${req.sessionId}`);
    }

    runtime.queue.push(
      this.makeEvent(req.sessionId, runtime.projectId, "command_started", {
        command: "mock_user_turn",
        turnId: req.turnId
      })
    );

    runtime.queue.push(
      this.makeEvent(req.sessionId, runtime.projectId, "assistant_message", {
        message: `[${this.id}] ${req.content}`
      })
    );

    runtime.queue.push(
      this.makeEvent(req.sessionId, runtime.projectId, "command_finished", {
        exitCode: 0,
        signal: 0
      })
    );
  }

  async interrupt(req: SessionRef): Promise<void> {
    const runtime = this.sessions.get(req.sessionId);
    if (!runtime) {
      return;
    }
    runtime.queue.push(this.makeEvent(req.sessionId, runtime.projectId, "session_state_changed", { state: "INTERRUPTED" }));
  }

  async resume(req: SessionRef): Promise<void> {
    const runtime = this.sessions.get(req.sessionId);
    if (!runtime) {
      return;
    }
    runtime.queue.push(this.makeEvent(req.sessionId, runtime.projectId, "session_state_changed", { state: "RUNNING" }));
  }

  async stop(req: SessionRef): Promise<void> {
    const runtime = this.sessions.get(req.sessionId);
    if (!runtime) {
      return;
    }
    runtime.queue.push(this.makeEvent(req.sessionId, runtime.projectId, "session_state_changed", { state: "COMPLETED" }));
    runtime.queue.close();
    this.sessions.delete(req.sessionId);
  }

  async *streamEvents(req: SessionRef): AsyncIterable<AdapterEvent> {
    const runtime = this.sessions.get(req.sessionId);
    if (!runtime) {
      throw new Error(`Unable to stream missing session ${req.sessionId}`);
    }
    yield* runtime.queue;
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
      sourceAdapterId: this.id,
      type,
      payload
    };
  }
}

export const createMockAdapters = (): AgentAdapter[] => [
  new MockCliAdapter("codex-cli", "Codex CLI (Mock)", "codex"),
  new MockCliAdapter("claude-cli", "Claude CLI (Mock)", "claude"),
  new MockCliAdapter("gemini-cli", "Gemini CLI (Mock)", "gemini")
];
