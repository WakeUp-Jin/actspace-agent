# Desktop build speed

## Goal and scope

Reduce repeated work before `pnpm dev` and make workspace package edits rebuild through a TypeScript project graph. Keep the release build clean and preserve package runtime exports. Renderer changes are driven by a separate measured profile.

## Baseline

On 2026-09-26, the existing `build:deps` took 13.85s and 14.92s. Building the Desktop dependency closure once took 7.70s and 7.50s. Renderer production build took 2.23s; Electron main/preload build took 1.37s. Current `dev` always executes `build:deps` before starting watchers, and only Shared is watched among workspace packages.

## Steps and checks

1. Replace repeated `build:deps` commands with one Desktop dependency-closure build. Check clean outputs and compare elapsed time.
2. Add a development build path that retains outputs, then run persistent dependency watch alongside Vite, Electron main and preload. Check no-change restart and source edits in Shared and Runtime.
3. Add composite TypeScript project references for the Desktop dependency graph, with each package's explicit dependency edges and build metadata under `dist`. Check a clean graph build, warm build, and typecheck.
4. Profile renderer; change bundling only where the profile shows a build-time gain. Check production build and renderer behavior.
5. Run focused process tests, package builds, Desktop build/typecheck, documentation checks, and record remaining manual Electron gates.

## Risks

- Package exports include JavaScript, declarations, a Client CJS bundle, and an English prompt asset. The development build must produce and watch all required assets.
- A stale `dist` file may survive incremental compilation after a source deletion. The release path remains clean; document a clean rebuild path for development troubleshooting.
- Existing uncommitted edits in a Desktop test and a frontend demo must remain untouched.

## Mode

Interactive. The user approved all four stages in this conversation.

## Progress

- [x] Inspect and measure the current build chain.
- [x] Remove duplicate dependency builds.
- [x] Add development incremental build and watch.
- [x] Add project references and verify clean/warm builds.
- [x] Profile renderer and apply measured improvements.
- [x] Finish checks and execution summary.

## Result

The dependency build path now builds the Runtime closure once and Client once. Development uses a generated TypeScript project graph with persistent watch, plus separate Client bundle and English prompt watchers. The renderer profile did not show a build-time change worth adding; the renderer remains a 2.09s production build with a large-chunk warning.

Validation: graph generation/check, development process tests, clean Desktop build, renderer build, Electron build, and project-graph warm build passed. Desktop `typecheck` remains blocked by pre-existing Usage Statistics fixture edits that omit the current `costUsd` field.
