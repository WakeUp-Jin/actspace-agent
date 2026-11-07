## [2026-11-06 23:30] | Task: 请求记录只在变化时写完整内容，估算从日志推算

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 和 DeepSeek harness 对齐：系统提示词、工具拆出来，只在变化时写；估算按 DeepSeek 来，4 个字符算一个 token。可以，开始做吧。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`packages/session/*`、`packages/context/*`、`packages/core/*`、`packages/client/client`、`apps/desktop`、`apps/web`、`docs/design-docs`

**Key Actions:**

- **新事件**：
  - `request/system-prompt`、`request/tools` 在内容 digest 与日志里最近一条不同时才写；
  - `request/context` 改成 schemaVersion 3 小快照，不再存对话、提示词、工具和估算明细；
  - codec 与关系校验同步。
- **一套估算**：
  - shared 的 `token-estimate.ts`，算法是 `ceil(字数/4)`，每块 +4，每条消息 +4；
  - 估算明细定义（`context-entries.ts`）只有一份，引擎和日志折叠共用。
- **`contextEstimate` 投影**：
  - 替代 `requestContext`，状态大小不随消息数增长；
  - 压缩替换事件带 `replacedTokens`；
  - 圆环、Web 百分比、面板「当前」都只读它；
  - 删除 `describeContext` 轮询和 `browseContextState`。
- **SQLite 历史与 Harness 统计**：用同一个折叠函数记趋势和明细。`CONTEXT_PROJECTOR_VERSION` 改为 4，`user_version` 改为 17，派生库会重建。
- **轨迹与历史窗口**：
  - 系统行、工具 Schema、上下文增减都读生效记录；
  - 历史窗口不从头开始时，带上起点前最近的两条记录；
  - disclosure 改读提示词记录的提供方来源。

### 🧠 Design Intent (Why)

run2 实机记录里，日志 9.1 MB，其中 `request/context` 占 7.9 MB：每次请求把整段对话、不变的提示词和工具、估算明细都重存一遍；长会话还会撞上单条 1 MiB 的上限。`requestContext` 投影每个 surface 事件都重算整段对话，约 0.7 GB 分配。参照 DSH「凡是发给模型的东西都能从日志重新拼出来」：变化时写一份完整、自包含的内容，不变就不写；估算不进日志，由投影从日志算。旧会话不兼容，由用户自行删除。

### 📁 Files Modified

- 规范与计划：
  - `docs/design-docs/agent-plugin-runtime/agent-spec-request-record.md`（新增）
  - `docs/exec-plans/active/20261106-request-record.md`（新增）
  - `docs/exec-runs/20261106-request-record/`（新增）
- 相关规范：
  - `agent-token-usage-and-context-state.md`、`agent-spec-dsh-event-model.md`、`agent-spec-runtime-projection.md`、`front-轨迹视图规范.md`
  - 上下文引擎 V2 的 01 / 05、`11-Harness统计设计.md`
  - `docs/tools/session-viewer/` 等，完整清单见执行过程
- 代码与测试：完整清单见执行过程 `execution-process.md`
