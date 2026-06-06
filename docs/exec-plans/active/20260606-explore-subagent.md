# Explore 内置子代理执行计划

## 目标

把现有 `agent` 工具拆成两件事：`agent` 回归「通用、全面」子代理（主模型 + Panel，行为不变），并新增内置 `explore` 子代理——聚焦小范围探索、跑便宜模型（默认 `deepseek-v4-flash`、可设置覆盖）、由主模型自动 delegate、在主消息流以内联 `Worked for Xs` 折叠展示嵌套真实工具行。

## 范围

- 包含：
  - `agent` 工具描述 reframe 为通用子代理。
  - 新增 `explore` 工具（定义 + executor，复用 SubAgent runner，聚焦 prompt + 更紧 maxTurns + flash llm）。
  - `exploreModelId` 设置项（shared 类型 + main 读取 + 设置页选择器），默认 flash，缺 key 回落主模型。
  - 主系统 prompt 增加「小探索优先 explore，大探索用 agent」策略。
  - 新增 `explore` 展示语义（preview kind + MessageBlock），内联折叠渲染（复用 `ToolActivityGroup` + `ToolLogLine`），完成态/重载时按需从 sidecar transcript 取嵌套行。
- 不包含：
  - 不改 `agent` 的 Panel 展示与主模型。
  - 不做 Explore 后台运行、并发、用户主动入口、自定义 agent 管理页。

## 背景

- 必读文档：`AGENTS.md`、`docs/design-docs/agent-explore-subagent.md`（本计划的设计事实来源）、`docs/design-docs/agent-subagent-runtime.md`（运行时机制）、`docs/design-docs/front-中间消息区规范.md`（工具流与 ToolActivityGroup）、`docs/design-docs/agent-tool-preview-design-guidelines.md`（新工具前端预览契约）。
- 相关代码路径：
  - `packages/shared/src/settings.ts`：`AgentSettings`（加 `exploreModelId`）、`SettingsUpdateInput`。
  - `packages/shared/src/session.ts`：`ToolPreviewKind` / `ToolUiPreview` / `MessageBlock`（加 `explore`）。
  - `packages/agent-core/src/tools/tools/agent/definition.ts`：reframe `agent` 描述。
  - `packages/agent-core/src/tools/tools/agent/explore-prompt.ts`：`EXPLORE_SUBAGENT_SYSTEM_PROMPT` 收窄出聚焦版本。
  - `packages/agent-core/src/tools/tools/agent/runner.ts`：`runExploreSubAgent` 加 `focused` 配置（prompt / maxTurns / preview kind）。
  - `packages/agent-core/src/tools/tools/explore/`（新建 definition.ts + index.ts）。
  - `packages/agent-core/src/tools/types.ts`：`ToolManagerConfig` 加 `exploreLlm?: LLMService`。
  - `packages/agent-core/src/tools/index.ts`：注册 `explore` 工具，注入 `exploreLlm`。
  - `packages/agent-core/src/engine/create-agent-deps.ts`：`createExploreLLMService()`（照搬 `createSummarizerForAgent` 的 `buildLLMConfig + createLLMService`），thread 到 `toolManagerConfig.exploreLlm`。
  - main 进程 turn 构造处（读 `agent.exploreModelId` 设置 → 传入 deps）。
  - 主系统 prompt 定义处（加 explore 使用策略段）。
  - `packages/desktop/src/renderer/App.tsx`：处理 `explore` preview，从 `activeTools.transcriptEvents` 派生内联嵌套块。
  - `packages/desktop/src/renderer/components/messages/`：新增 `ExploreRunBlock`（复用 `ToolActivityGroup` + `ToolLogLine`）；`ConversationView` 接入。
  - 设置页 explore 模型选择器（镜像 Kairos `modelId` 选择器）。
- 已知约束：
  - `exploreModelId` 镜像 `KairosSettings.modelId`：`ModelId | null`，`null` = flash 默认。
  - 缺 DeepSeek key 时 `createExploreLLMService` 回落主 `config.llm`，与 summarizer 退化一致。
  - 重载后主 session 只有 explore 的 `tool_call`/`tool_result`，嵌套行需经现有 `subagent:get-transcript` IPC 懒加载（renderer 不碰文件系统）。
  - 颜色全部走主题 token，浅/深双主题都验（`front-主题与配色规范.md`）。

## 风险

- 风险：`agent` 与 `explore` 语义重叠，主模型乱选。
  - 缓解：两者描述明确「全面 vs 聚焦」，主系统 prompt 给清晰选择策略；先观察真实 session 调用分布。
- 风险：内联嵌套行在重载后丢失（主 session 无 transcript）。
  - 缓解：展开时懒加载 sidecar transcript；未加载前折叠头仍展示 summary + stats。
- 风险：flash 服务在缺 key 环境构造失败。
  - 缓解：回落主模型，且单测覆盖「无 key 回落」。
- 风险：新增 `explore` preview kind 漏改某处 `switch`，TS 不穷尽报错。
  - 缓解：依赖 `tsc` 穷尽检查，逐个补齐 renderer/selectors 分支。

## 里程碑

1. 契约地基（shared 类型）。
2. 后端 explore 工具 + flash 注入 + prompt。
3. 前端内联折叠展示 + 设置项。
4. 验证、双主题、收尾。

## 任务（按顺序）

### 阶段 A：契约地基（shared）

- [x] A1. `packages/shared/src/settings.ts`：`AgentSettings` 加 `exploreModelId: ModelId | null`（注释：`null` = 默认 `deepseek-v4-flash`）；确认 `SettingsUpdateInput.agent` 已是 `Partial<AgentSettings>` 自动覆盖。验证：`pnpm --filter @actspace/shared typecheck`。
- [x] A2. `packages/shared/src/session.ts`：新增 `explore` 到 `ToolPreviewKind`；`ToolUiPreview` 加 `{ kind: "explore"; description; status; summary?; stats?; ... }`（字段对齐现有 `agent` preview，外加足以驱动折叠头的 `stats`）；`MessageBlock` 加 `kind: "explore"` 变体（含 `createdAt`、`status`、`description`、`summary`、`stats`、可选 `steps`/`transcriptRef`）。验证：`pnpm --filter @actspace/shared typecheck`。

### 阶段 B：后端

- [x] B1. `definition.ts`：把 `agent` 描述从 "Explore SubAgent" 改为「通用、全面子代理探索」措辞；保留 `subagent_type` 字段兼容。验证：`pnpm --filter @actspace/agent-core typecheck`。
- [x] B2. `explore-prompt.ts`：在现有 `EXPLORE_SUBAGENT_SYSTEM_PROMPT` 旁新增 `FOCUSED_EXPLORE_SYSTEM_PROMPT`（强调小范围、聚焦、尽快产出、短结论）。
- [x] B3. `runner.ts`：`RunExploreSubAgentInput` / `AgentToolRuntime` 加 `focused?: boolean` 与可选 `llm` 覆盖；`focused` 时用 `FOCUSED_EXPLORE_SYSTEM_PROMPT` + `maxTurns: 20` + preview kind `explore`。非 focused 路径完全不变。验证：现有 `agent` 测试仍过。
- [x] B4. 新建 `packages/agent-core/src/tools/tools/explore/definition.ts`（工具名 `explore`，输入 `{ description, prompt }`，`isReadOnly: true`，`previewKind: "explore"`，描述强调聚焦小探索）和 `index.ts`（`createExploreTool({ llm, workspaceRoot, sessionId })` → 调 `runExploreSubAgent({ focused: true, ... })`）。
- [x] B5. `tools/types.ts`：`ToolManagerConfig` 加 `exploreLlm?: LLMService`。`tools/index.ts`：当 `config.exploreLlm`（或回落 `config.llm`）存在且 `explore` 未禁用时注册 `explore` 工具。
- [x] B6. `create-agent-deps.ts`：新增 `createExploreLLMService(exploreModelId, envConfig)`（`buildLLMConfig(MODEL_REGISTRY[exploreModelId ?? "deepseek-v4-flash"]) + createLLMService`，缺 key 返回 undefined）；在 `createAgentFromConfig` / `createAgentForSession` 把它作为 `exploreLlm` 注入 `createToolManager`，缺省回落 `llm`。`AgentConfig` 透传 `exploreModelId`。验证：新增单测「无 key 回落主模型」「有 key 用 flash」。
- [x] B7. main 进程 turn 构造处读取 `settings.agent.exploreModelId` 并塞进 `AgentConfig`。
- [x] B8. 主系统 prompt 定义处新增策略段：小而明确的探索用 `explore`，大而全面的探索用 `agent`。

### 阶段 C：前端

- [x] C1. `App.tsx`：`tool_call_streaming`/`tool_started`/`subagent_event`/`tool_finished` 分支识别 `preview.kind === "explore"`，沿用现有 `activeTools.transcriptEvents` 收集嵌套事件；`toolEntryToBlock` 产出 `kind: "explore"` block（带 `steps` = 由 transcriptEvents 派生的嵌套工具 MessageBlock）。
- [x] C2. `session-selectors.ts`：`createMessageBlocks` 对 `explore` 的 `tool_result.uiPreview` 产出 `explore` block（含 summary + stats + transcriptRef，`steps` 为空，等展开懒加载）。
- [x] C3. 新建 `ExploreRunBlock.tsx`：复用 `ToolActivityGroup`（running 平铺 / done `Worked for Xs` 折叠）+ `ToolLogLine` 渲染嵌套 `steps`；折叠头展示 `Explore: <description>` 或 stats。展开时若 `steps` 为空且有 `transcriptRef`，经 `subagent:get-transcript` 懒加载嵌套行。
- [x] C4. `ConversationView.tsx` 的 `renderMessage` 接 `kind: "explore"` → `ExploreRunBlock`；并把 `explore` 纳入工具组的 tool-like 判定（与其它工具一同进主 turn 的 `Worked for` 折叠逻辑，避免双重折叠冲突——`explore` 自身折叠优先，外层工具组按现有规则处理）。
- [x] C5. 设置页新增 explore 模型选择器（镜像 Kairos `modelId` 选择器），写 `agent.exploreModelId`。

### 阶段 D：验证与收尾

- [x] D1. `pnpm --filter @actspace/shared build`、`pnpm --filter @actspace/agent-core build` 产出 dist。
- [x] D2. `pnpm --filter @actspace/agent-core test`、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test` 全绿。
- [x] D3. 新增/更新测试：explore 工具注册与只读工具集；无 key 回落；explore preview → 内联 block；`ExploreRunBlock` 折叠/展开 + 懒加载占位。
- [ ] D4. （留待用户验收）`pnpm dev` 真机：发触发小探索的消息，确认 explore 内联折叠（不弹 Panel）、跑 flash、`Worked for Xs` 真实耗时、浅/深双主题可读。
- [x] D5. 记 history（`docs/histories/2026-06/`），同步设计文档若有偏差，计划移到 `completed/`。

## 验证方式

- 命令：`pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/agent-core test`、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`、`pnpm build`。
- 手工检查：`pnpm dev` 触发小探索，观察内联折叠展示、模型为 flash、耗时真实、双主题。
- 观测检查：session.jsonl 里 explore 的 `tool_call`/`tool_result` 与 sidecar transcript；`llm_usage` 的 model 为 flash。

## 失败回退

- 任一阶段失败：`explore` 工具默认可经 `disabledTools` 关闭；不注册 `explore` 时主模型只剩 `agent`，行为回到当前状态。
- 前端 `ExploreRunBlock` 出问题：临时把 `explore` block 渲染回退到现有 `AgentRunBlock`（preview 字段兼容），不阻断主流程。

## 进度记录

- [x] 阶段 A 完成（2026-06-06）。
- [x] 阶段 B 完成（2026-06-06）。
- [x] 阶段 C 完成（2026-06-06）。
- [x] 阶段 D 完成（2026-06-06，除 D4 真机目测留待用户验收）。

## 决策记录

- 2026-06-06：拆分 `agent`（通用）与 `explore`（聚焦内置），而非复用单一工具。理由：两者在模型、scope、展示上诉求不同，合并会让 preview/prompt 充满条件分支；分开符合 Cursor/Claude Code 的「通用 Task + 专精内置子代理」模式。
- 2026-06-06：`exploreModelId` 默认 flash、可覆盖，镜像 `KairosSettings.modelId` 既有先例，不发明新模式。
- 2026-06-06：Explore 走内联折叠（复用 `ToolActivityGroup`）而非 Panel。理由：Explore 是主流程里顺手的小探索，内联折叠强调它是主流程一部分；通用 `agent` 才用 Panel 强调独立对象。
- 2026-06-06（实现期偏差）：A2/B3/B4/C1–C4 未新增 `explore` 的 `ToolPreviewKind`/`ToolUiPreview`/`MessageBlock` kind，改为在既有 `AgentToolPreview` 上加 `display: "panel" | "inline"` 判别字段，`explore` 复用 `agent` 的 preview/block/流式解析，渲染层按 `display` 路由到新增 `ExploreRunBlock`。理由：收敛改动面到一个可选字段，避免穿透所有 `ToolUiPreview`/`MessageBlock` 的 exhaustive switch，功能等价。已同步更新设计文档「后端模块边界 / 渲染契约」。
- 2026-06-06（实现期偏差）：`exploreModelId` 经 `RunTurnInput` 由 main 从 settings 注入（renderer 不每轮上送），而非新增 env 通道；与 `model` 同源、可测。
- 2026-06-06：`explore` block 不纳入主 turn 的 `WORK_TOOL_LIKE_KINDS`，保持自身独立的内联折叠，避免与外层 `Worked for` 组双重折叠。
