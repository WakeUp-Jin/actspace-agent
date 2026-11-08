## [2026-11-08 21:35] | Task: 修正 turn-tail 测试里过期的「文档」标签文案断言

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> `turn-tail.test.tsx` 那条文案断言在 main 上就是红的（期望「文档」、实际「MD 文档」），是上一次文案调整漏改了测试，单独修一下并提 PR。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer 测试）

**Key Actions:**

- `turn-tail.test.tsx`「previews a deliverable in the right panel」用例的标签断言从 `docs:文档` 改为 `docs:MD 文档`，与 `open-workspace-path.ts` 实际打开的标签标题一致。

### 🧠 Design Intent (Why)

- 文档面板改名「MD 文档」那次（`b936f1bc`）改了 `RightPanel` / `RightPanelObjectMenu` / `open-workspace-path`，漏了这条测试。源码里已没有「文档」单独作标签标题的地方，所以修测试而不是回退文案。

### 📁 Files Modified

- `apps/desktop/src/renderer/test/turn-tail.test.tsx`
