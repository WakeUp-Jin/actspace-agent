## [2026-07-09 21:35] | Task: Agent 评估 Baseline Compare CLI

### User Request

- 继续完成 ActSpace Agent 评估执行计划。
- 补齐 dataset report 之后的 baseline/current 对比入口，让优化前后结果可以形成可复盘文件。

### Changes

- 外部 `actspace-agent-eval` 仓库：
  - 新增 `src/reports/compare-report.ts`。
  - 新增 `actspace-agent-eval compare` 子命令。
  - 支持参数：
    - `--baseline <dataset-report.json>`
    - `--current <dataset-report.json>`
    - `--out <comparison.json>`
  - 读取两个 dataset report，输出 fixed cases、regressed cases、unchanged failures 和 score deltas。
  - 不传 `--out` 时输出到 stdout，传入 `--out` 时同时写 comparison report 文件。
- ActSpace 文档：
  - 更新 `docs/design-docs/agent-evaluation.md`，明确 baseline comparison 应读取 report 文件并写出 comparison report。
  - 更新执行计划，将 compare CLI 和 comparison report 文件输出记录为已完成能力。
- 外部 eval 文档：
  - 更新 README 和架构文档，说明 `compare` 命令和 comparison report。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - `npm test -- src/test/compare-report.test.ts src/test/report-extra.test.ts` 通过。
  - `npm run build` 通过。
  - 手动验证 `node dist/cli.js compare --baseline ... --current ... --out ...` 通过，并写出 comparison report。

### Notes

- 本轮不调用真实模型。
- 该切片完成的是优化前后评估结果对比闭环，不依赖 Docker daemon。
