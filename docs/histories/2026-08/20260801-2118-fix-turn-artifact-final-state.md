## [2026-08-01 21:18] | Task: 修复本轮 Artifacts 的发布时机与文件终态

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> Artifacts 应在最终回复完成后出现，不应在工具调用期间提前出现；已删除的临时文件不应继续导致读取失败，文件产物改成紧凑列表并在右侧显示增删统计。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、前端与工具预览设计文档

**Key Actions:**

- 使用当前 Run 的 `isStreaming` 状态门控最后一轮 Artifacts，只在 Run 结束后发布。
- 为成功 Delete preview 补充 executor 返回的绝对路径和 workspace 相对路径，并贯通流式与会话恢复。
- 将本轮 Write/Edit/Delete 折叠为文件终态：重复修改合并，后续删除移除，旧会话使用唯一 basename 安全回退。
- 文件产物改成单行路径列表，在行尾和头部展示本轮累计增删统计；`not_found` 改为明确的“文件已不存在”。

### 🧠 Design Intent (Why)

单工具完成只是过程事实，不能作为 turn 级产物的发布边界。Artifacts 必须同时满足 Run 已终结和输出仍存在，才能避免执行中闪现以及已删除临时文件形成失效入口。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/TurnOutputArtifacts.tsx`
- `packages/desktop/src/renderer/test/turn-output-artifacts.test.tsx`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/learnings/2026-08/turn-artifacts-are-terminal-state-projections.md`

### ✅ Verification

- Shared session selector：20 项通过。
- Agent Core bridge：35 项通过。
- Desktop TurnOutputArtifacts：14 项通过。
- Desktop streaming + TurnOutputArtifacts：41 项通过。
- `@actspace/desktop` build：通过（renderer 与 Electron 构建均成功，仅有既有 chunk size warning）。
- Desktop 定向 typecheck、`check:frontend-theme`、`check:docs`、`check:secrets`、`check:repo`、`git diff --check`：通过。
- Electron workspace runtime 已启动并截图确认主窗口正常渲染；当前可见 turn 没有文件产物，Computer Use 读取窗口状态持续超时，因此未完成目标 Artifacts 行的真实窗口视觉验收。
- 收尾时全 workspace `pnpm typecheck` 被并行工作区改动中的 `Composer.tsx supportsImages` 与 `right-panel-review.test.tsx` mock 类型错误阻断；两处均不在本次修改文件内。
