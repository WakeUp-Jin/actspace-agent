# 压缩的前端回显（A1） — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261025-compaction-display.md`
- **执行模式**：交互
- **开始时间**：2026-10-25
- **结束时间**：进行中

## 执行时间线

### 步骤 0：设计收敛

- **操作**：做 demo `docs/design-docs/frontend/compaction-display-demo.html`，先出现状与 A–E 五版，用户否掉 B–E；再出 A1–A5，用户选 A1。
- **决定**：摘要只在轨迹里看；压缩后 token 用「实测压缩前 − 估算删除 + 估算摘要」；轨迹详情一起补。

### 步骤 1：T1 后端记录

- **操作**：`ContextCompactionCoordinator.perform` 按入口区分 `trigger`，算 `beforeTokens` / `afterTokens` 写进 `compaction/end`；`CompactionObserver.onFinished` 回传结果；`autoCompact` 把字段带到 `compaction-finished`；`CompactionPlugin.maybeCompact` 改走 `withStrategy(this).maybeCompact`。
- **验证**：context-compaction 20、context-engine 27、session-journal 37、core-agent-loop 54 全过；五个包 `tsc --noEmit` 通过。

## 遇到的问题

- **问题**：新 worktree 里跑测试报 `Failed to resolve entry for package @actspace/llm-service`。
  - **原因**：workspace 包没有 dist。
  - **应对**：先 `pnpm --filter "@actspace/runtime..." --filter "@actspace/client..." --filter "@actspace/context-compaction..." build`。
- **问题**：`lifecycle.test.ts` 的触发比例用例 stub 了 `compact`，`maybeCompact` 改走协调器后不再经过它。
  - **应对**：改成 stub `select` 返回 null，用 `select` 是否被调用判断有没有触发。


- **问题**：历史投影里的 `triggerTokens` 取的是会话当前累计用量，不是压缩时的用量；实时路径写死 0。
  - **原因**：`packages/client/src/sessions/chat.ts` 投影 `compaction/end` 时拿 `snapshot.usage.totalTokens` 兜底。
  - **应对**：T1/T2 由后端写入 `beforeTokens`，投影改读事件数据。

## 跳过或推迟的事项

- 进行中显示条数：手动压缩开始时拿不到条数，保持手动、自动一致。
