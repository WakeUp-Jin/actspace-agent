## [2026-06-04 00:33] | Task: Add Session Hover Card

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户需要左侧会话列表 hover 后展示会话所属完整 workspace 路径、模型和 context 信息；不要显示 repo / branch 第一行。

### Changes Overview

**Scope:** `packages/desktop`, `packages/shared`, `docs/design-docs`, `docs/exec-plans`, `docs/learnings`

**Key Actions:**

- **[Hover card]**: 在左侧会话行接入只读 hover/focus 信息卡，显示标题、完整 workspace path、模型 label、context 百分比和 token 比例。
- **[Preview data]**: 新增 `session:get-preview` IPC，非当前会话按需读取摘要，renderer 以 `sessionId` 缓存，避免 `listSessions()` 扩大读取负担。
- **[Interaction safety]**: hover card 使用受控 Radix Tooltip open 状态；focus 可以打开，blur、右键菜单和 rename 状态会关闭。
- **[Main service]**: `session-preview-service` 只读 `meta.json`、`context-state.json` 和 `session.jsonl` 摘要，并拒绝 unsafe `sessionId`。
- **[Tests]**: 补充 Sidebar hover card 展示、缺失数据降级、focus 可见、重复 hover 缓存、右键/rename 互斥，以及 main preview service 回退和 unsafe id 测试。
- **[Docs]**: 更新左侧会话栏规范，归档 execution plan，并沉淀受控异步浮层的学习记录。

### Design Intent (Why)

左侧会话列表可能出现多个同名 workspace，仅靠会话标题无法判断当前上下文。Hover card 只回答“这条会话属于哪里、最近用什么模型、context 用了多少”，不扩展成管理入口，避免左栏交互变重。

非当前会话的模型和 context 信息不能塞进 `listSessions()`，否则列表刷新会被所有 session 事件流拖慢；按 hover 触发、main 侧只返回摘要、renderer 缓存，是更小的性能边界。

### Verification

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/sidebar.test.tsx`
- `pnpm --filter @actspace/desktop exec vitest run src/main/test/session-preview-service.test.ts`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop build`
- `git diff --check`
- 主题颜色扫描确认 hover card 相关 touched files 没有新增主题相关 hard-coded color。
- Electron renderer smoke 指向当前工作区 renderer `http://127.0.0.1:5174/`，验证浅/深主题下 hover card 可显示、宽度 420px、路径 `overflow-wrap:anywhere`、进度条百分比正常且未越出 viewport。

### Follow-up Fix: Chrome Title Ownership

用户反馈：会话详情 hover card 不应该挂在左侧会话列表项上，而应该在顶部当前会话标题（例如 `New chat`）hover 时出现。

本次修正：

- **[Ownership]**: 将 hover card 内容抽成 `SessionHoverPreviewCard`，从 `Sidebar` 移到 `WindowChromeBar` 当前会话标题触发。
- **[Sidebar cleanup]**: 左侧会话行不再触发大详情卡，只保留选择、右键、rename、pin、archive 和状态点行为。
- **[Chrome integration]**: `WorkbenchLayout` 把当前 active session 和 preview resolver 传给 `WindowChromeBar`；顶部标题支持 mouse hover 和 keyboard focus 打开详情卡，并保留同一会话只加载一次的缓存行为。
- **[Hit testing]**: `chrome-title-trigger` 使用 `-webkit-app-region: no-drag` 与语义 token 样式，让标题可 hover/focus，同时不破坏顶部栏其他拖拽区域。
- **[Tests]**: 更新 Sidebar/WindowChromeBar 单测，覆盖左侧不再弹详情、顶部标题 hover/focus 展示详情、重复 hover 不重复加载。

追加验证：

- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test -- src/renderer/test/sidebar.test.tsx`
- `git diff --check`
- 主题颜色扫描确认 `WindowChromeBar` / `SessionHoverPreview` / `electron.css` 没有新增主题相关 hard-coded color。

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/session-preview-service.ts`
- `packages/desktop/src/main/test/session-preview-service.test.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/SessionHoverPreview.tsx`
- `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/styles/electron.css`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/exec-plans/completed/20260603-session-hover-card.md`
- `docs/exec-plans/README.md`
- `docs/learnings/2026-06/controlled-tooltip-async-preview.md`
