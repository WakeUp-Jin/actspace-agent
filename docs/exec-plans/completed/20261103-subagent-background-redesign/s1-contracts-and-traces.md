# S1 契约与留痕地基

## 目标

把后面几个子计划共用的数据格式和留痕通道一次定好：新事件与编解码器、头部字段、收件箱来源、共享类型、工具结果里的 `actspace.context.trace` 登记、transcript 增量重写、免审批读取的扩展点、模型列表 Host 端口。本子计划不改任何工具的行为。

## 范围

- 包含：下面 1–7。
- 不包含：Bash 日志搬家（S2）、子智能体运行逻辑（S3）、界面（S6）。

## 必读

- 设计 [02](../../../design-docs/子智能体和后台任务设计规范/02-子智能体设计规范.md) §4、§6；[03](../../../design-docs/子智能体和后台任务设计规范/03-后台Bash设计规范.md) §1、§3；[04](../../../design-docs/子智能体和后台任务设计规范/04-外部子智能体设计规范.md) §3.3
- [会话记录 Markdown](../../../design-docs/agent-runtime/agent-session-transcript.md)
- `packages/session/session-journal/src/core-codecs.ts`、`src/header.ts`、`src/invariant-validator.ts`、`src/surface.ts`
- `packages/core/agent/src/inbox.ts`
- `packages/context/context-disclosure/src/plugin.ts`（`observe`）
- `packages/session/session-transcript/src/{plugin.ts,render.ts,paths.ts}`
- `packages/core/tool-runtime/src/permission/engine.ts`（`isHostReadable`）、`packages/core/runtime/src/harness/agent-factory-plugin.ts`（第 79–86 行）

## 步骤

### 1. 事件与编解码器

`packages/session/session-journal/src/core-codecs.ts`：

- `PERSISTED_EXTENSION_EVENT_TYPES` 增加 `subagent/spawned`、`subagent/activation`。
- 新增 `validateSubagentSpawned`、`validateSubagentActivation`，字段与取值照设计 02 §4.1：`kind ∈ local|fork|codex|claude-code`；`preset ∈ general|explore`（仅 local）；`op ∈ start|settle`；`trigger ∈ spawn|message`；`status ∈ completed|interrupted|failed|max_steps|lost`；`delivery ∈ returned|notified|lost`；`result` ≤ 8KB（UTF-8）。
- `validateBackgroundTaskData` 增加 `op: "prune"`（`taskId`、`prunedAt`、`reason: "session-cap"`）。`kind: "agent"` 仍接受（老会话）。
- `delegation/*` 不动。

`packages/session/session-journal/src/header.ts`：`SessionLineageV1` 增加可选 `inheritedThroughSeq?: number`（整数 ≥ 0，且只在 `origin: "delegation"` 时允许）。

`agent/inbox/spliced` 的 `source` 增加 `subagent_notification`、`agent_message`：找到校验 `source` 的位置（`invariant-validator.ts` / `surface.ts`，grep `task_notification`），一起放开；`agent_message` 带 `senderId`。

### 2. 收件箱

`packages/core/agent/src/inbox.ts`：`MainAgentInbox.enqueue` 增加 `source` 参数（默认 `task_notification`，保持现有调用不变）与可选 `senderId`，写进 `agent/inbox/spliced`。`hasPendingNotifications` 对三种来源一视同仁。

### 3. 共享类型

`packages/util/shared/src/session.ts`、`src/runtime-v2/projection.ts`、`packages/session/session-projection/src/facts.ts`：

- 新增 `SubagentKind`、`SubagentPreset`、`SubagentStatus`（`running|inactive|closed`）、`SubagentActivationStatus` 类型，与编解码器同一组取值，从一处导出。
- `BackgroundNotice.taskKind` 增加 `subagent`（通知来自 `subagent_notification`）与 `agent_message`；原 `agent` 保留用于老会话。
- 消息块 `kind: "agent"` 增加字段：`subagentKind`、`preset?`、`description`、`activationCount`、`transcriptPath`；原 `agentKind` 保留（老会话）。

### 4. `actspace.context.trace` 登记

`packages/context/context-disclosure/src/plugin.ts` 的 `observe()`：在现有读写文件分支之后，对**任意** `tool/result`（`status: "completed"`）扫描 `detail` 里 `label === "actspace.context.trace"`、`value.kind === "trace"` 的项，`normalizeFile` 后以 `owner: "actspace.context-tools"`、`read: false`、`description: value.description` 登记。文件不存在时跳过（`normalizeFile` 返回空）。

在 `packages/context/context-engine`（`PathReference` 所在处）确认 `description` 会进入活跃列表与睡眠索引的文字；没有就补上。

### 5. transcript 增量重写

`packages/session/session-transcript/src/plugin.ts`：

- `SessionTranscriptService` 新增 `refresh(sessionId: string): Promise<void>`：会话打开时用增量投影，没打开时读盘 fold；同一会话重叠调用合并为再写一次；写法沿用临时文件 + rename、`0600`。
- 头部 `Origin` 为 subagent 时增加 `Description`、`Preset`、`Model` 三行（从父会话 `subagent/spawned` / 最新 `subagent/activation start` 取，取不到就不写）。
- `inheritedThroughSeq` 存在时跳过 `[0..inheritedThroughSeq]`（与 fork / 侧边对话同一逻辑），头部写「截至 `[#N]` 的内容复制自父会话」。

`render.ts`：

- 轮次进行中、有调用没结果的工具写 `→ running`；轮次结束时仍写 `→ no result recorded`。
- `agent/inbox/spliced` 的 `agent_message` 渲染为 `## Message from <senderId> [#N]`；`subagent_notification` 渲染为 `## Subagent notification [#N]` 加 summary 一行。
- 父会话里 `send_message` 的工具行：`- [#N] send_message → <agent_id>: <消息首行>`。
- `background/task` `op: "prune"` 的任务在对应 bash 行后加 `(log pruned)`。

### 6. 免审批读取的扩展点

- `packages/session/session-transcript/src/paths.ts` 旁新增（或在 `packages/core/runtime` 里）`isBashLogReadPath(dataRoot, canonicalPath)`：只认 `<dataRoot>/sessions-v2/<安全 ID>/bash-log/bash_<uuid>.log`。
- 新增一个 Harness 内的「精确文件放行名单」服务 `actspace.host-readable-files`（`add(path)`、`has(path)`、`remove(path)`），由 `agent-factory-plugin.ts` 第 80 行的 `isHostReadablePath` 组合：transcript ∪ bash 日志 ∪ 名单里的精确路径。名单只放精确文件，不放目录。S5 往里加外部记录路径。

### 7. 模型列表 Host 端口

- 新端口 `actspace.host.models`：`listUsableModels(): readonly UsableModelSummary[]`（`key`、`label`、`connectionLabel?`、`reasoningEfforts`、`defaultEffort?`、`thinkingDefault`）与 `subagentDefaultModel(): string | null`。类型放 `packages/util/shared/src/model-connections.ts`。
- Desktop：`apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts` 用 `ModelStoreService.listUsableModels("default")` 实现；`subagentDefaultModel` 在 S3 接设置前先返回 `null`。
- CLI：`apps/cli/src/runtime-v2/host.ts` 只返回当前模型、默认 `null`。
- 在 `packages/core/runtime/cordis.yml` 的生成来源（插件清单 / manifest injects）里登记端口，用脚本重新生成，不手改。

## 验证

- `pnpm --filter @actspace/session-journal test`：新事件合法 / 非法各一组；`inheritedThroughSeq` 只在 delegation 允许；`prune` 合法。
- `pnpm --filter @actspace/context-disclosure test`：任意插件的工具结果带 trace detail 会登记；文件不存在不登记；回放同一 Journal 得到同样的路径集合。
- `pnpm --filter @actspace/session-transcript test`：`refresh` 合并重叠调用；进行中轮次 `→ running`；继承段跳过；`agent_message` 渲染；`(log pruned)`。
- `packages/core/tool-runtime` 权限测试：bash 日志文件名格式命中才放行；`bash-log` 目录、其他文件名、`journal.jsonl` 不放行；名单里的精确路径放行、同目录别的文件不放行。
- 统一验证命令（见 [README](README.md)）。

## 回滚

单独 revert 本提交即可；此时还没有任何地方写新事件。
