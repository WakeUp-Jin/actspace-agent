# Agent 工具与 SubAgent Run 实施计划

## 目标

实现 actspace 首版子智能体能力：主 Agent 可通过 `Agent` 工具启动一个同步前台的只读 Explore SubAgent run。主消息流展示可点击的执行块，执行中可查看实时 transcript，完成后展示摘要；主 Agent 上下文只接收结构化摘要和 transcript 引用。

## 范围

- 包含：
  - `packages/shared` 的 Agent 工具预览、MessageBlock、transcript 引用类型。
  - `packages/agent-core` 的 Agent 工具、Explore 子智能体 prompt、只读工具集、runner、transcript event 生成。
  - `packages/desktop/main` 的 transcript 落盘根目录、stream 转发、abort 级联、session store 写入。
  - `packages/desktop/renderer` 的 Agent 工具块、执行中摘要流、完整 transcript modal。
  - 单元测试、前端组件测试、文档和 history。
- 不包含：
  - 后台 `run_in_background`。
  - 多 SubAgent run 并发调度。
  - 子智能体写文件或申请权限。
  - fork 继承主上下文。
  - 自定义 agent definition 管理界面。

## 背景

- 设计文档：
  - `docs/design-docs/agent-subagent-runtime.md`
  - `docs/design-docs/agent-turn-layers.md`
  - `docs/design-docs/agent-current-module-map.md`
  - `docs/design-docs/agent-tool-preview-design-guidelines.md`
  - `docs/design-docs/front-中间消息区规范.md`
  - `docs/design-docs/front-主题与配色规范.md`
- 前端原型：
  - `docs/design-docs/public/front/agent-subagent-flow-prototype.html`
- 参考项目：
  - Claude Code 当前主工具名为 `Agent`，`Task` 是 legacy alias。
  - 参考路径：`/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/tools/AgentTool/`
- 相关代码路径：
  - `packages/shared/src/session.ts`
  - `packages/shared/src/session-selectors.ts`
  - `packages/agent-core/src/tools/`
  - `packages/agent-core/src/engine/loop.ts`
  - `packages/agent-core/src/engine/bridge.ts`
  - `packages/agent-core/src/engine/create-agent-deps.ts`
  - `packages/desktop/src/main/agent-turn.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`

## 已知约束

- 写代码前必须读 `AGENTS.md` 指定的必读文档。
- 工具对外协议若落到 LLM tool name，需遵守现有 snake_case 兼容性；用户可见展示统一为 `Agent`。
- Renderer 不直接读文件系统，transcript 读取必须经 preload/main IPC 或随事件流传入。
- 主 session 不能展开写入完整 SubAgent transcript，避免上下文恢复时污染主 Agent。
- 前端颜色必须使用语义 token，并验证浅/深主题。
- V0 子智能体必须只读，且不允许递归调用 Agent 工具。

## 风险

- 风险：工具 executor 当前只接收 `args, workspaceRoot`，缺少 LLM/context/session/stream 运行时依赖。
  - 缓解方式：优先扩展 `ToolManagerConfig` 或注册完整 `InternalTool`，把 SubAgent runner 所需依赖注入 Agent 工具，不改变普通工具 executor 签名。
- 风险：SubAgent transcript 实时流和最终落盘可能出现事件顺序不一致。
  - 缓解方式：单一 event sink 负责“追加内存 buffer → stream UI → write transcript”，测试锁定事件序。
- 风险：主 Agent abort 未能停止子智能体。
  - 缓解方式：主 turn AbortController 派生 child AbortController，Agent 工具执行时监听父 signal。
- 风险：前端执行中摘要和 modal transcript 重复维护状态，容易漂移。
  - 缓解方式：统一从 Agent preview 的 `recentEvents` 和 transcript event buffer 派生。
- 风险：Explore 子智能体输出太长，仍污染主上下文。
  - 缓解方式：Agent 工具 `modelOutput` 固定为 summary + stats + ref；完整 transcript 只给 UI/排障读取。

## 里程碑

1. 共享契约和文档地基。
2. 后端 Agent 工具和 Explore SubAgent runner。
3. main/preload/renderer transcript 集成。
4. UI 实现与浅深主题验收。
5. 测试、history、学习沉淀与收尾。

## 任务拆分

### 1. 共享契约

修改文件：

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/index.ts`（如需 re-export）

任务：

- 新增 `SubAgentTranscriptRef`、`AgentToolStats`、`AgentToolPreview` 类型。
- `ToolPreviewKind` / `ToolUiPreview` 新增 `agent`。
- `MessageBlock` 新增 `kind: "agent"`，字段包含 `description`、`status`、`summary`、`recentEvents`、`transcriptRef`、`stats`。
- `createMessageBlocks()` 支持从 `tool_result.payload.uiPreview.kind === "agent"` 恢复。
- 若 V0 需要运行时流式更新，`RuntimeStreamEvent` 增加 `subagent_event` 或让 `tool_call_streaming/tool_started` 的 preview 携带 recent events；实现前必须选定一种，不允许 renderer 猜 raw args。

验证：

- 新增/更新 shared 单测，覆盖 completed 和 running preview 恢复。

### 2. 后端 Agent 工具

修改文件：

- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/tools/agent/definition.ts`
- `packages/agent-core/src/tools/tools/agent/runner.ts`
- `packages/agent-core/src/tools/tools/agent/explore-prompt.ts`
- `packages/agent-core/src/tools/manager.ts` 或 `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`

任务：

- 新增 `agent` 工具定义，展示名和 description 明确写 `Agent`。
- 输入 schema：`description`、`prompt`、`subagent_type?: "explore"`。
- 创建 Explore 专属 ToolManager，只注册 `read_file`、`grep`、`glob`、`list_directory`。
- 创建独立 ContextManager，不恢复主 session 历史，只放子系统 prompt + user prompt。
- 复用父 turn 的模型配置，V0 不支持模型 override。
- 执行 `runAgentLoop()`，收集 transcript events、usage、tool count、最终 assistant message。
- 返回 `ToolResult`：`data` 为短 summary，`outputRef` 或 data payload 带 transcript ref，`uiPreview` 由 bridge 生成。

验证：

- agent-core 测试覆盖工具注册、只读工具暴露、递归 Agent 禁用、summary/ref 输出。

### 3. Bridge 与 Transcript

修改文件：

- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/adapters.ts`（如需 AgentEvent -> SessionEvent helper）
- `packages/agent-core/src/persistence/`（如新增 transcript store）
- `packages/desktop/src/main/agent-turn.ts`

任务：

- 在 `createToolUiPreview()` 中支持 `agent` preview。
- Agent 工具执行中将 SubAgent transcript 增量写入 main run log 和 transcript buffer。
- 主 `tool_started` 事件推送可点击 running Agent block。
- SubAgent 每产生关键事件，更新 running preview 的 recent events，并推到 renderer。
- `tool_finished` 后，主 session 的 `tool_result` payload 带 final `uiPreview`、summary、stats、transcriptRef。
- transcript 写到 `<sessionDir>/subagents/<turnId>/<runId>.jsonl`。

验证：

- bridge 测试覆盖 running preview、completed preview、主 session 不展开 transcript。

### 4. Main / Preload IPC

修改文件：

- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/preload/global.d.ts`
- `packages/shared/src/ipc.ts`

任务：

- 提供 `subagent:get-transcript` IPC，输入 transcriptRef，返回 `SessionEvent[]`。
- 对 transcript path 做 sessionRoot 边界校验，不接受 renderer 传绝对路径直读。
- 主 turn abort 时级联 abort 子智能体。

验证：

- main/preload 测试或 mock 测试覆盖 transcript 读取和越界拒绝。

### 5. Renderer UI

修改文件：

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/AgentRunBlock.tsx`
- `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx`
- `packages/desktop/src/renderer/components/messages/toolLogStyles.ts` 或局部样式文件
- `packages/desktop/src/renderer/test/`

任务：

- 新增 `AgentRunBlock`：
  - running：标题 + status + 最近执行流摘要 + shimmer。
  - completed：标题 + summary + stats。
  - failed/aborted：错误摘要 + transcript 入口。
- 新增 `SubAgentTranscriptModal`：
  - 打开时优先显示已有 transcript events。
  - running 时持续接收 App streaming state 更新。
  - completed 后可按 transcriptRef 补拉落盘事件。
  - 复用 `ConversationView` 或提取更小的 transcript renderer，避免套 Composer。
- App streaming state 支持 `agent` preview 的增量覆盖。
- 所有颜色使用语义 token，modal 可访问性包含 role、aria-label、Escape 关闭。

验证：

- renderer 单测覆盖 running 可点、modal 显示工具流、completed summary、浅深主题基本 class。
- 手工对照 HTML 原型。

### 6. 文档与收尾

修改文件：

- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-index.md`
- `docs/design-docs/front-index.md`
- `docs/histories/YYYY-MM/...`
- 如命中学习沉淀标准，新增 `docs/learnings/YYYY-MM/...`

任务：

- 同步模块地图和工具预览规范。
- 记录 history。
- 判断是否需要 learning：本任务包含 AgentTool 模式、transcript 分层、上下文污染防护，预计命中新概念/可迁移/有陷阱，应写 learning。

验证：

- `pnpm typecheck`
- `pnpm build`
- `pnpm test` 或局部 `pnpm --filter` 测试
- 浏览器 mock 验证 Agent block 和 modal
- Electron 真实验证：发送能触发 Agent 工具的 mock/真实 turn，确认 transcript 可打开

## 验证方式

- 命令：
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test`
- 手工检查：
  - 打开 `docs/design-docs/public/front/agent-subagent-flow-prototype.html` 对照 UI。
  - 浅色和深色主题下检查 Agent block 和 modal。
  - 执行中点击 Agent block 能看到实时 transcript。
  - 完成后主消息流 summary 不撑爆布局。
- 观测检查：
  - `session.jsonl` 只包含主 Agent 工具调用/结果。
  - `subagents/<turnId>/<runId>.jsonl` 包含完整 transcript。
  - run log 能看到主 turn 与 SubAgent run 的关联 id。

## 进度记录

- [x] 确认命名：工具显示名采用 `Agent`，运行实例称 SubAgent run。
- [x] 新增设计规范 `agent-subagent-runtime.md`。
- [ ] 完成 shared 契约。
- [ ] 完成后端 Agent 工具和 Explore runner。
- [ ] 完成 main/preload transcript IPC。
- [ ] 完成 renderer Agent block 和 modal。
- [ ] 完成测试、文档同步、history 和 learning。

## 决策记录

- 2026-06-02：采用 `Agent` 作为用户可见工具名。原因是 Claude Code 最新主名为 `Agent`，`Task` 只是 legacy alias；影响是 UI/prompt 统一叫 Agent，架构文档用 SubAgent run 避免和主 Agent 混淆。
- 2026-06-02：V0 只实现同步前台 Explore SubAgent。原因是先验证上下文隔离、transcript 和 UI 可观测闭环；后台通知、并发和写工具会显著扩大风险。
- 2026-06-02：主 session 不展开写入 SubAgent transcript。原因是保护主上下文和恢复链路；影响是需要单独 transcript store 和读取 IPC。
