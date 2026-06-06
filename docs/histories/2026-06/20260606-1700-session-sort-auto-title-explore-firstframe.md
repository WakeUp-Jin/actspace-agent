## [2026-06-06 17:00] | Task: explore 首帧不再现框 + 会话列表排序 + 首轮自动标题

### 🤖 Execution Context

- **Agent ID**: `local-agent`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor / local`

### 📥 User Query

> 1. explore 执行前那一瞬出现了像 agent 工具一样的「框」，应该和 Thinking 一样只是简单的 `Exploring xxx` 文本。
> 2. 会话列表排序一下：最近创建/修改的排在最前面。
> 3. 会话名字默认都是 "New chat"，能不能在第一轮用户输入 + 模型回复完成后，用一个 flash 模型生成一句简短会话标题？尽量优雅、改动小。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/desktop`（main + renderer）

**Key Actions:**

- **explore 首帧路由修复**：`App.tsx` `toolEntryToBlock` 的 `agent` 分支，`display` 从 `tool.preview.display ?? (tool.toolName === "explore" ? "inline" : undefined)`。根因是 `tool_call_streaming` 首帧的 preview 不带 `display`（只有后续 `subagent_event` 才从 runner 带 `inline`），导致执行前一瞬被当 panel 渲染成 agent 工具的框。用 `toolName` 兜底即可全程内联，落到 `ExploreRunBlock` 的 `Exploring` 简单文本态。
- **会话列表排序（源头修）**：`listSessionRecords` 原样返回 `readdir` 顺序（无意义），改为按 `updatedAt` 降序排序后返回；`updatedAt` 对新会话等于 `createdAt`，同时覆盖「最近创建」「最近修改」。`Sidebar.groupSessionsByWorkspace` 额外在组内按 `updatedAt` 降序兜底，使组排序依赖的 `sessions[0]` 恒为最新。
- **首轮自动标题（flash）**：
  - 新增纯函数模块 `packages/agent-core/src/session-title.ts`：`generateSessionTitle(llm, { userInput, replyText })`（吃现成 LLMService，便于 Mock 单测，失败/空输出回落 `null`）+ `isDefaultSessionTitle(title)`（`""`/`New chat`/`Session <id>` 视为默认）+ 清洗逻辑（取首行、循环剥引号与尾标点、限长 40）。
  - `create-agent-deps.ts` 新增 `createTitlerLLMService(env)`（固定 `deepseek-v4-flash`，缺 DeepSeek key 返回 undefined），经 `engine/index.ts` 导出。
  - `agent-turn.ts` 在 `writeSessionResult` 后调用 `maybeGenerateSessionTitle`：仅「首轮（turn 前 `priorMessageCount === 0`）+ 标题仍默认 + 本轮 `completed`」时生成，`updateMeta({ title })`。await 完成后才返回，让 renderer 在 turn 结束后既有的 `listSessions()` 刷新里直接拿到新标题——零新增 IPC。
- **测试**：新增 `session-title.test.ts`（默认标题判定、清洗 `"标题"。`、空输入/LLM 报错/空回复回落 null、多行取首行）。

### 🧠 Design Intent (Why)

- **explore 兜底用 `toolName` 而非等 preview**：`display` 是运行期才由 runner 经 `subagent_event` 填的，首帧拿不到；`toolName` 在 `tool_call_streaming` 首帧就稳定为 `"explore"`，是最早可判别的信号，避免「先渲染成框、再跳成内联」的闪烁/误认。
- **排序修在源头 `listSessionRecords`**：pinned 列表与按 workspace 分组都从同一个 `sessions` 数组派生，源头排好两边都受益；Sidebar 里的组内排序仅作防御，不改变语义。
- **标题生成走「turn 内 await + 复用既有刷新」**：renderer 在 `await runTurn()` 返回后必定 `getSession()` + `listSessions()`，所以在 turn 返回前更新 `meta.title` 就能被自然刷新看到，无需新增事件/IPC。flash 生成只在首轮触发、全程 best-effort（缺 key / 失败 / 已被改名都静默跳过），不阻塞也不污染主流程。
- **纯函数 + 注入 LLMService**：`generateSessionTitle` 不在内部构造模型，避免 `session-title` → engine 的循环依赖，并能用 `MockLLMService` 确定性单测；构造 flash 的职责留在 engine 的 `createTitlerLLMService`，与 `createSummarizerForAgent` 同源。

### 📁 Files Modified

- `packages/desktop/src/renderer/App.tsx`（explore 首帧 display 兜底）
- `packages/desktop/src/renderer/components/Sidebar.tsx`（组内排序兜底）
- `packages/agent-core/src/persistence/session-store.ts`（`listSessionRecords` 按 updatedAt 降序）
- `packages/agent-core/src/session-title.ts`（新增）+ `src/index.ts`（导出）
- `packages/agent-core/src/engine/create-agent-deps.ts`（`createTitlerLLMService`）+ `engine/index.ts`（导出）
- `packages/desktop/src/main/agent-turn.ts`（`maybeGenerateSessionTitle` 接入）
- `packages/agent-core/src/test/session-title.test.ts`（新增）

### ✅ Verification

- `pnpm --filter @actspace/agent-core typecheck`、`pnpm --filter @actspace/desktop typecheck` 均通过。
- `pnpm --filter @actspace/agent-core exec vitest run session-title session-store explore-tool` 通过（24）。
- `pnpm --filter @actspace/desktop exec vitest run sidebar explore-run-block app-streaming` 通过（52）。
