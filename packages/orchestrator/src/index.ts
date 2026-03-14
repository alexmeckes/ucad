import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import type {
  AdapterEvent,
  AdapterHealth,
  AdapterListResponse,
  AgentAdapter,
  ForkSessionRequest,
  HealthStatus,
  PermissionRequest,
  PermissionResolution,
  ProjectCreateRequest,
  StartSessionRequest,
  UserTurnRequest
} from "@ucad/contracts";
import { selectDefaultProfile, PolicyEngine } from "@ucad/policy-engine";
import { ReviewEngine } from "@ucad/review-engine";
import { UcadStorage } from "@ucad/storage-sqlite";
import { UCAD_HOME, WorkspaceManager } from "@ucad/workspace-manager";

interface SessionRuntime {
  sessionId: string;
  projectId: string;
  adapterId: string;
  workspaceRoot: string;
  mode: "LOCAL" | "WORKTREE";
  title: string | null;
  metadata?: Record<string, unknown>;
}

interface PendingTurn {
  req: UserTurnRequest;
  permissionRequest: PermissionRequest;
}

interface WorkspaceBinding {
  rootPath: string;
  strategy: "local" | "worktree" | "snapshot";
  gitBranch?: string | null;
  snapshotRef?: string | null;
}

interface RecoveryStats {
  rehydratedSessions: number;
  interruptedSessions: number;
}

interface CleanupStats {
  lastRunAt: string | null;
  lastCleanedCount: number;
  lastError?: string;
}

const ACTIVE_RECOVERY_STATES = new Set(["RUNNING", "WAITING_FOR_APPROVAL"]);
const DEFAULT_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const nowIso = (): string => new Date().toISOString();

export class UcadOrchestrator {
  private readonly storage: UcadStorage;
  private readonly policyEngine = new PolicyEngine();
  private readonly workspaceManager = new WorkspaceManager();
  private readonly reviewEngine = new ReviewEngine();
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly externalAdapterIds = new Set<string>();
  private readonly sessionRuntime = new Map<string, SessionRuntime>();
  private readonly pendingTurns = new Map<string, PendingTurn>();
  private readonly activeEventStreams = new Set<string>();
  private readonly eventEmitter = new EventEmitter();
  private readonly cleanupIntervalMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private recoveryStats: RecoveryStats = {
    rehydratedSessions: 0,
    interruptedSessions: 0
  };
  private cleanupStats: CleanupStats = {
    lastRunAt: null,
    lastCleanedCount: 0
  };

  constructor(options?: { dbPath?: string; adapters?: AgentAdapter[]; cleanupIntervalMs?: number }) {
    const dbPath = options?.dbPath ?? path.join(UCAD_HOME, "ucad.db");
    this.storage = new UcadStorage(dbPath);
    this.cleanupIntervalMs = options?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;

    const adapters = options?.adapters ?? [];
    for (const adapter of adapters) {
      this.adapters.set(adapter.metadata().id, adapter);
    }
  }

  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.metadata().id, adapter);
  }

  setExternalAdapters(adapters: AgentAdapter[]): void {
    const nextIds = new Set(adapters.map((adapter) => adapter.metadata().id));

    for (const previousId of this.externalAdapterIds) {
      if (nextIds.has(previousId)) {
        continue;
      }
      if (this.hasLiveSessionsForAdapter(previousId)) {
        continue;
      }
      this.adapters.delete(previousId);
    }

    this.externalAdapterIds.clear();
    for (const adapter of adapters) {
      const id = adapter.metadata().id;
      this.adapters.set(id, adapter);
      this.externalAdapterIds.add(id);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.recoveryStats = await this.rehydrateSessions();
    await this.runWorkspaceCleanup();

    if (this.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        void this.runWorkspaceCleanup();
      }, this.cleanupIntervalMs);
    }

    this.initialized = true;
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.storage.close();
  }

  onEvent(listener: (event: AdapterEvent) => void): () => void {
    this.eventEmitter.on("event", listener);
    return () => this.eventEmitter.off("event", listener);
  }

  emitEvent(event: AdapterEvent): void {
    this.storage.appendEvent(event);
    this.eventEmitter.emit("event", event);
  }

  async getHealth(): Promise<HealthStatus> {
    const adapterHealth = await this.collectAdapterHealth();
    return {
      orchestrator: this.initialized ? "ready" : "initializing",
      db: this.storage.ping() ? "ready" : "error",
      workspaceManager: "ready",
      adapters: adapterHealth,
      recovery: this.recoveryStats,
      cleanup: this.cleanupStats
    };
  }

  listAdapters(): AdapterListResponse {
    return [...this.adapters.values()].map((adapter) => adapter.metadata());
  }

  async createProject(req: ProjectCreateRequest): Promise<{ id: string; name: string; rootPath: string; isGitRepo: boolean }> {
    const isGitRepo = await this.workspaceManager.isGitRepo(req.rootPath);
    const project = this.storage.createProject({
      name: req.name,
      rootPath: req.rootPath,
      isGitRepo
    });

    return {
      id: project.id,
      name: project.name,
      rootPath: project.root_path,
      isGitRepo: Boolean(project.is_git_repo)
    };
  }

  listProjects(): Array<{ id: string; name: string; rootPath: string; isGitRepo: boolean }> {
    return this.storage.listProjects().map((project) => ({
      id: project.id,
      name: project.name,
      rootPath: project.root_path,
      isGitRepo: Boolean(project.is_git_repo)
    }));
  }

  listSessions(projectId: string): Array<{
    id: string;
    projectId: string;
    parentSessionId: string | null;
    adapterId: string;
    mode: string;
    state: string;
    title: string | null;
    workspaceRoot: string | null;
    workspaceStrategy: string | null;
    gitBranch: string | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
  }> {
    return this.storage.listSessions(projectId).map((session) => {
      const workspace = this.storage.getWorkspaceBySession(session.id);
      return {
        id: session.id,
        projectId: session.project_id,
        parentSessionId: session.parent_session_id,
        adapterId: session.adapter_id,
        mode: session.mode,
        state: session.state,
        title: session.title,
        workspaceRoot: workspace?.root_path ?? null,
        workspaceStrategy: workspace?.strategy ?? null,
        gitBranch: workspace?.git_branch ?? null,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        archivedAt: session.archived_at
      };
    });
  }

  listSessionEvents(sessionId: string): AdapterEvent[] {
    return this.storage.listEvents(sessionId).map((event) => {
      const runtime = this.sessionRuntime.get(event.session_id);
      const persistedSession = this.storage.getSession(event.session_id);
      let payload: Record<string, unknown> = {};

      try {
        payload = JSON.parse(event.payload_json) as Record<string, unknown>;
      } catch {
        payload = { raw: event.payload_json };
      }

      return {
        eventId: event.id,
        sessionId: event.session_id,
        projectId: runtime?.projectId ?? persistedSession?.project_id ?? "unknown-project",
        timestampIso: event.created_at,
        sourceAdapterId: runtime?.adapterId ?? persistedSession?.adapter_id ?? "unknown-adapter",
        type: event.type as AdapterEvent["type"],
        payload
      };
    });
  }

  async createSession(req: StartSessionRequest): Promise<{ sessionId: string; workspaceRoot: string }> {
    return this.createSessionInternal(req);
  }

  async sendTurn(req: UserTurnRequest): Promise<{ queued: boolean; awaitingApproval?: boolean; permissionRequestId?: string }> {
    const runtime = this.ensureSessionRuntime(req.sessionId);
    if (!runtime) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    const command = this.extractCommand(req.content);
    if (command) {
      const evaluation = this.policyEngine.evaluateCommand(req.sessionId, command, runtime.workspaceRoot);
      if (evaluation.requiresApproval) {
        const permissionRequest: PermissionRequest = {
          requestId: randomUUID(),
          sessionId: req.sessionId,
          capability: evaluation.capability,
          command,
          cwd: runtime.workspaceRoot,
          reason: evaluation.reason,
          metadata: { risk: evaluation.risk }
        };

        this.pendingTurns.set(permissionRequest.requestId, { req, permissionRequest });
        this.storage.updateSessionState(req.sessionId, "WAITING_FOR_APPROVAL");

        this.emitEvent({
          eventId: randomUUID(),
          sessionId: req.sessionId,
          projectId: runtime.projectId,
          timestampIso: nowIso(),
          sourceAdapterId: runtime.adapterId,
          type: "permission_requested",
          payload: permissionRequest as unknown as Record<string, unknown>
        });

        return {
          queued: false,
          awaitingApproval: true,
          permissionRequestId: permissionRequest.requestId
        };
      }
    }

    await this.dispatchTurn(req);
    return { queued: true };
  }

  async resolvePermission(resolution: PermissionResolution): Promise<{ resumed: boolean }> {
    const pending = this.pendingTurns.get(resolution.requestId);
    if (!pending) {
      return { resumed: false };
    }

    const runtime = this.ensureSessionRuntime(pending.req.sessionId);
    if (!runtime) {
      return { resumed: false };
    }

    this.storage.insertApproval({
      sessionId: resolution.sessionId,
      capability: pending.permissionRequest.capability,
      scope: resolution.scope ?? null,
      requestPayloadJson: JSON.stringify(pending.permissionRequest),
      decision: resolution.decision,
      decidedBy: resolution.decidedBy
    });

    this.emitEvent({
      eventId: randomUUID(),
      sessionId: resolution.sessionId,
      projectId: runtime.projectId,
      timestampIso: nowIso(),
      sourceAdapterId: runtime.adapterId,
      type: "permission_resolved",
      payload: resolution as unknown as Record<string, unknown>
    });

    const scope = this.policyEngine.permissionDecisionToGrant(resolution.decision, resolution.scope);
    if (scope) {
      this.policyEngine.registerGrant(resolution.sessionId, pending.permissionRequest.capability, scope);
    }

    this.pendingTurns.delete(resolution.requestId);
    this.storage.updateSessionState(resolution.sessionId, "RUNNING");

    if (resolution.decision === "deny") {
      return { resumed: false };
    }

    await this.dispatchTurn(pending.req);
    return { resumed: true };
  }

  async forkSession(req: ForkSessionRequest): Promise<{ sessionId: string; workspaceRoot: string }> {
    const parent = this.storage.getSession(req.sessionId);
    if (!parent) {
      throw new Error(`Parent session not found: ${req.sessionId}`);
    }

    const project = this.storage.getProject(parent.project_id);
    if (!project) {
      throw new Error(`Project not found for parent session: ${parent.project_id}`);
    }

    const parentWorkspace = this.storage.getWorkspaceBySession(req.sessionId);
    const sourceRoot = parentWorkspace?.root_path ?? project.root_path;
    const forkWorkspace = await this.resolveForkWorkspace({
      projectId: project.id,
      newSessionId: req.newSessionId,
      sourceRoot,
      repoRoot: project.root_path,
      isGitRepo: Boolean(project.is_git_repo),
      strategy: req.workspaceStrategy
    });

    const mode = forkWorkspace.strategy === "local" ? "LOCAL" : "WORKTREE";
    await this.createSessionInternal(
      {
        sessionId: req.newSessionId,
        projectId: project.id,
        adapterId: parent.adapter_id,
        mode,
        workspaceRoot: forkWorkspace.rootPath,
        parentSessionId: parent.id,
        title: `Fork of ${parent.id.slice(0, 8)}`,
        metadata: {
          forkReason: req.forkReason,
          workspaceStrategy: req.workspaceStrategy
        }
      },
      {
        preboundWorkspace: forkWorkspace
      }
    );

    this.storage.insertSessionEdge({
      parentSessionId: parent.id,
      childSessionId: req.newSessionId,
      reason: req.forkReason
    });

    return {
      sessionId: req.newSessionId,
      workspaceRoot: forkWorkspace.rootPath
    };
  }

  async interruptSession(sessionId: string): Promise<void> {
    const runtime = this.ensureSessionRuntime(sessionId);
    if (!runtime) {
      return;
    }

    const adapter = this.adapters.get(runtime.adapterId);
    if (!adapter) {
      return;
    }

    await adapter.interrupt({ sessionId });
    this.storage.updateSessionState(sessionId, "INTERRUPTED");
  }

  async getDiff(input: { sessionId: string; scope: "uncommitted" | "last_turn" | "branch"; baseRef?: string }): Promise<string> {
    const runtime = this.ensureSessionRuntime(input.sessionId);
    if (!runtime) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    this.storage.createReviewState({
      sessionId: input.sessionId,
      scope: input.scope,
      gitRefBase: input.baseRef
    });

    return this.reviewEngine.getDiff({
      repoRoot: runtime.workspaceRoot,
      scope: input.scope,
      baseRef: input.baseRef
    });
  }

  async stageReview(input: { sessionId: string; filePath?: string; patch?: string }): Promise<void> {
    const runtime = this.ensureSessionRuntime(input.sessionId);
    if (!runtime) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    if (input.patch) {
      await this.reviewEngine.stagePatch(runtime.workspaceRoot, input.patch);
      return;
    }

    if (input.filePath) {
      await this.reviewEngine.stageFile(runtime.workspaceRoot, input.filePath);
      return;
    }

    throw new Error("Either filePath or patch must be provided to stage");
  }

  async revertReview(input: { sessionId: string; filePath?: string; patch?: string }): Promise<void> {
    const runtime = this.ensureSessionRuntime(input.sessionId);
    if (!runtime) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    if (input.patch) {
      await this.reviewEngine.revertPatch(runtime.workspaceRoot, input.patch);
      return;
    }

    if (input.filePath) {
      await this.reviewEngine.revertFile(runtime.workspaceRoot, input.filePath);
      return;
    }

    throw new Error("Either filePath or patch must be provided to revert");
  }

  async runWorkspaceCleanup(): Promise<{ cleaned: number }> {
    const projects = this.storage.listProjects();
    let cleaned = 0;
    let lastError: string | undefined;

    for (const project of projects) {
      const allWorkspaces = this.storage.listWorkspaces(project.id);
      const managedCandidates = allWorkspaces
        .filter((workspace) => workspace.strategy !== "local")
        .filter((workspace) => !workspace.cleaned_at)
        .filter((workspace) => this.isManagedWorkspacePath(workspace.root_path));
      const byId = new Map(managedCandidates.map((workspace) => [workspace.id, workspace]));
      const decisions = this.workspaceManager.computeCleanupCandidates(
        managedCandidates.map((workspace) => ({
          id: workspace.id,
          isPinned: Boolean(workspace.is_pinned),
          createdAt: workspace.created_at,
          cleanedAt: workspace.cleaned_at
        }))
      );

      for (const decision of decisions) {
        const workspace = byId.get(decision.workspaceId);
        if (!workspace) {
          continue;
        }

        try {
          let snapshotRef: string | null = null;
          try {
            snapshotRef = await this.workspaceManager.captureSnapshotRef(workspace.root_path);
          } catch {
            snapshotRef = null;
          }

          this.storage.updateWorkspaceSnapshotRef(workspace.id, snapshotRef);
          this.storage.createArtifact({
            sessionId: workspace.session_id,
            type: "workspace_cleanup_snapshot",
            path: workspace.root_path,
            metadataJson: JSON.stringify({
              snapshotRef,
              reason: decision.reason
            })
          });

          await this.workspaceManager.cleanupWorkspace(workspace.root_path);
          this.storage.markWorkspaceCleaned(workspace.id);
          cleaned += 1;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Unknown cleanup error";
        }
      }
    }

    this.cleanupStats = {
      lastRunAt: nowIso(),
      lastCleanedCount: cleaned,
      ...(lastError ? { lastError } : {})
    };

    return { cleaned };
  }

  private async createSessionInternal(
    req: StartSessionRequest,
    options?: {
      preboundWorkspace?: WorkspaceBinding;
    }
  ): Promise<{ sessionId: string; workspaceRoot: string }> {
    if (this.storage.getSession(req.sessionId)) {
      throw new Error(`Session already exists: ${req.sessionId}`);
    }

    const project = this.storage.getProject(req.projectId);
    if (!project) {
      throw new Error(`Project not found: ${req.projectId}`);
    }

    const adapter = this.adapters.get(req.adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${req.adapterId}`);
    }

    const workspace = options?.preboundWorkspace ?? (await this.resolveWorkspaceForNewSession(req, project.root_path, Boolean(project.is_git_repo)));
    this.storage.createSession({
      id: req.sessionId,
      projectId: req.projectId,
      parentSessionId: req.parentSessionId,
      adapterId: req.adapterId,
      mode: req.mode,
      state: "CREATED",
      title: req.title
    });

    this.storage.createWorkspace({
      projectId: req.projectId,
      sessionId: req.sessionId,
      strategy: workspace.strategy,
      rootPath: workspace.rootPath,
      gitBranch: workspace.gitBranch ?? null,
      snapshotRef: workspace.snapshotRef ?? null,
      isPinned: false
    });

    const runtime: SessionRuntime = {
      sessionId: req.sessionId,
      projectId: req.projectId,
      adapterId: req.adapterId,
      workspaceRoot: workspace.rootPath,
      mode: req.mode,
      title: req.title ?? null,
      metadata: req.metadata,
    };
    this.upsertRuntime(runtime);

    try {
      await this.startAdapterSession(runtime, adapter);
    } catch (error) {
      this.storage.updateSessionState(req.sessionId, "FAILED");
      this.emitEvent({
        eventId: randomUUID(),
        sessionId: req.sessionId,
        projectId: req.projectId,
        timestampIso: nowIso(),
        sourceAdapterId: req.adapterId,
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : "Failed to start adapter session"
        }
      });
      throw error;
    }

    return {
      sessionId: req.sessionId,
      workspaceRoot: workspace.rootPath
    };
  }

  private async resolveWorkspaceForNewSession(
    req: StartSessionRequest,
    projectRoot: string,
    isGitRepo: boolean
  ): Promise<WorkspaceBinding> {
    if (req.mode === "WORKTREE" && isGitRepo) {
      const worktree = await this.workspaceManager.createWorktree({
        projectId: req.projectId,
        sessionId: req.sessionId,
        repoRoot: projectRoot
      });
      return {
        rootPath: worktree.rootPath,
        strategy: "worktree",
        gitBranch: worktree.branchName
      };
    }

    if (req.mode === "WORKTREE" && !isGitRepo) {
      const snapshotRoot = await this.workspaceManager.createSnapshotWorkspace(req.projectId, req.sessionId, projectRoot);
      return {
        rootPath: snapshotRoot,
        strategy: "snapshot",
        snapshotRef: `fs:${nowIso()}`
      };
    }

    return {
      rootPath: req.workspaceRoot || projectRoot,
      strategy: "local"
    };
  }

  private async resolveForkWorkspace(input: {
    projectId: string;
    newSessionId: string;
    sourceRoot: string;
    repoRoot: string;
    isGitRepo: boolean;
    strategy: "local" | "worktree" | "snapshot";
  }): Promise<WorkspaceBinding> {
    if (input.strategy === "local") {
      return {
        rootPath: input.repoRoot,
        strategy: "local"
      };
    }

    if (input.strategy === "snapshot") {
      const snapshotRoot = await this.workspaceManager.createSnapshotWorkspace(input.projectId, input.newSessionId, input.sourceRoot);
      return {
        rootPath: snapshotRoot,
        strategy: "snapshot",
        snapshotRef: `fs:${nowIso()}`
      };
    }

    if (input.isGitRepo) {
      const worktree = await this.workspaceManager.createWorktree({
        projectId: input.projectId,
        sessionId: input.newSessionId,
        repoRoot: input.repoRoot,
        baseRef: "HEAD"
      });
      return {
        rootPath: worktree.rootPath,
        strategy: "worktree",
        gitBranch: worktree.branchName
      };
    }

    const snapshotRoot = await this.workspaceManager.createSnapshotWorkspace(input.projectId, input.newSessionId, input.sourceRoot);
    return {
      rootPath: snapshotRoot,
      strategy: "snapshot",
      snapshotRef: `fs:${nowIso()}`
    };
  }

  private async dispatchTurn(req: UserTurnRequest): Promise<void> {
    const runtime = this.ensureSessionRuntime(req.sessionId);
    if (!runtime) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    const adapter = this.adapters.get(runtime.adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found for session: ${runtime.adapterId}`);
    }

    try {
      await adapter.sendTurn(req);
    } catch (error) {
      if (!this.isMissingSessionError(error)) {
        throw error;
      }

      await this.startAdapterSession(runtime, adapter);
      await adapter.sendTurn(req);
    }

    this.policyEngine.resetTurnScopedGrants(req.sessionId);
  }

  private extractCommand(content: string): string | null {
    const trimmed = content.trim();
    if (trimmed.startsWith("!")) {
      return trimmed.slice(1).trim();
    }

    if (trimmed.startsWith("/run ")) {
      return trimmed.slice(5).trim();
    }

    return null;
  }

  private async startAdapterSession(runtime: SessionRuntime, adapter: AgentAdapter): Promise<void> {
    await adapter.start({
      sessionId: runtime.sessionId,
      projectId: runtime.projectId,
      adapterId: runtime.adapterId,
      mode: runtime.mode,
      workspaceRoot: runtime.workspaceRoot,
      title: runtime.title ?? undefined,
      metadata: runtime.metadata,
    });

    this.storage.updateSessionState(runtime.sessionId, "RUNNING");
    if (!this.activeEventStreams.has(runtime.sessionId)) {
      this.activeEventStreams.add(runtime.sessionId);
      void this.consumeAdapterEvents(runtime.sessionId, adapter);
    }
  }

  private async consumeAdapterEvents(sessionId: string, adapter: AgentAdapter): Promise<void> {
    const runtime = this.ensureSessionRuntime(sessionId);
    if (!runtime) {
      this.activeEventStreams.delete(sessionId);
      return;
    }

    try {
      for await (const event of adapter.streamEvents({ sessionId })) {
        this.emitEvent(event);

        if (event.type === "session_state_changed") {
          const nextState = event.payload.state;
          if (typeof nextState === "string") {
            this.storage.updateSessionState(sessionId, nextState);
          }
        }
      }
    } catch (error) {
      this.emitEvent({
        eventId: randomUUID(),
        sessionId,
        projectId: runtime.projectId,
        timestampIso: nowIso(),
        sourceAdapterId: runtime.adapterId,
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : "Unknown adapter stream error"
        }
      });

      this.storage.updateSessionState(sessionId, "FAILED");
    } finally {
      this.activeEventStreams.delete(sessionId);
    }
  }

  private ensureSessionRuntime(sessionId: string): SessionRuntime | undefined {
    const existing = this.sessionRuntime.get(sessionId);
    if (existing) {
      return existing;
    }

    const session = this.storage.getSession(sessionId);
    if (!session) {
      return undefined;
    }

    const workspace = this.storage.getWorkspaceBySession(sessionId);
    if (!workspace) {
      return undefined;
    }

    const runtime: SessionRuntime = {
      sessionId: session.id,
      projectId: session.project_id,
      adapterId: session.adapter_id,
      workspaceRoot: workspace.root_path,
      mode: session.mode as "LOCAL" | "WORKTREE",
      title: session.title
    };

    this.upsertRuntime(runtime);
    return runtime;
  }

  private upsertRuntime(runtime: SessionRuntime): void {
    this.sessionRuntime.set(runtime.sessionId, runtime);
    const project = this.storage.getProject(runtime.projectId);
    this.policyEngine.registerSession({
      sessionId: runtime.sessionId,
      workspaceRoot: runtime.workspaceRoot,
      profile: selectDefaultProfile(Boolean(project?.is_git_repo))
    });
  }

  private async collectAdapterHealth(): Promise<AdapterHealth[]> {
    const entries = [...this.adapters.values()];
    return Promise.all(
      entries.map(async (adapter) => {
        const metadata = adapter.metadata();
        const capabilities = adapter.capabilities();
        const base = {
          adapterId: metadata.id,
          name: metadata.name,
          command: undefined,
          binaryFound: true,
          authStatus: "unknown" as const,
          latencyMs: null,
          healthy: true,
          capabilities
        };

        if (!adapter.diagnostics) {
          return base;
        }

        try {
          const diagnostics = await adapter.diagnostics();
          return {
            ...base,
            ...diagnostics
          };
        } catch (error) {
          return {
            ...base,
            binaryFound: false,
            healthy: false,
            detail: error instanceof Error ? error.message : "Diagnostics failed"
          };
        }
      })
    );
  }

  private async rehydrateSessions(): Promise<RecoveryStats> {
    const sessions = this.storage.listAllSessions();
    let rehydratedSessions = 0;
    let interruptedSessions = 0;

    for (const session of sessions) {
      const workspace = this.storage.getWorkspaceBySession(session.id);
      if (!workspace) {
        continue;
      }

      this.upsertRuntime({
        sessionId: session.id,
        projectId: session.project_id,
        adapterId: session.adapter_id,
        workspaceRoot: workspace.root_path,
        mode: session.mode as "LOCAL" | "WORKTREE",
        title: session.title
      });
      rehydratedSessions += 1;

      if (ACTIVE_RECOVERY_STATES.has(session.state)) {
        this.storage.updateSessionState(session.id, "INTERRUPTED");
        interruptedSessions += 1;
        this.emitEvent({
          eventId: randomUUID(),
          sessionId: session.id,
          projectId: session.project_id,
          timestampIso: nowIso(),
          sourceAdapterId: session.adapter_id,
          type: "session_state_changed",
          payload: {
            state: "INTERRUPTED",
            reason: "Recovered after app restart"
          }
        });
      }
    }

    return {
      rehydratedSessions,
      interruptedSessions
    };
  }

  private isMissingSessionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return /session not found|missing session/i.test(error.message);
  }

  private isManagedWorkspacePath(rootPath: string): boolean {
    const normalized = path.resolve(rootPath);
    const worktreeRoot = path.resolve(path.join(UCAD_HOME, "worktrees"));
    const snapshotRoot = path.resolve(path.join(UCAD_HOME, "snapshots"));
    return (
      normalized === worktreeRoot ||
      normalized === snapshotRoot ||
      normalized.startsWith(`${worktreeRoot}${path.sep}`) ||
      normalized.startsWith(`${snapshotRoot}${path.sep}`)
    );
  }

  private hasLiveSessionsForAdapter(adapterId: string): boolean {
    return this.storage
      .listAllSessions()
      .some((session) => session.adapter_id === adapterId && !["COMPLETED", "FAILED", "ARCHIVED"].includes(session.state));
  }
}

export const defaultDbPath = (): string => path.join(os.homedir(), ".ucad", "ucad.db");
