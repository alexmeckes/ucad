import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type {
  AgentAdapter,
  ExternalAdapterConfig,
  ExternalAdapterConfigFile
} from "@ucad/contracts";

const requireModule = createRequire(import.meta.url);

type AdapterSdkModule = typeof import("@ucad/adapter-sdk");
type HarnessSdkModule = typeof import("@ucad/harness-sdk-stdio");

const loadAdapterSdk = (): AdapterSdkModule => requireModule("@ucad/adapter-sdk") as AdapterSdkModule;
const loadHarnessSdk = (): HarnessSdkModule => requireModule("@ucad/harness-sdk-stdio") as HarnessSdkModule;

const resolveConfigPath = (input: string): string => (path.isAbsolute(input) ? input : path.resolve(process.cwd(), input));

export const defaultExternalAdapterConfigPath = (overridePath?: string): string => {
  if (overridePath) {
    return resolveConfigPath(overridePath);
  }
  return path.join(os.homedir(), ".ucad", "adapters.json");
};

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const isExternalAdapterConfig = (value: unknown): value is ExternalAdapterConfig => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<ExternalAdapterConfig>;
  if (typeof maybe.id !== "string" || typeof maybe.name !== "string" || typeof maybe.command !== "string") {
    return false;
  }

  if (maybe.args && !isStringArray(maybe.args)) {
    return false;
  }

  return maybe.type === "cli" || maybe.type === "harness_stdio";
};

const sanitizeExternalAdapterConfigFile = (input: Partial<ExternalAdapterConfigFile>): ExternalAdapterConfigFile => {
  const adapters = Array.isArray(input.adapters) ? input.adapters.filter(isExternalAdapterConfig) : [];
  return { adapters };
};

const createAdapter = (config: ExternalAdapterConfig): AgentAdapter => {
  if (config.type === "cli") {
    const { createConfigurableCliAdapter } = loadAdapterSdk();
    return createConfigurableCliAdapter({
      id: config.id,
      name: config.name,
      version: config.version,
      command: config.command,
      args: config.args,
      versionArgs: config.versionArgs,
      authEnvVars: config.authEnvVars,
      authStatusWhenEnvMissing: config.authStatusWhenEnvMissing,
      authProbeCommand: config.authProbeCommand,
      authProbeArgs: config.authProbeArgs,
      authProbeUnauthenticatedPatterns: config.authProbeUnauthenticatedPatterns,
      installHintCommand: config.installHintCommand,
      authHintCommand: config.authHintCommand,
      capabilities: config.capabilities
    });
  }

  const { createStdioHarnessAdapter } = loadHarnessSdk();
  return createStdioHarnessAdapter({
    id: config.id,
    name: config.name,
    version: config.version,
    command: config.command,
    args: config.args,
    eventNotificationMethod: config.eventNotificationMethod,
    timeoutMs: config.timeoutMs,
    rpcMethods: config.rpcMethods,
    capabilities: config.capabilities
  });
};

export const readExternalAdapterConfig = async (configPath: string): Promise<ExternalAdapterConfigFile> => {
  const absolutePath = resolveConfigPath(configPath);

  try {
    await access(absolutePath);
  } catch {
    return { adapters: [] };
  }

  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<ExternalAdapterConfigFile>;
  return sanitizeExternalAdapterConfigFile(parsed);
};

export const writeExternalAdapterConfig = async (configPath: string, config: ExternalAdapterConfigFile): Promise<void> => {
  const absolutePath = resolveConfigPath(configPath);
  const cleaned = sanitizeExternalAdapterConfigFile(config);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");
};

export const buildExternalAdapters = (config: ExternalAdapterConfigFile): AgentAdapter[] => {
  const resolved: AgentAdapter[] = [];

  for (const adapterConfig of config.adapters) {
    try {
      resolved.push(createAdapter(adapterConfig));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown adapter config error";
      console.error(`[ucad] failed to build external adapter ${JSON.stringify(adapterConfig)}: ${message}`);
    }
  }

  return resolved;
};

export const loadExternalAdaptersFromConfig = async (configPath: string): Promise<AgentAdapter[]> => {
  const config = await readExternalAdapterConfig(configPath);
  return buildExternalAdapters(config);
};
