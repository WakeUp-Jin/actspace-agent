# Explore 内置子代理设计

## 定位

`explore` 是 actspace 内置的、**聚焦小范围探索**的子代理。它由主模型在执行过程中自动 delegate，用更便宜的模型（默认 `deepseek-v4-flash`）做「读一两处、确认一个事实」级别的局部探索，结果以结构化摘要回灌主上下文。

它和现有的通用 `agent` 子代理工具是**分工关系，不是替代**：

| | `agent`（通用子代理） | `explore`（内置 Explore Agent） |
| --- | --- | --- |
| 任务规模 | 大、全面、跨多文件的深度盘点 | 小、聚焦、确认性的局部探索 |
| 模型 | 主模型（如 `deepseek-v4-pro`） | 便宜模型（默认 `deepseek-v4-flash`，可设置覆盖） |
| 触发 | 主模型按需 delegate 大探索 | 主模型自动 delegate 小探索，系统 prompt 引导「小探索优先 explore」 |
| 展示 | 现有独立 transcript Panel | 内联 `Worked for Xs` 折叠，展开是嵌套真实工具行 |
| 运行上限 | `maxTurns: 100` | 更紧的上限，强约束「小而专注」 |

本文是 Explore 子代理的长期设计事实来源。通用子代理运行时（隔离上下文、transcript、落盘、abort 级联）仍以 [`agent-subagent-runtime.md`](agent-subagent-runtime.md) 为准，Explore 复用其中绝大部分运行时机制，只在**模型、scope、展示**三点上分叉。

## 与现有 `agent` 工具的关系（reframe）

现状：`agent` 工具被写死成 `subagent_type: "explore"`、描述为 "launch a read-only Explore SubAgent run"、跑主模型、走 Panel 展示——它把「通用子代理」和「探索」两件事揉在了一起。

本次拆分后：

- `agent` 工具**回归通用子代理语义**：描述去掉 "Explore 专用" 措辞，定位为「更全面的、跨文件的深度子代理探索」。展示（AgentRunBlock + Panel）和主模型不变。
- 新增 `explore` 工具承载「内置、聚焦、便宜、内联」的探索能力。

二者都 read-only、都复用同一套 SubAgent runner 运行时，差异集中在下面三节。

## 模型分叉

- 新增设置项 `exploreModelId`（renderer 设置 → main → agent-core），默认 `deepseek-v4-flash`。
- Explore 子代理运行时使用一个**独立的 flash `LLMService`**，构造方式复用 `create-agent-deps.ts` 里 `createSummarizerForAgent()` 同款 `buildLLMConfig + createLLMService` 路径。
- 缺少 DeepSeek key 时的退化：回落到主 `config.llm`，保证功能不因缺 flash key 而失效（与 summarizer 缺 key 时的退化策略一致）。
- Explore 子代理的 `llm_usage` 仍按真实 model 记账，成本走 flash 定价（`resolveModelSpecByApiModel` 已能解析 flash）。

## Scope 分叉

Explore 的系统 prompt 在现有 `EXPLORE_SUBAGENT_SYSTEM_PROMPT` 基础上**进一步收窄**：

- 明确「这是一次小范围、聚焦的探索：只回答被委派的那个具体问题，不做全仓盘点」。
- 鼓励「定位到关键文件后尽快产出结论，不要无谓扩展搜索面」。
- 输出更短的结构化结论（聚焦答案 + 关键证据文件 + 不确定项）。
- 运行上限收紧（建议 `maxTurns: 20`，硬上限防循环，不追求广度）。

主模型侧的系统 prompt 增加使用策略：**小而明确的探索优先用 `explore`，大而全面的探索才用 `agent`**。

## 后端模块边界

- `packages/shared`
  - Explore 与 `agent` 的展示区分**不**新开 `ToolPreviewKind`/`MessageBlock` kind，而是在既有 `AgentToolPreview` 上加判别字段 `display: "panel" | "inline"`（缺省 `panel`）。`explore` 复用 `agent` 的 preview kind / MessageBlock / 流式 partial-args 解析，渲染层按 `display` 路由。这样把改动面收敛到一个可选字段，避免穿透所有 `ToolUiPreview`/`MessageBlock` 的 exhaustive switch。
  - `exploreModelId` 进入设置类型（`AgentSettings`）与 IPC 契约（`RunTurnInput`，由 main 从 settings 注入，renderer 不每轮上送）。
- `packages/agent-core`
  - 新增 `explore` 工具定义、executor，复用 `runExploreSubAgent` 运行时，但接收独立的 flash `llm` 与聚焦 prompt。
  - `createToolManager` 配置新增 `exploreLlm`（flash 服务）；`agent` 工具继续用主 `llm`。
  - Explore 的 `subagent_event` 仍按现有契约推送 transcript 增量与 typed preview，preview 仍是 `kind: "agent"`，但 `display: "inline"`（runner 经 `AgentToolRuntime.display` 透传到每一处 preview 构造点）。
- `packages/desktop/main`
  - 把 `exploreModelId` 设置读出、构造 flash 服务并注入 tool manager。
  - transcript 落盘、abort 级联与通用子代理一致。
- `packages/desktop/renderer`
  - 新增 Explore 的**内联折叠**渲染路径，不走 Panel。

## 工具契约

输入（与 `agent` 同形，但语义聚焦）：

```ts
type ExploreToolInput = {
  description: string; // 3-8 词标题，进主消息流折叠头
  prompt: string;      // 一个具体、聚焦的小探索任务
};
```

输出给主 Agent：短结构化摘要（聚焦结论 + 证据文件 + 不确定项）+ `transcriptRef`，与 `agent` 一致；不参与普通工具输出压缩流水线（与 `agent`/`bash` 同样跳过 `processToolOutput()`）。

## 渲染契约（关键差异）

Explore 的 MessageBlock 仍是 `kind: "agent"`，但 `display === "inline"`；`ConversationView` 的 `case "agent"` 按 `display` 路由：`inline` → 新增 `ExploreRunBlock`（内联折叠），其余 → 既有 `AgentRunBlock` + Composer 上方 Panel。`ExploreRunBlock` 复用主消息流刚落地的 `ToolActivityGroup`，并复用从 `SubAgentTranscriptModal` 导出的 `buildTranscriptSections` / `renderTranscriptItem` / `loadTranscript` 把 transcript 事件转成同款工具行：

`ExploreRunBlock` 自带折叠（不复用 `ToolActivityGroup`，因 running 需「带 chevron 的展开态 + 有界滚动」，与主 turn 组「running=平铺无 toggle」契约相反）：

- 执行中：折叠头 `Exploring`（shimmer + chevron，**默认展开**）+ **有界滚动窗口**（`max-h-[168px]` + `overflow-y-auto`，新行到达钉底）。窗口**与主流程同底色，无盒子/边框**（早期加了 `bg-surface-subtle` 圆角盒子，但「完整框」让人误以为是 agent Panel，且有隔离感，已去掉）。这套「有界滚动」曾从主 turn 工具组下线（大块 agent panel 塞进小窗口憋屈），其正确归属正是 Explore 执行中——这里的行都是小工具/思考行。
- 完成后：**自动收起**成单行 `Explored N files ›`（`N` = `stats.exploredFileCount`，0 时退化 `Explored`；**不显示时间/描述**），可再点开；展开是同一批嵌套过程行。
- 展开里的工具行与主智能体的工具行视觉一致（同 `ToolLogLine` / `ThinkingBlock`），区别只是「整组可折叠」；`llm_usage`（`Usage Tokens …`）行在 Explore 内联视图中**过滤不显示**。
- 折叠头与工具行同源单层 `--conversation-text-inset`（`ExploreRunBlock` 外层不再叠一层 inset），与外部 thinking / 最终回复对齐。
- 嵌套过程行的数据来自 `subagent_event.event` 累积的 transcript（App streaming state 在 `activeTools.transcriptEvents` 收集），完成态/重载时主 session 只有摘要，首次展开经 `subagent:get-transcript` 懒加载。

设计取舍：通用 `agent` 是「另开一个会话去做大任务」，用 Panel 强调它是独立对象；Explore 是「主流程里顺手做的小探索」，用内联折叠强调它是主流程的一部分、读完即收。Explore 子代理的工具集只有 `read_file` / `grep` / `glob` / `list_directory` 四个（`createExploreToolManager`）。

## 不做什么

- 不做 Explore 的后台运行与完成通知。
- 不做多个 Explore 并发。
- 不在本次给 `agent` 工具改展示或模型。
- 不做自定义 explore agent definition 管理页。
- 不把 Explore 暴露为用户在 Composer 主动点选的入口（V0 只由主模型自动 delegate）。

## 验证要求

后端：

- `explore` 工具注册后出现在主模型 tool definitions，`agent` 工具描述已 reframe 为通用子代理。
- 有 DeepSeek key 时 Explore 跑 flash；无 key 时回落主模型且不报错。
- Explore transcript 含 user/thinking/tool/assistant/usage 事件；主 session 只落 explore 的 `tool_call`/`tool_result`。
- Explore 的 `modelOutput` 不含 `[已压缩摘要]` 标记。
- abort 级联能结束 Explore run。

前端：

- Explore 在主消息流以内联折叠展示，**不**弹 Composer 上方 Panel。
- 执行中嵌套工具行可见；完成后默认塌缩成 `Worked for Xs`，展开能看到嵌套真实工具行。
- `Worked for Xs` 显示真实耗时（非恒定 1s）。
- 浅色、深色主题都可读。
