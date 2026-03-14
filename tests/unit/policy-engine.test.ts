import { describe, expect, it } from "vitest";
import { PolicyEngine, selectDefaultProfile } from "@ucad/policy-engine";

describe("policy-engine", () => {
  it("selects workspace-write defaults for git repos", () => {
    expect(selectDefaultProfile(true)).toEqual({
      sandboxMode: "workspace_write",
      approvalPolicy: "on_request",
      networkEnabled: false
    });
  });

  it("selects read-only defaults for non-git repos", () => {
    expect(selectDefaultProfile(false)).toEqual({
      sandboxMode: "read_only",
      approvalPolicy: "on_request",
      networkEnabled: false
    });
  });

  it("flags destructive commands as requiring approval", () => {
    const engine = new PolicyEngine();
    engine.registerSession({
      sessionId: "s1",
      workspaceRoot: "/tmp/project",
      profile: selectDefaultProfile(true)
    });

    const result = engine.evaluateCommand("s1", "rm -rf ./build", "/tmp/project");
    expect(result.requiresApproval).toBe(true);
    expect(result.risk).toBe("critical");
  });
});
