import { useState } from "react";
import type { AdapterSettingsState, ExternalAdapterType } from "@ucad/contracts";
import { addAdapterToSettings } from "../../adapter-settings-state";

interface AdapterFormProps {
  adapterSettings: AdapterSettingsState;
  onSettingsChange: (next: AdapterSettingsState) => void;
  onError: (msg: string) => void;
}

export function AdapterForm({ adapterSettings, onSettingsChange, onError }: AdapterFormProps) {
  const [type, setType] = useState<ExternalAdapterType>("cli");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");

  const onAdd = () => {
    const result = addAdapterToSettings(adapterSettings, {
      type,
      id,
      name,
      command,
      argsText: args,
    });
    if (result.error) {
      onError(result.error);
      return;
    }
    if (!result.next) {
      onError("Failed to add adapter.");
      return;
    }
    onSettingsChange(result.next);
    setId("");
    setName("");
    setCommand("");
    setArgs("");
  };

  return (
    <div className="adapter-form-section">
      <div className="adapter-form-row">
        <select
          data-testid="new-adapter-type"
          className="settings-input settings-input-sm"
          value={type}
          onChange={(e) => setType(e.target.value as ExternalAdapterType)}
        >
          <option value="cli">cli</option>
          <option value="harness_stdio">harness_stdio</option>
        </select>
        <input
          data-testid="new-adapter-id"
          className="settings-input"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="adapter-id"
        />
        <input
          data-testid="new-adapter-name"
          className="settings-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Adapter Name"
        />
      </div>
      <div className="adapter-form-row">
        <input
          data-testid="new-adapter-command"
          className="settings-input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="binary command"
        />
        <input
          data-testid="new-adapter-args"
          className="settings-input"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="args (csv)"
        />
        <button data-testid="add-adapter-btn" className="settings-btn" onClick={onAdd}>
          Add
        </button>
      </div>
    </div>
  );
}
