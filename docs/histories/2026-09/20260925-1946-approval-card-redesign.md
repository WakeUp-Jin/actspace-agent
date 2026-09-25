## [2026-09-25 19:46] | Task: 工具审批卡重设计

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI，交互模式`

### 📥 User Query

> 审批样式很奇怪、信息密度和样式都不好，先讨论并出 HTML 设计稿；确认 B 方向（读取一行、编辑写入不带 diff、删除和 Bash 去掉解释句、Bash/浏览器按钮在底部右侧）后，把项目里的审批组件都改成这种样式，先写计划再执行。

### 🛠 Changes Overview

**Scope:** `apps/desktop` renderer 消息组件、renderer 测试、前端设计文档。

**Key Actions:**

- **共享审批部件**：新增 `ApprovalParts.tsx`，包含一行审批条、卡片、三层按钮、路径折叠、原因标签映射、统一提交与精确授权建议读取。
- **一行审批条**：读取 / 搜索 / 匹配、编辑 / 写入、删除改为单行；编辑写入默认不展示 diff，点击 `+N -M` 在行下展开。
- **卡片**：Bash 与浏览器改为头行 + 内容 + 底部按钮；去掉 `Allowlist` 折叠、`Reason:` 行和中英混排标题。
- **提交行为**：Bash 审批改用共享提交，Bridge 返回 `ok: false` 时恢复可点。
- **测试**：同步 8 个既有过期断言，新增共享部件、grep 审批、diff 展开、写入动词、Bash 卡片与拒绝恢复用例。
- **文档**：`front-中间消息区规范.md` 新增“工具审批”小节并更新 Bash 审核态；删除 tooltip 规范中已不存在的“Bash 审批三点”；设计稿标注定稿。

### 🧠 Design Intent (Why)

旧审批卡像表单：灰色标题栏只说“需要授权”，关键路径最淡，编辑审批看不到内容，五张卡五种结构。新设计让审批回到工具日志的节奏：一行能说清的就一行，按钮在行尾；需要先读内容的（命令、浏览器能力）才用卡片，按钮放在读完的位置。风险只用标签和颜色表达，不再写解释句；未知原因保留在 tooltip，不丢信息。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/messages/ApprovalParts.tsx`
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `apps/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `apps/desktop/src/renderer/components/messages/DeleteFileBlock.tsx`
- `apps/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- `apps/desktop/src/renderer/components/messages/BrowserApprovalBlock.tsx`
- `apps/desktop/src/renderer/test/approval-parts.test.tsx` 等 8 个测试文件
- `docs/design-docs/frontend/approval-card-redesign.html`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/design-docs/frontend/front-icon-button-tooltip-guidelines.md`
- `docs/exec-plans/completed/20260925-approval-card-redesign.md`
- `docs/learnings/2026-09/20260925-flex-shrink-priority-for-paths.md`（学习沉淀：flex-shrink 是比例而非优先级）
