# 编辑提问重发 + 空闲发送不闪队列 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261107-edit-resend-rewind.md`
- **设计规范**：`docs/design-docs/agent-runtime/agent-edit-resend-rewind.md`
- **执行模式**：交互
- **开始时间**：2026-11-07（demo A1 与后端方案一经用户确认后）
- **结束时间**：2026-11-07 22:30（自动化验证完成；Electron 实机待验收）

前后有依赖，全部由主智能体按 B1→B6、F1→F5 的顺序自己写，没有开写作子智能体。

## 执行时间线

### B1–B6 后端与协议

- `tasks.submit` 带 `rewind {runId, expectedThroughSeq}` 和 `agentRunId`。
- `AgentApplication.rewindAndSubmit` 依次：
  - 拒绝运行中 / 有排队的会话；
  - 停掉在跑的后台任务和子 Agent；
  - 从日志算出截断点（`rewind-cut.ts`）；
  - 归档旧日志到 `recovery/`，重写前缀后重开（`session-persistence-jsonl/src/rewind.ts`）；
  - 把被移除部分里已结束的子 Agent 会话移进父会话 `recovery/`；
  - 接纳新提问，发出 `session/rewound`。
- `ManagedRuns.requestRunId`：Host 用客户端申请的 run id 开始任务。
- 运行时集成测试做了五轮回退，Host RPC 测试通过。

### F1 store 重载

- `ClientSessionStore.reset / isResetting`：丢掉在途读取，拒绝增量，下一份信封整体替换 cell。
- `DesktopSessionBridge` 识别 `session/rewound` 后整页重读。
- App 调 `forgetSnapshot`，清空本地队列和压缩失败块，重读任务快照。
- Web `SessionObserver.#rewound` 做同样的事。

### F2 空闲发送

- 空闲时用乐观 live run 和客户端 `agentRunId` 显示用户消息，`projectTaskQueue` 跳过它。
- 停止就是取消这条 pending 任务。
- Web `queuedMessages` 跳过空闲会话的队首。

### F3 编辑器 / F4 提问条

- `TurnPromptEditor`、`use-turn-editing`、`turn-prompt-draft`、`turn-edit-context`。
- `TurnView` 加可编辑、变淡、淡出三种状态。
- `PinnedTurnPrompt` 改成一行：点击滚到这一轮并进入编辑。

### 验证中发现并修复

- **App 的 `rememberOptions` 包装丢了 `agentRunId`**：空闲发送时消息仍会闪进托盘。App 级用例抓到，已修。
- **编辑重发失败后重新打开的编辑器显示旧内容**：重发同步写外部 store，旧编辑器没来得及卸下，状态没重建。现在编辑器带 `key`，每次打开换一个。
- **App 用例的影子对照**：`legacy-transcript.ts` 补上了回退截断规则，规范 §4 写明了这是有意改变的行为。
- **检查脚本**：
  - 编辑器里的 `role='dialog'` 选择器已去掉；
  - 回退路径的两处整份读日志标了 `perf-allow`（只在点编辑重发时走一次）；
  - `@mode` 声明改回脚本认的格式；
  - 重新生成了契约矩阵。

### F5 文档

- 更新四份前端规范：轮尾与导航（提问条）、中间消息区（编辑提问重发）、聊天输入框（空闲发送）、会话状态与数据流（§4 第 5 步、乐观 run、§6.1 回退重载）。
- `design-docs/index.md` 加入口；删除 `frontend/edit-resend-demo.html`。
