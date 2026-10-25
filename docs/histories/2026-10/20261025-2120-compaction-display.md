## [2026-10-25 21:20] | Task: 压缩的前端回显（A1）

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

把对话里的上下文压缩显示改得更清楚：先做 demo 比较多版设计，最终选 A1（居中分隔线，线色加深，进行中两侧向中间扫光）；摘要只在轨迹里看；后端补压缩后 token；轨迹详情一起补。

### 变更与动机

- **后端记录**：压缩协调器按入口区分 `trigger`；`beforeTokens` 取实测用量（自动压缩取触发时用量，手动取最近一次请求），`afterTokens` = 压缩前 − 被替换条目估算 + 摘要估算；写进 `compaction/end`，`compaction-finished` 实时事件同步带上。`CompactionPlugin.maybeCompact` 改走协调器的 `maybeCompact`，自动压缩不再被标成手动。
- **投影**：消息块加 `compactionId`、`trigger`、`beforeTokens`、`afterTokens`，去掉 `summary`；历史投影的 `triggerTokens` 原来取会话当前用量，现在取 `beforeTokens`，旧数据为 0。
- **对话**：`CompactCommandBlock` 重写为 A1 三态；完成时「以上 N 条消息已压缩 · X → 约 Y tokens · Ns · 在轨迹中查看」；窄窗换行；旧会话只显示条数和耗时。
- **轨迹**：`{ compactionId }` 跳转目标；概述加触发方式、压缩消息数、Token；压缩行时长原来是事务事件时间差（约 0），改取 `compaction/end.durationMs`。
- **mock**：`?mock=compaction` 三态场景。

### 验证与边界

- 后端四个包、shared、client、web、desktop 2029 项测试通过；三项前端检查通过；浏览器截图见[执行摘要](../../exec-runs/20261025-compaction-display/execution-summary.md)。
- 未验证：Electron 里手动 `/compact` 与长会话自动压缩的真实数据。

### 验收修复（B1 / B2）

- **B1**：手动压缩只看最近一条回复的 usage，它没有 usage 或全为 null 时整组 token 丢失；改为往前找最近一条有效用量。
- **B2**：自动压缩把触发判断用的压力值（混了估算）当实测写入；改为手动、自动统一从 journal 计算「最近实测 + 之后新增内容估算」，含估算时写 `beforeEstimated`，对话分隔线和轨迹的压缩前也显示「约」。连续两次压缩之间无请求时以上一次的压缩后数为基准。
- 验证：context-compaction 23、context-engine 27、session-journal 37、agent-loop 54、shared 179、client 51、web 124、desktop 2037 项通过；desktop typecheck 与三项前端检查通过。
