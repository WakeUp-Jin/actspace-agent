## [2026-07-09 21:00] | Task: Agent 评估运行模式元信息

### User Request

- 继续完成 ActSpace Agent 评估执行计划。
- 推进真实 Agent 模式相关工作，让 eval runner 可以清楚区分 mock、Docker mock 和 Docker live 运行路径。

### Changes

- 外部 `actspace-agent-eval` 仓库：
  - 新增 case run mode：
    - `mock-command`
    - `docker-mock-agent`
    - `docker-live-agent`
  - dry-run 结果会返回 run mode。
  - `report.json` 新增 `run` 元信息：
    - run mode
    - 实际执行命令
    - Docker 命令
    - artifacts 目录
  - 命令失败 report 也会保留 run metadata，方便复验 Docker 或 live model 环境失败。
  - 更新 runner、CLI、report schema 和相关测试。
- ActSpace 文档：
  - 更新 `docs/design-docs/agent-evaluation.md`，将 run mode、执行命令、Docker 命令和 artifacts 目录列入单次报告要求。
  - 更新执行计划，记录 dry-run/report 已能区分 `mock-command`、`docker-mock-agent` 和 `docker-live-agent`。
- 外部 eval 文档：
  - 更新 README 和架构文档，说明 run mode 和 report run metadata。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - 目标测试通过：
    - `src/test/run-case.test.ts`
    - `src/test/run-case-failure.test.ts`
    - `src/test/run-case-e2e.test.ts`
    - `src/test/report.test.ts`
    - `src/test/report-extra.test.ts`

### Notes

- 本轮没有调用真实模型。
- 默认 Docker run 已明确标记为 `docker-live-agent`，但真实容器执行仍需要 Docker daemon 可用。
- ActSpace 仓库侧 pnpm 验证仍受本机依赖重装和 npm registry DNS 限制影响，未重复触发长时间安装重试。
