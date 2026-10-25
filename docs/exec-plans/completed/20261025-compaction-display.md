# 压缩的前端回显（A1）

## 目标

对话里的上下文压缩换成 demo 选定的 A1 样式：一条居中分隔线，写清「以上 N 条消息已压缩 · 压缩前 → 约压缩后 tokens · 耗时」，可以一键跳到轨迹里的压缩行；摘要不再在对话里展开，只在轨迹详情里看。后端在压缩完成时记录触发方式和压缩前后 token，轨迹详情一并补上这些数据。

## 范围

- 包含：
  - 后端：压缩协调器算出 `trigger`、`beforeTokens`、`afterTokens`，写进 `compaction/end`，实时事件 `compaction-finished` 同步带上。
  - 投影：`ContextCompactionPayload` 和 `context_compaction` 消息块加字段；修掉历史投影里 `triggerTokens` 取「当前用量」的错误。
  - 对话：`CompactCommandBlock` 改成 A1（进行中 / 完成 / 失败三态），去掉对话内摘要展开。
  - 跳转：`TrajectoryRevealTarget` 加 `{ compactionId }`，点「在轨迹中查看」切到轨迹并选中压缩行。
  - 轨迹：压缩行概述加触发方式、压缩前 → 后 token、压缩消息数。
- 不包含：
  - 进行中显示条数（手动压缩开始时拿不到条数；手动、自动保持一致）。
  - 压缩后等下一次请求实测回填。
  - 「请求 · 压缩」请求详情的改动。
  - 老会话数据迁移：没有新字段的旧压缩只显示条数和耗时。

## 背景

- 设计 demo：`docs/design-docs/frontend/compaction-display-demo.html`（版本 A1）。
- 上一轮压缩 UI：`docs/exec-plans/completed/20260929-context-compaction-timeline.md`。
- 相关代码：
  - 后端：`packages/context/engine/src/compaction.ts`（`ContextCompactionCoordinator.perform`）、`packages/session/journal/src/compaction.ts`（`createCompactionTransaction`）、`packages/core/agent-loop/src/loop.ts`（`autoCompact`）、`packages/shared/src/runtime-v2/live-event.ts`、`packages/context/compaction/src/plugin.ts`。
  - 投影：`packages/shared/src/session.ts`、`packages/shared/src/session-selectors.ts`、`packages/client/src/sessions/chat.ts`、`packages/client/src/live/stream-adapter.ts`、`packages/client/src/live/live-run.ts`。
  - 前端：`apps/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`、`R/trajectory/reveal.ts`、`R/trajectory/builder.ts`、`R/components/trajectory/details/RecordOverview.tsx`、`R/components/trajectory/TrajectoryNavigation.tsx`。
- 约束：样式只用 token 和语义色（`check:frontend-tokens`、`check:frontend-theme`）；文案中文；手动与自动压缩外观一致。

## Token 口径（2026-10-25 用户确认）

- `beforeTokens`：实测。自动压缩取触发判断时的用量（`usage.inputTokens + usage.outputTokens`）；手动压缩取 journal 里最近一条带 usage 的 `assistant/message`（input + cacheRead + cacheWrite + output）。拿不到就不写。
- `afterTokens`：`max(0, beforeTokens − Σ estimateContextTokens(被替换条目) + estimateContextTokens(摘要))`，只在有 `beforeTokens` 时写。界面显示为「约 9K」。
- `trigger`：`maybeCompact` 路径为 `auto`，`compact` 路径为 `manual`。

## 风险

- 风险：`compaction/end` 是事务内事件，加字段可能碰到 journal 校验。缓解：只加可选数据字段，跑 session-journal 测试。
- 风险：`CompactionPlugin.maybeCompact` 兼容路径走 `compact`，会把自动标成手动。缓解：改走 `withStrategy(this).maybeCompact`。
- 风险：实时事件和持久化投影字段不一致，刷新后显示变化。缓解：两边都从同一组字段取，单测覆盖。

## 里程碑

1. T1 后端记录：coordinator 计算并写入 `compaction/end`；`CompactionObserver.onFinished` 回传；loop 发实时事件带上新字段；单测。
2. T2 投影：shared 类型、selectors、client chat 投影、stream-adapter、live-run；修 `triggerTokens`；单测。
3. T3 对话 A1：重写 `CompactCommandBlock`；去掉摘要展开；更新测试。
4. T4 跳转：`reveal.ts` 加 `compactionId`；A1 链接接 `useTrajectoryNavigation`；单测。
5. T5 轨迹详情：builder 把 end 数据带进记录；`RecordOverview` 压缩分支加三行；单测。
6. T6 验证与收尾：命令、浏览器 mock 截图（浅 / 深 / 480px）、文档与 history、计划归档。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/context-engine test`、`pnpm --filter @actspace/session-journal test`、`pnpm --filter @actspace/agent-loop test`、`pnpm --filter @actspace/shared test`、`pnpm --filter @actspace/client test`
  - `pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`
  - `pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm check:renderer-bridge`、`pnpm check:current-docs`
- 手工检查：浏览器 mock 下看三态、浅 / 深色、480px 窄窗；点「在轨迹中查看」能选中压缩行。
- 未覆盖（留给用户）：Electron 里手动 `/compact` 与长会话自动压缩的真实数据。

## 进度记录

- [x] T1 后端记录
- [x] T2 投影
- [x] T3 对话 A1
- [x] T4 跳转
- [x] T5 轨迹详情
- [x] T6 验证与收尾

## 决策记录

- 2026-10-25：选 A1（居中分隔线 + 两侧线向中间收）；B–E 太显眼被否。
- 2026-10-25：摘要只在轨迹里看，对话里不再展开。
- 2026-10-25：压缩后 token 用「实测压缩前 − 估算删除 + 估算摘要」，压缩完成即有数。
- 2026-10-25：进行中不显示条数，保证手动、自动一致。
- 2026-10-25：轨迹压缩行的时长改取 `compaction/end.durationMs`（事务事件同时写入，时间差约为 0）。
- 2026-10-25：窄窗时分隔线中间换行，不截断数据。

## 执行模式

- **交互模式**：用户在线，按里程碑提交。

## 执行文档

`docs/exec-runs/20261025-compaction-display/`：`execution-process.md`、`execution-summary.md`。
