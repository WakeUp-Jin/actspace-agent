## [2026-11-01 11:07] | Task: 让 Agent 能读历史会话

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI，worktree ../actspace-agent-session-history，分支 feat/session-history-transcript`

### 📥 User Query

> Agent 现在看不到自己的历史会话。参考 DeepSeek Harness、OpenCode、Codex 的做法，把历史会话做成只有内容的 Markdown，再用系统提示词告诉 Agent 在哪、怎么读。在 worktree 新分支里实现；流程是先写设计规范，再写计划，再实现。

### 🛠 Changes Overview

**Scope:** `@actspace/session-transcript`（新）、`@actspace/tools-runtime`、`@actspace/runtime`、docs

**Key Actions:**

- **新插件包**：每轮结束从 Journal 增量投影出 `sessions-v2/<id>/transcript.md`，含子 Agent、侧边对话 / Fork 标记、压缩摘要；主会话注入提醒式 `<session-history>` 提示词，路径运行时填入。
- **权限**：`evaluateGlobalBoundary` 接受 Host 可读路径判断，读 transcript 不弹工作区外审批。
- **装配与文档**：runtime 默认组合、契约矩阵、设计文档、执行计划、存储与权限文档。

### 🧠 Design Intent (Why)

原始 Journal 体积大、单行很长，模型读不了；派生一份精简 Markdown，用现有读文件和搜索工具即可，不新增工具。Journal 仍是唯一事实源，transcript 可随时重建。

### 📁 Files Modified

- `packages/session/transcript/src/{render,paths,prompt,plugin,manifest,index}.ts`
- `packages/tools/runtime/src/permission/engine.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/runtime/src/harness/agent-factory-plugin.ts`
- `packages/runtime/cordis.yml`、`packages/runtime/src/profiles/composition.ts`
- `docs/design-docs/agent-runtime/agent-session-transcript.md`
- `docs/exec-plans/completed/20261101-session-history-transcript.md`
