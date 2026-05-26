## [2026-05-26 12:51] | Task: Tool line text shimmer

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 参考 Cursor 的工具执行闪光效果，取消整块背景光带，改为只在工具行文本上做颜色流动；高亮色使用浅蓝，形成 actspace 自己的品牌味道。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs`

**Key Actions:**

- **[Text shimmer]**: 将工具执行中的 loading 动效从背景扫光改为文本渐变高亮，普通文字保持灰色，扫过区域变为浅蓝。
- **[Markup alignment]**: 为 read/search/directory/WebSearch 工具行文本统一包裹 `tool-log-line-text`，确保 shimmer 只作用在文字上。
- **[Docs sync]**: 更新 `docs/TODOLIST.md`，将工具执行中闪光反馈不明显标记为已处理。

### 🧠 Design Intent (Why)

Cursor 的效果强调的是文字颜色被移动高亮扫过，而不是整块背景发光。文本级 shimmer 更轻、更干净，也避免工具日志行出现突兀的大面积光带。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/styles.css`
- `docs/TODOLIST.md`
