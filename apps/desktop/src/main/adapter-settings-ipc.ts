import type { AgentAdapter, AdapterSettingsState, SaveAdapterSettingsRequest } from "@ucad/contracts";
import { buildExternalAdapters, readExternalAdapterConfig, writeExternalAdapterConfig } from "./external-adapters";

export interface IpcMainLike {
  handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>) => void;
}

export interface ExternalAdapterController {
  setExternalAdapters: (adapters: AgentAdapter[]) => void;
}

const buildAdapterSettingsNote = (env: NodeJS.ProcessEnv): string => {
  return env.UCAD_ADAPTER_CONFIG_PATH ? "Using UCAD_ADAPTER_CONFIG_PATH override." : "Using default adapter config path.";
};

const buildAdapterSettingsState = (
  configPath: string,
  adapters: AdapterSettingsState["adapters"],
  loadedAdapterIds: string[],
  env: NodeJS.ProcessEnv
): AdapterSettingsState => {
  return {
    configPath,
    adapters,
    loadedAdapterIds,
    note: buildAdapterSettingsNote(env)
  };
};

export const getAdapterSettingsState = async (
  configPath: string,
  env: NodeJS.ProcessEnv
): Promise<AdapterSettingsState> => {
  const config = await readExternalAdapterConfig(configPath);
  const loadedAdapterIds = buildExternalAdapters(config).map((adapter) => adapter.metadata().id);
  return buildAdapterSettingsState(configPath, config.adapters, loadedAdapterIds, env);
};

export const saveAdapterSettingsState = async (
  configPath: string,
  req: SaveAdapterSettingsRequest,
  orchestrator: ExternalAdapterController,
  env: NodeJS.ProcessEnv
): Promise<AdapterSettingsState> => {
  await writeExternalAdapterConfig(configPath, {
    adapters: req.adapters
  });

  const nextConfig = await readExternalAdapterConfig(configPath);
  const nextAdapters = buildExternalAdapters(nextConfig);
  orchestrator.setExternalAdapters(nextAdapters);

  return buildAdapterSettingsState(
    configPath,
    nextConfig.adapters,
    nextAdapters.map((adapter) => adapter.metadata().id),
    env
  );
};

export const registerAdapterSettingsIpc = (options: {
  ipcMain: IpcMainLike;
  configPath: string;
  orchestrator: ExternalAdapterController;
  env?: NodeJS.ProcessEnv;
}): void => {
  const env = options.env ?? process.env;

  options.ipcMain.handle("settings.adapters.get", async () => {
    return getAdapterSettingsState(options.configPath, env);
  });

  options.ipcMain.handle("settings.adapters.save", async (_, req) => {
    return saveAdapterSettingsState(options.configPath, req as SaveAdapterSettingsRequest, options.orchestrator, env);
  });
};
