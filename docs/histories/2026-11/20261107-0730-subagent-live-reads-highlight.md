## [2026-11-07 07:30] | Task: 子 Agent 运行时主进程不再每秒整份重读日志；回复渲染不再反复新建高亮器

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> run6发现的两个问题我们要一起讨论一下看看怎么修复／问题3按照你的建议来／我觉得可以

### 🛠 Changes Overview

**Scope:** `packages/core/runtime`、`packages/core/agent-service`、`apps/desktop/src/main`、`apps/desktop/src/renderer`、`packages/fs/tool-fs-search`、`docs/design-docs`

**Key Actions:**

- **主进程整份重读（run6：4 个子 Agent 时每分钟分配 2–3.4 GB）**：
  - 会话控制器读会话时，除了主会话，也认外部登记的子 Agent 会话（`liveSession`）：`readModel`、`readProjection`、`browseToolDetail`、`inspectEvents` 都走内存里的日志和读模型；
  - 子 Agent 会话取消登记时，删掉它的读模型；子 Agent 会话不再积攒只给推送用的变化记录；
  - 新增 `latestEvent(sessionId, type)`（控制器 → 应用 → registry）：子 Agent 列表取模型名只读最新一条 `request/header`，运行中的子会话走日志自带的类型索引；
  - 右侧子 Agent 列表：有子智能体在跑时每秒轮询，都没在跑时 5 秒一次。
- **渲染进程反复新建 lowlight（run6 合计 1.8 GB）**：rehype-highlight 只初始化一次，插件交出同一个转换函数，所有回复共用。
- **grep 输出上限 64K**（run5 定位的工具结果过大）。
- **规范**：新增 `agent-spec-surface-derived.md`（对话内容只存一份），§8 三条决定已确认，执行计划待写。
- **测试**（都先在旧代码上确认失败）：
  - `live-child-reads.test.ts`：5 个子会话 × 5 轮轮询，整份读取从 50 次降到 0，取消登记后改走磁盘、内容完整；
  - `chat-markdown-highlight-reuse.test.tsx`：高亮插件初始化从 65 次降到 ≤1；
  - `panel-polling-quiet.test.tsx`：列表在跑时每秒、空闲时 5 秒轮询。

- **实机复测 run7**（同样 4 个子 Agent）：主进程 `readJsonlSession` 3937 → 38 MB、`#build` 2235 → 28 MB、`validateJsonValue` 1165 → 37 MB，子 Agent 运行期每分钟分配峰值 3.4 GB → 1.7 GB，结束后每分钟约 2 MB；渲染进程 `createLowlight` 1809 → 0.3 MB。剩余大头是上下文引擎每次请求的冻结与摘要、流式时每帧整条重新解析 Markdown。

### 🧠 Design Intent (Why)

子 Agent 会话本来就在主进程内存里（子 Agent 管理器正用它写），只是读取方法只查主会话表，于是面板每秒对每个子会话从磁盘整份读、校验、重建投影缓存（缓存只放 3 个会话，4 个子会话互相挤掉）。改成认外部会话后，读取只处理新增事件。前端已经只渲染点开的那个子智能体，退出即卸载，不需要再改。

### 📁 Files Modified

- `packages/core/runtime/src/session/session-controller.ts`、`live-child-reads.test.ts`（新增）
- `packages/core/agent-service/src/application.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`runtime-registry.ts`
- `apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`、`test/panel-polling-quiet.test.tsx`
- `apps/desktop/src/renderer/components/messages/markdown/pipeline.ts`、`test/chat-markdown-highlight-reuse.test.tsx`（新增）
- `packages/fs/tool-fs-search/src/node-ports.ts`、`src/test/node-ports.test.ts`
- `docs/design-docs/agent-plugin-runtime/agent-spec-surface-derived.md`（新增）、`docs/design-docs/tool-system/agent-subprocess-runner-guidelines.md`
