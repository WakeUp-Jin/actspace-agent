# [2026-06-10 08:20] | Task: 修复历史重建块顺序导致的多轮对话 400 + Review 图片预览

## 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

## 📥 User Query

> 排查修复两个 bug：1) Review 功能无法渲染 PNG 图片，untracked 图片报 "Untracked file is too large to include in Review diff"；2) 会话只能发送第一条消息，第二、三条没有任何响应（日志已写入 logs/）。

## 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/shared`、`packages/desktop`（main + renderer）

**Key Actions:**

- **修复历史重建块顺序（bug 2 根因）**：`sessionEventsToMessages` 重建 assistant 消息时，原来按事件落盘顺序拼成 `[thinking, toolCall, text]`，与流式组装的原始顺序 `[thinking, text, toolCall]` 不一致。DeepSeek Anthropic 兼容端要求 `tool_use` 之后必须紧跟 `tool_result`（即 `tool_use` 必须是 assistant 消息的末尾块），text 排在 `tool_use` 后会被 400 `invalid_request_error` 拒绝。由于每轮 turn 都会从 `session.jsonl` 重建上下文，只要上一轮用过工具，后续每条消息都失败——表现为"只有第一条消息有响应"。
- **Review 图片预览（bug 1）**：`review-git-service` 对 untracked 文件一律按文本处理，图片超 256KB 上限报 "too large"、含 NUL 报 "binary skipped"，均不渲染。现为二进制图片扩展名（png/jpg/jpeg/gif/webp/bmp）跳过文本 diff 流程，在 `ReviewFileChange` 上标记 `renderKind: "image"`；已跟踪被修改的图片（git diff 中为 binary、无 hunks）同样标记。`ReviewRenderView` 对该类文件复用已有的 `workspace:read-file` IPC（data URL，5MB 上限）渲染图片预览。svg 仍按文本 diff 渲染（对 review 更有用）。

## 🧠 Design Intent (Why)

- bug 2 的修复选在重建侧而不是协议转换侧：重建顺序与原始消息不一致本身就是数据失真，恢复原始顺序后所有下游 provider 路径（DeepSeek/Kimi）天然正确，无需在 adapter 里加重排兜底。
- bug 1 复用 `readWorkspaceFile` 的图片 data URL 能力而不是在 Review 链路里再造一条图片读取通道，renderer 仍然不直接碰文件系统；`renderKind` 作为可选字段缺省即旧文本行为，对既有消费方零破坏。

## 📁 Files Modified

- `packages/agent-core/src/adapters.ts`（重建顺序修复）
- `packages/agent-core/src/test/adapters.test.ts`（块顺序回归测试）
- `packages/shared/src/ipc.ts`（`ReviewFileChange.renderKind`）
- `packages/desktop/src/main/review-git-service.ts`（图片识别与标记）
- `packages/desktop/src/main/test/review-git-service.test.ts`（图片用例 ×2）
- `packages/desktop/src/renderer/components/right-panel/ReviewRenderView.tsx`（图片预览渲染）
- `docs/design-docs/core-review-change-sources.md`（契约同步）

## ✅ Verification

- `agent-core` 全量 613 用例、`desktop` 全量 327 用例、全仓 typecheck 均通过。
- 用真实出错会话的 `session.jsonl` 离线复现：修复前重建为 `thinking,toolCall,text`，修复后为 `thinking,text,toolCall`，与 cache-audit 中 400 请求的失真结构对照一致。
