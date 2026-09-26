# Desktop build speed: execution summary

## Delivered

- `build:deps` now builds the Runtime dependency closure once and Client once, removing repeated package invocations.
- Development starts from an incremental TypeScript project graph and keeps dependency, Client bundle, prompt, renderer, and Electron watchers alive together.
- `scripts/generate-desktop-build-graph.mjs` derives 30 package references from workspace manifests. Run `pnpm check:desktop-build-graph` when package dependencies change.
- Release `pnpm --filter @actspace/desktop build` keeps its clean step and passed after the change.

## Evidence

- Existing `build:deps`: 13.85s / 14.92s.
- New `build:deps`: 8.44s.
- Development dependency preparation: 1.48s; warm graph build: 0.33s.
- Renderer profile: 2474 modules, 2.09s production build.
- Clean Desktop build: 11.76s.
- `node --test scripts/test/dev-process-runner.test.mjs`: 5 passed, 1 skipped.
- `pnpm check:desktop-build-graph`: passed.

## Remaining gate

`pnpm --filter @actspace/desktop typecheck` currently reports errors in existing Usage Statistics fixtures because the worktree's `UsageCostSummary` edits require `costUsd`. Re-run after those unrelated edits are completed. Electron UI, packaged app, and signing gates remain manual release checks.

`pnpm check:docs` also remains blocked by the pre-existing `docs/exec-plans/active/20260926-site-homepage-redesign.md`, whose completed plan is still under `active/`.
