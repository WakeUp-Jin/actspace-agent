## [2026-11-07 22:30] | Task: 编辑提问重发（从某一轮重来）+ 空闲发送不闪队列

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（worktree `actspace-agent-edit-resend`，分支 `fix/edit-resend-composer`）

### 📥 User Query

> 点开之后原地编辑发送，不需要分叉，就是重来。比如 12345 五条消息，我从第二条编辑发送的时候，那后面三条就消失了。上下文也是如此 只注入一二条的上下文。
> 新建会话输入一段话点击发送，中间会有一瞬间先放在队列里面，然后再发送……直接就发送不就好了。

### 🛠 Changes Overview

**Scope:** `packages/`（shared、agent-service、runtime、session-*、client、agent-host、background-tasks、subagent）、`apps/desktop`、`apps/web`、`docs/`

**Key Actions:**

- **后端：**
  - `tasks.submit` 带 `rewind` 时，先停掉在跑的后台任务和子 Agent，再归档旧日志到 `recovery/`、重写前缀、接纳新提问，发出 `session/rewound`；
  - 客户端申请的 `agentRunId` 成为 Run id。
- **前端：**
  - 点提问卡片原地编辑（demo A1），下方变淡，发送后淡出，新提问乐观显示在原位置；
  - 提问条改为一行，点击回到这一轮并进入编辑；
  - 空闲时发送直接以乐观 run 显示，不进托盘；
  - 收到回退事件后桌面和 Web 都整页重载。
- **文档：** 新规范 `agent-runtime/agent-edit-resend-rewind.md`；前端规范四处更新；执行计划和执行记录。

### 🧠 Design Intent (Why)

- 语义是「重来」而非分叉。日志直接改写成前缀，旧日志存档，所有投影仍从日志推出，读取方不需要理解「隐藏」。
- 回退和接纳新提问必须是一次操作，所以复用 `tasks.submit`，不新增通道。
- 乐观用户块的 id 与 durable renderKey 相同，落盘后自然去重，不会出现两条。

### 📁 Files Modified

- 见 `docs/exec-runs/20261107-edit-resend-rewind/execution-summary.md` 的核心变更清单。
