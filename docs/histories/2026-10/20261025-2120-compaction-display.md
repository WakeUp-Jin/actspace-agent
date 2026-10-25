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
