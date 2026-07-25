## 2026-07-19 14:00 | Task: 增加 `/eval` 失败回归 Candidate 命令

### Execution Context

- Base Model: GPT-5
- Runtime: Codex desktop

### User Query

用户希望在 Agent 执行失败或效果很差时，通过 `/eval` 把用户输入、会话历史和执行上下文交给独立 Agent，生成本地回归 Candidate，再由独立 Eval 仓库导入内部数据集；首版要求复用现有读写工具并保持简单。

### Changes Overview

- 新增 `/eval [失败说明]` renderer 分流、IPC 与 preload 契约，不调用普通 `runTurn`。
- 新增独立 Candidate 生成服务：Candidate 目录作为 Agent workspaceRoot，复用现有 read/list/grep/glob/write/edit 工具，禁用 Bash、删除、网络和子 Agent。
- 新增 `eval_candidate` SessionEvent 与可恢复 status 展示。
- Candidate 固定写入 `<userData>/eval-candidates/<candidateId>/`，包含 `candidate.json`、`case.json` 和 `fixture/`。
- 补充 Main Service、Renderer 命令路由和 Session selector 测试。
- 同步独立 `actspace-agent-eval` 的 `ingest-candidate` 导入命令、测试和文档。

### Design Intent

首版只建立可使用的失败回归闭环。生成 Agent 通过系统提示词区分职责，不新增专用工具；把输出目录设为 Agent workspaceRoot，既复用现有文件工具，也让写入范围自然收敛。正式 Dataset 的 schema 校验、fixture 复制和 regression split 更新仍由独立 Eval 仓库负责。

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `packages/desktop/src/main/eval-candidate-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `docs/design-docs/evaluation/agent-eval-failure-candidate.md`
