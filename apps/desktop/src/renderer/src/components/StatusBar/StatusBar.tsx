import type { HealthStatus } from "@ucad/contracts";
import type { Session } from "../../hooks/useSessions";
import "./StatusBar.css";

interface StatusBarProps {
  health: HealthStatus | null;
  selectedSession: Session | null;
  selectedAdapterId: string;
  selectedMode: string;
  selectedModel: string;
  autoBootstrapMessage: string;
  autoBootstrapStatus: string;
  onRefreshHealth: () => void;
  onOpenReview: () => void;
  onInterrupt: () => void;
}

export function StatusBar(props: StatusBarProps) {
  const orchStatus = props.health?.orchestrator ?? "...";
  const session = props.selectedSession;
  const sessionState = session?.state ?? "none";
  const activeAdapter = session?.adapterId ?? props.selectedAdapterId ?? "none";

  const adapterHealth = props.health?.adapters?.find((a) => a.adapterId === activeAdapter);
  const dotClass = adapterHealth
    ? adapterHealth.healthy && adapterHealth.authStatus === "authenticated"
      ? "dot-ok"
      : adapterHealth.healthy
        ? "dot-auth-warn"
        : "dot-warn"
    : orchStatus === "ready"
      ? "dot-ok"
      : "dot-warn";
  const dotTitle = adapterHealth
    ? `${adapterHealth.adapterId}: ${adapterHealth.healthy ? "healthy" : "unhealthy"}, auth: ${adapterHealth.authStatus}${adapterHealth.latencyMs != null ? `, ${adapterHealth.latencyMs}ms` : ""}`
    : orchStatus;

  const gitBranch = session?.gitBranch ?? null;
  const isRunning = sessionState.toUpperCase() === "RUNNING";

  return (
    <div className="statusbar app-statusbar">
      <div className="statusbar-left">
        <span className="statusbar-item" title={dotTitle}>
          <span className={`statusbar-dot ${dotClass}`} />
        </span>
        {gitBranch && (
          <span className="statusbar-item statusbar-branch" title={gitBranch}>
            {gitBranch.length > 28 ? gitBranch.slice(0, 27) + "\u2026" : gitBranch}
          </span>
        )}
        <span className={`statusbar-item statusbar-state statusbar-state-${sessionState.toLowerCase()}`}>
          {sessionState === "none" ? "" : sessionState.toLowerCase()}
        </span>
      </div>

      {props.autoBootstrapMessage && (
        <span
          className={`statusbar-item ${props.autoBootstrapStatus === "failed" ? "statusbar-err" : "statusbar-ok"}`}
          data-testid="auto-bootstrap-message"
        >
          {props.autoBootstrapMessage}
        </span>
      )}

      <div className="statusbar-right">
        {session && isRunning && (
          <button
            data-testid="interrupt-session-btn"
            className="statusbar-btn statusbar-btn-interrupt"
            onClick={props.onInterrupt}
            title="Interrupt session"
          >
            Stop
          </button>
        )}
        <button className="statusbar-btn" onClick={props.onOpenReview} title="Review changes (diffs)">
          Review
        </button>
        <button
          data-testid="refresh-health-btn"
          className="statusbar-btn"
          onClick={props.onRefreshHealth}
          title="Refresh adapter health"
        >
          Health
        </button>
      </div>
    </div>
  );
}
