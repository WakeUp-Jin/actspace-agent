## [2026-07-26 08:02] | Task: Fix Bash directory deletion approval and environment visibility

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> workspace 内明确目录的删除不应被 `rm -rf` 一刀切硬拒绝，应进入审批；不新增目录删除工具，并恢复 Bash 执行环境 badge。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/shared`, `packages/desktop`

**Key Actions:**

- **[Delete policy]**: 将明确位于 workspace 子目录的 `rm -rf` 归入不可逆审批；workspace 根、越界、glob 和 `.git` 目标继续硬拒绝。
- **[Accurate denial context]**: 执行前拒绝明确回填“命令未执行且没有审批请求”，避免模型让用户寻找不存在的审批按钮。
- **[Environment visibility]**: 修复实时 Bash preview 漏传 `sandboxed`，审批卡片展示计划环境，最终态展示实际环境，拒绝态展示 `未执行`。
- **[No silent downgrade]**: 沙盒初始化失败时终止命令，不再静默切换真实环境；真实环境执行必须显式申请 `no_sandbox` 并审批。
- **[Prompt alignment]**: 修正主 Agent 关于 `delete_file` 不存在的过期提示，明确文件与目录删除边界。

### 🧠 Design Intent (Why)

递归 flag 只描述删除方式，不足以证明目标永远不应删除；安全决策应围绕目标路径边界。审批、拒绝和执行环境也必须成为模型与 UI 可区分的事实，不能依赖模糊错误文案或历史恢复偶然补齐。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/bash/command-rules.ts`
- `packages/agent-core/src/tools/tools/bash/permissions.ts`
- `packages/agent-core/src/tools/tools/bash/executor.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/prompt/main-agent.ts`
- `packages/shared/src/session.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- `docs/design-docs/execution-safety/agent-bash工具设计文档.md`
