import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UcadStorage } from "@ucad/storage-sqlite";

describe("storage schema", () => {
  it("creates and persists projects/sessions", () => {
    const dbPath = path.join(os.tmpdir(), `ucad-test-${Date.now()}.db`);
    const storage = new UcadStorage(dbPath);

    const project = storage.createProject({
      name: "demo",
      rootPath: "/tmp/demo",
      isGitRepo: true
    });

    const session = storage.createSession({
      projectId: project.id,
      adapterId: "codex-cli",
      mode: "LOCAL",
      state: "CREATED"
    });

    expect(storage.getProject(project.id)?.name).toBe("demo");
    expect(storage.getSession(session.id)?.project_id).toBe(project.id);

    storage.close();
  });
});
