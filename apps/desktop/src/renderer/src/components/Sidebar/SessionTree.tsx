import type { Session } from "../../hooks/useSessions";
import type { ReactNode } from "react";

interface SessionTreeProps {
  sessionChildren: Map<string, Session[]>;
  selectedSessionId: string;
  onSelect: (id: string) => void;
  rootNode: string;
  projectName?: string;
}

/** Format adapter ID into a short display name */
function adapterLabel(adapterId: string): string {
  switch (adapterId) {
    case "claude-cli": return "Claude";
    case "codex-cli": return "Codex";
    case "gemini-cli": return "Gemini";
    default: return adapterId.replace(/-cli$/, "");
  }
}

const STRATEGY_LABELS: Record<string, string> = {
  local: "LOCAL",
  worktree: "WT",
  snapshot: "SNAP",
};

function SessionBranch({
  parentKey,
  depth,
  sessionChildren,
  selectedSessionId,
  onSelect,
}: {
  parentKey: string;
  depth: number;
  sessionChildren: Map<string, Session[]>;
  selectedSessionId: string;
  onSelect: (id: string) => void;
}): ReactNode {
  const branch = sessionChildren.get(parentKey) ?? [];
  if (branch.length === 0) return null;

  return (
    <>
      {branch.map((session) => {
        // Title format: "Friendly · model · effort" or just "Friendly"
        const parts = session.title?.split(" · ") ?? [];
        const label = parts[0] || adapterLabel(session.adapterId);
        const detail = parts.slice(1).join(" · ") || null;
        const strategy = session.workspaceStrategy ?? null;
        const strategyLabel = strategy ? STRATEGY_LABELS[strategy] ?? strategy.toUpperCase() : null;
        const gitBranch = session.gitBranch ?? null;
        const truncatedBranch = gitBranch && gitBranch.length > 16 ? gitBranch.slice(0, 15) + "\u2026" : gitBranch;

        return (
          <div key={session.id}>
            <button
              className={`session-node${selectedSessionId === session.id ? " session-node-active" : ""}`}
              data-testid="session-graph-node"
              style={{ paddingLeft: `${12 + depth * 12}px` }}
              onClick={() => onSelect(session.id)}
            >
              <span className="session-node-adapter">{label}</span>
              {detail && <span className="session-node-model">{detail}</span>}
              {strategyLabel && (
                <span className="session-node-strategy">{strategyLabel}</span>
              )}
              {truncatedBranch && (
                <span className="session-node-branch" title={gitBranch ?? undefined}>{truncatedBranch}</span>
              )}
              <span className={`session-node-state session-state-${session.state.toLowerCase()}`}>
                {session.state}
              </span>
            </button>
            <SessionBranch
              parentKey={session.id}
              depth={depth + 1}
              sessionChildren={sessionChildren}
              selectedSessionId={selectedSessionId}
              onSelect={onSelect}
            />
          </div>
        );
      })}
    </>
  );
}

export function SessionTree({ sessionChildren, selectedSessionId, onSelect, rootNode, projectName }: SessionTreeProps) {
  const hasAny = (sessionChildren.get(rootNode) ?? []).length > 0;

  const headerLabel = projectName
    ? `Sessions \u00b7 ${projectName}`
    : "Sessions";

  return (
    <div className="sidebar-section" data-testid="session-graph">
      <div className="sidebar-section-header">
        <span className="sidebar-label">{headerLabel}</span>
      </div>
      {hasAny ? (
        <div className="session-tree">
          <SessionBranch
            parentKey={rootNode}
            depth={0}
            sessionChildren={sessionChildren}
            selectedSessionId={selectedSessionId}
            onSelect={onSelect}
          />
        </div>
      ) : (
        <div className="sidebar-empty">No sessions yet</div>
      )}
    </div>
  );
}
