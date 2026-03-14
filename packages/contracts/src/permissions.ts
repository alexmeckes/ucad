export type PermissionCapability =
  | "filesystem_read"
  | "filesystem_write"
  | "exec"
  | "network"
  | "git"
  | "mcp";

export type GrantScope = "once" | "turn" | "session" | "workspace";

export type PermissionDecision = "allow" | "deny" | "allow_with_scope";

export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  capability: PermissionCapability;
  command?: string;
  cwd?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface PermissionResolution {
  requestId: string;
  sessionId: string;
  decision: PermissionDecision;
  scope?: GrantScope;
  decidedBy: string;
}

export interface PermissionRecord {
  id: string;
  sessionId: string;
  capability: PermissionCapability;
  scope: GrantScope | null;
  requestPayloadJson: string;
  decision: PermissionDecision;
  decidedAt: string;
  decidedBy: string;
}
