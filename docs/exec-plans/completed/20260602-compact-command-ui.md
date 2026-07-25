# /compact 命令前端接入计划

## 目标

把 `/compact` 做成主聊天流里的可执行系统事件：用户在 Composer 输入 `/compact` 后触发一次手动上下文压缩，消息流中依次展示执行前、执行中、执行完成三种状态；未来自动压缩也复用同一类消息块。后端已有自动历史压缩和 `context_compaction` 持久化事件，本计划聚焦命令入口、事件契约、消息块转换和前端渲染。

## 范围

- 包含：
  - Composer 对 `/compact` 的命令识别与发送分流。
  - Main/Preload/Shared 增加手动压缩 IPC 契约。
  - Agent Core 暴露一次性手动压缩入口，复用现有 `ContextManager.compactIfNeeded` / `compactHistory` / summarizer 地基。
  - 流式事件增加 compaction 生命周期，用于执行前、执行中、完成态实时展示。
  - `context_compaction` 持久化事件映射为消息流里的完成态 `MessageBlock`。
  - 新增 `CompactCommandBlock` 前端组件，视觉对齐 `docs/design-docs/frontend/compact-command-states.html`。
  - 单测、类型检查、浅/深主题视觉验收与 Electron 手工验收。
- 不包含：
  - 自动压缩策略调整、阈值调整或摘要 prompt 重写。
  - Context 面板的手动增删改能力。
  - 完成态展开详情。本轮明确不做展开。
  - 精确 token 级进度。若后端无法提供真实百分比，前端采用阶段式进度，不伪造精确实时进度。
  - Slash 命令 palette 的完整体系。本轮只支持 `/compact` 直输触发，命令补全后续单独规划。

## 背景

- 相关文档：
  - `docs/design-docs/frontend/compact-command-states.html`
  - `docs/design-docs/frontend/front-中间消息区规范.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
  - `docs/design-docs/model-context/agent-context-compression.md`
  - `docs/exec-plans/completed/20260529-context-compression.md`
- 相关代码路径：
  - Shared 契约：`packages/shared/src/session.ts`、`packages/shared/src/ipc.ts`、`packages/shared/src/session-selectors.ts`
  - Agent Core 压缩：`packages/agent-core/src/context/manager.ts`、`packages/agent-core/src/context/compression/history-compactor.ts`、`packages/agent-core/src/engine/create-agent-deps.ts`、`packages/agent-core/src/engine/bridge.ts`
  - Main / Preload：`packages/desktop/src/main/agent-turn.ts`、`packages/desktop/src/main/index.ts`、`packages/desktop/src/preload/index.ts`
  - Renderer 状态与渲染：`packages/desktop/src/renderer/App.tsx`、`packages/desktop/src/renderer/components/ConversationView.tsx`、`packages/desktop/src/renderer/components/messages/*`
  - 样式 token：`packages/desktop/src/renderer/styles/tokens.css`、`packages/desktop/src/renderer/styles/tailwind.css`
- 已知现状：
  - 后端自动历史压缩已在模型调用前触发，压缩成功后落 `context_compaction` SessionEvent 和 run-log。
  - `ContextManager.compactIfNeeded` 只在 token 水位超过阈值时压缩；手动 `/compact` 需要一个强制压缩入口，否则用户触发时可能因为未过阈值无事发生。
  - `createMessageBlocks` 当前跳过 `context_compaction`，所以历史压缩不会出现在主消息流。
  - 前端流式状态已有工具段机制，但 compaction 不是工具调用，不应塞进 `ToolUiPreview`。

## 风险

- 风险：手动 `/compact` 强制压缩后，如果可压区太短，用户会看到执行完成但没有实质变化。
  - 缓解：后端结果区分 `compacted` / `skipped`，完成态文案分别显示 `Context compacted` 或 `Nothing to compact`，并在计划测试中覆盖。
- 风险：执行进度条被误解为真实百分比。
  - 缓解：契约使用 `stage` + 可选 `progress`；实现里只在后端明确传值时展示百分比，否则使用 indeterminate / staged progress。原型中的百分比是视觉占位，正式实现不承诺精确。
- 风险：`context_compaction` 从观测事件变成可见消息后，旧 session 可能突然出现多条历史压缩记录。
  - 缓解：只渲染 payload 完整的事件；样式克制、不可展开；自动压缩与手动压缩共享完成态但显示 `trigger` 来源。
- 风险：Composer 把 `/compact` 当普通用户消息持久化，导致模型也收到命令文本。
  - 缓解：`handleSend` 在调用 `runTurn` 前识别 exact command，走 `compactContext` IPC，不创建 `user_message`；消息流可显示一个本地 pending 命令块，但不把 `/compact` 写入 LLM conversation。
- 风险：颜色实现违反主题规范。
  - 缓解：正式组件只使用语义 Tailwind 类和必要的新增语义 CSS token；若需要执行卡专属深色 token，先在 `tokens.css` 浅/深两套定义，再映射使用。

## 里程碑

1. 契约与后端手动压缩入口。
2. Renderer 状态流与持久化事件映射。
3. 三态 UI 组件与主题 token。
4. 测试、文档同步、真实 Electron 验收。

## 任务清单

### M1 契约与后端入口

- [x] T1.1 增加手动压缩 IPC 契约
  - 文件：`packages/shared/src/ipc.ts`、`packages/desktop/src/preload/index.ts`、`packages/desktop/src/global.d.ts`。
  - 改动：新增 `CompactContextInput { sessionId; turnId }`、`CompactContextResult { sessionId; turnId; status; events; contextSnapshot; contextState? }`；preload 暴露 `window.actspace.compactContext(input)`。
  - 验证：`pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/desktop typecheck`。

- [x] T1.2 增加 compaction 流式事件
  - 文件：`packages/shared/src/session.ts`。
  - 改动：在 `RuntimeStreamEvent` 增加 `context_compaction_started`、`context_compaction_progress`、`context_compaction_finished`、`context_compaction_failed`。payload 至少包含 `sessionId`、`turnId`、`trigger: "manual" | "auto"`、`stage`、`progress?`、`summary?`。
  - 验证：shared typecheck；确保现有 switch 使用点新增分支或有穷尽处理。

- [x] T1.3 Agent Core 暴露强制压缩入口
  - 文件：`packages/agent-core/src/context/manager.ts`、`packages/agent-core/src/engine/create-agent-deps.ts`、新增 `packages/agent-core/src/engine/compact-context.ts`。
  - 改动：新增 `contextManager.compactNow(summarizer, options)`，跳过 token 阈值但仍复用 `compactHistory` 的配对安全和 fallback；`compact-context.ts` 负责装配手动压缩 result，返回与 `ContextCompactionReport` 兼容的报告，并增加 `trigger: "manual"`、`status: "compacted" | "skipped" | "failed"`。
  - 验证：新增 agent-core 单测覆盖强制压缩、无可压区 skipped、summarizer 失败 fallback。

- [x] T1.4 Main 进程接入 `context:compact`
  - 文件：`packages/desktop/src/main/index.ts`、新增 `packages/desktop/src/main/context-compact.ts`。
  - 改动：注册 IPC handler，构造与普通 turn 相同的 session paths、runtime context、modelSpec/summarizer/contextManager；执行前发 started/progress，完成后写入 `context_compaction` SessionEvent、更新 `context-state.json`，返回刷新后的 snapshot/state。
  - 验证：desktop main 测试覆盖 handler 成功、skipped、失败事件；`pnpm --filter @actspace/desktop exec vitest run src/main/test`。

### M2 消息块与 Renderer 状态

- [x] T2.1 扩展 `ContextCompactionPayload`
  - 文件：`packages/shared/src/session.ts`、`packages/agent-core/src/engine/bridge.ts`。
  - 改动：payload 增加 `trigger?: "manual" | "auto"`、`status?: "compacted" | "skipped" | "failed"`、`reductionRatio?`、`removedCount?`、`reason?`。旧事件缺字段时按 auto/compacted 兼容。
  - 验证：shared / agent-core typecheck，bridge 测试更新。

- [x] T2.2 增加 `MessageBlock.kind = "context_compaction"`
  - 文件：`packages/shared/src/session.ts`、`packages/shared/src/session-selectors.ts`、`packages/shared/src/test/*`。
  - 改动：`createMessageBlocks` 不再跳过 `context_compaction`，而是转成完成态 block；字段包含 `status`、`trigger`、`summaryText`、`reductionLabel?`、`createdAt`。
  - 验证：新增 selector 单测，覆盖旧 payload、manual compacted、manual skipped。

- [x] T2.3 Renderer 处理 compaction 流式事件
  - 文件：`packages/desktop/src/renderer/App.tsx`。
  - 改动：`StreamingState.segments` 新增 `compaction` segment；收到 started 时插入 running block，progress 更新 stage/progress，finished 转完成态，failed 转 failed 态。`/compact` 本地 pending 块应与后端 started 块合并，不重复显示。
  - 验证：更新 `app-streaming-user-message.test.tsx`，覆盖 started -> progress -> finished 的消息流。

- [x] T2.4 Composer 分流 `/compact`
  - 文件：`packages/desktop/src/renderer/App.tsx`。
  - 改动：`handleSend` 对 `text.trim() === "/compact"` 走 `compactContext`；不调用 `runTurn`，不携带 attachments，不允许与普通 streaming turn 并发。触发时复用现有 `isStreaming` 禁用输入和发送按钮，后续若发现压缩与普通 turn 需要不同禁用文案，再单独拆 `isCompacting`。
  - 验证：renderer 单测断言 `/compact` 不调用 `runTurn`，调用 `compactContext`，普通文本仍调用 `runTurn`。

### M3 UI 组件与主题

- [x] T3.1 实现 `CompactCommandBlock`
  - 文件：新增 `packages/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`，更新 `ConversationView.tsx`。
  - 改动：支持 `pending | running | completed | skipped | failed`。pending 轻量命令行；running 使用主题感知执行卡 + 细进度条；completed/skipped/failed 收束为短结果态，不展开。
  - 验证：新增 `compact-command-block.test.tsx` 覆盖主要状态和文案。

- [x] T3.2 补主题 token
  - 文件：`packages/desktop/src/renderer/styles/tokens.css`、`packages/desktop/src/renderer/styles/tailwind.css`。
  - 改动：如正式组件需要执行卡专属颜色，新增 `--act-color-compact-exec-*` 浅/深两套 token，并映射为语义类；禁止在组件里写 `bg-white` / `text-black` / 主题相关 hex。
  - 验证：对改动文件跑 `rg -n "text-black|bg-black|bg-white|text-\\[#|bg-\\[#|border-\\[#|rgba\\(" packages/desktop/src/renderer/...`，逐条确认合法例外。

- [x] T3.3 更新 mock fixture
  - 文件：`packages/desktop/src/renderer/fixtures/workbenchFixture.ts`。
  - 改动：加入至少一条 manual `/compact` 完成态和一条 running 示例，便于无 bridge 模式查看。
  - 验证：renderer 相关测试快照/查询不回归。

### M4 文档、验证与收尾

- [x] T4.1 更新设计规范
  - 文件：`docs/design-docs/frontend/front-中间消息区规范.md`、`docs/design-docs/model-context/agent-context-compression.md`、`docs/design-docs/agent-runtime/agent-turn-layers.md`。
  - 改动：补 `/compact` 命令消息流规则、手动压缩 IPC、自动/手动共用 `context_compaction` 完成态。
  - 验证：人工通读，确保与 HTML 原型和实现一致。

- [x] T4.2 测试与类型检查
  - 命令：
    - `pnpm --filter @actspace/shared typecheck`
    - `pnpm --filter @actspace/agent-core exec vitest run src/context src/engine`
    - `pnpm --filter @actspace/agent-core typecheck`
    - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test src/main/test`
    - `pnpm --filter @actspace/desktop typecheck`
    - `git diff --check`

- [x] T4.3 前端视觉验收
  - 文件 / 入口：
    - `docs/design-docs/frontend/compact-command-states.html`
    - 实际 Electron renderer 主聊天页。
  - 检查：
    - 浅色、深色主题下 running 卡片文字、进度条、边框、完成态均可读。
    - 390px 左右窄宽度下不横向溢出，长英文/路径不会撑爆卡片。
    - `prefers-reduced-motion` 下 running 态不依赖动画才能理解。

- [x] T4.4 History 与归档
  - 文件：`docs/histories/YYYY-MM/...`。
  - 改动：实现完成后记录用户诉求、关键改动、验证结果；计划完成后移动到 `docs/exec-plans/completed/` 并更新 `docs/exec-plans/README.md`。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared typecheck`
  - `pnpm --filter @actspace/agent-core exec vitest run src/context src/engine`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test src/main/test`
  - `pnpm --filter @actspace/desktop typecheck`
  - `git diff --check`
- 手工检查：
  - 在真实 Electron 中输入 `/compact`，确认不会生成普通用户消息给 LLM，而是在消息流中出现 compaction 执行块。
  - 构造长会话触发 manual compact，确认 `session.jsonl` 出现 `context_compaction`，刷新会话后仍显示完成态。
  - 构造短会话触发 manual compact，确认显示 `Nothing to compact`，不会报错。
  - 切换浅色 / 深色主题复验 running 与完成态。
- 观测检查：
  - `logs/agent-runs/*.jsonl` 有 manual compaction 记录。
  - `context-state.json` 的 `compressionCount` / summarizedConversation bucket 与实际压缩结果一致。

## 进度记录

- [x] 已确认 UI 方向：消息流内三态，执行中使用主题感知高对比执行卡，完成态不展开。
- [x] 已落 HTML 原型：`docs/design-docs/frontend/compact-command-states.html`。
- [x] M1 契约与后端入口。
- [x] M2 消息块与 Renderer 状态。
- [x] M3 UI 组件与主题。
- [x] M4 文档、验证与收尾。

## 决策记录

- 2026-06-02：`/compact` 不放 Composer 上方浮层，放入消息流。原因是未来自动压缩也应保留发生时间和因果关系，消息流更适合表达系统事件。
- 2026-06-02：执行完成后不做展开详情，只展示短结果态。详细数据留在 `context_compaction` payload、run-log 和 Context 面板。
- 2026-06-02：正式实现不把 compaction 伪装成 tool preview。它是上下文管理事件，不是工具调用；共享工具流的消息节奏，但使用独立 `MessageBlock.kind` 和组件。
- 2026-06-02：进度条采用阶段式进度。除非后端能提供真实 progress，否则不展示精确百分比，避免 UI 暗示不存在的实时精度。
