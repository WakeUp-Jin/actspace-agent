## [2026-11-01 16:00] | Task: 删除「转成可视化 HTML」

### 🤖 Execution Context

- **Agent ID**: `subagent (架构优化 P1)`
- **Base Model**: `Claude Sonnet 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 执行功能减法 P1：删除「转成可视化 HTML」功能（回复下方的按钮、右侧 Reply 视图、生成逻辑、IPC、类型、mock、测试和文档）。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/desktop`、`docs/`

**Key Actions:**

- **删除生成逻辑**: 删 `fixed-renderer-visualization.ts`（含内联系统提示词）和 main 里两个 IPC handler。
- **删除 IPC 契约**: `contract.visualize`、`visualizeReply` / `listVisualizations` channel 常量，以及五个相关类型。
- **删除 renderer 入口**: `TurnActions` 里的可视化按钮、状态机和「重新生成可视化」菜单项；`ReplyHtmlRenderView`、`api/visualize.ts`、右侧面板的 `replyHtml` 标签、启动页和「+」菜单里的入口。
- **清理测试与 mock**: 删可视化用例，各 App 级测试的 bridge stub 去掉 `visualize.*`。
- **同步文档**: 右侧面板规范删「Reply 视图」「消息可视化转换」；存储文档注明 `visualizations.json` 不再读写；更新日志追加移除说明。

### 🧠 Design Intent (Why)

这个功能每次点击都要一次额外的模型调用，价值低于维护成本；聊天里已支持 Mermaid 作图。属于「架构优化」第一步功能减法（`docs/design-docs/架构优化/01-功能减法设计.md` 第 7 节）。磁盘上已有的 `visualizations.json` 不读也不删，回滚后仍可用。`registry.completeText` 是通用能力，保留；`HtmlRenderView.tsx` 留给 P3。

### 📁 Files Modified

- `apps/desktop/src/main/runtime-v2/fixed-renderer-visualization.ts`（删除）
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/components/conversation/TurnActions.tsx`
- `apps/desktop/src/renderer/components/right-panel/ReplyHtmlRenderView.tsx`（删除）
- `apps/desktop/src/renderer/api/visualize.ts`（删除）
- `packages/shared/src/desktop-bridge/contract.ts`
- `packages/shared/src/runtime-v2/fixed-renderer.ts`
- `packages/shared/src/ipc.ts`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/releases/feature-release-notes.md`
