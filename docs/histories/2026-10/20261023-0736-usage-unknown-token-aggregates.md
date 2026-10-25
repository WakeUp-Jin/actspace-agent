## [2026-10-23 07:36] | Task: Preserve unknown Token semantics in Usage aggregates

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `GPT-6`
- **Runtime**: Codex desktop, local workspace

### 📥 User Query

> 修复已批准的 BUG-036：Usage 聚合要区分缺失 Token 用量、明确为零和混合用量；补回归测试，并在修复后定向复验。

### 🛠 Changes Overview

**Scope:** shared IPC, Desktop Usage read model, Usage renderer, regression tests and acceptance/design documentation.

**Key Actions:**

- Added per-field unknown Token request counts to Usage summary/provider/model aggregate contracts and SQL projection; tool rows do not contribute unknown LLM Token counts.
- Updated the renderer to show unknown values as “—”, preserve explicit `0`, and show known subtotals with unknown request counts for mixed samples. Cache hit rate stays unknown when required input/cache facts are incomplete.
- Raised the disposable SQLite read-model schema to 13 and fixed staging publication to copy explicit non-generated columns.
- Added SQL and renderer regression coverage; documented the data semantics in the Usage design specification and BUG-036 record.

### 🧠 Design Intent (Why)

A missing provider usage fact is not a measured zero. Retaining known sums and unknown counts separately prevents aggregates from fabricating certainty while keeping explicitly reported zero values useful. The disposable index can rebuild from Journal facts when its schema changes.

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model-schema.ts`
- `apps/desktop/src/main/runtime-v2/read-model-sync.ts`
- `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `apps/desktop/scripts/test-usage-read-model.mjs`
- `apps/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `docs/design-docs/frontend/front-usage-statistics-refresh.md`
- `docs/exec-runs/20261021-actspace-full-acceptance/bugs/BUG-036.md`

### ✅ Verification

- `node --test apps/desktop/scripts/test-usage-read-model.mjs`: 72/72 passed.
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/usage-statistics-page.test.tsx`: 9/9 passed.
- `pnpm --filter @actspace/client build` and `pnpm --filter @actspace/desktop build:electron`: passed; Desktop typecheck and production renderer build also passed. The renderer production build emitted the existing CSS `::highlight()` and large-chunk warnings.
- Real Electron Computer Use retest: 6/6 targeted acceptance points passed using an isolated app/profile and synthetic Journal. Evidence and 14 screenshots: `tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-usage-aggregate/ui-report.md`. Main/preload, IPC, Usage Worker and SQLite came from the built app; the renderer was served from current source by isolated Vite because shared `dist/index.html` predates the fix. No real Provider request or user profile was used.
- BUG-036 is closed after the targeted retest. P2-D11 remains failed because its wider protocol, failure/cancellation, cache and recovery coverage is incomplete.
