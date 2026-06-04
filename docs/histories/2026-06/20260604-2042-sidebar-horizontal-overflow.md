## [2026-06-04 20:42] | Task: Fix sidebar horizontal overflow

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 会话列表宽度过小时出现横向滚动条，分析原因并修复。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[Scrollbar axis]**: Changed the session navigation container from generic `overflow-auto` to `overflow-x-hidden overflow-y-auto`, so the sidebar owns vertical scrolling only.
- **[Shrink contract]**: Added `min-w-0` / `w-full` to sidebar list containers and rows so narrow sidebar layouts can shrink instead of expanding the scroll width.
- **[Empty state]**: Removed the long scheduled-task hint from the nowrap time column that was able to inflate horizontal content width.
- **[Tests]**: Added sidebar tests that lock the vertical-only scroll contract and ensure the removed scheduled hint does not return.

### 🧠 Design Intent (Why)

The sidebar is a fixed-width navigation pane, not a two-axis canvas. Horizontal overflow made the list look broken and allowed trackpad gestures to shift session titles off the left edge. The fix keeps the sidebar's scroll behavior single-axis and removes the nowrap empty-state text that was the clearest width inflation source.

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
