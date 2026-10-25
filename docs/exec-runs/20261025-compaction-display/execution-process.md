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

## 遇到的问题

- **问题**：历史投影里的 `triggerTokens` 取的是会话当前累计用量，不是压缩时的用量；实时路径写死 0。
  - **原因**：`packages/client/src/sessions/chat.ts` 投影 `compaction/end` 时拿 `snapshot.usage.totalTokens` 兜底。
  - **应对**：T1/T2 由后端写入 `beforeTokens`，投影改读事件数据。

## 跳过或推迟的事项

- 进行中显示条数：手动压缩开始时拿不到条数，保持手动、自动一致。
