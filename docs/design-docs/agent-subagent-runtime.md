# Agent 子智能体运行规范

## 定位

本文定义 actspace 的子智能体**运行时**能力：主 Agent 通过 **Agent 工具**启动一个独立的 SubAgent run，让它在隔离上下文中完成探索、验证或局部分析任务。这里是子代理运行时（隔离上下文、transcript、落盘、流式、abort 级联）的长期设计事实来源；具体实施步骤归档见 `docs/exec-plans/completed/20260602-agent-tool-subagent-runtime.md`。

> 工具分工：`agent` 工具定位为**通用、全面**的子代理探索（跑主模型、Panel 展示）。另有内置的**聚焦小范围** `explore` 子代理（跑便宜模型、内联折叠展示），复用本文的运行时机制，仅在模型 / scope / 展示三点上分叉，单独见 [`agent-explore-subagent.md`](agent-explore-subagent.md)。本文历史上把 `agent` 写成「Explore 专用」，现已 reframe 为通用子代理；`subagent_type: "explore"` 字段为兼容保留，新设计以 `explore` 独立工具承载聚焦探索。

命名约定：

- **Agent 工具**：LLM 可调用的工具，用户可见名称为 `Agent`，对齐 Claude Code 新版命名。
- **SubAgent run**：一次 Agent 工具调用创建的子智能体运行实例。
- **Transcript**：SubAgent run 内部的 `SessionEvent[]` 执行流，供前端会话内 panel 完整回放。

Claude Code 当前主工具名是 `Agent`，`Task` 仍作为 legacy alias。actspace 首版采用 `Agent` 作为展示名与工具语义名，内部文档用 SubAgent run 区分运行实例。

## 目标

- 让主 Agent 可以把独立、只读、上下文噪声较大的探索任务交给子智能体。
- 保护主上下文：主 Agent 只接收结构化结果摘要，不直接吞掉所有工具输出。
- 保留可观测性：用户能在主消息流看到执行中摘要，也能点击打开完整子智能体执行流。
- 先做可验证 V0：同步前台运行、内置 Explore 子智能体、只读工具集、可持久化 transcript。

## 不做什么

V0 不实现：

- 后台 `run_in_background` 与完成通知。
- 多个 SubAgent run 并发调度。
- 子智能体继续追问或用户中途输入接管。
- 子智能体写文件、执行高风险 Bash 或申请权限。
- fork 继承主 Agent 完整上下文。
- 自定义 agent definition 管理页面。

这些能力需要更完整的调度、取消、权限和恢复协议，放到 V1+。

## 后端架构

SubAgent run 采用 AgentTool 模式：

```txt
主 Agent LLM
  -> tool_call: Agent(description, prompt, subagent_type)
  -> ToolManager.execute("agent")
  -> Agent 工具创建独立 SubAgent runtime
  -> runAgentLoop(context, llm, subToolManager)
  -> transcript events 持久化
  -> 返回 summary + usage + transcriptRef 给主 Agent
  -> 主 Agent 继续推理
```

### 模块边界

- `packages/shared`
  - 扩展 `ToolPreviewKind` / `ToolUiPreview` / `MessageBlock`，新增 `agent` 展示语义。
  - 定义 `SubAgentTranscriptRef`、`AgentToolPreview`、`AgentToolStats`、`AgentToolRecentEvent` 等共享类型。
  - `RuntimeStreamEvent.subagent_event` 承载 SubAgent transcript 增量事件和最新 typed preview。
- `packages/agent-core`
  - 新增 Agent 工具定义、executor、只读子工具集工厂、SubAgent runner。
  - runner 复用现有 `runAgentLoop`、LLM service、ContextManager、ToolManager。
  - 子智能体事件转为 `SessionEvent[]`，写入 transcript store。
- `packages/desktop/main`
  - 给 agent-core 提供 transcript 落盘根目录、sessionId、turnId、stream callback。
  - 主 turn abort 时级联 abort 当前 SubAgent run。
  - 提供 `subagent:get-transcript` IPC，按 typed `SubAgentTranscriptRef` 读取 sidecar transcript。
- `packages/desktop/renderer`
  - 渲染主消息流中的 Agent 工具块。
  - 点击 Agent 工具块打开完整 transcript panel。
  - 执行中也可打开，实时显示已产生的 transcript events。

## V0 工具契约

工具展示名为 `Agent`。如果代码层需要遵守 snake_case，可用内部工具名 `agent`，但前端文案、模型 prompt 和 UI 均显示 `Agent`。

输入：

```ts
type AgentToolInput = {
  description: string;      // 3-8 个词/短句，用于主消息流标题
  prompt: string;           // 交给子智能体的完整任务说明
  subagent_type?: "explore";
};
```

输出给主 Agent：

```ts
type AgentToolOutput = {
  status: "completed" | "failed" | "aborted";
  description: string;
  subagentType: "explore";
  summary: string;
  transcriptRef: {
    kind: "subagent_transcript";
    sessionId: string;
    turnId: string;
    runId: string;
    path?: string;
  };
  stats: {
    durationMs: number;
    toolCallCount: number;
    exploredFileCount?: number;
    totalTokens?: number;
  };
};
```

`ToolResult` 里额外带 `subagent` 运行时字段，供 bridge 收集 `transcriptEvents` 和最终 `uiPreview`。这个字段不直接暴露给 renderer；renderer 只收到 `RuntimeStreamEvent.subagent_event` 和最终 `tool_result.uiPreview`。

传给主 Agent 的 `modelOutput` 应短而结构化，包含：

- 子智能体最终结论。
- 涉及的关键文件或证据。
- 明确失败或不确定项。
- transcriptRef，供系统与 UI 回看，但不要求主 Agent 读取。

Agent 工具的 `previewKind === "agent"` 不参与普通工具输出压缩流水线。调度层应像处理 `bash` 一样跳过 `processToolOutput()`，保证返回给主 Agent 的 `modelOutput` 保持 `runExploreSubAgent()` 产出的完整结构化报告，且保留 executor 自己设置的 `outputRef` / `subagent` 元数据。普通工具的 `[已压缩摘要]` 标记不得出现在 Agent 工具结果里。

## Transcript 契约

SubAgent transcript 是完整可恢复事件流，不是摘要字符串。

建议路径：

```txt
<userData>/sessions/<sessionId>/subagents/<turnId>/<runId>.jsonl
```

当前落地路径为：

```txt
<sessionDir>/subagents/<parentTurnId>/<runId>.jsonl
```

每行是 `SessionEvent`。事件的 `sessionId` 仍使用父 sessionId；transcript 内部事件的 `turnId` 使用 `${parentTurnId}:subagent:${runId}`，而 `SubAgentTranscriptRef.turnId` 保留父 turnId，用于从主 session 定位 sidecar 文件。

读取边界：

- `writeSessionResult()` 先追加主 `session.jsonl`，再写 `AgentTurnResult.subagentTranscripts`。
- `readSubAgentTranscript()` 只接受 `SubAgentTranscriptRef`，并校验 `sessionId`、`turnId`、`runId` 都是安全 path segment。
- `getSafeSubAgentTranscriptPath()` 要求 `basename(sessionDir) === transcriptRef.sessionId`，拒绝 renderer 传跨 session ref。
- renderer 通过 preload 调用 `subagent:get-transcript`，不接触文件系统路径。

最小事件集：

- `user_message`：子智能体收到的 prompt。
- `thinking`：子智能体思考。
- `tool_call` / `tool_result`：子智能体工具调用和结果。
- `assistant_message`：子智能体最终报告。
- `llm_usage`：子智能体模型调用用量。
- `error`：失败或 abort。

主会话 `session.jsonl` 只写 Agent 工具的 `tool_call` / `tool_result`，不展开写入 transcript 内部事件，避免主上下文膨胀。

## 流式更新契约

SubAgent run 的内部事件不复用普通工具 `tool_call_streaming`，而是走独立 runtime event：

```ts
type SubAgentRuntimeEvent = {
  type: "subagent_event";
  toolCallId: string;
  transcriptRef: SubAgentTranscriptRef;
  event: SessionEvent;
  preview: AgentToolPreview;
};
```

约束：

- `event` 是刚产生的一条 transcript 事件，可用于 live panel 追加。
- `preview` 是同一 toolCallId 的最新 Agent block view model，renderer 直接覆盖 running block。
- `preview.recentEvents` 只保留少量摘要，用于主消息流；完整 transcript 以 sidecar JSONL 为事实来源。
- 完成态仍以 `tool_result.payload.uiPreview.kind === "agent"` 持久化恢复。

## 子智能体类型

### Explore

定位：只读代码库探索和结构化报告。

工具：

- `read_file`
- `grep`
- `glob`
- `list_directory`

V0 暂不开放：

- `edit_file`
- `write_file`
- `bash`
- `web_search`
- `analyze_media`
- `agent`

系统提示词重点：

- 当前任务是只读探索，不得创建、修改、删除文件。
- 优先广泛搜索，再读关键文件。
- 输出结构化报告，控制长度，明确证据文件。
- 不要再调用 Agent 工具，避免递归。

运行上限：

- Explore SubAgent V0 使用 `maxTurns: 100`。这个值是防无限循环的硬上限，不应过早截断正常的广泛探索；复杂代码库/设计文档盘点需要允许多轮 read/grep/glob 后再产出最终报告。

## UI 规范

Agent 工具在主消息流中不是普通单行工具日志，而是一个轻量可点击执行块。

### 折叠态结构

执行中：

- 标题行：`探索 actspace-agent 项目`
- 状态：`Running` 或小型进度文本。
- 摘要区：显示最近 3-5 条 transcript 事件的轻量摘要。
- 文本 shimmer 只用于状态和正在进行的摘要行，内容始终可读。
- 整块可点击打开完整 transcript。

完成后：

- 标题行仍显示 description。
- 正文显示子智能体最终 summary，最多 3-4 行，超出视觉截断。
- 底部可显示 `Explored 10 files · 8 tools · 41s` 这类 stats。
- 下方继续接主 Agent 的后续状态，如 `Planning next moves`。

### Composer 上方 Transcript Panel

点击 Agent 工具块后，在 follow-up Composer 上方打开会话内 transcript panel。它不使用全局遮罩，也不居中覆盖整个工作台。

- Header：description 和关闭按钮。
- 顶部固定展示子智能体收到的任务输入；输入区默认折叠为数行预览，点击展开完整任务，再次点击收起。
- Task input 不设置内部滚动条，长输入由展开态直接撑开顶部区域；工具流和最终回复仍在其下方滚动。
- 主体复用正常聊天流渲染过程 transcript。
- 执行中实时追加 transcript events，并且不展示最终报告区域。
- 出现最终报告后，过程 transcript 默认折叠成 `Worked for ...` 行；用户点击该行后再展开完整工具与 thinking 事件。
- 最终报告显示在 `Worked` 行下方，按正常 Markdown 正文渲染，不使用固定高度底部抽屉。
- 最终报告来源优先使用主消息流 `MessageBlock.kind === "agent"` 上的 `summary`，也就是 `runExploreSubAgent()` 的最终 `result.message` / `output.summary`；只有旧数据缺少 summary 时，才回退读取 transcript 里的 assistant 输出。
- Panel 和 follow-up Composer 使用同一套 `conversation-content-width` 宽度约束；panel 自身不承担 follow-up 输入，V0 只看执行流。
- Panel 打开时应控制最大高度，让顶部仍露出一截聊天内容，而不是完全遮住当前阅读上下文。
- Panel 打开期间，follow-up Composer 上方的 Review / overflow 操作层暂时隐藏；关闭 Panel 后再按 Git Review summary 恢复。

### 颜色与主题

- 所有主题相关颜色必须使用语义 token。
- 不用大面积品牌色；蓝色仅用于 running、focus、可点击状态的小面积提示。
- Agent 工具块允许轻边框，因为它是可打开的聚合执行对象；内部 transcript 仍保持消息流语法。

## 取消与错误

- 主 turn abort 必须级联 abort 当前 SubAgent run。
- 子智能体失败不应让 Electron 进程崩溃；Agent 工具返回 failed result，让主 Agent 可以解释失败并继续。
- transcript 中必须落 `error` 事件，主消息流 summary 展示失败原因。

## 验证要求

后端：

- Agent 工具注册后出现在 LLM tool definitions。
- Explore 子智能体只暴露只读工具。
- 子智能体 transcript 包含 user/tool/assistant/usage 事件。
- 主 Agent tool result 只包含摘要和 ref，不包含完整 transcript。
- 长 Agent summary 超过普通工具压缩阈值时，主 Agent 收到的 `modelOutput` 仍不包含 `[已压缩摘要]`。
- abort 可以结束子智能体。

前端：

- running Agent 工具块可点击打开 Composer 上方 transcript panel。
- Panel 能显示执行中的 prompt、thinking 和工具流，运行中不显示 `Final output`。
- Panel 的 `Final output` 只在 Agent block 不再 running 后展示，优先显示 Agent block summary，不把 transcript 中途 `assistant_message` 误判成最终报告。
- completed panel 默认把工具流折叠成 `Worked for ...` 行，最终回复作为正文直接渲染在下方。
- transcript panel 打开时顶部仍保留可见聊天内容，并暂时隐藏 Composer 的 Review 操作层。
- completed Agent 工具块显示 summary 和 stats。
- 浅色、深色主题都可读。

## 与 Claude Code 的取舍

借鉴：

- AgentTool 模式。
- 独立上下文和工具集。
- transcript 与主上下文分离。
- 只读 Explore agent。

暂不借鉴：

- 后台通知。
- fork 继承主上下文。
- worktree/remote isolation。
- MCP per-agent 动态接入。
- 自定义 agent marketplace。

这些能力成熟但复杂，当前 actspace 先把同步只读闭环做稳。
