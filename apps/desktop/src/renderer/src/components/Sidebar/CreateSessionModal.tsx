import { useState, useRef, useEffect } from "react";
import { Modal } from "../shared/Modal";

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
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
  onForkSession: (strategy: "local" | "worktree" | "snapshot") => void;
  canFork: boolean;
  canCreateSession: boolean;
}

export function CreateSessionModal(props: CreateSessionModalProps) {
  const datalistId = `model-suggestions-${props.selectedAdapterId}`;
  const [forkMenuOpen, setForkMenuOpen] = useState(false);
  const forkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forkMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (forkMenuRef.current && !forkMenuRef.current.contains(e.target as Node)) {
        setForkMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [forkMenuOpen]);

  const handleStart = () => {
    props.onCreateSession();
    props.onClose();
  };

  const handleFork = (strategy: "local" | "worktree" | "snapshot") => {
    props.onForkSession(strategy);
    setForkMenuOpen(false);
    props.onClose();
  };

  return (
    <Modal open={props.open} onClose={props.onClose} title="New Session" size="sm">
      <div className="modal-form">
        <label className="modal-field-label">Adapter</label>
        <select
          data-testid="adapter-select"
          className="sidebar-select"
          value={props.selectedAdapterId}
          onChange={(e) => props.onSelectAdapter(e.target.value)}
        >
          {props.adapters.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <label className="modal-field-label">Model</label>
        <div className="sidebar-input-wrap">
          <input
            data-testid="model-input"
            className="sidebar-input sidebar-input-mono"
            type="text"
            list={datalistId}
            value={props.selectedModel}
            onChange={(e) => props.onSelectModel(e.target.value)}
            placeholder="Default (type or pick)"
          />
          {props.selectedModel && (
            <button
              className="sidebar-input-clear"
              onClick={() => props.onSelectModel("")}
              title="Reset to default"
            >
              &times;
            </button>
          )}
        </div>
        <datalist id={datalistId}>
          {props.modelSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <div className="sidebar-row">
          {props.effortLevels && (
            <div className="sidebar-col">
              <label className="modal-field-label">Effort</label>
              <select
                data-testid="effort-select"
                className="sidebar-select"
                value={props.selectedEffort}
                onChange={(e) => props.onSelectEffort(e.target.value)}
              >
                {props.effortLevels.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="sidebar-col">
            <label className="modal-field-label">Mode</label>
            <select
              data-testid="mode-select"
              className="sidebar-select"
              value={props.selectedMode}
              onChange={(e) => props.onSelectMode(e.target.value as "LOCAL" | "WORKTREE")}
            >
              <option value="LOCAL">Local</option>
              <option value="WORKTREE">Worktree</option>
            </select>
          </div>
        </div>

        <div className="modal-actions">
          <button
            data-testid="start-session-btn"
            className="sidebar-btn sidebar-btn-primary"
            onClick={handleStart}
            disabled={!props.canCreateSession}
          >
            Start
          </button>
          <div className="sidebar-fork-wrap" ref={forkMenuRef}>
            <button
              data-testid="fork-session-btn"
              className="sidebar-btn"
              onClick={() => setForkMenuOpen((v) => !v)}
              disabled={!props.canFork}
            >
              Fork &#x25BE;
            </button>
            {forkMenuOpen && (
              <div className="sidebar-fork-menu">
                <button className="sidebar-fork-option" onClick={() => handleFork("local")}>
                  Local
                </button>
                <button className="sidebar-fork-option" onClick={() => handleFork("worktree")}>
                  Worktree
                </button>
                <button className="sidebar-fork-option" onClick={() => handleFork("snapshot")}>
                  Snapshot
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
