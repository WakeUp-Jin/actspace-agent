# 压缩的前端回显（A1） — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261025-compaction-display.md`
- **执行模式**：交互
- **开始时间**：2026-10-25
- **结束时间**：2026-10-25

## 执行时间线

### 步骤 0：设计收敛

- **操作**：做 demo `docs/design-docs/frontend/compaction-display-demo.html`，先出现状与 A–E 五版，用户否掉 B–E；再出 A1–A5，用户选 A1。
- **决定**：摘要只在轨迹里看；压缩后 token 用「实测压缩前 − 估算删除 + 估算摘要」；轨迹详情一起补。

### 步骤 1：T1 后端记录

- **操作**：`ContextCompactionCoordinator.perform` 按入口区分 `trigger`，算 `beforeTokens` / `afterTokens` 写进 `compaction/end`；`CompactionObserver.onFinished` 回传结果；`autoCompact` 把字段带到 `compaction-finished`；`CompactionPlugin.maybeCompact` 改走 `withStrategy(this).maybeCompact`。
- **验证**：context-compaction 20、context-engine 27、session-journal 37、core-agent-loop 54 全过；五个包 `tsc --noEmit` 通过。

### 步骤 2：T2 投影

- **操作**：`ContextCompactionPayload` 与 `context_compaction` 块加 `compactionId`、`trigger`、`beforeTokens`、`afterTokens`，块上去掉 `summary`；selector、client 历史投影、stream-adapter、live-run、`createCompactionBlock` 透传；历史投影不再用会话当前用量充当 `triggerTokens`。
- **验证**：shared 179、client 50 通过；desktop `runtime-v2-tool-stream` 覆盖实时字段。

### 步骤 3–5：T3 对话 A1、T4 跳转、T5 轨迹详情

- **操作**：`CompactCommandBlock` 重写为居中分隔线（`base.css` 的 `compact-divider-*` 与两侧扫光）；删掉对话内摘要面板与 `markdown.css` 里的摘要样式；`TrajectoryRevealTarget` 加 `{ compactionId }`；builder 把 start 区间与 end 统计合进 `record.compaction`，时长改取 `compaction/end.durationMs`；`RecordOverview` 加触发方式、压缩消息数、Token。
- **验证**：desktop 2029 项通过；新增 `trajectory-compaction-overview.test.tsx`；`?mock=compaction` 浏览器截图 6 张（`screenshots/`）。

## 遇到的问题

- **问题**：新 worktree 里跑测试报 `Failed to resolve entry for package @actspace/llm-service`。
  - **原因**：workspace 包没有 dist。
  - **应对**：先 `pnpm --filter "@actspace/runtime..." --filter "@actspace/client..." --filter "@actspace/context-compaction..." build`。
- **问题**：`lifecycle.test.ts` 的触发比例用例 stub 了 `compact`，`maybeCompact` 改走协调器后不再经过它。
  - **应对**：改成 stub `select` 返回 null，用 `select` 是否被调用判断有没有触发。


- **问题**：历史投影里的 `triggerTokens` 取的是会话当前累计用量，不是压缩时的用量；实时路径写死 0。
  - **原因**：`packages/client/src/sessions/chat.ts` 投影 `compaction/end` 时拿 `snapshot.usage.totalTokens` 兜底。
  - **应对**：T1/T2 由后端写入 `beforeTokens`，投影改读事件数据。

- **问题**：浏览器截图里轨迹详情的时长是「0 毫秒」。
  - **原因**：压缩事务的四个事件一次写入，`compaction/start` 到 `compaction/end` 的时间差约为 0；之前一直如此。
  - **应对**：builder 优先取 `compaction/end.data.durationMs`，旧数据回退时间差。
- **问题**：480px 宽时 token 数被截成「182…」，耗时看不到。
  - **应对**：中间一组改为可换行，数据挪到第二行。
- **问题**：`check:current-docs` 报 `20261021-model-acquisition-picker` 的截图链接失效。
  - **原因**：与本分支无关，基线 main 上同样失败。
  - **应对**：不处理，记录在摘要里。

## 跳过或推迟的事项

- 进行中显示条数：手动压缩开始时拿不到条数，保持手动、自动一致。
