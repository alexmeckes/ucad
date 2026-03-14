import { useState, useCallback } from "react";
import type { AdapterSettingsState, HealthStatus } from "@ucad/contracts";
import { validateAdapterConfig } from "../../adapter-settings-state";
import { Modal } from "../shared/Modal";
import { HealthSummary } from "./HealthSummary";
import { DiagnosticsTable } from "./DiagnosticsTable";
import { AdapterTable } from "./AdapterTable";
import { AdapterForm } from "./AdapterForm";
import "./SettingsModal.css";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  health: HealthStatus | null;
  onRefreshHealth: () => Promise<void>;
  adapterSettings: AdapterSettingsState | null;
  onAdapterSettingsChange: (next: AdapterSettingsState) => void;
  onRefreshAdapterCatalog: () => Promise<void>;
  onRefreshAdapterSettings: () => Promise<void>;
}

export function SettingsModal(props: SettingsModalProps) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const onSave = useCallback(async () => {
    if (!props.adapterSettings) return;
    const validationError = validateAdapterConfig(props.adapterSettings);
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }
    try {
      const saved = await window.ucad.saveAdapterSettings({
        adapters: props.adapterSettings.adapters,
      });
      props.onAdapterSettingsChange(saved);
      setError("");
      setMessage("Adapter settings saved and reloaded.");
      await props.onRefreshAdapterCatalog();
      await props.onRefreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setMessage("");
    }
  }, [props]);

  const handleSettingsChange = useCallback(
    (next: AdapterSettingsState) => {
      props.onAdapterSettingsChange(next);
      setError("");
      setMessage("");
    },
    [props]
  );

  return (
    <Modal open={props.open} onClose={props.onClose} title="Settings">
      <HealthSummary health={props.health} onRefresh={() => void props.onRefreshHealth()} />
      <DiagnosticsTable health={props.health} />

      {props.adapterSettings && (
        <div className="settings-section" data-testid="adapter-settings-panel">
          <h3>Adapter Configuration</h3>
          <div className="settings-meta">
            <div>
              <strong>Config:</strong>{" "}
              <code data-testid="adapter-settings-config-path">{props.adapterSettings.configPath}</code>
            </div>
            {props.adapterSettings.note && <div>{props.adapterSettings.note}</div>}
            <div>
              <strong>Loaded IDs:</strong>{" "}
              <span data-testid="adapter-settings-loaded-ids">
                {props.adapterSettings.loadedAdapterIds.length > 0
                  ? props.adapterSettings.loadedAdapterIds.join(", ")
                  : "none"}
              </span>
            </div>
          </div>

          {error && (
            <div className="settings-error" data-testid="adapter-settings-error">
              {error}
            </div>
          )}
          {message && (
            <div className="settings-success" data-testid="adapter-settings-success">
              {message}
            </div>
          )}

          <AdapterTable
            adapterSettings={props.adapterSettings}
            onSettingsChange={handleSettingsChange}
          />
          <AdapterForm
            adapterSettings={props.adapterSettings}
            onSettingsChange={handleSettingsChange}
            onError={setError}
          />

          <div className="settings-actions">
            <button data-testid="save-adapter-settings-btn" className="settings-btn settings-btn-primary" onClick={() => void onSave()}>
              Save Settings
            </button>
            <button data-testid="reload-adapter-settings-btn" className="settings-btn" onClick={() => void props.onRefreshAdapterSettings()}>
              Reload From Disk
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
