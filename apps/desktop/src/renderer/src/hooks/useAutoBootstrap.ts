import { useState, useEffect } from "react";
import type { HealthStatus } from "@ucad/contracts";
import type { Project } from "./useProjects";

const BUILTIN_ADAPTER_PREFERENCE = ["codex-cli", "claude-cli", "gemini-cli"] as const;

const lastPathSegment = (value: string): string => {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "Workspace";
};

const chooseBootstrapAdapterId = (
  availableAdapters: Array<{ id: string; name: string }>,
  health: HealthStatus
): string | null => {
  if (availableAdapters.length === 0) return null;
  const healthById = new Map(health.adapters.map((a) => [a.adapterId, a]));
  const scored = availableAdapters.map((adapter) => {
    const d = healthById.get(adapter.id);
    const preferenceIndex = BUILTIN_ADAPTER_PREFERENCE.indexOf(
      adapter.id as (typeof BUILTIN_ADAPTER_PREFERENCE)[number]
    );
    const preferenceScore = preferenceIndex === -1 ? 0 : 100 - preferenceIndex * 10;
    const healthScore = d?.healthy ? 30 : 0;
    const authScore = d?.authStatus === "authenticated" ? 20 : d?.authStatus === "unknown" ? 5 : 0;
    const binaryScore = d?.binaryFound ? 10 : 0;
    return { adapterId: adapter.id, score: preferenceScore + healthScore + authScore + binaryScore };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.adapterId ?? null;
};

export function useAutoBootstrap(
  health: HealthStatus | null,
  adapters: Array<{ id: string; name: string }>,
  projects: Project[],
  projectsLoaded: boolean,
  refreshProjects: () => Promise<void>,
  refreshSessions: (projectId: string) => Promise<void>,
  refreshHealth: () => Promise<void>,
  setSelectedProjectId: (id: string) => void,
  setSelectedSessionId: (id: string) => void
) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status !== "idle") return;
    if (!projectsLoaded) return;
    if (projects.length > 0) {
      setStatus("done");
      return;
    }
    if (!health || adapters.length === 0) return;

    setStatus("running");
    void (async () => {
      try {
        const launchContext = await window.ucad.getLaunchContext();
        const rootPath = launchContext.cwd;
        const created = await window.ucad.createProject({
          name: lastPathSegment(rootPath),
          rootPath,
        });
        await refreshProjects();
        setSelectedProjectId(created.id);

        const adapterId = chooseBootstrapAdapterId(adapters, health);
        if (!adapterId) {
          setStatus("done");
          setMessage("Project created automatically. No adapters are available yet.");
          return;
        }

        const sessionId = await window.ucad.generateSessionId();
        await window.ucad.createSession({
          sessionId,
          projectId: created.id,
          adapterId,
          mode: "LOCAL",
          workspaceRoot: rootPath,
          title: `${adapterId} LOCAL`,
        });
        await refreshSessions(created.id);
        setSelectedSessionId(sessionId);
        await refreshHealth();

        setStatus("done");
        setMessage(`Ready. Created project and started a ${adapterId} session automatically.`);
      } catch (error) {
        setStatus("failed");
        const msg = error instanceof Error ? error.message : "Auto bootstrap failed";
        setMessage(`Auto bootstrap failed: ${msg}`);
      }
    })();
  }, [adapters, status, health, projects.length, projectsLoaded, refreshProjects, refreshSessions, refreshHealth, setSelectedProjectId, setSelectedSessionId]);

  return { autoBootstrapStatus: status, autoBootstrapMessage: message };
}
