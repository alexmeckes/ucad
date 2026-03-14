import { useState, useRef, useEffect } from "react";
import { ProjectSelector } from "./ProjectSelector";
import { CreateProjectModal } from "./CreateProjectModal";
import { CreateSessionModal } from "./CreateSessionModal";
import type { Project } from "../../hooks/useProjects";
import type { Session } from "../../hooks/useSessions";
import "./Sidebar.css";

interface SidebarProps {
  // Projects
  projects: Project[];
  selectedProjectId: string;
  selectedProject: Project | null;
  onSelectProject: (id: string) => void;
  projectName: string;
  setProjectName: (v: string) => void;
  projectPath: string;
  setProjectPath: (v: string) => void;
  onCreateProject: () => Promise<string | null>;

  // Sessions
  sessions: Session[];
  sessionChildren: Map<string, Session[]>;
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
  rootNode: string;

  // Adapter controls
  adapters: Array<{ id: string; name: string }>;
  selectedAdapterId: string;
  onSelectAdapter: (id: string) => void;
  selectedMode: "LOCAL" | "WORKTREE";
  onSelectMode: (m: "LOCAL" | "WORKTREE") => void;
  selectedModel: string;
  onSelectModel: (m: string) => void;
  modelSuggestions: string[];
  selectedEffort: string;
  onSelectEffort: (e: string) => void;
  effortLevels: Array<{ id: string; label: string }> | null;
  onCreateSession: () => void;
  onQuickCreateSession: (adapterId: string) => void;
  onForkSession: (strategy: "local" | "worktree" | "snapshot") => void;
  onOpenSettings: () => void;
  canFork: boolean;
  canCreateSession: boolean;
}

export function Sidebar(props: SidebarProps) {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createSessionOpen, setCreateSessionOpen] = useState(false);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span>UCAD</span>
        <button className="sidebar-icon-btn" onClick={props.onOpenSettings} title="Settings (⌘K)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0a1.97 1.97 0 0 1-2.93 1.118c-1.563-.94-3.383.88-2.443 2.443a1.97 1.97 0 0 1-1.118 2.93c-1.79.527-1.79 3.065 0 3.592a1.97 1.97 0 0 1 1.118 2.93c-.94 1.563.88 3.383 2.443 2.443a1.97 1.97 0 0 1 2.93 1.118c.527 1.79 3.065 1.79 3.592 0a1.97 1.97 0 0 1 2.93-1.118c1.563.94 3.383-.88 2.443-2.443a1.97 1.97 0 0 1 1.118-2.93c1.79-.527 1.79-3.065 0-3.592a1.97 1.97 0 0 1-1.118-2.93c.94-1.563-.88-3.383-2.443-2.443a1.97 1.97 0 0 1-2.93-1.118z"/>
          </svg>
        </button>
      </div>

      <ProjectSelector
        projects={props.projects}
        selectedProjectId={props.selectedProjectId}
        onSelect={props.onSelectProject}
        sessions={props.sessions}
        sessionChildren={props.sessionChildren}
        selectedSessionId={props.selectedSessionId}
        onSelectSession={props.onSelectSession}
        rootNode={props.rootNode}
        onOpenCreateProject={() => setCreateProjectOpen(true)}
        onOpenCreateSession={() => setCreateSessionOpen(true)}
        adapters={props.adapters}
        onQuickCreateSession={props.onQuickCreateSession}
      />

      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        projectName={props.projectName}
        setProjectName={props.setProjectName}
        projectPath={props.projectPath}
        setProjectPath={props.setProjectPath}
        onCreate={props.onCreateProject}
      />

      <CreateSessionModal
        open={createSessionOpen}
        onClose={() => setCreateSessionOpen(false)}
        adapters={props.adapters}
        selectedAdapterId={props.selectedAdapterId}
        onSelectAdapter={props.onSelectAdapter}
        selectedMode={props.selectedMode}
        onSelectMode={props.onSelectMode}
        selectedModel={props.selectedModel}
        onSelectModel={props.onSelectModel}
        modelSuggestions={props.modelSuggestions}
        selectedEffort={props.selectedEffort}
        onSelectEffort={props.onSelectEffort}
        effortLevels={props.effortLevels}
        onCreateSession={props.onCreateSession}
        onForkSession={props.onForkSession}
        canFork={props.canFork}
        canCreateSession={props.canCreateSession}
      />
    </aside>
  );
}
