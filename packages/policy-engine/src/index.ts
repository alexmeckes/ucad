import path from "node:path";
import type { GrantScope, PermissionCapability, PermissionDecision } from "@ucad/contracts";

export type SandboxMode = "read_only" | "workspace_write";
export type ApprovalPolicy = "on_request";

export interface PermissionProfile {
  sandboxMode: SandboxMode;
  approvalPolicy: ApprovalPolicy;
  networkEnabled: boolean;
}

export interface PolicySessionContext {
  sessionId: string;
  workspaceRoot: string;
  profile: PermissionProfile;
}

export interface CommandEvaluation {
  requiresApproval: boolean;
  capability: PermissionCapability;
  reason: string;
  risk: "low" | "medium" | "high" | "critical";
}

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /(^|\s)rm\s+-rf\s+/,
  /(^|\s)git\s+reset\s+--hard(\s|$)/,
  /(^|\s)git\s+clean\s+-fdx(\s|$)/,
  /(^|\s)sudo\s+/,
  /(^|\s)chmod\s+-R\s+777(\s|$)/,
  /(^|\s)mkfs(\.|\s)/
];

const NETWORK_PATTERNS: RegExp[] = [/(^|\s)curl\s+/, /(^|\s)wget\s+/, /(^|\s)npm\s+install\s+/, /(^|\s)pnpm\s+add\s+/];

const GIT_MUTATION_PATTERNS: RegExp[] = [/(^|\s)git\s+commit\s+/, /(^|\s)git\s+push\s+/, /(^|\s)git\s+rebase\s+/];

export const selectDefaultProfile = (isGitRepo: boolean): PermissionProfile => {
  if (isGitRepo) {
    return {
      sandboxMode: "workspace_write",
      approvalPolicy: "on_request",
      networkEnabled: false
    };
  }

  return {
    sandboxMode: "read_only",
    approvalPolicy: "on_request",
    networkEnabled: false
  };
};

const hasGrant = (scopes: Set<GrantScope>, scope: GrantScope): boolean => scopes.has(scope);

export class PolicyEngine {
  private readonly sessions = new Map<string, PolicySessionContext>();
  private readonly grants = new Map<string, Map<PermissionCapability, Set<GrantScope>>>();

  registerSession(ctx: PolicySessionContext): void {
    this.sessions.set(ctx.sessionId, ctx);
    if (!this.grants.has(ctx.sessionId)) {
      this.grants.set(ctx.sessionId, new Map());
    }
  }

  registerGrant(sessionId: string, capability: PermissionCapability, scope: GrantScope): void {
    const byCapability = this.grants.get(sessionId) ?? new Map<PermissionCapability, Set<GrantScope>>();
    const scopes = byCapability.get(capability) ?? new Set<GrantScope>();
    scopes.add(scope);
    byCapability.set(capability, scopes);
    this.grants.set(sessionId, byCapability);
  }

  resetTurnScopedGrants(sessionId: string): void {
    const byCapability = this.grants.get(sessionId);
    if (!byCapability) {
      return;
    }

    for (const [capability, scopes] of byCapability.entries()) {
      if (scopes.has("turn")) {
        scopes.delete("turn");
      }
      byCapability.set(capability, scopes);
    }
  }

  evaluateCommand(sessionId: string, command: string, cwd: string): CommandEvaluation {
    const ctx = this.sessions.get(sessionId);
    if (!ctx) {
      return {
        requiresApproval: true,
        capability: "exec",
        reason: "Session policy context missing",
        risk: "high"
      };
    }

    const outsideWorkspace = !this.isWithinWorkspace(cwd, ctx.workspaceRoot);
    const grantMap = this.grants.get(sessionId) ?? new Map<PermissionCapability, Set<GrantScope>>();

    if (outsideWorkspace) {
      const scopes = grantMap.get("filesystem_write") ?? new Set<GrantScope>();
      if (!hasGrant(scopes, "workspace") && !hasGrant(scopes, "session")) {
        return {
          requiresApproval: true,
          capability: "filesystem_write",
          reason: "Command attempted outside workspace root",
          risk: "high"
        };
      }
    }

    if (this.matchesAny(command, DESTRUCTIVE_PATTERNS)) {
      return {
        requiresApproval: true,
        capability: "exec",
        reason: "Command classified as destructive",
        risk: "critical"
      };
    }

    if (this.matchesAny(command, NETWORK_PATTERNS) && !ctx.profile.networkEnabled) {
      const scopes = grantMap.get("network") ?? new Set<GrantScope>();
      if (!hasGrant(scopes, "session") && !hasGrant(scopes, "workspace")) {
        return {
          requiresApproval: true,
          capability: "network",
          reason: "Network disabled by default policy",
          risk: "high"
        };
      }
    }

    if (this.matchesAny(command, GIT_MUTATION_PATTERNS)) {
      const scopes = grantMap.get("git") ?? new Set<GrantScope>();
      if (!hasGrant(scopes, "session") && !hasGrant(scopes, "workspace") && !hasGrant(scopes, "turn")) {
        return {
          requiresApproval: true,
          capability: "git",
          reason: "Git mutation command requires approval",
          risk: "medium"
        };
      }
    }

    if (ctx.profile.sandboxMode === "read_only") {
      return {
        requiresApproval: true,
        capability: "filesystem_write",
        reason: "Read-only mode blocks mutating commands",
        risk: "medium"
      };
    }

    return {
      requiresApproval: false,
      capability: "exec",
      reason: "Command permitted by active policy",
      risk: "low"
    };
  }

  permissionDecisionToGrant(decision: PermissionDecision, scope?: GrantScope): GrantScope | undefined {
    if (decision === "allow_with_scope" && scope) {
      return scope;
    }

    if (decision === "allow") {
      return "once";
    }

    return undefined;
  }

  private isWithinWorkspace(candidatePath: string, workspaceRoot: string): boolean {
    const normalizedCandidate = path.resolve(candidatePath);
    const normalizedRoot = path.resolve(workspaceRoot);
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
  }

  private matchesAny(input: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(input));
  }
}
