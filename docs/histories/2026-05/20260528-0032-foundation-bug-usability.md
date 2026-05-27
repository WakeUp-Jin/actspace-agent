## [2026-05-28 00:32] | Task: 修复基础 Bug 与可用性问题

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 按基础 Bug 与可用性修复计划开始执行；先清理 Usage 运行时 mock 假数据，并继续处理基础体验问题。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `packages/agent-core`, `docs`

**Key Actions:**

- **Usage 空态**: 移除 Usage 页面运行时 `mockUsageStatistics` fallback，缺少真实 snapshot 时展示空态和刷新入口。
- **Markdown 表格**: 放宽手写 Markdown parser 的表格分隔行兼容性，并新增 renderer 测试锁定 GFM table 渲染。
- **Bash 审核态**: 审批提交成功后立即从 pending 审核卡片切到 running/denied 展示，提交失败时恢复按钮状态。
- **文件路径展示**: `write_file` 和 `edit_file` 结果新增 `relativePath`，模型/用户可见结果优先显示 workspace 相对路径，并在工具描述中写清裸文件名默认解析到 workspace root。
- **计划同步**: 更新基础 Bug 计划和 Usage Statistics 计划，明确产品运行时不再回退 mock 业务数据。

### 🧠 Design Intent (Why)

Usage 页面展示假数据会误导用户判断真实消耗；运行时应该只展示事实数据，没有事实时进入空态。文件工具展示绝对路径会让用户误判创建位置，改为相对路径能更清楚地表达“文件属于当前 workspace”。Bash 审核态则需要在用户点击后立即反映状态变化，避免看起来还停在审核中。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/messages/MarkdownProse.tsx`
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- `packages/desktop/src/renderer/test/markdown-prose.test.tsx`
- `packages/agent-core/src/tools/tools/write-file/executor.ts`
- `packages/agent-core/src/tools/tools/write-file/definition.ts`
- `packages/agent-core/src/tools/tools/edit-file-diff/executor.ts`
- `packages/agent-core/src/tools/tools/edit-file-diff/definition.ts`
- `packages/agent-core/src/tools/test/edit-write.test.ts`
- `docs/exec-plans/active/20260527-bugfix-foundation_代码编完需手动验证.md`
- `docs/exec-plans/active/actspace-usage-statistics-session-jsonl-plan.md`
