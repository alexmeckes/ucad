import type { AdapterCapabilities } from "./adapter";

export type ExternalAdapterType = "cli" | "harness_stdio";

export interface ExternalAdapterBaseConfig {
  type: ExternalAdapterType;
  id: string;
  name: string;
  version?: string;
  capabilities?: Partial<AdapterCapabilities>;
}

export interface ExternalCliAdapterConfig extends ExternalAdapterBaseConfig {
  type: "cli";
  command: string;
  args?: string[];
  versionArgs?: string[];
  authEnvVars?: string[];
  authStatusWhenEnvMissing?: "unauthenticated" | "unknown";
  authProbeCommand?: string;
  authProbeArgs?: string[];
  authProbeUnauthenticatedPatterns?: string[];
  installHintCommand?: string;
  authHintCommand?: string;
}

export interface ExternalHarnessStdioAdapterConfig extends ExternalAdapterBaseConfig {
  type: "harness_stdio";
  command: string;
  args?: string[];
  eventNotificationMethod?: string;
  timeoutMs?: number;
  rpcMethods?: {
    start?: string;
    sendTurn?: string;
    interrupt?: string;
    resume?: string;
    stop?: string;
  };
}

export type ExternalAdapterConfig = ExternalCliAdapterConfig | ExternalHarnessStdioAdapterConfig;

export interface ExternalAdapterConfigFile {
  adapters: ExternalAdapterConfig[];
}

export interface AdapterSettingsState {
  configPath: string;
  adapters: ExternalAdapterConfig[];
  loadedAdapterIds: string[];
  note?: string;
}

export interface SaveAdapterSettingsRequest {
  adapters: ExternalAdapterConfig[];
}
