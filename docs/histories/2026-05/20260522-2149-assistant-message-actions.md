## [2026-05-22 21:49] | Task: Add assistant message actions

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> Add the missing assistant-message "..." action logo and popup menu.

### Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **Assistant actions**: Added a three-dot action trigger to assistant replies.
- **Message menu**: Added a compact menu with Fork Chat, Copy Message, and Copy Request ID entries.
- **Clipboard support**: Wired Copy Message to assistant content and Copy Request ID to the current message id.
- **Turn-level correction**: Moved the menu from each assistant text block to a single turn-level action row, aligned to the right edge.
- **Visual polish**: Limited the turn action hover state to the button itself and reduced diff header typography weight.
- **Dismissal fix**: Scoped outside-click detection to the action anchor instead of the full-width action row.
- **Topbar simplification**: Reduced the topbar action area to a single right-panel toggle and removed the extra search, notification, settings, avatar, and badge-like visual noise.

### Design Intent (Why)

Assistant replies needed a visible per-turn action affordance matching the intended workflow. A turn can include multiple assistant text blocks, so the menu belongs to the turn rather than each text block. Fork Chat is displayed but disabled until the app has a real fork-session capability, while copy actions are usable with the data currently available in `MessageBlock`.

### Files Modified

- `packages/desktop/src/renderer/components/messages/AssistantReply.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/styles.css`
