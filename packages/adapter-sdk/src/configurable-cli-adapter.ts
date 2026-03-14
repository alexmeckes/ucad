import type { AdapterCapabilities } from "@ucad/contracts";
import { BaseCliAdapter, type CliAdapterOptions } from "./base-cli-adapter";

export interface ConfigurableCliAdapterOptions extends CliAdapterOptions {
  capabilities?: Partial<AdapterCapabilities>;
}

export class ConfigurableCliAdapter extends BaseCliAdapter {
  private readonly capabilityOverrides: Partial<AdapterCapabilities>;

  constructor(options: ConfigurableCliAdapterOptions) {
    super(options);
    this.capabilityOverrides = options.capabilities ?? {};
  }

  override capabilities(): AdapterCapabilities {
    return {
      ...super.capabilities(),
      ...this.capabilityOverrides
    };
  }
}

export const createConfigurableCliAdapter = (options: ConfigurableCliAdapterOptions): ConfigurableCliAdapter =>
  new ConfigurableCliAdapter(options);
