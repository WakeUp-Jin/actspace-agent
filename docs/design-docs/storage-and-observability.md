# 存储与可观测性边界

本文档记录 `actspace` 当前本地存储、会话事实、上下文状态、应用数据目录和本地排障日志的边界。Agent 内部模块清单见 `agent-core/current-module-map.md`。

## 本地会话存储模型

当前首版本地存储采用会话目录模型：

- 每个会话一个目录。
- `meta.json`：会话摘要、标题、更新时间、turn 计数。
- `session.jsonl`：会话事件流持久化文件。
- `context-state.json`：当前上下文估算、bucket 与只读 entries 状态，可覆盖更新，供 Context 面板和未来上下文控制能力使用。
- `attachments/`：附件目录。

当前应用启动时会初始化应用数据目录：

- `sessions/`
- `tmp/`

## `session.jsonl` 与 `context-state.json`

`session.jsonl` 是会话恢复事实来源，保存稳定的 SessionEvent。

每轮真实 turn 的 `SessionEvent` 顺序以 `user_message -> thinking/tool_call -> llm_usage -> tool_result -> assistant_message -> llm_usage -> context_snapshot` 为基线。即使后端内部 AgentLoopResult 不包含 user message，IPC bridge 也必须显式写入本轮用户输入事件。

`llm_usage` 按每次模型回复写入，而不是按 turn 或 session 聚合。成本按当时共享模型配置计算后写入 usage，价格配置本身不写入事件。

`context-state.json` 是当前可变视图，用于 Context 面板和未来上下文控制能力；完整设计见 `agent-core/token-usage-and-context-state.md`。

## 应用数据目录

应用会在启动早期显式把 Electron `userData` 目录固定为产品名 `actspace`，因此安装后目录规则应稳定为：

- macOS：`~/Library/Application Support/actspace/`
- Windows：`%APPDATA%/actspace/`
- Linux：`~/.config/actspace/`

上述目录下再包含：

- `sessions/`
- `tmp/`

## Workspace Root 与 UserData 边界

Agent 文件工具的 `workspaceRoot` 与 Electron `userData` 分离：

- `userData` 只用于 session、附件、tmp 等应用数据。
- `workspaceRoot` 用于 `read_file`、`grep`、`glob`、`list_directory`、`edit-file` 等文件工具。
- 首版解析顺序为 `ACTSPACE_WORKSPACE_ROOT` -> 当前仓库根目录。

renderer 不能直接访问文件系统，所有文件与 session 读写都必须走 preload + IPC。

## 本地排障日志

开发排障日志会写入仓库根目录 `logs/`。其中 `logs/agent-runs/` 用于保存最近约 1 天的 Agent turn 运行链路 JSONL。

`logs/agent-runs/*.jsonl` 不同于 `session.jsonl`：

- `session.jsonl` 是稳定会话事实，用于恢复和统计。
- `logs/agent-runs/*.jsonl` 是本地排障文件，允许包含完整用户输入、完整工具参数、完整工具结果和最终 AgentTurnResult。
- run log 按状态记录而不是按流式 chunk 记录。
- 模型流式文本会聚合为单条 `assistant_text` / `assistant_thinking` 事件。
- 模型完整工具调用指令会记录为单条 `assistant_tool_call`。
- 工具真实执行只记录开始和完成，便于判断 Agent 执行、后端推送或前端渲染问题。

日志目录只保存在本机，不应提交到 Git；仓库根目录 `logs/` 已在 `.gitignore` 中忽略。

开发态 `logRoot` 默认指向仓库根目录 `logs/`，也可以通过 `ACTSPACE_REPO_ROOT` 显式指定仓库根。
