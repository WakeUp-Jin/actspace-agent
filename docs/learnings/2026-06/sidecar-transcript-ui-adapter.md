# Sidecar Transcript 详情页要适配回主消息语法

关联 history：`docs/histories/2026-06/20260604-0145-subagent-transcript-ui.md`

## 是什么

Sidecar transcript 适合保存“人类需要回看、主模型不应每轮重读”的内部事件流。但 UI 展示这些事件时，不应该直接把 raw event payload 当成详情页组件语言。

更稳的做法是加一层很薄的 UI adapter：

- sidecar 仍保存完整事件：`thinking`、`tool_call`、`tool_result`、`assistant_message`、`llm_usage`。
- 详情页读取 sidecar 后，把事件适配成主消息区已经存在的组件输入。
- 工具调用优先按 `tool_call` 参数 + `tool_result` 输出配对，展示为 `Read file`、`Glob pattern`、`Listed dir` 这类主消息流工具行。

## 为什么需要

raw event 对排障很有价值，但它不是用户界面语言。直接展示 JSON 参数、时间戳和边框卡片会带来几个问题：

- **视觉分裂**：同一个 Agent 行为在主消息区是 `Thinking / Read / Glob`，打开详情后却变成调试面板。
- **重复维护**：弹窗自己实现一套标题、状态、错误和工具摘要规则，长期会和主消息区漂移。
- **信息噪音**：内部 prompt、raw tool name、完整参数对象通常不是用户第一眼要看的内容。

UI adapter 的价值是把“可观测数据结构”和“产品展示语法”隔开。数据可以完整，展示要克制。

## 怎么做

SubAgent transcript 的工具事件通常是成对出现：

```ts
tool_call: {
  id: "tc-read",
  name: "read_file",
  arguments: { path: "packages/desktop/src/renderer/App.tsx" }
}

tool_result: {
  toolCallId: "tc-read",
  toolName: "read_file",
  ok: true,
  modelOutput: "..."
}
```

详情页不需要显示这两个 raw card，而是适配成主消息区的轻量工具行：

```ts
{
  kind: "read",
  filePath: "App.tsx",
  displayText: "Read App.tsx",
  status: "completed"
}
```

同理：

- `thinking` → `ThinkingBlock`
- `read_file` / `grep` / `glob` / `list_directory` → `ToolLogLine`
- `user_message` → 详情页顶部任务输入区
- `assistant_message` → 详情页底部最终输出区
- `llm_usage` → 轻量 usage 行

## 常见陷阱

- 不要为了复用主 session selector，把 sidecar transcript 混进主 session 恢复路径。sidecar 的职责是详情回放，不是主消息流恢复。
- 不要从 raw output 里提取过多内容塞进 UI。主消息流工具行只需要短摘要，长输出仍应留给更明确的展开或排障路径。
- 不要把内部 prompt 混进过程日志。若详情页需要让用户确认子智能体收到的任务，应放在顶部独立任务输入区；主过程流仍只承载 thinking、工具和 usage。
- 不要把最终 assistant report 当作普通过程事件。最终输出应单独收在底部，过程流才不会读起来像“日志中途突然插入结论”。
- 如果未来后端给 sidecar tool_result 提供 typed `uiPreview`，adapter 应优先消费 preview，再回退到 `tool_call` 参数推导。

## 可迁移场景

这个模式适用于任何“内部事件结构很详细，但外部产品语言已经存在”的详情页：

- 后台研究任务的检索过程。
- 批量文件分析的每个文件诊断。
- 自动化任务的步骤日志。
- Planner / Critic / Executor 等多角色 Agent 的内部回放。

核心判断：如果主界面已经有成熟组件语法，详情页应当适配回那套语法，而不是展示一套新的 raw event UI。
