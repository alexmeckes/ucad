import { describe, expect, it } from "vitest";
import type { AdapterSettingsState } from "@ucad/contracts";
import {
  addAdapterToSettings,
  normalizeOptionalString,
  normalizeOptionalStringArray,
  parseCsv,
  removeAdapterFromSettings,
  validateAdapterConfig
} from "../../apps/desktop/src/renderer/src/adapter-settings-state";

const baseSettings = (): AdapterSettingsState => ({
  configPath: "/tmp/adapters.json",
  adapters: [],
  loadedAdapterIds: []
});

describe("adapter settings state helpers", () => {
  it("parses CSV and optional normalizers consistently", () => {
    expect(parseCsv("a, b, ,c")).toEqual(["a", "b", "c"]);
    expect(normalizeOptionalString("   ")).toBeUndefined();
    expect(normalizeOptionalString(" value ")).toBe("value");
    expect(normalizeOptionalStringArray(" ,x, y, ")).toEqual(["x", "y"]);
    expect(normalizeOptionalStringArray(" , , ")).toBeUndefined();
  });

  it("adds adapter from draft with trimming and duplicate protection", () => {
    const settings = baseSettings();
    const added = addAdapterToSettings(settings, {
      type: "cli",
      id: "  custom-cli ",
      name: " Custom CLI ",
      command: " custom ",
      argsText: "--json, --verbose"
    });

    expect(added.error).toBeUndefined();
    expect(added.next?.adapters).toHaveLength(1);
    expect(added.next?.adapters[0]).toMatchObject({
      type: "cli",
      id: "custom-cli",
      name: "Custom CLI",
      command: "custom",
      args: ["--json", "--verbose"]
    });

    const duplicate = addAdapterToSettings(added.next as AdapterSettingsState, {
      type: "cli",
      id: "custom-cli",
      name: "Another",
      command: "another",
      argsText: ""
    });
    expect(duplicate.error).toContain("already exists");
  });

  it("removes adapter immutably by index", () => {
    const settings: AdapterSettingsState = {
      ...baseSettings(),
      adapters: [
        { type: "cli", id: "a", name: "A", command: "a" },
        { type: "harness_stdio", id: "b", name: "B", command: "b" }
      ]
    };

    const next = removeAdapterFromSettings(settings, 0);
    expect(next.adapters).toHaveLength(1);
    expect(next.adapters[0].id).toBe("b");
    expect(settings.adapters).toHaveLength(2);
  });

  it("validates required fields, duplicate ids, and harness timeout", () => {
    const invalidRequired: AdapterSettingsState = {
      ...baseSettings(),
      adapters: [{ type: "cli", id: "", name: "x", command: "y" }]
    };
    expect(validateAdapterConfig(invalidRequired)).toContain("requires id");

    const duplicateIds: AdapterSettingsState = {
      ...baseSettings(),
      adapters: [
        { type: "cli", id: "dup", name: "x", command: "x" },
        { type: "harness_stdio", id: "dup", name: "y", command: "y" }
      ]
    };
    expect(validateAdapterConfig(duplicateIds)).toContain("Duplicate adapter id");

    const invalidTimeout: AdapterSettingsState = {
      ...baseSettings(),
      adapters: [{ type: "harness_stdio", id: "h", name: "h", command: "node", timeoutMs: 0 }]
    };
    expect(validateAdapterConfig(invalidTimeout)).toContain("Invalid timeoutMs");

    const valid: AdapterSettingsState = {
      ...baseSettings(),
      adapters: [
        { type: "cli", id: "ok", name: "ok", command: "ok" },
        { type: "harness_stdio", id: "h2", name: "h2", command: "node", timeoutMs: 10_000 }
      ]
    };
    expect(validateAdapterConfig(valid)).toBeNull();
  });
});
