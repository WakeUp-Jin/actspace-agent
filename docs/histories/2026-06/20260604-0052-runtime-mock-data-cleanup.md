## [2026-06-04 00:52] | Task: Clean runtime mock data

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 清理 renderer 产品运行路径里的 fixtures / mock 假数据，但保留 agent-core 的 `MockLLMService` 作为测试设施。

### Changes Overview

**Scope:** `packages/desktop`, `docs`

**Key Actions:**

- **[Runtime empty states]**: Removed renderer runtime fixture fallbacks for chat bootstrap, context snapshot, demo attachments, scheduled tasks, settings, archived sessions and Lab initial cards.
- **[Test fixture boundary]**: Moved remaining renderer sample data into `packages/desktop/src/renderer/test/fixtures/**` and updated tests to import from the test boundary.
- **[Lab cleanup]**: Lab now opens with an empty matrix; user-created experiments still work as local temporary state, and tests create their own cards instead of relying on preloaded fake experiments.
- **[Docs sync]**: Updated frontend verification and Lab docs to distinguish browser renderer validation from runtime fake business data; clarified `agent-core` mock provider as test-only in quality scoring.

### Design Intent

Runtime UI must either show facts from the real app or an honest empty / unavailable state. Stable fake data is still useful for component and Agent tests, but it cannot sit in the normal product path where users may mistake it for their own sessions, prompts, attachments, scheduled work or Lab experiments.

This follows the existing learning note `docs/learnings/2026-05/runtime-empty-state-vs-test-fixture.md`, so no new learning document was added.

### Verification

- `pnpm install`
- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/agent-core build`
- `pnpm --dir packages/desktop exec vitest run src/renderer/test/composer.test.tsx src/renderer/test/lab-page.test.tsx src/renderer/test/settings-page.test.tsx src/renderer/test/sidebar.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test`
- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/shared test`
- `pnpm typecheck`
- `pnpm --filter @actspace/desktop build`
- Browser renderer on `http://127.0.0.1:5174/`: Chat/sidebar no longer showed old fake session, fake attachment or scheduled task strings; Lab showed four empty stages and no old fixture experiment names.
- Runtime fixture grep against `packages/desktop/src/renderer --glob '!**/test/**'`: no production renderer fixture/mock fallback hits.

### Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/LabPage.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/test/fixtures/usageStatisticsFixture.ts`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/lab-implementation-progress.md`
- `docs/design-docs/lab-frontend-page-design.md`
- `docs/QUALITY_SCORE.md`
- `docs/exec-plans/completed/20260604-runtime-mock-data-cleanup.md`
