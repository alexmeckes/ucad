import { useState } from "react";
import type { HealthStatus } from "@ucad/contracts";

interface DiagnosticsTableProps {
  health: HealthStatus | null;
}

export function DiagnosticsTable({ health }: DiagnosticsTableProps) {
  const [diagnosticCommand, setDiagnosticCommand] = useState("");
  const adapters = health?.adapters ?? [];

  return (
    <div className="settings-section">
      <h3>Adapter Diagnostics</h3>
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>Adapter</th>
              <th>Binary</th>
              <th>Auth</th>
              <th>Latency</th>
              <th>Healthy</th>
              <th>Actions</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {adapters.map((a) => (
              <tr key={a.adapterId}>
                <td>{a.name}</td>
                <td>{a.binaryFound ? "found" : "missing"}</td>
                <td>{a.authStatus}</td>
                <td>{a.latencyMs ?? "-"}</td>
                <td>{a.healthy ? "yes" : "no"}</td>
                <td className="settings-actions-cell">
                  <button
                    data-testid={`adapter-install-${a.adapterId}`}
                    className="settings-btn-sm"
                    disabled={a.binaryFound || !a.installHintCommand}
                    onClick={() => setDiagnosticCommand(a.installHintCommand ?? "")}
                  >
                    Install
                  </button>
                  <button
                    data-testid={`adapter-auth-${a.adapterId}`}
                    className="settings-btn-sm"
                    disabled={a.authStatus === "authenticated" || !a.authHintCommand}
                    onClick={() => setDiagnosticCommand(a.authHintCommand ?? "")}
                  >
                    Auth
                  </button>
                </td>
                <td className="settings-detail-cell">{a.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {diagnosticCommand && (
        <div className="settings-command-hint" data-testid="diagnostic-command">
          <span className="settings-command-label">Suggested:</span>
          <code>{diagnosticCommand}</code>
        </div>
      )}
    </div>
  );
}
