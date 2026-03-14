export type SessionState =
  | "CREATED"
  | "RUNNING"
  | "WAITING_FOR_APPROVAL"
  | "INTERRUPTED"
  | "COMPLETED"
  | "FAILED"
  | "ARCHIVED";

export type SessionMode = "LOCAL" | "WORKTREE";

export type WorkspaceStrategy = "local" | "worktree" | "snapshot";

export interface SessionRef {
  sessionId: string;
}

export interface StartSessionRequest {
  sessionId: string;
  projectId: string;
  adapterId: string;
  mode: SessionMode;
  workspaceRoot: string;
  title?: string;
  parentSessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface UserTurnRequest extends SessionRef {
  turnId: string;
  content: string;
  attachments?: string[];
}

export interface ForkSessionRequest extends SessionRef {
  newSessionId: string;
  forkReason: string;
  workspaceStrategy: WorkspaceStrategy;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  parentSessionId: string | null;
  adapterId: string;
  mode: SessionMode;
  state: SessionState;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
