## [2026-05-22 22:51] | Task: Fix Thinking chevron direction

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> Thinking 折叠时箭头应向右，展开后箭头应向下。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI and frontend design docs

**Key Actions:**

- **[Thinking icon state]**: Changed collapsed Thinking rows to use a right chevron and expanded rows to use a down chevron.
- **[Docs]**: Recorded the Thinking disclosure icon convention in the middle message area spec.

### 🧠 Design Intent (Why)

Thinking is a disclosure row. The right chevron communicates a collapsed hidden body, while the down chevron communicates expanded content below.

### 📁 Files Modified

- `packages/desktop/src/renderer/components/messages/ThinkingBlock.tsx`
- `docs/design-docs/front-中间消息区规范.md`
