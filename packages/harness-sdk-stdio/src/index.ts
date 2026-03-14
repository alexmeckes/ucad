import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import readline from "node:readline";
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

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

type Handler = (params?: Record<string, unknown>) => Promise<unknown> | unknown;

class AsyncQueue<T> implements AsyncIterable<T> {
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
          return { done: false, value: this.values.shift() as T };
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

export class StdioHarnessServer {
  private readonly handlers = new Map<string, Handler>();

  register(method: string, handler: Handler): void {
    this.handlers.set(method, handler);
  }

  start(): void {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

    rl.on("line", async (line) => {
      try {
        const message = JSON.parse(line) as JsonRpcRequest;
        if (!message.id || !message.method) {
          return;
        }

        const handler = this.handlers.get(message.method);
        if (!handler) {
          this.write({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`
            }
          });
          return;
        }

        const result = await handler(message.params);
        this.write({
          jsonrpc: "2.0",
          id: message.id,
          result
        });
      } catch (error) {
        this.write({
          jsonrpc: "2.0",
          id: randomUUID(),
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    this.write({
      jsonrpc: "2.0",
      method,
      params
    } satisfies JsonRpcNotification);
  }

  private write(payload: JsonRpcResponse | JsonRpcNotification): void {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
}

export class StdioHarnessClient {
  call(method: string, params?: Record<string, unknown>): JsonRpcRequest {
    return {
      jsonrpc: "2.0",
      id: randomUUID(),
      method,
      params
    };
  }
}

interface RpcMethods {
  start: string;
  sendTurn: string;
  interrupt: string;
  resume: string;
  stop: string;
}

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface HarnessRuntime {
  sessionId: string;
  projectId: string;
  queue: AsyncQueue<AdapterEvent>;
  child: ReturnType<typeof spawn>;
  pending: Map<string, PendingRpc>;
}

export interface StdioHarnessAdapterOptions {
  id: string;
  name: string;
  command: string;
  args?: string[];
  version?: string;
  eventNotificationMethod?: string;
  rpcMethods?: Partial<RpcMethods>;
  capabilities?: Partial<AdapterCapabilities>;
  timeoutMs?: number;
}

const DEFAULT_RPC_METHODS: RpcMethods = {
  start: "session.start",
  sendTurn: "session.turn",
  interrupt: "session.interrupt",
  resume: "session.resume",
  stop: "session.stop"
};

const DEFAULT_CAPABILITIES: AdapterCapabilities = {
  structuredEvents: true,
  structuredTools: true,
  supportsForkHints: true,
  supportsResume: true,
  supportsInterrupt: true,
  supportsPatch: true,
  supportsMcpPassthrough: true
};

const isRpcResponse = (payload: unknown): payload is JsonRpcResponse =>
  Boolean(payload && typeof payload === "object" && "id" in payload && "jsonrpc" in payload);

const isRpcNotification = (payload: unknown): payload is JsonRpcNotification =>
  Boolean(payload && typeof payload === "object" && "method" in payload && "jsonrpc" in payload);

export class StdioHarnessAdapter implements AgentAdapter {
  private readonly runtimes = new Map<string, HarnessRuntime>();
  private readonly rpcMethods: RpcMethods;
  private readonly eventNotificationMethod: string;
  private readonly capabilityOverrides: Partial<AdapterCapabilities>;
  private readonly timeoutMs: number;

  constructor(private readonly options: StdioHarnessAdapterOptions) {
    this.rpcMethods = {
      ...DEFAULT_RPC_METHODS,
      ...(options.rpcMethods ?? {})
    };
    this.eventNotificationMethod = options.eventNotificationMethod ?? "event";
    this.capabilityOverrides = options.capabilities ?? {};
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  metadata(): { id: string; name: string; kind: AdapterKind; version?: string } {
    return {
      id: this.options.id,
      name: this.options.name,
      kind: "harness",
      version: this.options.version
    };
  }

  capabilities(): AdapterCapabilities {
    return {
      ...DEFAULT_CAPABILITIES,
      ...this.capabilityOverrides
    };
  }

  async diagnostics(): Promise<AdapterDiagnostics> {
    return {
      adapterId: this.options.id,
      command: this.options.command,
      binaryFound: true,
      authStatus: "unknown",
      latencyMs: null,
      healthy: true
    };
  }

  async start(req: StartSessionRequest): Promise<void> {
    if (this.runtimes.has(req.sessionId)) {
      throw new Error(`Harness runtime already exists: ${req.sessionId}`);
    }

    const child = spawn(this.options.command, this.options.args ?? [], {
      cwd: req.workspaceRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const queue = new AsyncQueue<AdapterEvent>();
    const pending = new Map<string, PendingRpc>();
    const runtime: HarnessRuntime = {
      sessionId: req.sessionId,
      projectId: req.projectId,
      queue,
      child,
      pending
    };
    this.runtimes.set(req.sessionId, runtime);

    const stdoutRl = readline.createInterface({
      input: child.stdout ?? process.stdin,
      terminal: false
    });
    stdoutRl.on("line", (line) => {
      this.handleRuntimeLine(runtime, line);
    });

    child.stderr?.on("data", (chunk) => {
      runtime.queue.push(
        this.makeEvent(req.sessionId, req.projectId, "error", {
          message: chunk.toString()
        })
      );
    });

    child.on("exit", (code, signal) => {
      for (const [id, rpc] of runtime.pending.entries()) {
        clearTimeout(rpc.timer);
        rpc.reject(new Error(`Harness process exited while waiting for RPC ${id}`));
      }
      runtime.pending.clear();
      runtime.queue.push(
        this.makeEvent(req.sessionId, req.projectId, "session_state_changed", {
          state: code === 0 ? "COMPLETED" : "FAILED",
          exitCode: code,
          signal
        })
      );
      runtime.queue.close();
      this.runtimes.delete(req.sessionId);
      stdoutRl.close();
    });

    await this.callRpc(runtime, this.rpcMethods.start, req as unknown as Record<string, unknown>);
  }

  async sendTurn(req: UserTurnRequest): Promise<void> {
    const runtime = this.ensureRuntime(req.sessionId);
    await this.callRpc(runtime, this.rpcMethods.sendTurn, req as unknown as Record<string, unknown>);
  }

  async interrupt(req: SessionRef): Promise<void> {
    const runtime = this.ensureRuntime(req.sessionId);
    await this.callRpc(runtime, this.rpcMethods.interrupt, req as unknown as Record<string, unknown>);
  }

  async resume(req: SessionRef): Promise<void> {
    const runtime = this.ensureRuntime(req.sessionId);
    await this.callRpc(runtime, this.rpcMethods.resume, req as unknown as Record<string, unknown>);
  }

  async stop(req: SessionRef): Promise<void> {
    const runtime = this.ensureRuntime(req.sessionId);
    await this.callRpc(runtime, this.rpcMethods.stop, req as unknown as Record<string, unknown>);
    runtime.child.kill();
  }

  async *streamEvents(req: SessionRef): AsyncIterable<AdapterEvent> {
    const runtime = this.ensureRuntime(req.sessionId);
    yield* runtime.queue;
  }

  private ensureRuntime(sessionId: string): HarnessRuntime {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      throw new Error(`Harness runtime not found: ${sessionId}`);
    }
    return runtime;
  }

  private handleRuntimeLine(runtime: HarnessRuntime, line: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      runtime.queue.push(
        this.makeEvent(runtime.sessionId, runtime.projectId, "command_output", {
          output: line
        })
      );
      return;
    }

    if (isRpcResponse(payload)) {
      const pending = runtime.pending.get(payload.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      runtime.pending.delete(payload.id);
      if (payload.error) {
        pending.reject(new Error(payload.error.message));
      } else {
        pending.resolve(payload.result);
      }
      return;
    }

    if (isRpcNotification(payload) && payload.method === this.eventNotificationMethod) {
      const params = (payload.params ?? {}) as Record<string, unknown>;
      runtime.queue.push(this.normalizeIncomingEvent(runtime, params));
    }
  }

  private normalizeIncomingEvent(runtime: HarnessRuntime, params: Record<string, unknown>): AdapterEvent {
    const type = typeof params.type === "string" ? (params.type as AdapterEvent["type"]) : "assistant_message";
    const payload = typeof params.payload === "object" && params.payload ? (params.payload as Record<string, unknown>) : params;

    return {
      eventId: typeof params.eventId === "string" ? params.eventId : randomUUID(),
      sessionId: runtime.sessionId,
      projectId: runtime.projectId,
      timestampIso: typeof params.timestampIso === "string" ? params.timestampIso : new Date().toISOString(),
      sourceAdapterId: this.options.id,
      type,
      payload
    };
  }

  private async callRpc(runtime: HarnessRuntime, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = randomUUID();
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const stdin = runtime.child.stdin;
    if (!stdin) {
      throw new Error("Harness process stdin is unavailable");
    }

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        runtime.pending.delete(id);
        reject(new Error(`Harness RPC timed out: ${method}`));
      }, this.timeoutMs);

      runtime.pending.set(id, {
        resolve,
        reject,
        timer
      });
    });

    stdin.write(`${JSON.stringify(message)}\n`);
    return resultPromise;
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
      sourceAdapterId: this.options.id,
      type,
      payload
    };
  }
}

export const createStdioHarnessAdapter = (options: StdioHarnessAdapterOptions): StdioHarnessAdapter =>
  new StdioHarnessAdapter(options);
