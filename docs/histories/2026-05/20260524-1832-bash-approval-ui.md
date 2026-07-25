## [2026-05-24 18:32] | Task: Build Bash approval UI

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行 Bash 工具组件与审核状态样式计划，把正常 Bash、审核态 Bash 和相关边界状态分步骤完成并验收。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/desktop`, `docs`

**Key Actions:**

- **[Shared Contract]**: 为消息块补充 Bash preview/status 字段，让正常执行和审核态共用 `kind: "bash"`。
- **[Renderer Component]**: 新增 Bash 展示组件，正常态保持日志行，展开后只显示一个命令输出容器；pending 态显示轻量审核面板。
- **[Streaming Fallback]**: 真实流式工具事件中，Bash 执行阶段先渲染为 Bash block，最终由落盘 tool result 替换为完整输出。
- **[Fixture Coverage]**: 补充 pending、running、success、failed、denied、expired、cancelled 的 mock 样本。
- **[Docs]**: 更新中间消息区规范和 Bash approval UI 计划进度。

### 🧠 Design Intent (Why)

Bash 的视觉语法需要区分“执行日志”和“需要用户操作的审核面板”。普通执行不加外层卡片，避免比 Read/Search 更重；只有展开后的命令和输出进入单层容器。pending 审核态承载风险说明和操作按钮，因此允许使用轻量边框块。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-approval-ui-plan.md`
