## [2026-07-09 21:20] | Task: Agent 评估 Dataset Runner

### User Request

- 继续完成 ActSpace Agent 评估执行计划。
- 推进从单 case 评估到 dataset 级评估的能力，让评估结果可以作为后续 baseline comparison 的输入。

### Changes

- 外部 `actspace-agent-eval` 仓库：
  - 新增 `src/runner/run-dataset.ts`。
  - 复用现有 `runCase`，按 dataset manifest 顺序运行全部 cases。
  - 生成 dataset report，并写出 `${datasetId}-dataset-report.json`。
  - CLI 支持不传 `--case` 或传 `--case all` 时运行整个 dataset。
  - 保留单 case `--case <id>` 和 `--dry-run` 行为。
  - 新增 dataset runner E2E 测试，覆盖 dataset run、post-run artifacts 和 dataset report 输出。
- ActSpace 文档：
  - 更新 `docs/design-docs/evaluation/agent-evaluation.md`，明确 dataset run report 是 baseline comparison 的输入。
  - 更新执行计划，将 dataset runner 和 dataset report 文件输出记录为已完成能力。
- 外部 eval 文档：
  - 更新 README 和架构文档，说明 dataset run 命令和 `${datasetId}-dataset-report.json` 输出。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - 目标测试通过：
    - `src/test/run-dataset.test.ts`
    - `src/test/run-case-e2e.test.ts`
    - `src/test/report-extra.test.ts`

### Notes

- 本轮仍不调用真实模型。
- Docker daemon 未启动时，真实 Docker 执行仍只能生成结构化失败报告；dataset runner 本身已经可通过 mock/scripted E2E 验证。
