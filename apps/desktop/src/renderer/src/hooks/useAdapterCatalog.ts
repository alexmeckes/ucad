import { useState, useCallback, useMemo } from "react";

/** Model suggestions per adapter (user can also type any model ID) */
const ADAPTER_MODEL_SUGGESTIONS: Record<string, string[]> = {
  "claude-cli": [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-sonnet-4-5",
    "claude-opus-4-5",
  ],
  "codex-cli": [
    "gpt-5.3-codex",
    "gpt-5.3-codex-spark",
    "gpt-5.2-codex",
    "gpt-5.1-codex",
    "gpt-5.1-codex-max",
    "o4-mini",
    "o3",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-4.1",
  ],
  "gemini-cli": [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ],
};

/** Reasoning effort levels per adapter */
const ADAPTER_EFFORT_LEVELS: Record<string, Array<{ id: string; label: string }>> = {
  "claude-cli": [
    { id: "", label: "Default" },
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
  ],
  "codex-cli": [
    { id: "", label: "Default" },
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
    { id: "xhigh", label: "xHigh" },
  ],
};

export function useAdapterCatalog() {
  const [adapters, setAdapters] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAdapterId, setSelectedAdapterId] = useState<string>("codex-cli");
  const [selectedMode, setSelectedMode] = useState<"LOCAL" | "WORKTREE">("LOCAL");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedEffort, setSelectedEffort] = useState<string>("");

  const modelSuggestions = useMemo(
    () => ADAPTER_MODEL_SUGGESTIONS[selectedAdapterId] ?? [],
    [selectedAdapterId]
  );

  const effortLevels = useMemo(
    () => ADAPTER_EFFORT_LEVELS[selectedAdapterId] ?? null,
    [selectedAdapterId]
  );

  const handleSelectAdapter = useCallback((id: string) => {
    setSelectedAdapterId(id);
    setSelectedModel("");
    setSelectedEffort("");
  }, []);

  const refreshAdapterCatalog = useCallback(async (): Promise<void> => {
    const next = await window.ucad.listAdapters();
    const mapped = next.map((a) => ({ id: a.id, name: a.name }));
    setAdapters(mapped);
    if (mapped.length === 0) {
      setSelectedAdapterId("");
      return;
    }
    setSelectedAdapterId((current) => {
      if (!mapped.some((a) => a.id === current)) return mapped[0].id;
      return current;
    });
  }, []);

  const getModelSuggestionsForAdapter = useCallback(
    (adapterId: string) => ADAPTER_MODEL_SUGGESTIONS[adapterId] ?? [],
    []
  );

  return {
    adapters,
    selectedAdapterId,
    setSelectedAdapterId: handleSelectAdapter,
    selectedMode,
    setSelectedMode,
    selectedModel,
    setSelectedModel,
    modelSuggestions,
    selectedEffort,
    setSelectedEffort,
    effortLevels,
    refreshAdapterCatalog,
    getModelSuggestionsForAdapter,
  };
}
