## [2026-07-30 14:19] | Task: 实现 Composer Slash Command 菜单

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 为聊天输入框增加简洁的 `/` 快捷入口，第一版只保留 Functions 与 Skills 两个模块；先完成设计规范和执行计划，确认后实现。

### Changes Overview

**Scope:** Desktop Renderer、前端设计文档与测试

**Key Actions:**

- 新增 Slash Function catalog、完整草稿解析、Functions / Skills 过滤排序与稳定 option id。
- 在 Composer 中实现 Functions / Skills 双分组菜单、键盘导航、IME 防护、无障碍 active descendant 和浮层互斥。
- 复用现有模式、Compact、Eval、Context、Review 与 Skill 绑定链，不新增 IPC 或第二套能力系统。
- Skill 加载按 workspace 缓存，并用 request identity 防止旧工作区异步结果覆盖新结果。
- 浏览器布局验收发现 initial surface 向上弹出会越出视口，调整为 initial 向下、follow-up 向上；480px 窄窗口保持在 Composer 可用宽度内。

### Design Intent (Why)

Slash 菜单是键盘优先的能力发现入口，不替代鼠标优先的 `+` 菜单。第一版保持小型 renderer catalog，把执行继续交给已有回调和命令路由，以最小改动提高 Compact、Eval、模式和 Skills 的可发现性，同时避免引入跨进程 Command Registry。

### Verification

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/composer-slash-commands.test.ts src/renderer/test/composer.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`：64 tests passed。
- `pnpm typecheck`：通过。
- `pnpm build`：通过；保留已有 Vite 大 chunk warning。
- `pnpm check:frontend-theme`：通过。
- 浏览器 Renderer：验证 initial surface 在 1280px / 480px 下不越界、输入焦点保持、ArrowDown + Enter 可选择 Plan。
- Electron 真实 Skill IPC、Context / Review 与命令链由用户手动验收，本记录不把浏览器结果视为 Electron 验收。

### Files Modified

- `packages/desktop/src/renderer/components/composer-slash-commands.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer-slash-commands.test.ts`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `docs/design-docs/frontend/front-composer-slash-command.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/exec-plans/active/20260730-composer-slash-command-menu.md`

### Learning Note

- 这次变更暴露了可迁移的异步目录加载竞态，已沉淀到 `docs/learnings/2026-07/async-catalog-loads-need-request-identity.md`。
