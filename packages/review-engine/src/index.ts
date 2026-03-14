import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DiffScope = "uncommitted" | "last_turn" | "branch";

export interface DiffRequest {
  repoRoot: string;
  scope: DiffScope;
  baseRef?: string;
}

const runGit = async (repoRoot: string, args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync("git", ["-C", repoRoot, ...args]);
  return stdout.toString();
};

const runGitWithInput = async (repoRoot: string, args: string[], input: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = execFile("git", ["-C", repoRoot, ...args], (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });

    if (!child.stdin) {
      reject(new Error("Failed to open stdin for git command"));
      return;
    }

    child.stdin.write(input);
    child.stdin.end();
  });
};

export class ReviewEngine {
  async getDiff(input: DiffRequest): Promise<string> {
    if (input.scope === "uncommitted") {
      return runGit(input.repoRoot, ["diff"]);
    }

    if (input.scope === "branch") {
      const baseRef = input.baseRef ?? "HEAD";
      return runGit(input.repoRoot, ["diff", `${baseRef}...HEAD`]);
    }

    if (input.scope === "last_turn") {
      try {
        return await runGit(input.repoRoot, ["diff", "HEAD~1..HEAD"]);
      } catch {
        return runGit(input.repoRoot, ["diff"]);
      }
    }

    return "";
  }

  async stageFile(repoRoot: string, filePath: string): Promise<void> {
    await runGit(repoRoot, ["add", "--", filePath]);
  }

  async revertFile(repoRoot: string, filePath: string): Promise<void> {
    await runGit(repoRoot, ["checkout", "--", filePath]);
  }

  async stagePatch(repoRoot: string, patch: string): Promise<void> {
    await runGitWithInput(repoRoot, ["apply", "--cached", "--unidiff-zero", "-"], patch);
  }

  async revertPatch(repoRoot: string, patch: string): Promise<void> {
    await runGitWithInput(repoRoot, ["apply", "-R", "--unidiff-zero", "-"], patch);
  }
}
