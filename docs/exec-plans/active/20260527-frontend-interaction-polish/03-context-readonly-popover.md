# 03 Composer Context 只读弹窗

## 目标

完成 `#8` Context 按钮接入。点击 Composer 里的 Context 圆形入口后打开只读弹窗，展示总占用、分段占用、System prompt、Tools、Rules、Skills、MCP、Subagents、Conversation，并保证与模型菜单、模式菜单等 Composer 浮层互斥。

## 范围

包含：

- `ContextPopup` 支持 `contextState` entries 展示。
- 数据优先来自 `SessionRecord.contextState`，没有时 fallback 到 `contextSnapshot`。
- 弹窗包含总占用、分段条、bucket 列表和 entries 列表。
- entries 按 System prompt / Tools / Rules / Skills / MCP / Subagents / Conversation 分组展示。
- 只读展示，不提供增删改按钮。
- Composer 任意时刻只有一个浮层打开。

不包含：

- 不实现 Context 条目的增删改、pin、remove。
- 不做右侧完整 Context 视图；该能力由 `../20260527-right-panel-views.md` 负责。
- 不自行解析 `session.jsonl`。
- 不改变后端 context state 生成逻辑，除非发现字段缺失且先更新对应后端计划。

## 背景

相关文档：

- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/design-docs/agent-core/token-usage-and-context-state.md`
- `docs/FRONTEND_VERIFICATION.md`

相关代码路径：

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ContextPopup.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/tokens.css`（仅在需要新增全局 token 时修改）

已知现状：

- `ContextPopup` 当前只接收 `ContextUsageSnapshot | null`。
- `SessionRecord` 已有 `contextState?: ContextState | null`。
- `ContextStateEntry` 已包含 kind、title、estimatedTokens、included、preview 等字段。

## 实施任务

### Step 1: 数据流补齐

- 将 `contextState` 从 `App` 传到 `WorkbenchLayout`、`ConversationView`、`Composer`。
- `Composer` 再传给 `ContextPopup`。
- 保留 `contextSnapshot` fallback。

验收：

- TypeScript 类型能体现 `contextState` 可空。
- mock 环境没有 contextState 时仍能显示 snapshot 统计。

### Step 2: ContextPopup 展示结构

- 统一输入为 view model：
  - total tokens / max tokens / percent used
  - buckets
  - entries by bucket
- 有 entries 时展示各分组标题、token 估算、included 状态和 preview。
- 无 entries 时展示只读空态，说明当前只有 summary snapshot。
- 颜色使用现有 context bucket 色彩，不新增大面积彩色背景。

验收：

- 弹窗能看到 System prompt、Tools、Rules、Skills、MCP、Subagents、Conversation 至少 7 个分组或对应空态。
- 长 preview 不撑破弹窗。

### Step 3: 浮层互斥与可访问性

- 点击 Context 时关闭 mode menu、model menu、model options。
- 打开 mode / model 时关闭 Context。
- Escape 关闭弹窗。
- 点击 Composer 外部关闭弹窗。
- 弹窗 role / aria-label 保持明确。

验收：

- Context popup 不会和模型菜单同时打开。
- 键盘 focus 不迷失，关闭按钮可访问。

### Step 4: 测试

- renderer 测试覆盖：
  - 点击 Context 打开弹窗。
  - 有 contextState 时展示 entries。
  - 无 contextState 时 fallback 到 contextSnapshot。
  - 打开 model menu 后 Context 自动关闭。

## 风险

- 风险：Context entries 内容过长导致弹窗撑高或遮挡 Composer。
  - 缓解：限制弹窗最大高度，内部滚动。
- 风险：Context 数据来源不稳定。
  - 缓解：view model 同时支持 contextState、contextSnapshot 和空态。

## 验证方式

- `pnpm --filter @actspace/desktop test -- ContextPopup` 或等价局部测试。
- `pnpm --filter @actspace/desktop typecheck`。
- 浏览器 mock 验证弹窗打开/关闭、entries 展示、浮层互斥。
- 本阶段不强制 Electron 真实验证，因为未新增 preload / IPC。

## 进度记录

- [ ] 完成 contextState 数据流补齐。
- [ ] 完成 ContextPopup entries 展示。
- [ ] 完成浮层互斥与可访问性。
- [ ] 完成测试和浏览器 mock 验证。

## 决策记录

- 2026-05-28：Context popup 只读消费 `contextState` / `contextSnapshot`，不自行解析持久化文件，避免和右侧 Context 视图及后端 context plan 产生职责重叠。
