## [2026-09-26 09:28] | Task: 工作区「+」直接新建 Agent 会话

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 在项目下点击新建会弹窗选择 Agent / Chat，交互太糟糕，希望像「新建会话」一样直接创建。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer Sidebar）、设计文档

**Key Actions:**

- **[去掉形态菜单]**: 侧栏 workspace 分组的「+」不再弹 Agent/Chat 菜单，点击直接以 `agentForm: "agent"` 在该工作区新建会话；移除对应的菜单 state、ref 与外部点击关闭逻辑。
- **[同步测试与文档]**: 更新 `sidebar.test.tsx` 用例；更新 `agent-main-chat-form.md` §10 的入口描述。

### 🧠 Design Intent (Why)

Chat 形态不使用工作区，在项目下新建 Chat 不符合入口语义；多一步菜单只增加打断。需要 Chat 时，空会话 Composer 已支持切换形态，顶部「新建会话」下拉也保留两种入口。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/test/sidebar.test.tsx`
- `docs/design-docs/agent-runtime/agent-main-chat-form.md`
