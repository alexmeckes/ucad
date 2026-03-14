import type { AdapterCapabilities, AdapterDiagnostics } from "./adapter";

export interface AdapterHealth extends AdapterDiagnostics {
  name: string;
  capabilities: AdapterCapabilities;
}

export interface HealthStatus {
  orchestrator: "ready" | "initializing" | "error";
  db: "ready" | "error";
  workspaceManager: "ready" | "error";
  adapters: AdapterHealth[];
  recovery: {
    rehydratedSessions: number;
    interruptedSessions: number;
  };
  cleanup: {
    lastRunAt: string | null;
    lastCleanedCount: number;
    lastError?: string;
  };
}
