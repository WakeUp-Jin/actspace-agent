## [2026-07-09 00:25] | Task: Agent 评估仓库 runner 和评分器基础

### User Request

- 继续完成 ActSpace Agent 评估计划。
- 将评估模块做成独立 `actspace-agent-eval` 仓库，并推进可运行数据集、Docker-first 执行和核心评分器。

### Changes

- 在外部 `actspace-agent-eval` 仓库完成 case、dataset、artifact、report schema 的基础实现。
- 增加 `coding-basic` 数据集和 `auth.empty-password` 示例 case。
- 增加 `fixtures/projects/auth-app` 小型代码库夹具，用于后续 coding Agent eval。
- 增加 dataset loader 和 fixture workspace 复制能力，确保 case 能定位并生成一次性可写 workspace。
- 增加 Docker dry-run runner：
  - 准备 run 目录。
  - 写入 case input。
  - 创建 eval-output 目录。
  - 生成包含 `/actspace`、`/workspace`、`/eval/input.md`、`/eval-output` 挂载和 `--out /eval-output` 的 Docker 命令。
- 增加四类确定性评分器：
  - 工具调用评分器。
  - 执行结果评分器。
  - 上下文质量评分器。
  - 安全边界评分器。
- 更新外部仓库 README、ARCHITECTURE、`.gitignore` 和 CI，使 `eval-runs/` 的具体运行产物默认不进 git。
- 更新 `docs/exec-plans/active/20260708-agent-evaluation/README.md` 的任务状态。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - `npm test` 通过，6 个测试文件、13 条测试。
  - `npm run build` 通过。
  - `npm run ci` 通过。
  - `node dist/cli.js run --dataset coding-basic --case auth.empty-password --docker --dry-run --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 通过，并输出预期 Docker 命令。

### Notes

- 当前 Docker runner 只完成 dry-run 命令构建，尚未启动真实 Docker 容器执行 Agent。
- `auth.empty-password` 的端到端执行、artifact 读取、报告生成和 baseline comparison 仍在后续阶段。
