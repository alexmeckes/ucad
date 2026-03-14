import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadExternalAdaptersFromConfig } from "../../apps/desktop/src/main/external-adapters";

describe("external adapter config loader", () => {
  it("loads cli and harness adapters from JSON config", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ucad-adapter-config-"));
    const configPath = path.join(tempRoot, "adapters.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          adapters: [
            {
              type: "cli",
              id: "custom-cli",
              name: "Custom CLI",
              command: "custom",
              capabilities: {
                structuredEvents: true
              }
            },
            {
              type: "harness_stdio",
              id: "custom-harness",
              name: "Custom Harness",
              command: "node",
              args: ["./harness.mjs"]
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const adapters = await loadExternalAdaptersFromConfig(configPath);
    expect(adapters.map((adapter) => adapter.metadata().id).sort()).toEqual(["custom-cli", "custom-harness"]);
    expect(adapters.find((adapter) => adapter.metadata().id === "custom-cli")?.capabilities().structuredEvents).toBe(true);
    expect(adapters.find((adapter) => adapter.metadata().id === "custom-harness")?.metadata().kind).toBe("harness");

    await rm(tempRoot, { recursive: true, force: true });
  });
});
