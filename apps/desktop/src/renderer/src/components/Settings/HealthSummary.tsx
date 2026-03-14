import type { HealthStatus } from "@ucad/contracts";

interface HealthSummaryProps {
  health: HealthStatus | null;
  onRefresh: () => void;
}

export function HealthSummary({ health, onRefresh }: HealthSummaryProps) {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>System Health</h3>
        <button data-testid="refresh-health-btn" className="settings-btn-sm" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <div className="health-grid">
        <div className="health-item">
          <span className="health-label">Orchestrator</span>
          <span className={`health-value ${health?.orchestrator === "ready" ? "val-ok" : "val-warn"}`}>
            {health?.orchestrator ?? "loading"}
          </span>
        </div>
        <div className="health-item">
          <span className="health-label">DB</span>
          <span className={`health-value ${health?.db === "ready" ? "val-ok" : "val-warn"}`}>
            {health?.db ?? "loading"}
          </span>
        </div>
        <div className="health-item">
          <span className="health-label">Workspace</span>
          <span className={`health-value ${health?.workspaceManager === "ready" ? "val-ok" : "val-warn"}`}>
            {health?.workspaceManager ?? "loading"}
          </span>
        </div>
        <div className="health-item">
          <span className="health-label">Recovered</span>
          <span className="health-value">{health?.recovery.rehydratedSessions ?? 0}</span>
        </div>
        <div className="health-item">
          <span className="health-label">Interrupted</span>
          <span className="health-value">{health?.recovery.interruptedSessions ?? 0}</span>
        </div>
        <div className="health-item">
          <span className="health-label">Last Cleanup</span>
          <span className="health-value">{health?.cleanup.lastRunAt ?? "never"}</span>
        </div>
      </div>
      {health?.cleanup.lastError && (
        <div className="health-error">Cleanup Error: {health.cleanup.lastError}</div>
      )}
    </div>
  );
}
