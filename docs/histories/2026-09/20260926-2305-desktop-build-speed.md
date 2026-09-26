## [2026-09-26 23:05] | Task: 加快 Desktop 编译速度

### 📥 User Query

> 现在的编译速度很慢，看看怎么优化吧

### 🛠 Changes Overview

**Scope:** Desktop build scripts, workspace TypeScript build graph, English prompt asset watch, execution documentation.

**Key Actions:**

- Removed repeated package builds from `apps/desktop` `build:deps`.
- Added generated composite project references and a warm incremental development build.
- Added persistent dependency, Client bundle, and prompt watchers to `pnpm dev`.
- Profiled the renderer and kept its bundling unchanged because the measured build time did not justify a risky split.

### 🧠 Design Intent (Why)

The old development path built the Runtime closure and then rebuilt several of the same packages explicitly. The new path has one dependency graph for development and one clean path for release, so repeated work is removed without allowing stale files into release artifacts.

### 📁 Files Modified

- `apps/desktop/package.json`
- `scripts/desktop-dev.mjs`
- `scripts/generate-desktop-build-graph.mjs`
- `tsconfig.desktop-deps.json`
- `packages/*/tsconfig.build.json`
- `packages/english-learning/scripts/copy-prompts.mjs`
- `docs/exec-plans/20260926-desktop-build-speed.md`
- `docs/exec-runs/20260926-desktop-build-speed/`

### ✅ Validation

Existing `build:deps` measured 13.85–14.92s; the deduplicated path measured 8.44s. Warm project graph build measured 0.33s. Clean Desktop build passed in 11.76s; renderer profile passed in 2.09s; process tests passed 5/5 runnable tests. Desktop typecheck remains blocked by unrelated Usage Statistics fixture edits requiring `costUsd`.
