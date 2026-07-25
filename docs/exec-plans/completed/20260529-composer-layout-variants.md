# Composer 多形态布局与子组件拆分计划

## 目标

把 `Composer` 从单一 follow-up 输入条改造成可复用的组合式输入系统，支持已有会话底部 follow-up、新会话居中输入、无附件紧凑态、有附件展开态等形态。完成后，同一套核心子组件可以拼装出不同场景：创建新会话时使用 initial composer；发送首条消息后切换为 follow-up composer；附件存在时输入框上移为独立内容行，底部工具栏只承载操作控件。

## 范围

- 包含：
  - 重构 `packages/desktop/src/renderer/components/Composer.tsx`，拆出稳定的小子组件。
  - 支持 `surface="followup" | "initial"` 两类使用场景。
  - 支持 `inputLayout="inline" | "stacked"` 两类输入布局。
  - 支持三个产品组合状态：
    - `followup + inline`：已有会话、无附件，输入框在 `+` 后面。
    - `followup + stacked`：已有会话、有附件，附件和输入框在面板上半部，底部工具栏不再放 textarea。
    - `initial + stacked`：创建新会话形态，无论是否有附件，输入框都在面板上半部。
  - 新增或复用 initial composer 容器，让新会话可以使用 Composer 组件，而不是另写孤立页面。
  - 把 workspace、branch、runtime 三个上下文入口做成下拉选择框入口，而不是静态文字。
  - 保留现有模型选择菜单的双栏/悬浮 Edit 方向，必要时抽为 `ModelSelector` 子组件。
  - 更新前端设计文档中 Composer 规范，写清多形态矩阵。
  - 补充 renderer 测试锁定关键 DOM 归属、状态切换和发送行为。
  - 完成 history；若实现过程中沉淀出可迁移的组件状态矩阵经验，再补 learning。
- 不包含：
  - 不接入真实文件选择、图片上传或附件持久化。
  - 不实现真实 workspace / branch / runtime 切换数据流；第一版可以是带菜单的 UI 入口。
  - 不改变 agent-core、IPC 协议或 session 存储结构，除非后续发现创建新会话必须调整现有 renderer 状态流。
  - 不重做全局视觉语言、侧边栏、消息块、右侧面板。
  - 不引入新的重样式组件库。

## 背景

- 相关文档：
  - `AGENTS.md`
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/CODING_BEHAVIOR.md`
  - `docs/FRONTEND.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/PLANS_GUIDE.md`
  - `docs/HISTORY_GUIDE.md`
  - `docs/QUALITY_SCORE.md`
  - `docs/design-docs/frontend/README.md`
  - `docs/design-docs/frontend/front-聊天输入框规范.md`
  - `docs/coding-standards/team/frontend-style-scope-conventions.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/test/composer.test.tsx`
  - `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- 已知约束：
  - 写代码前必须先说明方案并获得用户批准。
  - 当前 renderer 的 Tailwind 页面切片迁移已完成收口，普通 UI 样式应继续由组件局部 Tailwind class 常量负责，避免回流到全局 CSS。
  - 测试应优先使用语义、ARIA、文本和用户行为，不绑定 Tailwind class。
  - 前端改动完成后需要按 `docs/FRONTEND_VERIFICATION.md` 选择工程验证和视觉验收方式。

## 状态模型

### 维度一：Surface

- `followup`：已有会话底部 composer。
  - 显示 review action strip。
  - 显示面板下方 status row。
  - 默认贴近底部消息流。
- `initial`：创建新会话 composer。
  - 居中或靠中下位置显示。
  - 显示 workspace / branch / runtime selector row。
  - 显示 `Plan New Idea` chip。
  - 不显示 review action strip。
  - 不显示 follow-up status row。

### 维度二：Input Layout

- `inline`：
  - textarea 在底部 toolbar 内，位于 `+` 后面。
  - 适合无附件、低高度 follow-up。
  - 不作为当前 initial 产品态使用。
- `stacked`：
  - textarea 位于 panel 内容区，toolbar 只包含 `+`、模型/Auto、发送。
  - 有附件时必须使用 stacked，避免附件和输入框挤在同一条工具栏里。
  - initial 场景始终使用 stacked。

### 自动布局规则

- `surface="followup"`：
  - `hasAttachments === false` 时默认 `inputLayout="inline"`。
  - `hasAttachments === true` 时默认 `inputLayout="stacked"`。
- `surface="initial"`：
  - 始终解析为 `inputLayout="stacked"`。
  - 输入框必须位于面板上半部，不和 `+`、`Auto`、发送按钮挤在同一行。

## 子组件边界

- `Composer`
  - 组合状态入口，管理输入内容、发送、浮层互斥关闭和附件 demo 状态。
  - 接收 `surface`、`inputLayout`、`contextSnapshot`、`isStreaming`、`onSend` 等 props。
- `ComposerFrame`
  - 负责 surface 外层布局：follow-up 的 review/status，initial 的居中 shell 和 selector row。
- `ComposerPanel`
  - 负责 panel 内部布局：附件、textarea、toolbar 的顺序。
- `ComposerInput`
  - 单一 textarea，复用 Enter 发送和 IME 保护逻辑。
- `AttachmentStrip`
  - 图片与文件附件预览，以及删除按钮。
- `ComposerToolbar`
  - 底部工具栏，只负责排列子控件。
- `AddMenuButton`
  - `+` 按钮和 command menu。
- `ModelSelector`
  - 模型按钮、模型菜单、悬浮/聚焦 Edit、Thinking option。
- `ContextUsageButton`
  - follow-up 底部状态行右侧的百分比入口。
- `SendButton`
  - 发送、停止、aborting 状态。
- `WorkspaceSelector` / `BranchSelector` / `RuntimeSelector`
  - initial 顶部三个下拉入口。
  - 第一版使用静态选项和菜单壳，不接真实切换。
- `ReviewActionsStrip`
  - follow-up 上方 review demo 层。
- `ComposerStatusRow`
  - follow-up 下方 branch/local/context usage 状态行。
- `PlanNewIdeaChip`
  - initial 下方快捷 chip。

## 风险

- 风险：一次拆分过大，导致现有发送、停止、模型选择和 context 弹窗回归。
  - 缓解方式：先写结构测试，再迁移组件；每个子组件抽出后跑 composer 测试。
- 风险：`initial` 接入真实 App 流程时影响现有 mock session 和 session 恢复。
  - 缓解方式：先明确当前 App 没有真正空白新会话页面时的状态来源；必要时只在无消息的新 session 中渲染 initial composer，不动 session 存储。
- 风险：下拉入口增多，外部点击、ESC 和互斥关闭逻辑变复杂。
  - 缓解方式：统一 floating panel state，不让每个子组件各自维护全局 document listener。
- 风险：Tailwind class 常量继续堆在单文件，影响可读性。
  - 缓解方式：第一阶段可在同文件内拆组件；若文件超过可读阈值，再拆到 `components/composer/*`，但保持一次迁移边界清晰。
- 风险：截图参考偏暗色，而当前 app 仍以浅色聊天工作台为主。
  - 缓解方式：本计划优先实现结构和交互状态；视觉色彩保持现有浅色 token，暗色 initial 背景后续作为独立主题/页面视觉切片处理。

## 里程碑

### M0. 方案确认与现状审计

任务：

1. 确认状态模型：`surface` + `inputLayout`。
2. 审计 `Composer.tsx` 当前 state、refs、document listener 和 JSX 结构。
3. 审计 `ConversationView`、`WorkbenchLayout`、`App` 中 composer 的挂载点和新会话状态来源。
4. 更新本计划的决策记录。

验收：

- 本计划没有待定布局状态。
- 用户确认可以开始代码实现。

### M1. 组件边界拆分

任务：

1. 在 `Composer.tsx` 内先抽出 `ComposerInput`、`AttachmentStrip`、`SendButton`。
2. 抽出 `AddMenuButton` 和 `ModelSelector`，保留现有菜单行为。
3. 抽出 `ReviewActionsStrip`、`ComposerStatusRow`、`ContextUsageButton`。
4. 保持默认 `followup + inline` 行为不变。

验证：

```sh
pnpm --filter @actspace/desktop test -- packages/desktop/src/renderer/test/composer.test.tsx
```

预期：

- 现有 composer 测试全部通过。
- 无附件 follow-up 仍可输入、选择模型、发送。

### M2. follow-up inline / stacked 切换

任务：

1. 为 `ComposerPanel` 增加 `inputLayout`。
2. 无附件时 textarea 放在 toolbar 内。
3. 有附件时 textarea 放在附件下方、toolbar 上方。
4. toolbar 在 stacked 下不渲染 textarea。
5. 保留 review strip 在 panel 外、status row 在 panel 下方。

测试：

- `followup + inline`：`Message composer` 在 toolbar 内。
- `followup + stacked`：`Message composer` 在 panel 内但不在 toolbar 内。
- `followup + stacked`：附件、输入框、toolbar 顺序稳定。
- 发送行为在两种布局下都调用 `onSend`。

验证：

```sh
pnpm --filter @actspace/desktop test -- packages/desktop/src/renderer/test/composer.test.tsx
```

### M3. initial composer UI 接入

任务：

1. 为 `Composer` 增加 `surface="initial"`。
2. 新增 initial 外层布局：selector row、panel、`PlanNewIdeaChip`。
3. 新增 workspace / branch / runtime 三个 selector 入口。
4. 支持 `initial + stacked`，且 initial 不使用 inline 产品态。
5. 在无消息的新会话或明确的 initial 状态中渲染 initial composer。
6. 首条消息发送后，App/ConversationView 进入普通 conversation，底部显示 `followup + inline`。

测试：

- initial composer 渲染 workspace / branch / runtime 三个下拉入口。
- initial composer 没有 review strip 和 follow-up status row。
- initial composer 输入框位于 toolbar 上方。
- initial composer 能输入并发送。
- initial 发送后，现有 streaming/user message 测试仍通过。

验证：

```sh
pnpm --filter @actspace/desktop test -- packages/desktop/src/renderer/test/composer.test.tsx
pnpm --filter @actspace/desktop test -- packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx
```

### M4. 文档与视觉验收

任务：

1. 更新 `docs/design-docs/frontend/front-聊天输入框规范.md`，写入 `surface + inputLayout` 状态矩阵。
2. 按结果更新本计划进度记录。
3. 新增 history。
4. 判断是否需要 learning；若实现过程中形成可迁移的“状态矩阵组件设计”经验，则写入 `docs/learnings/YYYY-MM/`。

验证：

```sh
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
```

手工检查：

- follow-up 无附件：输入框位于 `+` 后面。
- follow-up 有附件：输入框上移，底部 toolbar 不包含 textarea。
- follow-up 有附件：模型选择紧跟在 `+` 右侧。
- initial 无附件：新会话 composer 可输入并发送，发送后进入 follow-up。
- initial 无附件：`Auto` 模型入口紧跟在 `+` 右侧。
- initial 有附件：附件、输入、toolbar 三层关系正确。
- 模型菜单、`+` 菜单、workspace/branch/runtime 菜单、底部 context 弹窗的外部点击和 ESC 行为正常。

观测检查：

- 按 `docs/FRONTEND_VERIFICATION.md` 使用浏览器 mock 快速检查布局。
- 若本轮接入真实 Electron 新会话入口，最终用 Electron 窗口验证一次。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop test -- packages/desktop/src/renderer/test/composer.test.tsx`
  - `pnpm --filter @actspace/desktop test -- packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`
- 手工检查：
  - 检查四个组合状态的 DOM 顺序和视觉层次。
  - 检查发送、停止、模型选择、Edit、Thinking option、`+` 菜单、底部 context 弹窗。
  - 检查 selector row 的三个下拉入口是否可打开、关闭。
- 观测检查：
  - 浏览器 mock 用于快速看布局、菜单和响应式。
  - Electron 窗口用于最终确认新会话入口和真实 preload 环境下不白屏。

## 进度记录

- [x] 确认任务复杂度需要 execution plan。
- [x] 梳理 `surface + inputLayout` 状态模型。
- [x] 列出 Composer 子组件边界。
- [ ] 用户确认本计划。
- [x] M0：完成现状审计并更新决策记录。
- [x] M1：完成无行为变化的子组件拆分。
- [x] M2：完成 follow-up inline / stacked 切换。
- [x] M3：完成 initial composer UI 接入。
- [x] M4：完成文档、history、验证和收尾。

## 决策记录

- 2026-05-29：采用 `surface + inputLayout` 两轴状态模型，而不是为每张截图硬编码一个独立组件。这样可以同时覆盖 follow-up、initial、无附件、有附件，并避免后续继续追加临时布局分支。
- 2026-05-29：附件存在时强制使用 `stacked` 输入布局。原因是附件与 textarea 同处 toolbar 会造成视觉拥挤，也不符合参考图中“附件 / 输入 / 工具栏”三层结构。
- 2026-05-29：workspace、branch、runtime 在 initial 场景中先作为下拉 UI 入口实现，暂不接真实切换数据流。这样可以先验证 Composer 结构与交互模型，不提前扩大到 session/workspace 状态管理。
- 2026-05-29：`initial` composer 只在 session 已恢复且消息为空时渲染。Electron bridge 场景下 App 首屏存在异步 session restore；如果过早渲染 composer，用户可能输入到随后被恢复结果替换的临时节点。
- 2026-05-29：`initial` composer 始终使用 `stacked` 布局。新会话首屏需要像创建入口而不是底部 follow-up bar，因此输入框必须独立位于工具栏上方。
- 2026-05-29：`stacked` toolbar 中模型入口紧跟 `+` 右侧；Context usage 只保留在 follow-up 底部状态行，避免 panel 内出现重复圆圈入口。
