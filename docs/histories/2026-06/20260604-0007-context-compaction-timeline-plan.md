## [2026-06-04 00:07] | Task: Plan Context Compaction Timeline Style Bugfix

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望把 Context Compaction 完成态改成独立的 timeline divider：`Context compacted · N messages`，执行中去掉方框和图标，保留稳定文字与铺满内容列的进度条，并要求调整相关 docs、生成 bug 修复计划放入 active。

### Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Design spec]**: 更新中间消息区规范，明确 Context Compaction 是独立 timeline item，不贴进上一条 assistant 回复，也不使用图标、卡片、pill 或文字动效。
- **[Bugfix plan]**: 新增 active plan `20260604-context-compaction-timeline-bugfix.md`，拆出组件视觉重构、文案映射、测试、fixture 和浅/深主题验收。
- **[Plan index]**: 更新 `docs/exec-plans/README.md`，把该 bugfix plan 登记到当前 active 列表。

### Design Intent

Context Compaction 是工作流里的上下文边界事件，不是工具调用、用户消息或 assistant 正文。完成态采用独立 divider 可以让用户明确感知“这里执行了压缩”，同时避免像通知卡片一样打断阅读。执行中只保留稳定文字与进度条，把动态反馈集中到进度条上，减少聊天流里的闪动。

### Verification

- `git diff --check`
- 本轮只改文档和计划，未运行前端测试。

### Files Modified

- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/exec-plans/active/20260604-context-compaction-timeline-bugfix.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-06/20260604-0007-context-compaction-timeline-plan.md`

## [2026-06-04 00:36] | Task: Implement Context Compaction Timeline Style Bugfix

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户要求开始执行 `20260604-context-compaction-timeline-bugfix` 计划，把 Context Compaction 从通知卡片样式改成消息流里的独立 timeline item。

### Changes Overview

**Scope:** `packages/shared`, `packages/desktop`, `docs`

**Key Actions:**

- **[Timeline UI]**: `CompactCommandBlock` 移除 `lucide-react` 状态图标、外围卡片和 pill；running 改为稳定文本 + 3px 进度条，completed / skipped / failed 改为独立 divider。
- **[Copy mapping]**: `session-selectors` 和 renderer streaming 完成态统一使用 `Context compacted · N messages`，不再把 `N messages removed` 作为主 UI 文案；`removedCount` 仍保留在原始 payload。
- **[Tests and fixture]**: 更新组件测试、App streaming 测试、shared selector 测试和 workbench mock fixture，覆盖无图标、progressbar、separator 和新完成态文案。
- **[Plan closeout]**: 将执行计划移动到 `docs/exec-plans/completed/`，并更新 `docs/exec-plans/README.md`。

### Design Intent

压缩事件应该像工作流中的上下文边界，而不是系统通知。完成态 divider 保留可感知的时间线位置；running 只让进度条承担动态反馈，文本保持稳定，避免在聊天流里重复闪动。

### Verification

- `pnpm --filter @actspace/shared exec vitest run src/test/session-selectors.test.ts`
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/compact-command-block.test.tsx`
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/app-streaming-user-message.test.tsx`
- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/desktop typecheck`
- `git diff --check`
- 颜色扫描：本轮 touched compaction 相关文件无主题相关硬编码颜色命中。
- Browser mock：`http://127.0.0.1:5288/` 下确认默认 / system 主题中 `context_compaction` 是独立 block，completed 有 `role="separator"`，running 有 `role="progressbar"`，两态 `svg` 数量均为 0；390px 窄屏无横向溢出。真实 Electron 窗口未在本轮启动。

### Files Modified

- `packages/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/test/compact-command-block.test.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/test/session-selectors.test.ts`
- `docs/exec-plans/completed/20260604-context-compaction-timeline-bugfix.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-06/20260604-0007-context-compaction-timeline-plan.md`
