import { execFile } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CreateWorktreeInput {
  projectId: string;
  sessionId: string;
  repoRoot: string;
  baseRef?: string;
}

export interface WorkspaceCandidate {
  id: string;
  isPinned: boolean;
  createdAt: string;
  cleanedAt: string | null;
}

export interface CleanupDecision {
  workspaceId: string;
  reason: "older_than_4_days" | "over_limit";
}

export const UCAD_HOME = path.join(os.homedir(), ".ucad");

const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");

export const shortSessionId = (sessionId: string): string => sessionId.slice(0, 8);

export class WorkspaceManager {
  async isGitRepo(rootPath: string): Promise<boolean> {
    try {
      await execFileAsync("git", ["-C", rootPath, "rev-parse", "--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  async createWorktree(input: CreateWorktreeInput): Promise<{ rootPath: string; branchName: string }> {
    const worktreesRoot = path.join(UCAD_HOME, "worktrees", sanitize(input.projectId));
    await mkdir(worktreesRoot, { recursive: true });

    const worktreePath = path.join(worktreesRoot, sanitize(input.sessionId));
    const branchName = `agent/${shortSessionId(input.sessionId)}`;
    const baseRef = input.baseRef ?? "HEAD";

    await execFileAsync("git", ["-C", input.repoRoot, "worktree", "add", "--detach", worktreePath, baseRef]);

    return {
      rootPath: worktreePath,
      branchName
    };
  }

  async createSnapshotWorkspace(projectId: string, sessionId: string, sourceRoot: string): Promise<string> {
    const snapshotsRoot = path.join(UCAD_HOME, "snapshots", sanitize(projectId));
    await mkdir(snapshotsRoot, { recursive: true });

    const snapshotPath = path.join(snapshotsRoot, sanitize(sessionId));
    await cp(sourceRoot, snapshotPath, { recursive: true });
    return snapshotPath;
  }

  async captureSnapshotRef(rootPath: string): Promise<string> {
    if (await this.isGitRepo(rootPath)) {
      const { stdout } = await execFileAsync("git", ["-C", rootPath, "rev-parse", "HEAD"]);
      return `git:${stdout.toString().trim()}`;
    }

    return `fs:${new Date().toISOString()}`;
  }

  async createForkWorkspace(input: {
    projectId: string;
    newSessionId: string;
    sourceRoot: string;
    repoRoot: string;
    isGitRepo: boolean;
  }): Promise<{ rootPath: string; strategy: "worktree" | "snapshot"; branchName?: string }> {
    if (input.isGitRepo) {
      const worktree = await this.createWorktree({
        projectId: input.projectId,
        sessionId: input.newSessionId,
        repoRoot: input.repoRoot,
        baseRef: "HEAD"
      });

      return {
        rootPath: worktree.rootPath,
        strategy: "worktree",
        branchName: worktree.branchName
      };
    }

    return {
      rootPath: await this.createSnapshotWorkspace(input.projectId, input.newSessionId, input.sourceRoot),
      strategy: "snapshot"
    };
  }

  computeCleanupCandidates(candidates: WorkspaceCandidate[]): CleanupDecision[] {
    const active = candidates.filter((item) => !item.cleanedAt && !item.isPinned);
    const decisions: CleanupDecision[] = [];
    const nowMs = Date.now();

    for (const candidate of active) {
      const ageMs = nowMs - new Date(candidate.createdAt).getTime();
      if (ageMs > 4 * 24 * 60 * 60 * 1000) {
        decisions.push({ workspaceId: candidate.id, reason: "older_than_4_days" });
      }
    }

    if (active.length > 10) {
      const sorted = [...active].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const overBy = active.length - 10;
      for (let i = 0; i < overBy; i += 1) {
        if (!decisions.some((decision) => decision.workspaceId === sorted[i].id)) {
          decisions.push({ workspaceId: sorted[i].id, reason: "over_limit" });
        }
      }
    }

    return decisions;
  }

  async cleanupWorkspace(rootPath: string): Promise<void> {
    await rm(rootPath, { recursive: true, force: true });
  }
}
