import { Fragment, useCallback } from "react";
import type {
  AdapterCapabilities,
  AdapterSettingsState,
  ExternalAdapterConfig,
  ExternalHarnessStdioAdapterConfig,
  ExternalAdapterType,
} from "@ucad/contracts";
import {
  arrayToCsv,
  normalizeOptionalString,
  normalizeOptionalStringArray,
  removeAdapterFromSettings,
} from "../../adapter-settings-state";

const ADAPTER_CAPABILITY_KEYS: Array<keyof AdapterCapabilities> = [
  "structuredEvents",
  "structuredTools",
  "supportsForkHints",
  "supportsResume",
  "supportsInterrupt",
  "supportsPatch",
  "supportsMcpPassthrough",
];

interface AdapterTableProps {
  adapterSettings: AdapterSettingsState;
  onSettingsChange: (next: AdapterSettingsState) => void;
}

export function AdapterTable({ adapterSettings, onSettingsChange }: AdapterTableProps) {
  const updateAt = useCallback(
    (index: number, updater: (a: ExternalAdapterConfig) => ExternalAdapterConfig) => {
      onSettingsChange({
        ...adapterSettings,
        adapters: adapterSettings.adapters.map((a, i) => (i === index ? updater(a) : a)),
      });
    },
    [adapterSettings, onSettingsChange]
  );

  const onRemove = useCallback(
    (index: number) => {
      onSettingsChange(removeAdapterFromSettings(adapterSettings, index));
    },
    [adapterSettings, onSettingsChange]
  );

  const onUpdateField = (index: number, field: "id" | "name" | "command" | "version", value: string) => {
    updateAt(index, (a) => {
      if (field === "version") return { ...a, version: normalizeOptionalString(value) };
      return { ...a, [field]: value };
    });
  };

  const onUpdateArgs = (index: number, value: string) => {
    updateAt(index, (a) => ({ ...a, args: normalizeOptionalStringArray(value) }));
  };

  const onUpdateType = (index: number, type: ExternalAdapterType) => {
    updateAt(index, (a) => {
      if (a.type === type) return a;
      if (type === "cli") {
        return { type: "cli", id: a.id, name: a.name, command: a.command, args: a.args, version: a.version, capabilities: a.capabilities };
      }
      return { type: "harness_stdio", id: a.id, name: a.name, command: a.command, args: a.args, version: a.version, capabilities: a.capabilities };
    });
  };

  const onToggleCap = (index: number, cap: keyof AdapterCapabilities, enabled: boolean) => {
    updateAt(index, (a) => {
      const next: Partial<AdapterCapabilities> = { ...(a.capabilities ?? {}) };
      if (enabled) next[cap] = true;
      else delete next[cap];
      return { ...a, capabilities: Object.keys(next).length > 0 ? next : undefined };
    });
  };

  const onCliField = (
    index: number,
    field: "versionArgs" | "authEnvVars" | "authProbeArgs" | "authProbeUnauthenticatedPatterns" | "authProbeCommand" | "authHintCommand" | "installHintCommand",
    value: string
  ) => {
    updateAt(index, (a) => {
      if (a.type !== "cli") return a;
      if (field === "versionArgs" || field === "authEnvVars" || field === "authProbeArgs" || field === "authProbeUnauthenticatedPatterns") {
        return { ...a, [field]: normalizeOptionalStringArray(value) };
      }
      return { ...a, [field]: normalizeOptionalString(value) };
    });
  };

  const onCliAuthStatus = (index: number, value: string) => {
    updateAt(index, (a) => {
      if (a.type !== "cli") return a;
      return { ...a, authStatusWhenEnvMissing: (value as "unauthenticated" | "unknown") || undefined };
    });
  };

  const onHarnessField = (index: number, field: "eventNotificationMethod" | "timeoutMs", value: string) => {
    updateAt(index, (a) => {
      if (a.type !== "harness_stdio") return a;
      if (field === "timeoutMs") {
        const n = Number(value);
        return { ...a, timeoutMs: Number.isFinite(n) && n > 0 ? n : undefined };
      }
      return { ...a, eventNotificationMethod: normalizeOptionalString(value) };
    });
  };

  const onHarnessRpc = (index: number, field: "start" | "sendTurn" | "interrupt" | "resume" | "stop", value: string) => {
    updateAt(index, (a) => {
      if (a.type !== "harness_stdio") return a;
      const rpc: NonNullable<ExternalHarnessStdioAdapterConfig["rpcMethods"]> = { ...(a.rpcMethods ?? {}) };
      const v = normalizeOptionalString(value);
      if (v) rpc[field] = v;
      else delete rpc[field];
      return { ...a, rpcMethods: Object.keys(rpc).length > 0 ? rpc : undefined };
    });
  };

  return (
    <div className="settings-table-wrap">
      <table className="settings-table" data-testid="adapter-settings-panel">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Command</th>
            <th>Args</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {adapterSettings.adapters.map((adapter, index) => (
            <Fragment key={`${adapter.id}-${index}`}>
              <tr data-testid={`adapter-row-${index}`}>
                <td>
                  <input
                    data-testid={`adapter-id-${index}`}
                    className="settings-input"
                    value={adapter.id}
                    onChange={(e) => onUpdateField(index, "id", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    data-testid={`adapter-name-${index}`}
                    className="settings-input"
                    value={adapter.name}
                    onChange={(e) => onUpdateField(index, "name", e.target.value)}
                  />
                </td>
                <td>
                  <select
                    data-testid={`adapter-type-${index}`}
                    className="settings-input"
                    value={adapter.type}
                    onChange={(e) => onUpdateType(index, e.target.value as ExternalAdapterType)}
                  >
                    <option value="cli">cli</option>
                    <option value="harness_stdio">harness_stdio</option>
                  </select>
                </td>
                <td>
                  <input
                    data-testid={`adapter-command-${index}`}
                    className="settings-input"
                    value={adapter.command}
                    onChange={(e) => onUpdateField(index, "command", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    data-testid={`adapter-args-${index}`}
                    className="settings-input"
                    value={arrayToCsv(adapter.args)}
                    onChange={(e) => onUpdateArgs(index, e.target.value)}
                  />
                </td>
                <td>
                  <button data-testid={`remove-adapter-${index}`} className="settings-btn-sm settings-btn-danger" onClick={() => onRemove(index)}>
                    Remove
                  </button>
                </td>
              </tr>
              <tr className="settings-advanced-row" data-testid={`adapter-advanced-row-${index}`}>
                <td colSpan={6}>
                  <div className="settings-advanced-grid">
                    <div className="settings-field">
                      <label>Version</label>
                      <input
                        data-testid={`adapter-version-${index}`}
                        className="settings-input"
                        value={adapter.version ?? ""}
                        onChange={(e) => onUpdateField(index, "version", e.target.value)}
                      />
                    </div>

                    <div className="settings-caps">
                      <label>Capabilities</label>
                      <div className="settings-caps-grid">
                        {ADAPTER_CAPABILITY_KEYS.map((cap) => (
                          <label key={cap} className="settings-cap-toggle">
                            <input
                              data-testid={`adapter-capability-${index}-${cap}`}
                              type="checkbox"
                              checked={Boolean(adapter.capabilities?.[cap])}
                              onChange={(e) => onToggleCap(index, cap, e.target.checked)}
                            />
                            {cap}
                          </label>
                        ))}
                      </div>
                    </div>

                    {adapter.type === "cli" ? (
                      <div className="settings-variant-grid">
                        <div className="settings-field">
                          <label>versionArgs (csv)</label>
                          <input data-testid={`adapter-cli-version-args-${index}`} className="settings-input" value={arrayToCsv(adapter.versionArgs)} onChange={(e) => onCliField(index, "versionArgs", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>authEnvVars (csv)</label>
                          <input data-testid={`adapter-cli-auth-env-vars-${index}`} className="settings-input" value={arrayToCsv(adapter.authEnvVars)} onChange={(e) => onCliField(index, "authEnvVars", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>authStatusWhenEnvMissing</label>
                          <select data-testid={`adapter-cli-auth-status-${index}`} className="settings-input" value={adapter.authStatusWhenEnvMissing ?? ""} onChange={(e) => onCliAuthStatus(index, e.target.value)}>
                            <option value="">unset</option>
                            <option value="unauthenticated">unauthenticated</option>
                            <option value="unknown">unknown</option>
                          </select>
                        </div>
                        <div className="settings-field">
                          <label>authProbeCommand</label>
                          <input data-testid={`adapter-cli-auth-probe-command-${index}`} className="settings-input" value={adapter.authProbeCommand ?? ""} onChange={(e) => onCliField(index, "authProbeCommand", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>authProbeArgs (csv)</label>
                          <input data-testid={`adapter-cli-auth-probe-args-${index}`} className="settings-input" value={arrayToCsv(adapter.authProbeArgs)} onChange={(e) => onCliField(index, "authProbeArgs", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>authProbeUnauthPatterns (csv)</label>
                          <input data-testid={`adapter-cli-auth-unauth-patterns-${index}`} className="settings-input" value={arrayToCsv(adapter.authProbeUnauthenticatedPatterns)} onChange={(e) => onCliField(index, "authProbeUnauthenticatedPatterns", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>installHintCommand</label>
                          <input data-testid={`adapter-cli-install-hint-${index}`} className="settings-input" value={adapter.installHintCommand ?? ""} onChange={(e) => onCliField(index, "installHintCommand", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>authHintCommand</label>
                          <input data-testid={`adapter-cli-auth-hint-${index}`} className="settings-input" value={adapter.authHintCommand ?? ""} onChange={(e) => onCliField(index, "authHintCommand", e.target.value)} />
                        </div>
                      </div>
                    ) : (
                      <div className="settings-variant-grid">
                        <div className="settings-field">
                          <label>eventNotificationMethod</label>
                          <input data-testid={`adapter-harness-event-method-${index}`} className="settings-input" value={(adapter as ExternalHarnessStdioAdapterConfig).eventNotificationMethod ?? ""} onChange={(e) => onHarnessField(index, "eventNotificationMethod", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>timeoutMs</label>
                          <input data-testid={`adapter-harness-timeout-${index}`} className="settings-input" value={(adapter as ExternalHarnessStdioAdapterConfig).timeoutMs ?? ""} onChange={(e) => onHarnessField(index, "timeoutMs", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>rpc.start</label>
                          <input data-testid={`adapter-harness-rpc-start-${index}`} className="settings-input" value={(adapter as ExternalHarnessStdioAdapterConfig).rpcMethods?.start ?? ""} onChange={(e) => onHarnessRpc(index, "start", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>rpc.sendTurn</label>
                          <input data-testid={`adapter-harness-rpc-sendTurn-${index}`} className="settings-input" value={(adapter as ExternalHarnessStdioAdapterConfig).rpcMethods?.sendTurn ?? ""} onChange={(e) => onHarnessRpc(index, "sendTurn", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>rpc.interrupt</label>
                          <input data-testid={`adapter-harness-rpc-interrupt-${index}`} className="settings-input" value={(adapter as ExternalHarnessStdioAdapterConfig).rpcMethods?.interrupt ?? ""} onChange={(e) => onHarnessRpc(index, "interrupt", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>rpc.resume</label>
                          <input data-testid={`adapter-harness-rpc-resume-${index}`} className="settings-input" value={(adapter as ExternalHarnessStdioAdapterConfig).rpcMethods?.resume ?? ""} onChange={(e) => onHarnessRpc(index, "resume", e.target.value)} />
                        </div>
                        <div className="settings-field">
                          <label>rpc.stop</label>
                          <input data-testid={`adapter-harness-rpc-stop-${index}`} className="settings-input" value={(adapter as ExternalHarnessStdioAdapterConfig).rpcMethods?.stop ?? ""} onChange={(e) => onHarnessRpc(index, "stop", e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
