## [2026-05-31 01:09] | Task: Fix settings scroll pane

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 设置页滚动时，希望只滚动右侧设置视图，左侧设置菜单栏不跟随滚动。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer settings page and frontend docs.

**Key Actions:**

- **[Layout fix]**: Locked the settings page shell to viewport height and hid shell overflow so body-level scrolling no longer moves the left settings nav.
- **[Scroll ownership]**: Kept vertical scrolling on the right settings content pane only, and added a regression test for the class ownership.
- **[Docs sync]**: Documented that settings-page vertical scrolling belongs only to the right content pane.

### 🧠 Design Intent (Why)

Settings page bypasses the normal `SplitView` shell, so it needs to define its own viewport-height boundary. Without that boundary, the right pane's `overflow-y-auto` can fall through to document scrolling, which makes the left navigation move with the content.

### 📁 Files Modified

- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/design-docs/front-设置页规范.md`
