import { useState, useMemo, useCallback } from "react";

export interface Session {
  id: string;
  parentSessionId: string | null;
  adapterId: string;
  mode: string;
  state: string;
  title: string | null;
  workspaceRoot: string | null;
  workspaceStrategy: string | null;
  gitBranch: string | null;
  createdAt: string;
}

const ROOT_NODE = "__root__";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const sessionChildren = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const session of sessions) {
      const key = session.parentSessionId ?? ROOT_NODE;
      const values = map.get(key) ?? [];
      values.push(session);
      map.set(key, values);
    }
    for (const [key, values] of map.entries()) {
      values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      map.set(key, values);
    }
    return map;
  }, [sessions]);

  const refreshSessions = useCallback(async (projectId: string): Promise<void> => {
    const next = await window.ucad.listSessions(projectId);
    setSessions(next);
    setSelectedSessionId((current) => {
      if (!current && next.length > 0) return next[0].id;
      return current;
    });
  }, []);

  const createSession = useCallback(
    async (projectId: string, adapterId: string, mode: string, workspaceRoot: string, model?: string, effort?: string): Promise<string> => {
      const sessionId = await window.ucad.generateSessionId();
      const metadata: Record<string, unknown> = {};
      if (model) metadata.model = model;
      if (effort) metadata.effort = effort;
      const friendly = adapterId.replace(/-cli$/, "").replace(/^\w/, (c) => c.toUpperCase());
      const label = [friendly, model, effort].filter(Boolean).join(" · ");
      await window.ucad.createSession({
        sessionId,
        projectId,
        adapterId,
        mode: mode as "LOCAL" | "WORKTREE",
        workspaceRoot,
        title: label,
        metadata,
      });
      await refreshSessions(projectId);
      setSelectedSessionId(sessionId);
      return sessionId;
    },
    [refreshSessions]
  );

  const forkSession = useCallback(
    async (sessionId: string, projectId: string, workspaceStrategy: "local" | "worktree" | "snapshot" = "worktree"): Promise<string> => {
      const newSessionId = await window.ucad.generateSessionId();
      await window.ucad.forkSession({
        sessionId,
        newSessionId,
        forkReason: "User requested fork",
        workspaceStrategy,
      });
      if (projectId) {
        await refreshSessions(projectId);
      }
      setSelectedSessionId(newSessionId);
      return newSessionId;
    },
    [refreshSessions]
  );

  return {
    sessions,
    selectedSessionId,
    selectedSession,
    sessionChildren,
    setSelectedSessionId,
    refreshSessions,
    createSession,
    forkSession,
    ROOT_NODE,
  };
}
