## [2026-11-07 06:00] | Task: 中间回复不再挂着流式样子；重启后队列不再卡在已暂停

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 那一段字又出现了，之前出现的 bug，为什么又出现了，没有写测试代码吗？／好像又卡住了。开始修复这两个 bug 吧。

### 🛠 Changes Overview

**Scope:** `apps/desktop/src/renderer/components`、`packages/session/session-persistence-jsonl`、`packages/harness-evolution/harness-control`、`packages/harness-evolution/harness-hmr`、`docs/design-docs`

**Key Actions:**

- **流式残留段（真正原因）**：
  - 末尾渐显和光标原来按「整轮还在跑」判断，一轮里每条已写完、后面接了工具的回复都挂着流式样子，直到整轮结束；
  - 新增 `WritingReplyContext`，由 `TurnView` 指定本轮最后一项的回复为「正在写」，只有它带平滑输出、渐显和光标；
  - mermaid 和表格的版面稳定规则仍按整轮算；
  - 11-05 修的 IPC 顺序问题确实存在，但不是这个现象的主因。
- **重启后队列卡在已暂停**：
  - writer lease 只看持有进程是否还在，进程退出就立即接管，不再等 30 秒心跳过期；
  - `HarnessControl.retryStartup()` 公开「启动时只因存储被占」的重试，HMR 在读 blocked 前先调用它，不再直接抛 `RECOVERY_BLOCKED` 让 run manager 暂停队列。
- **测试**（全部先在旧代码上确认失败）：
  - `turn-streaming-tail.test.tsx`：一轮在跑时中间回复不带光标、最后一条带；结束后都不带；
  - lease：进程已退出时在心跳窗口内也接管；进程还在时仍拒绝；
  - HMR：启动锁住时 acquire 先重试再放行；control：`retryStartup` 在旧 Host 释放后清掉阻塞。

### 🧠 Design Intent (Why)

上次只在主进程验证了发送顺序，没有测渲染端「哪条回复算正在写」，现有 Markdown 测试还把整轮流式当成预期。这次把测试放在出问题的那一层（TurnView 渲染）。卡住是因为新进程在旧进程退出后 12 秒内启动，30 秒心跳窗口让锁被拒，HMR 又绕过了 control 已有的重试；进程已不在就是旧 writer 失效的证明，不必再等。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/messages/reply-streaming-context.ts`、`AssistantReply.tsx`、`MarkdownProse.tsx`、`conversation/TurnView.tsx`、`test/turn-streaming-tail.test.tsx`（新增）
- `packages/session/session-persistence-jsonl/src/writer-lease.ts`、`storage.ts`；`packages/session/session-persistence/src/test/persistence.test.ts`
- `packages/harness-evolution/harness-control/src/service.ts`、`test/activation.test.ts`
- `packages/harness-evolution/harness-hmr/src/service.ts`、`test/lifecycle.test.ts`
- `docs/design-docs/frontend/front-聊天区Markdown渲染规范.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md`
