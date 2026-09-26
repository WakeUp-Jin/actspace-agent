# Desktop build speed: execution process

## Start

2026-09-26, interactive mode. The user approved all four stages. Two unrelated pre-existing working-tree edits were identified and will be preserved.

## Baseline

- Current Desktop `build:deps`: 13.85s and 14.92s.
- Dependency closure built once: 7.70s and 7.50s.
- Renderer production build: 2.23s. Electron main/preload build: 1.37s.
- `dev` always builds dependencies first. Only Shared has a workspace package watch.

## Progress

- Duplicate package builds were removed from `apps/desktop/package.json`; `build:deps` fell to 8.44s in the measured run.
- Generated 30 package build configs plus `tsconfig.desktop-deps.json` from workspace dependency edges.
- Added `build:deps:dev`, `dev:deps`, Client bundle watch, and English prompt watch. The first dev preparation took 1.48s; a warm project-graph build took 0.33s.
- Confirmed `tsc -b --watch` starts with zero errors and recompiles after touching Shared.
- A second watch smoke touched Shared and Runtime; both changes triggered incremental recompilation with zero errors.
- Renderer profile transformed 2474 modules and built in 2.09s. No bundling change was justified by the profile.
- Clean Desktop build passed in 11.76s. Process tests and graph drift checks passed.
- Desktop typecheck is blocked by existing Usage Statistics fixture edits missing `costUsd`; this was not introduced by the build changes.
