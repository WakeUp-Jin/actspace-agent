## [2026-07-09 16:10] | Task: Agent 评估报告与基线对比

### User Request

- 继续完成 ActSpace Agent 评估计划。
- 在 `actspace-agent-eval` 中推进报告生成和 baseline comparison，形成可对比的评估闭环。

### Changes

- 在外部 `actspace-agent-eval` 仓库新增 dataset report：
  - 汇总单 case report。
  - 统计 passed/failed。
- 新增 baseline comparison：
  - 输出 fixed cases。
  - 输出 regressed cases。
  - 输出 unchanged failures。
  - 输出 score deltas。
- 新增 `src/reports/index.ts` 作为报告模块入口。
- 补充报告相关单元测试。
- 更新 `docs/exec-plans/active/20260708-agent-evaluation/README.md`，将任务 5.1 和 5.2 标记为完成。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - `npm test` 通过，11 个测试文件、20 条测试。
  - `npm run build` 通过。
  - `npm run ci` 通过。
  - CLI mock E2E 通过并生成 passed report。

### Notes

- ActSpace 仓库侧最终 `pnpm` 验证本轮被依赖重装和 registry DNS 限制阻断；此前同一变更集下 agent-cli test/build/typecheck 通过过，本轮没有继续等待网络重试。
- 真实 Docker 容器级闭环仍需要 Docker daemon 运行后复验。
