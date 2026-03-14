import type { Project } from "../../hooks/useProjects";
import type { Session } from "../../hooks/useSessions";
import type { ReactNode } from "react";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string;
  onSelect: (id: string) => void;
  sessions: Session[];
  sessionChildren: Map<string, Session[]>;
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
  rootNode: string;
  onOpenCreateProject: () => void;
  onOpenCreateSession: () => void;
  adapters: Array<{ id: string; name: string }>;
  onQuickCreateSession: (adapterId: string) => void;
}

/** Show last 2 path segments with ellipsis prefix */
function truncatePath(fullPath: string): string {
  const parts = fullPath.replace(/\/+$/, "").split("/");
  if (parts.length <= 2) return fullPath;
  return "\u2026/" + parts.slice(-2).join("/");
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

/** Accent colors for projects (Arc-style spaces) */
const PROJECT_COLORS = [
  "var(--cyan)",
  "var(--magenta)",
  "var(--green)",
  "var(--yellow)",
  "var(--red)",
];

function getProjectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

/** Format relative time */
function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function ThreadItem({
  session,
  isActive,
  depth,
  onSelect,
  sessionChildren,
  selectedSessionId,
}: {
  session: Session;
  isActive: boolean;
  depth: number;
  onSelect: (id: string) => void;
  sessionChildren: Map<string, Session[]>;
  selectedSessionId: string;
}) {
  const parts = session.title?.split(" \u00b7 ") ?? [];
  const adapter = adapterLabel(session.adapterId);
  const threadTitle = parts[0] && parts[0] !== session.adapterId
    ? parts[0]
    : adapter;
  const model = parts.length > 1 ? parts[1] : null;
  const stateKey = session.state.toLowerCase();
  const isWaiting = stateKey === "waiting_for_approval";
  const children = sessionChildren.get(session.id) ?? [];

  return (
    <>
      <button
        className={`thread-item${isActive ? " thread-item-active" : ""}${isWaiting ? " thread-item-attention" : ""}`}
        data-testid="session-graph-node"
        style={depth > 0 ? { paddingLeft: `${8 + depth * 12}px` } : undefined}
        onClick={() => onSelect(session.id)}
      >
        <span
          className={`thread-status-dot session-state-${stateKey}`}
          title={session.state}
        />
        <div className="thread-content">
          <div className="thread-title-row">
            <span className="thread-title">{threadTitle}</span>
            <span className="thread-time">{timeAgo(session.createdAt)}</span>
          </div>
          <div className="thread-meta">
            <span className="thread-adapter">{adapter}</span>
            {model && <span className="thread-model">{model}</span>}
            {isWaiting && <span className="thread-approval">Needs approval</span>}
          </div>
        </div>
      </button>
      {children.map((child) => (
        <ThreadItem
          key={child.id}
          session={child}
          isActive={selectedSessionId === child.id}
          depth={depth + 1}
          onSelect={onSelect}
          sessionChildren={sessionChildren}
          selectedSessionId={selectedSessionId}
        />
      ))}
    </>
  );
}

export function ProjectSelector({
  projects,
  selectedProjectId,
  onSelect,
  sessions,
  sessionChildren,
  selectedSessionId,
  onSelectSession,
  rootNode,
  onOpenCreateProject,
  onOpenCreateSession,
  adapters,
  onQuickCreateSession,
}: ProjectSelectorProps) {
  const hasRunning = sessions.some(
    (s) => s.state.toUpperCase() === "RUNNING",
  );

  const rootSessions = sessionChildren.get(rootNode) ?? [];
  const threadCount = sessions.length;

  return (
    <div className="sidebar-section sidebar-project-section">
      <div className="project-list">
        {projects.length === 0 && (
          <div className="sidebar-empty">No projects yet</div>
        )}

        {projects.map((p, index) => {
          const isSelected = p.id === selectedProjectId;
          const color = getProjectColor(index);

          return (
            <div key={p.id} className="project-group">
              <button
                className={`project-item${isSelected ? " project-item-active" : ""}`}
                onClick={() => onSelect(p.id)}
              >
                <span
                  className="project-color-dot"
                  style={{ background: color }}
                />
                <span className="project-item-name">{p.name}</span>
                <span className="project-item-path">
                  {truncatePath(p.rootPath)}
                </span>
              </button>

              {isSelected && (
                <div className="project-threads">
                  {rootSessions.length > 0 && (
                    <>
                      <div className="threads-header">
                        <span className="threads-label">
                          Threads{threadCount > 0 ? ` (${threadCount})` : ""}
                        </span>
                      </div>
                      <div className="threads-list">
                        {rootSessions.map((session) => (
                          <ThreadItem
                            key={session.id}
                            session={session}
                            isActive={selectedSessionId === session.id}
                            depth={0}
                            onSelect={onSelectSession}
                            sessionChildren={sessionChildren}
                            selectedSessionId={selectedSessionId}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <div className="thread-quick-start">
                    {adapters.map((a) => (
                      <button
                        key={a.id}
                        className="thread-quick-btn"
                        onClick={() => onQuickCreateSession(a.id)}
                        title={`New ${a.name} thread`}
                      >
                        + {a.name.replace(/ CLI$/, "")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="project-add-btn"
        onClick={onOpenCreateProject}
      >
        + Add project
      </button>
    </div>
  );
}
