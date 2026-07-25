# `/eval` 失败回归 Candidate 命令执行计划

## 目标

实现 `/eval [失败说明]` 到 Candidate 落盘，再由 `actspace-agent-eval ingest-candidate` 导入 regression 数据集的最小闭环。

## 范围

- 包含：共享 IPC/SessionEvent 契约、桌面端命令分流、Main Process Candidate 生成服务、独立生成 Agent、Candidate 状态展示、Eval 导入命令、测试、文档与 history。
- 不包含：自动运行 Candidate、自动提交、去重、工作区快照、复杂审核 UI、新工具或新模型设置。

## 背景

- 相关文档：`docs/design-docs/evaluation/agent-eval-failure-candidate.md`、`docs/design-docs/agent-runtime/agent-turn-layers.md`。
- 相关代码路径：`packages/shared/src/ipc.ts`、`packages/shared/src/session.ts`、`packages/desktop/src/renderer/App.tsx`、`packages/desktop/src/main/`、`packages/agent-core/src/engine/create-agent-deps.ts`、Eval 仓库 `src/actspace_agent_eval/cli.py`。
- 已知约束：复用现有文件工具；Candidate 仅在显式 `/eval` 后产生；Eval 仓库保持黑盒边界。

## 风险

- 风险：模型只回复而不生成 `case.json`/`fixture/`。
- 缓解方式：Main Process 在 Agent 完成后检查必要产物，缺失则返回失败并持久化失败状态。
- 风险：Case 导入后破坏 Dataset manifest。
- 缓解方式：导入前校验 Candidate，写入后用现有 `load_dataset` 重新加载；失败时恢复旧 manifest 并删除本次复制文件。

## 里程碑

1. 落共享契约和 Candidate 生成服务。
2. 接 `/eval` Renderer/IPC 与会话状态展示。
3. 增加 Eval importer。
4. 完成测试、文档、history 与验证。

## 验证方式

- 命令：shared/desktop TypeScript typecheck 与 vitest；Eval 仓库 Ruff、mypy、pytest。
- 手工检查：`/eval` 不调用普通 `runTurn`；Candidate 路径位于 `userData/eval-candidates/`；导入后 manifest regression split 包含新 Case。
- 观测检查：会话恢复后能看到 Candidate 成功或失败状态。

## 进度记录

- [x] 确认范围和简化设计。
- [x] 完成 Actspace Candidate 生成链路。
- [x] 完成 Eval 导入链路。
- [x] 完成验证并归档计划。

## 决策记录

- 2026-07-19：不新增专用工具；生成 Agent 复用现有文件工具，Candidate 目录作为 Agent workspaceRoot。
- 2026-07-19：首版由 Eval importer 承担严格 Case/Dataset 校验，Actspace 只检查必要文件是否生成。
