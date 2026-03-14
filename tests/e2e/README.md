# E2E Notes

Playwright Electron E2E is implemented in
`/Users/alexmeckes/Downloads/opencodex/tests/e2e/desktop.e2e.spec.ts`.

Commands:

- `pnpm test:e2e`
  - Builds desktop app and runs Playwright suite.
  - E2E spec is intentionally skipped unless `UCAD_RUN_E2E=1`.
- `pnpm test:e2e:full`
  - Sets `UCAD_RUN_E2E=1` and executes the full Electron E2E workflow.

Why gated:

- Some CI/sandbox environments cannot launch Electron UI processes.
- Gating avoids false failures while keeping full coverage available for desktop-capable runs.
