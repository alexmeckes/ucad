import type {
  AdapterSettingsState,
  ExternalAdapterConfig,
  ExternalAdapterType
} from "@ucad/contracts";

export interface NewAdapterDraft {
  type: ExternalAdapterType;
  id: string;
  name: string;
  command: string;
  argsText: string;
}

export const parseCsv = (raw: string): string[] => {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export const arrayToCsv = (values?: string[]): string => values?.join(", ") ?? "";

export const normalizeOptionalString = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const normalizeOptionalStringArray = (value: string): string[] | undefined => {
  const parsed = parseCsv(value);
  return parsed.length > 0 ? parsed : undefined;
};

export const validateAdapterConfig = (settings: AdapterSettingsState): string | null => {
  const seenIds = new Set<string>();
  for (const adapter of settings.adapters) {
    const id = adapter.id.trim();
    const name = adapter.name.trim();
    const command = adapter.command.trim();

    if (!id || !name || !command) {
      return "Every adapter requires id, name, and command.";
    }

    if (seenIds.has(id)) {
      return `Duplicate adapter id: ${id}`;
    }
    seenIds.add(id);

    if (adapter.type === "harness_stdio" && adapter.timeoutMs !== undefined && (!Number.isFinite(adapter.timeoutMs) || adapter.timeoutMs <= 0)) {
      return `Invalid timeoutMs for adapter ${id}`;
    }
  }

  return null;
};

const buildAdapterFromDraft = (draft: NewAdapterDraft): ExternalAdapterConfig => {
  const id = draft.id.trim();
  const name = draft.name.trim();
  const command = draft.command.trim();
  const args = parseCsv(draft.argsText);

  if (draft.type === "cli") {
    return {
      type: "cli",
      id,
      name,
      command,
      ...(args.length > 0 ? { args } : {})
    };
  }

  return {
    type: "harness_stdio",
    id,
    name,
    command,
    ...(args.length > 0 ? { args } : {})
  };
};

export const addAdapterToSettings = (
  settings: AdapterSettingsState,
  draft: NewAdapterDraft
): { next?: AdapterSettingsState; error?: string } => {
  const id = draft.id.trim();
  const name = draft.name.trim();
  const command = draft.command.trim();

  if (!id || !name || !command) {
    return {
      error: "Adapter id, name, and command are required."
    };
  }

  if (settings.adapters.some((adapter) => adapter.id === id)) {
    return {
      error: `Adapter id already exists: ${id}`
    };
  }

  const adapterConfig = buildAdapterFromDraft({
    ...draft,
    id,
    name,
    command
  });

  return {
    next: {
      ...settings,
      adapters: [...settings.adapters, adapterConfig]
    }
  };
};

export const removeAdapterFromSettings = (settings: AdapterSettingsState, index: number): AdapterSettingsState => {
  return {
    ...settings,
    adapters: settings.adapters.filter((_, currentIndex) => currentIndex !== index)
  };
};
