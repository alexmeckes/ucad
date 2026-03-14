import { describe, expect, it } from "vitest";
import { WorkspaceManager } from "@ucad/workspace-manager";

describe("workspace-manager cleanup", () => {
  it("marks old unpinned workspaces for cleanup", () => {
    const manager = new WorkspaceManager();
    const now = Date.now();

    const decisions = manager.computeCleanupCandidates([
      {
        id: "old",
        isPinned: false,
        createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
        cleanedAt: null
      }
    ]);

    expect(decisions).toEqual([{ workspaceId: "old", reason: "older_than_4_days" }]);
  });

  it("marks excess workspaces when over limit", () => {
    const manager = new WorkspaceManager();
    const candidates = Array.from({ length: 12 }).map((_, index) => ({
      id: `w-${index}`,
      isPinned: false,
      createdAt: new Date(Date.now() - (index + 1) * 1000).toISOString(),
      cleanedAt: null
    }));

    const decisions = manager.computeCleanupCandidates(candidates);
    expect(decisions.length).toBeGreaterThanOrEqual(2);
  });
});
