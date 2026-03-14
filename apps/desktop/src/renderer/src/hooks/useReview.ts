import { useState, useCallback } from "react";

function parseChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m && m[1] !== "/dev/null") files.add(m[1]);
  }
  return [...files];
}

export function useReview(selectedSessionId: string) {
  const [diffText, setDiffText] = useState("");
  const [diffScope, setDiffScope] = useState<"uncommitted" | "last_turn" | "branch">("uncommitted");
  const [baseRef, setBaseRef] = useState("main");
  const [filePath, setFilePath] = useState("");
  const [changedFiles, setChangedFiles] = useState<string[]>([]);

  const loadDiff = useCallback(async (): Promise<void> => {
    if (!selectedSessionId) return;
    const diff = await window.ucad.getDiff({
      sessionId: selectedSessionId,
      scope: diffScope,
      baseRef,
    });
    setDiffText(diff);
    setChangedFiles(parseChangedFiles(diff));
  }, [selectedSessionId, diffScope, baseRef]);

  const stageFile = useCallback(async (path?: string): Promise<void> => {
    const target = path ?? filePath;
    if (!selectedSessionId || !target) return;
    await window.ucad.stageReview({ sessionId: selectedSessionId, filePath: target });
  }, [selectedSessionId, filePath]);

  const revertFile = useCallback(async (path?: string): Promise<void> => {
    const target = path ?? filePath;
    if (!selectedSessionId || !target) return;
    await window.ucad.revertReview({ sessionId: selectedSessionId, filePath: target });
  }, [selectedSessionId, filePath]);

  const stagePatch = useCallback(async (): Promise<void> => {
    if (!selectedSessionId || !diffText) return;
    await window.ucad.stageReview({ sessionId: selectedSessionId, patch: diffText });
  }, [selectedSessionId, diffText]);

  const revertPatch = useCallback(async (): Promise<void> => {
    if (!selectedSessionId || !diffText) return;
    await window.ucad.revertReview({ sessionId: selectedSessionId, patch: diffText });
  }, [selectedSessionId, diffText]);

  return {
    diffText,
    setDiffText,
    diffScope,
    setDiffScope,
    baseRef,
    setBaseRef,
    filePath,
    setFilePath,
    changedFiles,
    loadDiff,
    stageFile,
    revertFile,
    stagePatch,
    revertPatch,
  };
}
