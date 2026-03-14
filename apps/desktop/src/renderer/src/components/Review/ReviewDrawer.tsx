import { Drawer } from "../shared/Drawer";
import { DiffViewer } from "./DiffViewer";
import "./ReviewDrawer.css";

interface ReviewDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedSessionId: string;
  // Diff state
  diffText: string;
  setDiffText: (v: string) => void;
  diffScope: "uncommitted" | "last_turn" | "branch";
  setDiffScope: (v: "uncommitted" | "last_turn" | "branch") => void;
  baseRef: string;
  setBaseRef: (v: string) => void;
  filePath: string;
  setFilePath: (v: string) => void;
  changedFiles: string[];
  // Actions
  onLoadDiff: () => Promise<void>;
  onStageFile: (path?: string) => Promise<void>;
  onRevertFile: (path?: string) => Promise<void>;
  onStagePatch: () => Promise<void>;
  onRevertPatch: () => Promise<void>;
}

export function ReviewDrawer(props: ReviewDrawerProps) {
  const disabled = !props.selectedSessionId;

  return (
    <Drawer open={props.open} onClose={props.onClose} title="Review Changes">
      <div className="review-controls">
        <div className="review-scope-row">
          <select
            data-testid="diff-scope-select"
            className="review-select"
            value={props.diffScope}
            onChange={(e) => props.setDiffScope(e.target.value as "uncommitted" | "last_turn" | "branch")}
          >
            <option value="uncommitted">uncommitted</option>
            <option value="last_turn">last_turn</option>
            <option value="branch">branch</option>
          </select>
          <input
            data-testid="base-ref-input"
            className="review-input"
            value={props.baseRef}
            onChange={(e) => props.setBaseRef(e.target.value)}
            placeholder="base ref"
          />
          <button
            data-testid="load-diff-btn"
            className="review-btn"
            onClick={() => void props.onLoadDiff()}
            disabled={disabled}
          >
            Load Diff
          </button>
        </div>

        {props.changedFiles.length > 0 && (
          <div className="review-file-list">
            <div className="review-file-list-header">
              Changed Files ({props.changedFiles.length})
            </div>
            {props.changedFiles.map((file) => (
              <div key={file} className="review-file-item">
                <span
                  className="review-file-name"
                  onClick={() => props.setFilePath(file)}
                  title={file}
                >
                  {file}
                </span>
                <div className="review-file-actions">
                  <button
                    className="review-btn-sm review-btn-green"
                    onClick={() => void props.onStageFile(file)}
                    title={`Stage ${file}`}
                  >
                    Stage
                  </button>
                  <button
                    className="review-btn-sm review-btn-red"
                    onClick={() => void props.onRevertFile(file)}
                    title={`Revert ${file}`}
                  >
                    Revert
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DiffViewer diff={props.diffText} />

        <div className="review-actions-row">
          <button
            data-testid="stage-patch-btn"
            className="review-btn review-btn-green"
            onClick={() => void props.onStagePatch()}
            disabled={disabled || !props.diffText}
          >
            Stage Patch
          </button>
          <button
            data-testid="revert-patch-btn"
            className="review-btn review-btn-red"
            onClick={() => void props.onRevertPatch()}
            disabled={disabled || !props.diffText}
          >
            Revert Patch
          </button>
        </div>

        <div className="review-file-row">
          <input
            data-testid="file-path-input"
            className="review-input"
            value={props.filePath}
            onChange={(e) => props.setFilePath(e.target.value)}
            placeholder="relative/file/path.ts"
          />
          <button
            data-testid="stage-file-btn"
            className="review-btn review-btn-green"
            onClick={() => void props.onStageFile()}
            disabled={disabled || !props.filePath}
          >
            Stage
          </button>
          <button
            data-testid="revert-file-btn"
            className="review-btn review-btn-red"
            onClick={() => void props.onRevertFile()}
            disabled={disabled || !props.filePath}
          >
            Revert
          </button>
        </div>
      </div>
    </Drawer>
  );
}
