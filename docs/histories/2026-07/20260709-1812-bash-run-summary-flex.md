## [2026-07-09 18:12] | Task: stabilize Bash run summary layout

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户指出长 Browser Bridge `abb` 命令路径会把 `Ran Bash command` 挤成换行，要求将 BashRunBlock 执行行改成稳定 flex：summary 固定不换行，command preview 占剩余宽度并省略。

### 🛠 Changes Overview

**Scope:** desktop renderer message UI

**Key Actions:**

- **Stable flex row**: 将 Bash 执行行从 `inline-flex` 调整为占满可用宽度的 `flex w-full overflow-hidden`。
- **Fixed summary**: 为执行摘要增加 `bash-run-summary flex-none whitespace-nowrap`，避免 `Ran Bash command` 被长路径挤成多行。
- **Truncated preview**: 为命令预览增加 `min-w-0 flex-1`，让长路径在剩余宽度内省略。
- **Fixed trailing badges**: 将沙盒 / 真实环境 / 后台状态 / 展开箭头放入 `bash-run-trailing flex-none`，避免被长命令预览挤掉。
- **Regression test**: 增加长 Browser Bridge 路径 preview 的组件测试，锁定 summary 不换行与 preview 省略布局类。

### 🧠 Design Intent (Why)

Bash 工具行同时承载稳定状态文案、可变长度命令预览和右侧环境状态。状态文案与环境徽标应保持可扫描，命令预览才是可截断内容；否则带空格的绝对路径会抢占宽度，让工具状态读起来断裂，甚至挤掉沙盒 / 真实环境徽标。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- `packages/desktop/src/renderer/test/bash-run-block-tooltip.test.tsx`
- `docs/histories/2026-07/20260709-1812-bash-run-summary-flex.md`
