## [2026-07-24 23:24] | Task: Require Bash intent

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> 将 Bash 工具的 `intent` 改为必须填写；保留现有 `rm` 权限设计。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、Bash 设计文档

**Key Actions:**

- **工具契约**: 将模型可见 Bash Schema 的 `intent` 加入必填字段，并明确要求用一行简体中文解释命令目的。
- **运行时兜底**: 权限归一化阶段拒绝缺失或纯空白的 `intent`，同时裁剪首尾空白后再交给审批、执行和前端预览链路。
- **回归验证**: 新增 Schema 必填、缺失/空白拒绝、说明文本裁剪测试；现有 `rm` hard reject / irreversible ask 规则保持不变。

### 🧠 Design Intent (Why)

模型工具 Schema 是首层行为约束，但 Provider、旧调用或手工调用不一定严格执行它。将必填声明和运行时校验放在同一工具边界，才能保证所有实际进入 Bash 执行链路的命令都有用户可读说明。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/bash/definition.ts`
- `packages/agent-core/src/tools/tools/bash/permissions.ts`
- `packages/agent-core/src/tools/test/bash.test.ts`
- `docs/design-docs/execution-safety/agent-bash工具设计文档.md`
- `docs/histories/2026-07/20260724-2324-require-bash-intent.md`
