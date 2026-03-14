import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { UnifiedEvent } from "@ucad/contracts";
import { SCHEMA_SQL } from "./schema";

const nowIso = (): string => new Date().toISOString();

export interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  is_git_repo: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  project_id: string;
  parent_session_id: string | null;
  adapter_id: string;
  mode: string;
  state: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface WorkspaceRow {
  id: string;
  project_id: string;
  session_id: string;
  strategy: string;
  root_path: string;
  git_branch: string | null;
  snapshot_ref: string | null;
  is_pinned: number;
  created_at: string;
  cleaned_at: string | null;
}

export class UcadStorage {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  ping(): boolean {
    try {
      this.db.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  createProject(input: { id?: string; name: string; rootPath: string; isGitRepo: boolean }): ProjectRow {
    const id = input.id ?? randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO projects (id, name, root_path, is_git_repo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.name, input.rootPath, input.isGitRepo ? 1 : 0, ts, ts);

    return this.getProject(id)!;
  }

  getProject(projectId: string): ProjectRow | undefined {
    return this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as ProjectRow | undefined;
  }

  listProjects(): ProjectRow[] {
    return this.db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as ProjectRow[];
  }

  createSession(input: {
    id?: string;
    projectId: string;
    parentSessionId?: string;
    adapterId: string;
    mode: string;
    state: string;
    title?: string;
  }): SessionRow {
    const id = input.id ?? randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, parent_session_id, adapter_id, mode, state, title, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        id,
        input.projectId,
        input.parentSessionId ?? null,
        input.adapterId,
        input.mode,
        input.state,
        input.title ?? null,
        ts,
        ts
      );
    return this.getSession(id)!;
  }

  getSession(sessionId: string): SessionRow | undefined {
    return this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as SessionRow | undefined;
  }

  listSessions(projectId: string): SessionRow[] {
    return this.db.prepare(`SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC`).all(projectId) as SessionRow[];
  }

  listAllSessions(): SessionRow[] {
    return this.db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all() as SessionRow[];
  }

  updateSessionState(sessionId: string, state: string): void {
    this.db.prepare(`UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?`).run(state, nowIso(), sessionId);
  }

  archiveSession(sessionId: string): void {
    const ts = nowIso();
    this.db.prepare(`UPDATE sessions SET state = 'ARCHIVED', archived_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, sessionId);
  }

  insertSessionEdge(input: { parentSessionId: string; childSessionId: string; reason: string }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_edges (parent_session_id, child_session_id, reason, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(input.parentSessionId, input.childSessionId, input.reason, nowIso());
  }

  appendEvent(event: UnifiedEvent): number {
    const nextSeq =
      (this.db
        .prepare(`SELECT COALESCE(MAX(seq_no), 0) AS max_seq FROM events WHERE session_id = ?`)
        .get(event.sessionId) as { max_seq: number }).max_seq + 1;

    this.db
      .prepare(
        `INSERT INTO events (id, session_id, seq_no, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(event.eventId, event.sessionId, nextSeq, event.type, JSON.stringify(event.payload), event.timestampIso);

    return nextSeq;
  }

  listEvents(sessionId: string): Array<{ id: string; session_id: string; seq_no: number; type: string; payload_json: string; created_at: string }> {
    return this.db.prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY seq_no ASC`).all(sessionId) as Array<{
      id: string;
      session_id: string;
      seq_no: number;
      type: string;
      payload_json: string;
      created_at: string;
    }>;
  }

  insertApproval(input: {
    id?: string;
    sessionId: string;
    capability: string;
    scope: string | null;
    requestPayloadJson: string;
    decision: string;
    decidedBy: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO approvals (id, session_id, capability, scope, request_payload_json, decision, decided_at, decided_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id ?? randomUUID(),
        input.sessionId,
        input.capability,
        input.scope,
        input.requestPayloadJson,
        input.decision,
        nowIso(),
        input.decidedBy
      );
  }

  createWorkspace(input: {
    id?: string;
    projectId: string;
    sessionId: string;
    strategy: string;
    rootPath: string;
    gitBranch?: string | null;
    snapshotRef?: string | null;
    isPinned?: boolean;
  }): string {
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO workspaces (id, project_id, session_id, strategy, root_path, git_branch, snapshot_ref, is_pinned, created_at, cleaned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        id,
        input.projectId,
        input.sessionId,
        input.strategy,
        input.rootPath,
        input.gitBranch ?? null,
        input.snapshotRef ?? null,
        input.isPinned ? 1 : 0,
        nowIso()
      );
    return id;
  }

  listWorkspaces(projectId: string): WorkspaceRow[] {
    return this.db.prepare(`SELECT * FROM workspaces WHERE project_id = ? ORDER BY created_at DESC`).all(projectId) as WorkspaceRow[];
  }

  listAllWorkspaces(): WorkspaceRow[] {
    return this.db.prepare(`SELECT * FROM workspaces ORDER BY created_at DESC`).all() as WorkspaceRow[];
  }

  getWorkspaceBySession(sessionId: string): WorkspaceRow | undefined {
    return this.db
      .prepare(`SELECT * FROM workspaces WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(sessionId) as WorkspaceRow | undefined;
  }

  getWorkspace(workspaceId: string): WorkspaceRow | undefined {
    return this.db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(workspaceId) as WorkspaceRow | undefined;
  }

  markWorkspaceCleaned(workspaceId: string): void {
    this.db.prepare(`UPDATE workspaces SET cleaned_at = ? WHERE id = ?`).run(nowIso(), workspaceId);
  }

  updateWorkspaceSnapshotRef(workspaceId: string, snapshotRef: string | null): void {
    this.db.prepare(`UPDATE workspaces SET snapshot_ref = ? WHERE id = ?`).run(snapshotRef, workspaceId);
  }

  createReviewState(input: { id?: string; sessionId: string; scope: string; gitRefBase?: string }): void {
    this.db
      .prepare(
        `INSERT INTO review_states (id, session_id, scope, git_ref_base, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.id ?? randomUUID(), input.sessionId, input.scope, input.gitRefBase ?? null, nowIso());
  }

  createArtifact(input: { id?: string; sessionId: string; type: string; path: string; metadataJson?: string }): void {
    this.db
      .prepare(
        `INSERT INTO artifacts (id, session_id, type, path, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.id ?? randomUUID(), input.sessionId, input.type, input.path, input.metadataJson ?? null, nowIso());
  }
}
