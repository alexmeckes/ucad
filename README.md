# UCAD (Universal Coding Agent Desktop)

This repository contains a greenfield Electron + TypeScript monorepo implementation of the Universal Coding Agent Desktop plan.

## Run

```bash
pnpm install
pnpm -r build
pnpm --filter @ucad/desktop dev
```

## Test

```bash
pnpm test
```

## External Adapters

You can inject custom adapters without editing core app code.

Default config path:

`~/.ucad/adapters.json`

Override config path:

`UCAD_ADAPTER_CONFIG_PATH=/absolute/path/adapters.json`

You can edit adapters from the in-app `Adapter Settings` panel or by writing the JSON file directly.

```json
{
  "adapters": [
    {
      "type": "cli",
      "id": "my-cli",
      "name": "My CLI",
      "command": "mycli",
      "args": ["--interactive"]
    },
    {
      "type": "harness_stdio",
      "id": "my-harness",
      "name": "My Harness",
      "command": "node",
      "args": ["/absolute/path/to/harness.mjs"]
    }
  ]
}
```

Run with:

```bash
UCAD_ADAPTER_CONFIG_PATH=/absolute/path/adapters.json pnpm --filter @ucad/desktop dev
```

See a full sample config at `/Users/alexmeckes/Downloads/opencodex/docs/adapters.example.json`.

## Harness Scaffold

Generate a local JSON-RPC-over-stdio harness template:

```bash
pnpm scaffold:harness
```

Custom output path:

```bash
pnpm scaffold:harness harnesses/my-harness.mjs
```

## E2E

```bash
pnpm test:e2e
pnpm test:e2e:full
```

To run non-skipped Electron E2E locally with startup hardening + diagnostics:

```bash
UCAD_RUN_E2E=1 pnpm test:e2e
```

When `UCAD_RUN_E2E=1`, the runner rebuilds native modules for Electron before tests and restores Node-native modules afterward.

Useful debug flags:

- `UCAD_E2E_KEEP_TMP=1` keeps temp run directories.
- `UCAD_STARTUP_LOG_PATH=/absolute/path/startup.log` writes startup lifecycle logs there.

Manual rebuild commands:

```bash
pnpm rebuild:native:electron
pnpm rebuild:native:node
```
