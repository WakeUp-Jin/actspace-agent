# 存储与可观测性边界

本文档记录 `actspace` 当前本地存储、会话事实、上下文状态、应用数据目录和本地排障日志的边界。Agent 内部模块清单见 `docs/design-docs/agent-runtime/agent-current-module-map.md`。

## 本地会话存储模型

当前首版本地存储采用会话目录模型：

- 每个会话一个目录。
- `meta.json`：Session V2 摘要、标题、更新时间、`agentRunCount`。
- `session.jsonl`：SessionEvent V2 会话事实流。
- `context-state.json`：当前上下文估算、bucket 与只读 entries 状态，可覆盖更新，供 Context 面板和未来上下文控制能力使用。
- `traces/<agentRunId>.jsonl`：一次 Agent Run 的脱敏请求/响应 Trace，供分析观测读取。
- `attachments/`：附件目录。
- `artifacts/generated-images/`：`generate_image` 生成的会话图片产物；事件流只保存本地路径、MIME 与轻量展示元数据，不保存 Base64 或远程签名 URL。

当前应用启动时会初始化应用数据目录：

- `sessions/`
- `tmp/`
- `cache-audit/`：缓存低命中排障旁路目录，仅在低缓存事件附近固化上下文快照。
- `eval-candidates/`：只在用户显式执行 `/eval` 后生成的失败回归 Candidate，包含 `candidate.json`、`case.json` 和 `fixture/`。

### 会话 Fork

会话 Fork 以源会话当前已持久化的目录为快照，创建一个可独立继续运行的新会话。它不是简单复用源目录：持久化层会复制 `meta.json`、`session.jsonl`、`context-state.json`、`attachments/`、SubAgent transcript 与其他 session sidecar，并在复制后的结构化 JSON / JSONL 中重写会话身份和指向源会话目录的内部路径引用。

- 新会话使用新的 `sessionId`，标题为 `<原标题> (fork)`，继承 workspace、Agent Run 计数和已有上下文。
- 新会话默认取消 pinned / archived 状态，创建完成后源会话保持不变。
- 已完成历史事件的 event / Agent Run / Turn / LLM Call 标识继续保留，用来表达分支前的共同历史；后续新 Agent Run 再生成自己的标识。
- renderer 通过 preload + `session:fork` IPC 请求 Fork，不能直接复制 `userData` 文件。
- 运行中或等待审批的会话禁止 Fork；renderer 负责禁用入口，Main Process 仍会用 active Agent Run 状态做第二层拒绝，避免复制半截运行。

## `session.jsonl` 与 `context-state.json`

`session.jsonl` 是会话恢复事实来源，保存稳定的 SessionEvent。

每次真实 Agent Run 采用两阶段 append：Main Process 在 Agent 真正开始执行前先写 `user_message`，Agent 收敛后再追加 thinking/tool/assistant/usage、终态与 `context_snapshot`。正常完成的顺序以 `user_message -> thinking/tool_call -> llm_usage -> tool_result -> assistant_message -> llm_usage -> context_snapshot` 为基线；中止运行至少以 `user_message -> ...已完成事件... -> agent_run_aborted -> context_snapshot` 收敛。Bridge 的通用调用默认仍可聚合 user event，但桌面端真实路径会关闭该选项，避免重复写入。

SessionEvent 强制 `schemaVersion: 2 + agentRunId`。真实 Agent Loop 产生的 assistant、tool 和 usage 事件进一步携带 `turnId/llmCallId`；`llm_usage.payload` 保存 `llmCallId/attempt/durationMs`。旧 V1 Session 与 meta 不做兼容读取。

`agent_run_aborted` 是可恢复的 SessionEvent，不是 renderer 内存标记。消息 selector 将它派生为 `Stopped` 状态块；应用切换会话或重启后会得到同样的展示。恢复模型上下文时，adapter 会丢弃中止前未闭合的 thinking/tool call，避免把没有对应 tool result 的半截调用重新发给模型。

每次 Agent Run 开始时，会话历史由 `createAgentForSession({ sessionPath })`（实际由 ConversationContext 完成 `parseJsonl + sessionEventsToMessages`）在构造阶段一次性读回 `Message[]`，Main 进程仅透传 sessionPath，不直接读 `session.jsonl`，也不接触消息转换函数。

`llm_usage` 按每次真实 LLM Call 写入，而不是按 Turn、Agent Run 或 Session 聚合。成本按当时共享模型配置计算后写入 usage，价格配置本身不写入事件。低缓存排障只在该 payload 中写轻量索引：`cacheStatus`、`cacheAuditId`、`cacheHitRatio`；完整上下文证据不进入 `session.jsonl`。

### Agent 分析 Trace

完整请求上下文写入 `<userData>/sessions/<sessionId>/traces/<agentRunId>.jsonl`。每个文件包含 Agent Run、真实 Turn、LLM Request/Response 与 Retry 事件，可还原 system prompt、工具 schema、messages、响应、token 和耗时。

- Trace Writer 不接收请求 header，并递归脱敏 Key、Authorization、Cookie、data URL、长 Base64、签名 URL 与不安全错误体。
- Trace 是 Session 级长期分析证据，不采用 `logs/agent-runs/` 的一天回收策略。
- Renderer 不能直接读 Trace；只能通过 `agent-trace:list/read` IPC，并由 Main 校验 ID、普通文件类型和 Session 子树边界。
- Trace 不取代 `session.jsonl`：删除 Trace 不影响会话恢复，删除 Session 事实则无法恢复对话。

DeepSeek Anthropic provider-native server tool 不会产生本地 `tool_call` / `tool_result` 事件；真实触发次数保存在 `llm_usage.payload.serverToolUse` 中，例如 `webSearchRequests` / `webFetchRequests`。

`context-state.json` 是当前可变视图，用于 Context 面板和未来上下文控制能力；完整设计见 `docs/design-docs/model-context/agent-token-usage-and-context-state.md`。

## 应用数据目录

应用会在启动早期显式把 Electron `userData` 目录固定为产品名 `actspace`，因此安装后目录规则应稳定为：

- macOS：`~/Library/Application Support/actspace/`
- Windows：`%APPDATA%/actspace/`
- Linux：`~/.config/actspace/`

上述目录下再包含：

- `sessions/`
- `tmp/`
- `cache-audit/`
- `eval-candidates/<candidateId>/`：等待 `actspace-agent-eval ingest-candidate` 导入的本地回归 Candidate。
- `kairos/inbox/`
- `plugins/<name>/`：外部插件的二进制与配置（如 `plugins/fs-watch/{bin/fs-watch, config.json}`），见 `agent-plugins-fs-watch.md`。
- `skills/<name>/`：设置页安装 / actspace 物化的用户级 Skill 目录（`SKILL.md` + `references/`）；fs-watch 插件的事件日志落在 `skills/fs-watch/references/watch-log/`。

图片生成产物使用 `<userData>/sessions/<sessionId>/artifacts/generated-images/<generationId>/`。它们属于会话事实的一部分，不进入会自动清理的 `tmp/tool-output`；`tool_result.payload.artifacts` 与 `uiPreview.images` 只保存本地文件引用，供重启后的 session selector 恢复本轮产物栏。renderer 点击图片时通过受控 IPC 按需读取单张 data URL，不持久化 Base64，也不直接加载 `file://`。

`cache-audit/` 使用 `<userData>/cache-audit/<sessionId>/last.context.json` 保存上一轮真实 provider 输入的滚动快照；当模型返回的 cache hit ratio 低于阈值时，才在 `<cacheAuditId>/` 下固化 `summary.json`、`previous.context.json`、`current.context.json`、`diff.txt`。这些文件可能包含完整用户输入、工具结果和文件片段，只能保存在本地，不应上传或提交。

## Workspace Root 与 UserData 边界

Agent 文件工具的 `workspaceRoot` 与 Electron `userData` 分离：

- `userData` 只用于 session、附件、tmp 等应用数据。
- `workspaceRoot` 用于 `read_file`、`grep`、`glob`、`list_directory`、`edit_file` 等文件工具。
- 主 Agent 的 `write_file` / `edit_file` 额外允许写入 `<userData>/kairos/inbox/`，用于把可交接信息 append 到 `main-agent.md`；这个额外根由 runtime context 显式注入，不代表整个 `userData` 可写。
- `/eval` 的独立生成 Agent 直接把 Candidate 目录设为自己的 `workspaceRoot`；它可通过绝对路径读取原工作区与会话文件，但相对写入只落在 Candidate 内。
- 应用默认根解析顺序为 `ACTSPACE_WORKSPACE_ROOT` -> 当前仓库根目录。
- 普通聊天 Agent Run 的实际根优先读当前 session `meta.workspaceRoot`；未设置时回退应用默认根。
- 顶部 Workspace 选择器的切换只是 renderer 临时状态；用户发送消息时才把最终选择写入当前 session `meta.workspaceRoot`，避免多次选择造成多次迁移。

renderer 不能直接访问文件系统，所有文件与 session 读写都必须走 preload + IPC。

## 本地排障日志

开发排障日志会写入仓库根目录 `logs/`。其中 `logs/agent-runs/` 用于保存最近约 1 天的 Agent Run 链路 JSONL。

`logs/agent-runs/*.jsonl` 不同于 `session.jsonl`：

- `session.jsonl` 是稳定会话事实，用于恢复和统计。
- `logs/agent-runs/*.jsonl` 是本地排障文件，允许包含完整用户输入、完整工具参数、完整工具结果和最终 AgentRunResult。
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
├── inbox/
│   ├── main-agent.md          # 主 Agent append-only handoff notes
│   └── lab-agent.md           # Lab Agent append-only handoff notes（Lab Runtime 接入后写入）
├── config/
│   ├── preferences.json       # enabled / sleepRange / rhythm / circuitBreaker / tip
│   ├── paths.json             # 可读写路径列表（2026-07-03 起 watch 字段随巡检管道退役）
│   ├── blocklist.json         # paths[] 黑名单 glob + toolsDenied[] + tip
│   ├── rule.md                # 用户写的自由约束，注入 system prompt [4] 段
│   └── soul.md                # 人格插槽（2026-07-04），注入 [1] 段 {soul}；空白 fallback 内置默认人格
├── memory/
│   ├── notifications.json     # 通知中心（2026-07-04，notify_user 产出 + 可变已读状态，滚动 200 条）
│   └── short-term/
│       ├── 2026-05/           # 按月分目录
│       │   ├── 2026-05-27.jsonl       # 当日事件流（含 _001/_002 分卷）
│       │   ├── 2026-05-27_001.jsonl   # resetToday 后新卷
│       │   └── week_2026-W22.summary.md  # 压缩出来的周摘要
│       └── ...
├── observe/
│   ├── sessions-state.json    # sessions-digest 已读游标
│   └── inbox-state.json       # inbox 已读水位
│                              # （watch-manifests/ 已于 2026-07-03 随巡检管道退役；旧目录无害可删）
├── briefs/
│   ├── tasks/                 # 用户写的 brief markdown
│   │   └── <id>.md
│   └── index.json             # parser 维护的调度索引（lastRun/nextRun/intervalSec）
├── inbox/
│   ├── main-agent.md          # Main Agent 追加给 Kairos 的观察信号
│   └── lab-agent.md           # Lab Agent / Lab Runtime 追加给 Kairos 的观察信号
└── notes/                     # LLM 自己用 edit_file 写的笔记（v1 只读列出）
```

`inbox/` 不是运行事实日志，也不参与 `reset_today` 分卷。它只是 Main Agent / Lab Agent 写给 Kairos 的输入信号目录；Kairos 每次 tick 读取最近消息并拼入 prompt 观测摘要，真正采取过的行动仍以 `memory/short-term/*.jsonl` 的 `SessionEvent` 为事实来源。

### 事件流持久化

Kairos 的运行事实写入 `memory/short-term/<YYYY-MM>/<date>[_NNN].jsonl`，每行是一个 `SessionEvent`。复用主 Agent 同款 schema（`@actspace/shared/session.ts`），并扩展 4 个 Kairos 专属 `SessionEventType`：

| `type` | 触发时机 | 关键 payload |
|---|---|---|
| `kairos_tick_injected` | 每次 tick 注入 system message 时 | `{ trigger: "auto" \| "brief" \| "wake_now", briefId?, content }` |
| `kairos_sleep_start` | LLM 调 `sleep` 工具后 scheduler 真正进入 sleep | `{ seconds, sleepEndsAt, biasApplied }` |
| `kairos_sleep_end` | 自然 sleep 结束 | `{ actualSeconds }` |
| `kairos_sleep_interrupted` | 被 `notifyMainAgentRunStart` / `wakeNow` 打断 | `{ reason: "user_message" \| "wake_now", remainingSeconds }` |

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
| `kairos:read-config` / `kairos:write-config` | invoke | 5 份 config 的读写；写盘前 main 端 schema 校验（rule.md / soul.md 跳过 JSON parse） |
| `kairos:briefs-list` / `briefs-read` / `briefs-write` / `briefs-delete` | invoke | `briefs/tasks/*.md` 的列表与编辑（2026-07-04）；系统字段（created/lastRun/nextRun）由 main 保护，写/删后 `reloadBriefs()` |
| `kairos:notifications-list` / `notifications-mark-read` / `notifications-remove` | invoke | 通知中心列表 + 已读 + 删除（单条/清除已读/清空全部；2026-07-04，见 agent-kairos-notifications.md） |
| `kairos:event` | main → renderer | 每个 SessionEvent 推一份（50ms debounce 攒批） |
| `kairos:state` | main → renderer | 每次状态变更推一份（同 50ms 攒批） |
| `kairos:notification` | main → renderer | 新通知直发（不攒批）；important 级同时弹 macOS 系统通知 |

### 排障日志归属

Kairos tick 的内部排障**不走** `logs/agent-runs/`——后者只服务主 Agent Run。Kairos 的等价物就是 `memory/short-term/<date>.jsonl` 本身：因为 SessionEvent 已经包含完整 assistant_message + 工具调用 + 工具结果，无需另起一个 run-log。压缩日志和 controller 出错信息直接落到根目录 `logs/latest-dev.log`（`pnpm dev:log` 输出），便于排障时一处可查。

Workspace Root 边界对 Kairos 仍然有效：`tools/scheduler.ts` 在 `callerAgent === "kairos"` 时按 `paths.json` 跑双校验（workspace 白名单 + blocklist.paths glob），主 Agent 路径完全不受影响。
