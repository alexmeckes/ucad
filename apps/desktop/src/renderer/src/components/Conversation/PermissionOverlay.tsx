import { useEffect } from "react";
import type { AdapterEvent } from "@ucad/contracts";
import { KeyboardHint } from "../shared/KeyboardHint";

interface PermissionOverlayProps {
  event: AdapterEvent;
  onResolve: (
    decision: "allow" | "allow_with_scope" | "deny",
    scope?: "once" | "turn" | "session" | "workspace"
  ) => Promise<void>;
}

const CAPABILITY_COLORS: Record<string, string> = {
  filesystem_read: "var(--cyan)",
  filesystem_write: "var(--yellow)",
  exec: "var(--magenta)",
  network: "var(--green)",
  git: "var(--cyan)",
  mcp: "var(--magenta)",
};

const RISK_COLORS: Record<string, string> = {
  low: "var(--green)",
  medium: "var(--yellow)",
  high: "var(--red)",
  critical: "var(--red)",
};

export function PermissionOverlay({ event, onResolve }: PermissionOverlayProps) {
  const payload = event.payload ?? {};
  const requestId = payload.requestId as string ?? "";
  const capability = payload.capability as string ?? "unknown";
  const risk = payload.risk as string ?? "";
  const command = payload.command as string ?? "";
  const cwd = payload.cwd as string ?? "";
  const reason = payload.reason as string ?? "";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        void onResolve("allow_with_scope", "once");
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        void onResolve("allow_with_scope", "turn");
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        void onResolve("allow_with_scope", "session");
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        void onResolve("deny");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onResolve]);

  return (
    <div className="permission-overlay" data-testid="permission-panel">
      <div className="permission-content">
        <div className="permission-header-row">
          <div className="permission-title">Permission Required</div>
          <div className="permission-badges">
            <span
              className="permission-capability-badge"
              style={{ color: CAPABILITY_COLORS[capability] ?? "var(--text-muted)", borderColor: CAPABILITY_COLORS[capability] ?? "var(--border)" }}
            >
              {capability.replace(/_/g, " ")}
            </span>
            {risk && (
              <span
                className="permission-risk-badge"
                style={{ color: RISK_COLORS[risk] ?? "var(--text-muted)", borderColor: RISK_COLORS[risk] ?? "var(--border)" }}
              >
                {risk}
              </span>
            )}
          </div>
        </div>

        {reason && <div className="permission-reason">{reason}</div>}

        {command && (
          <div className="permission-command">
            <code>{command}</code>
          </div>
        )}

        {cwd && (
          <div className="permission-cwd">
            <span className="permission-cwd-label">cwd:</span> {cwd}
          </div>
        )}

        <div className="permission-id">{requestId}</div>

        <div className="permission-actions">
          <button
            data-testid="permission-allow-once-btn"
            className="perm-btn perm-btn-allow"
            onClick={() => void onResolve("allow_with_scope", "once")}
          >
            Allow Once <KeyboardHint keys="y" />
          </button>
          <button
            data-testid="permission-allow-turn-btn"
            className="perm-btn perm-btn-turn"
            onClick={() => void onResolve("allow_with_scope", "turn")}
          >
            Allow Turn <KeyboardHint keys="t" />
          </button>
          <button
            data-testid="permission-allow-session-btn"
            className="perm-btn perm-btn-session"
            onClick={() => void onResolve("allow_with_scope", "session")}
          >
            Allow Session <KeyboardHint keys="s" />
          </button>
          <button
            data-testid="permission-deny-btn"
            className="perm-btn perm-btn-deny"
            onClick={() => void onResolve("deny")}
          >
            Deny <KeyboardHint keys="n" />
          </button>
        </div>
      </div>
    </div>
  );
}
