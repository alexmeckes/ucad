import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
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
import { UcadOrchestrator } from "@ucad/orchestrator";
import { UcadStorage } from "@ucad/storage-sqlite";

class MockAdapter implements AgentAdapter {
  private readonly queues = new Map<string, AdapterEvent[]>();

  metadata(): { id: string; name: string; kind: AdapterKind; version?: string } {
    return { id: "mock-cli", name: "Mock CLI", kind: "cli" };
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
    return {
      adapterId: "mock-cli",
      command: "mock",
      binaryFound: true,
      authStatus: "authenticated",
      latencyMs: 1,
      healthy: true
    };
  }

  async start(req: StartSessionRequest): Promise<void> {
    this.queues.set(req.sessionId, [
      {
        eventId: randomUUID(),
        sessionId: req.sessionId,
        projectId: req.projectId,
        timestampIso: new Date().toISOString(),
        sourceAdapterId: "mock-cli",
        type: "session_state_changed",
        payload: { state: "RUNNING" }
      }
    ]);
  }

  async sendTurn(req: UserTurnRequest): Promise<void> {
    this.queues.get(req.sessionId)?.push({
      eventId: randomUUID(),
      sessionId: req.sessionId,
      projectId: "project",
      timestampIso: new Date().toISOString(),
      sourceAdapterId: "mock-cli",
      type: "assistant_message",
      payload: { message: `echo:${req.content}` }
    });
  }

  async interrupt(_req: SessionRef): Promise<void> {}
  async resume(_req: SessionRef): Promise<void> {}
  async stop(_req: SessionRef): Promise<void> {}

  async *streamEvents(req: SessionRef): AsyncIterable<AdapterEvent> {
    for (const event of this.queues.get(req.sessionId) ?? []) {
      yield event;
    }
  }
}

describe("orchestrator permission flow", () => {
  it("requests approval for risky /run commands", async () => {
    const dbPath = path.join(os.tmpdir(), `ucad-orch-${Date.now()}.db`);
    const orchestrator = new UcadOrchestrator({
      dbPath,
      adapters: [new MockAdapter()]
    });

    const project = await orchestrator.createProject({
      name: "demo",
      rootPath: os.tmpdir()
    });

    const sessionId = randomUUID();
    await orchestrator.createSession({
      sessionId,
      projectId: project.id,
      adapterId: "mock-cli",
      mode: "LOCAL",
      workspaceRoot: project.rootPath,
      title: "mock"
    });

    const sendResult = await orchestrator.sendTurn({
      sessionId,
      turnId: randomUUID(),
      content: "/run rm -rf ./tmp"
    });

    expect(sendResult.awaitingApproval).toBe(true);
    expect(sendResult.permissionRequestId).toBeTruthy();

    orchestrator.dispose();
  });

  it("rehydrates sessions and interrupts active state after restart", async () => {
    const dbPath = path.join(os.tmpdir(), `ucad-orch-recovery-${Date.now()}.db`);
    const adapter = new MockAdapter();
    const orchestratorA = new UcadOrchestrator({
      dbPath,
      adapters: [adapter],
      cleanupIntervalMs: 0
    });

    const project = await orchestratorA.createProject({
      name: "demo-recovery",
      rootPath: os.tmpdir()
    });

    const sessionId = randomUUID();
    await orchestratorA.createSession({
      sessionId,
      projectId: project.id,
      adapterId: "mock-cli",
      mode: "LOCAL",
      workspaceRoot: project.rootPath,
      title: "mock"
    });
    orchestratorA.dispose();

    const orchestratorB = new UcadOrchestrator({
      dbPath,
      adapters: [adapter],
      cleanupIntervalMs: 0
    });
    await orchestratorB.initialize();

    const sessions = orchestratorB.listSessions(project.id);
    expect(sessions[0]?.state).toBe("INTERRUPTED");

    const health = await orchestratorB.getHealth();
    expect(health.recovery.rehydratedSessions).toBeGreaterThanOrEqual(1);
    expect(health.recovery.interruptedSessions).toBeGreaterThanOrEqual(1);

    orchestratorB.dispose();
  });

  it("forks into one isolated workspace row per session", async () => {
    const dbPath = path.join(os.tmpdir(), `ucad-orch-fork-${Date.now()}.db`);
    const repoRoot = path.join(os.tmpdir(), `ucad-fork-source-${Date.now()}`);
    await mkdir(repoRoot, { recursive: true });
    await writeFile(path.join(repoRoot, "seed.txt"), "hello fork\n", "utf8");

    const orchestrator = new UcadOrchestrator({
      dbPath,
      adapters: [new MockAdapter()],
      cleanupIntervalMs: 0
    });

    const project = await orchestrator.createProject({
      name: "demo-fork",
      rootPath: repoRoot
    });

    const parentSessionId = randomUUID();
    await orchestrator.createSession({
      sessionId: parentSessionId,
      projectId: project.id,
      adapterId: "mock-cli",
      mode: "LOCAL",
      workspaceRoot: repoRoot,
      title: "parent"
    });

    const childSessionId = randomUUID();
    await orchestrator.forkSession({
      sessionId: parentSessionId,
      newSessionId: childSessionId,
      forkReason: "test fork",
      workspaceStrategy: "worktree"
    });

    orchestrator.dispose();

    const storage = new UcadStorage(dbPath);
    const workspaces = storage.listWorkspaces(project.id);
    const parentRows = workspaces.filter((row) => row.session_id === parentSessionId);
    const childRows = workspaces.filter((row) => row.session_id === childSessionId);

    expect(parentRows.length).toBe(1);
    expect(childRows.length).toBe(1);
    expect(childRows[0]?.root_path).not.toBe(repoRoot);

    storage.close();
  });
});
