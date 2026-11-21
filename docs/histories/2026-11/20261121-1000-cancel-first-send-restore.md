## [2026-11-21 10:00] | Task: 修复误触发送后停止丢消息、之后发不出消息

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 新会话第一条消息误触发送，马上点了停止：消息不见了，之后再发新消息也发不出去（输入框上方一直是「已暂停 / 继续发送」）。把丢的那条找回来；修 bug，这种「发出去马上取消」应该把原文放回输入框（参考 Cursor）。

### 🛠 Changes Overview

**Scope:** `@actspace/session-persistence-jsonl`、`apps/desktop`（renderer）

**Key Actions:**

- **选择存储的租约不再因一次心跳失败永久丢失**：`SessionWriterLease` 的心跳不再重叠（两拍共用一个临时文件，重叠时后一拍 rename 报 ENOENT）；心跳写失败只等下一拍，不置 `#lost`。`assertOwned` 只在锁文件不在（ENOENT）或 nonce 换成别人时才判定丢失，其它读错误只让这一次检查失败。
- **停止还没开始的消息时放回输入框**：`abortSession` 取消 pending 任务成功后，用任务里的原文、附件（优先用提交时带预览的那份）、文件引用和批注写回 composer 草稿；输入框已有新内容时，被取消的消息在前、新内容接在后面，附件和批注按 id 去重。
- 抽出 `queuedMessageFromTask`（排队托盘和取消恢复共用）和 `cancelledMessageDraft`（合并规则，单测覆盖）。

### 🧠 Design Intent (Why)

排查会话日志：第一条任务被接受后 48ms 队列就被暂停，从没开始 Run；之后每条新消息 resume 后几毫秒又被暂停。原因是 Harness 选择存储（`harness-state`）的写租约心跳在前一晚 22:30 失败过一次，被标成永久丢失，此后每次 `acquire` 都抛 `DURABILITY_BLOCKED`，`SessionRunManager` 按设计暂停队列等用户修复，但界面上只有「已暂停」，点「继续发送」又被暂停，直到重启应用。会话自己的租约心跳一直正常，锁文件里仍是本进程的 nonce，说明并没有别人接管。接管锁只看持有进程是否存活、不看心跳新旧，心跳只是展示用的时间戳，所以一次写失败不该让租约失效。

丢消息：乐观 run 还没开始时，停止 = 取消这条 pending 任务，原实现取消后直接丢掉内容。调研 Claude Code / Cursor：发送后、还没有输出就停止，会把原文放回输入框、消息流里不留这条；本次按这个做。

### Unverified & Leftovers（未验证与遗留）

- **已在 Electron 验证（agent-desktop，独立数据目录）**：让另一个存活进程占着选择存储的锁，复现「任务被接受、队列立刻暂停」；新会话发一条后点停止，对话清空、原文回到输入框、队列里没有残留；放开锁后再发，Run 正常开始并完成。
- **未验证**：心跳失败的真实触发条件（睡眠唤醒 / 两拍重叠）是根据锁文件时间戳推断的，没有在真机上复现；修复后的心跳在长时间运行、睡眠唤醒后是否保持持锁，需要观察。
- **遗留**：Harness `acquire` 被阻塞时，`ManagedRuns` 没把 `onFailure` 传给 `AgentService`，失败原因不上界面，用户只看到「已暂停」，点「继续发送」会被再次暂停（已登记 tech-debt）。Run 已开始、模型还没输出时停止，用户消息已写进日志，仍留在消息流里，不放回输入框（要放回需要配合回退，待定）。

### 📁 Files Modified

- `packages/session/session-persistence-jsonl/src/writer-lease.ts`
- `packages/session/session-persistence/src/test/persistence.test.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/session/message-queue.ts`
- `apps/desktop/src/renderer/test/app-message-queue.test.tsx`
- `apps/desktop/src/renderer/test/message-queue-tray.test.tsx`
