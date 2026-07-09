## [2026-07-09 16:05] | Task: Agent 评估执行器与报告链路

### User Request

- 继续完成 ActSpace Agent 评估计划。
- 在 `actspace-agent-eval` 中推进真实执行链路、artifact 读取、评分和报告生成。

### Changes

- 在外部 `actspace-agent-eval` 仓库新增通用命令执行器：
  - 支持执行 Docker command。
  - 支持 mock command，用于 CI 和本地低成本端到端验证。
- 新增 artifact reader：
  - 读取 `result.json`。
  - 读取 `trace.jsonl`。
  - 读取 `final-response.md`。
  - 读取 `git-diff.patch`。
  - 读取 `command-results.json`。
  - 读取 `context-snapshots/`。
- 新增单 case report builder，将四类 grader 结果汇总为 `report.json`。
- 扩展 CLI：
  - 保留 `--dry-run`。
  - 增加 `--mock-command` 用于 artifacts -> graders -> report 的 mock E2E。
  - 增加 `--mock-agent`，用于真实 Docker 中调用 ActSpace CLI 的 `--mock` 模式。
- 命令失败时也会生成结构化 failed report，避免 Docker daemon、镜像或环境问题只停留在终端日志。
- 更新外部仓库 README 和 ARCHITECTURE。
- 更新 ActSpace 执行计划中任务 3.2 的状态和验证结果。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - `npm test` 通过，10 个测试文件、18 条测试。
  - `npm run build` 通过。
  - `npm run ci` 通过。
  - CLI mock E2E 通过，并生成 passed report。
  - `docker --version` 可用。
  - 真实 Docker `--mock-agent` 执行因当前机器 Docker daemon 未启动失败，但 runner 已生成结构化 failed report。

### Notes

- 当前未把任务 3.2 标为 completed，因为真实 Docker 容器级闭环需要 Docker daemon 运行后再验证。
- 后续需要在 daemon 可用时重跑 `--mock-agent`，再进入真实 Agent 修复代码、采集 diff/verification/context artifacts 的阶段。
