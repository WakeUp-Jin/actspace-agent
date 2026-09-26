## [2026-09-26 08:15] | Task: Chat 模式 context 用量收进输入框

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> Chat 模式底部只剩一个 context 用量，有点多余；把它放到模型选择器旁边、发送按钮左边，换行时显示在模型选择器右边。保留百分比数字。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer Composer）

**Key Actions:**

- **新增 Chat 专用 grid 布局**：inline 为 `plus_mode_input_model_context_send`，stacked / 窄屏为 `plus_mode_model_context_._send`，context 始终紧跟模型。
- **抽出 `renderContextUsageButton(variant)`**：状态行与输入框内共用同一按钮逻辑；输入框内变体圆环 13px、`text-faint`，避免比模型名更抢眼。
- **Chat followup 不再渲染底部状态行**：Agent 模式状态行（分支/运行位置/权限 + 用量）保持不变。
- **测试**：`chat-presentation-recovery.test.tsx` 断言用量按钮位于「输入框工具栏」内且无 `.composer-status-row`。

### 🧠 Design Intent (Why)

Chat 没有分支、运行位置、权限，状态行只为一个百分比占一整行，拉大了输入框与窗口底部距离。context 占用的是当前模型窗口，和模型选择器相邻语义一致；沿用现有「同一 grid 切换 template-areas」机制，不改变 DOM、不影响 textarea 焦点。ContextPopup 仍相对 footer 向上弹出，无需改锚点。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/test/chat-presentation-recovery.test.tsx`
