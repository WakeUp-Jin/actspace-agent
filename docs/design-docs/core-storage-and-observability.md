# 存储与可观测性边界

本文档记录 `actspace` 当前本地存储、会话事实、上下文状态、应用数据目录和本地排障日志的边界。Agent 内部模块清单见 `agent-current-module-map.md`。

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
- `cache-audit/`：缓存低命中排障旁路目录，仅在低缓存事件附近固化上下文快照。

## `session.jsonl` 与 `context-state.json`

`session.jsonl` 是会话恢复事实来源，保存稳定的 SessionEvent。

每轮真实 turn 的 `SessionEvent` 顺序以 `user_message -> thinking/tool_call -> llm_usage -> tool_result -> assistant_message -> llm_usage -> context_snapshot` 为基线。即使后端内部 AgentLoopResult 不包含 user message，IPC bridge 也必须显式写入本轮用户输入事件。

每轮 turn 开始时，会话历史由 `ContextManager.createForSession({ sessionPath })`（实际由 `ConversationContext.createFromSession` 完成 `parseJsonl + sessionEventsToMessages`）在构造阶段一次性读回 `Message[]`，main 进程仅透传 sessionPath，不直接读 `session.jsonl`，也不接触消息转换函数。

`llm_usage` 按每次模型回复写入，而不是按 turn 或 session 聚合。成本按当时共享模型配置计算后写入 usage，价格配置本身不写入事件。低缓存排障只在该 payload 中写轻量索引：`cacheStatus`、`cacheAuditId`、`cacheHitRatio`；完整上下文证据不进入 `session.jsonl`。

DeepSeek Anthropic provider-native server tool 不会产生本地 `tool_call` / `tool_result` 事件；真实触发次数保存在 `llm_usage.payload.serverToolUse` 中，例如 `webSearchRequests` / `webFetchRequests`。

`context-state.json` 是当前可变视图，用于 Context 面板和未来上下文控制能力；完整设计见 `agent-token-usage-and-context-state.md`。

## 应用数据目录

应用会在启动早期显式把 Electron `userData` 目录固定为产品名 `actspace`，因此安装后目录规则应稳定为：

- macOS：`~/Library/Application Support/actspace/`
- Windows：`%APPDATA%/actspace/`
- Linux：`~/.config/actspace/`

上述目录下再包含：

- `sessions/`
- `tmp/`
- `cache-audit/`

`cache-audit/` 使用 `<userData>/cache-audit/<sessionId>/last.context.json` 保存上一轮真实 provider 输入的滚动快照；当模型返回的 cache hit ratio 低于阈值时，才在 `<cacheAuditId>/` 下固化 `summary.json`、`previous.context.json`、`current.context.json`、`diff.txt`。这些文件可能包含完整用户输入、工具结果和文件片段，只能保存在本地，不应上传或提交。

## Workspace Root 与 UserData 边界

Agent 文件工具的 `workspaceRoot` 与 Electron `userData` 分离：

- `userData` 只用于 session、附件、tmp 等应用数据。
- `workspaceRoot` 用于 `read_file`、`grep`、`glob`、`list_directory`、`edit_file` 等文件工具。
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
- provider-native server tool 只进入 `agent_event.message_end.summary.serverToolUse`，不计入本地 `toolCallCount`。

日志目录只保存在本机，不应提交到 Git；仓库根目录 `logs/` 已在 `.gitignore` 中忽略。

开发态 `logRoot` 默认指向仓库根目录 `logs/`，也可以通过 `ACTSPACE_REPO_ROOT` 显式指定仓库根。

## Kairos 存储与可观测性

Kairos（自治模式）在 `<userData>/kairos/` 下独立成树，与主 Agent `sessions/` 完全解耦。`packages/desktop` 在 `app.whenReady()` 时调 `ensureKairosScaffolding(kairosRoot)` 幂等创建并落默认 config。

### 目录树

```
<userData>/kairos/
├── config/
│   ├── preferences.json       # enabled / sleepRange / rhythm / circuitBreaker / tip
│   ├── paths.json             # workspaces / sessionRoots / watch[] 三大类路径
│   ├── blocklist.json         # paths[] 黑名单 glob + toolsDenied[] + tip
│   └── rule.md                # 用户写的自由约束，注入 system prompt [4] 段
├── memory/
│   └── short-term/
│       ├── 2026-05/           # 按月分目录
│       │   ├── 2026-05-27.jsonl       # 当日事件流（含 _001/_002 分卷）
│       │   ├── 2026-05-27_001.jsonl   # resetToday 后新卷
│       │   └── week_2026-W22.summary.md  # 压缩出来的周摘要
│       └── ...
├── observe/
│   └── watch-manifests/       # 每个 watch 路径一份 sha1 fileset 快照
│       └── <sha1>.json
├── briefs/
│   ├── tasks/                 # 用户写的 brief markdown
│   │   └── <id>.md
│   └── index.json             # parser 维护的调度索引（lastRun/nextRun/intervalSec）
└── notes/                     # LLM 自己用 edit_file 写的笔记（v1 只读列出）
```

### 事件流持久化

Kairos 的运行事实写入 `memory/short-term/<YYYY-MM>/<date>[_NNN].jsonl`，每行是一个 `SessionEvent`。复用主 Agent 同款 schema（`@actspace/shared/session.ts`），并扩展 4 个 Kairos 专属 `SessionEventType`：

| `type` | 触发时机 | 关键 payload |
|---|---|---|
| `kairos_tick_injected` | 每次 tick 注入 system message 时 | `{ trigger: "auto" \| "brief" \| "wake_now", briefId?, content }` |
| `kairos_sleep_start` | LLM 调 `sleep` 工具后 scheduler 真正进入 sleep | `{ seconds, sleepEndsAt, biasApplied }` |
| `kairos_sleep_end` | 自然 sleep 结束 | `{ actualSeconds }` |
| `kairos_sleep_interrupted` | 被 `notifyMainAgentTurnStart` / `wakeNow` 打断 | `{ reason: "user_message" \| "wake_now", remainingSeconds }` |

同一文件里同样写 `assistant_message` / `thinking` / `tool_call` / `tool_result`，与主 Agent 共用消费链路（`createMessageBlocks` 等聚合函数无需修改）。前端用 `aggregateKairosEvents(events)` 把这条事件流派生为表格行（`KairosEventRow`）。

`ShortMemoryStore.appendEvent(ev)` 走 append-only；`rotateDaily()` 在 `resetToday` 时把当日分卷号 +1（不删旧文件）；compressor 把"7 天前"的旧事件压成 `week_*.summary.md`，下次 tick 加载顺序中该 week 区间直接走 summary，原 jsonl 不删（人类排障可回看）。

### 内存可观测

- `SessionEventRingBuffer`：controller 持有的内存圆环，capacity=200，给 UI 首屏访问。disk write 成功后才 push（保证消费方看到的都已落盘）。
- `KairosRuntimeState`（`@actspace/shared`）：`{ enabled, state: "stopped"|"idle"|"ticking"|"sleeping"|"interrupted"|"cooldown", todayTickCount, toolCallCountInCurrentTick, totalSleepSecondsToday, sleepEndsAt?, cooldownEndsAt? }`，每次状态变更通过 `kairos:state` 推到 renderer。

### IPC 通道

| Channel | 方向 | 用途 |
|---|---|---|
| `kairos:get-state` | invoke | renderer 拉一次 `KairosRuntimeState` |
| `kairos:get-events-recent` | invoke | 从 ring buffer 拿最近 N 条事件 |
| `kairos:control` | invoke | `{ type: "start" \| "stop" \| "wake_now" \| "reset_today" }` |
| `kairos:read-config` / `kairos:write-config` | invoke | 4 份 config 的读写；写盘前 main 端 schema 校验（rule.md 跳过 JSON parse） |
| `kairos:event` | main → renderer | 每个 SessionEvent 推一份（50ms debounce 攒批） |
| `kairos:state` | main → renderer | 每次状态变更推一份（同 50ms 攒批） |

### 排障日志归属

Kairos tick 的内部排障**不走** `logs/agent-runs/`——后者只服务主 Agent 的用户级 turn。Kairos 的等价物就是 `memory/short-term/<date>.jsonl` 本身：因为 SessionEvent 已经包含完整 assistant_message + 工具调用 + 工具结果，无需另起一个 run-log。压缩日志和 controller 出错信息直接落到根目录 `logs/latest-dev.log`（`pnpm dev:log` 输出），便于排障时一处可查。

Workspace Root 边界对 Kairos 仍然有效：`tools/scheduler.ts` 在 `callerAgent === "kairos"` 时按 `paths.json` 跑双校验（workspace 白名单 + blocklist.paths glob），主 Agent 路径完全不受影响。
