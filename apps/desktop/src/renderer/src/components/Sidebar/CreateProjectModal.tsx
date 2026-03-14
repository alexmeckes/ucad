import { Modal } from "../shared/Modal";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  setProjectName: (v: string) => void;
  projectPath: string;
  setProjectPath: (v: string) => void;
  onCreate: () => Promise<string | null>;
}

export function CreateProjectModal({
  open, onClose, projectName, setProjectName, projectPath, setProjectPath, onCreate,
}: CreateProjectModalProps) {
  const handleCreate = async () => {
    const id = await onCreate();
    if (id) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New Project" size="sm">
      <div className="modal-form">
        <label className="modal-field-label">Name</label>
        <input
          data-testid="project-name-input"
          className="sidebar-input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name"
          autoFocus
        />
        <label className="modal-field-label">Path</label>
        <input
          data-testid="project-path-input"
          className="sidebar-input"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="/absolute/path"
        />
        <div className="modal-actions">
          <button
            data-testid="create-project-btn"
            className="sidebar-btn sidebar-btn-primary"
            onClick={() => void handleCreate()}
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
