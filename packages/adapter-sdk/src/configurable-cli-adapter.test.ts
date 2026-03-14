import { describe, expect, it } from "vitest";
import { ConfigurableCliAdapter } from "./configurable-cli-adapter";

describe("ConfigurableCliAdapter", () => {
  it("applies capability overrides on top of defaults", () => {
    const adapter = new ConfigurableCliAdapter({
      id: "custom-cli",
      name: "Custom CLI",
      command: "custom",
      capabilities: {
        structuredEvents: true,
        supportsPatch: true,
        supportsMcpPassthrough: true
      }
    });

    const capabilities = adapter.capabilities();
    expect(capabilities.structuredEvents).toBe(true);
    expect(capabilities.supportsPatch).toBe(true);
    expect(capabilities.supportsMcpPassthrough).toBe(true);
    expect(capabilities.supportsInterrupt).toBe(true);
  });
});
