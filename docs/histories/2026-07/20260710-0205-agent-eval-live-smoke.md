# Agent Eval Live Smoke 收口

时间：2026-07-10 02:05

## 背景

Agent 评估执行计划中，Docker 端到端链路已经有 `doctor`、`--mock-agent`、`judge-basic + --judge-command` 和真实 Agent 结构化失败报告作为证据，但计划状态仍保留为“部分完成 / 待处理”。

真实 Agent 模式还缺一个 `runtime.network: allow` 的最小手动验收用例，用于在宿主机显式提供模型环境变量时验证 Docker live Agent 路径。

## 变更

- 在外部 `actspace-agent-eval` 仓库新增 `live-smoke/final-response` 数据集，用于手动验证 Docker live Agent 模式。
- 将真实模型命令改为显式传入 `--env DEEPSEEK_API_KEY` 和 `--env DEEPSEEK_API_FORMAT`，不默认透传宿主 `.env` 或全部环境变量。
- 将执行计划中的任务 3.2 更新为已完成。
- 将任务 6.1 更新为“已完成，真实模型成功运行需要宿主机提供模型凭据”，明确区分运行入口完成和真实模型凭据验收。
- 同步更新主设计文档和外部评估仓库的设计文档副本。

## 验证

- 外部评估仓库 `npm run typecheck` 通过。
- 外部评估仓库 `npm test` 通过，18 个测试文件、34 条测试。
- 外部评估仓库 `npm run build` 通过。
- `live-smoke/final-response` dry-run 通过，Docker 命令使用 `--network bridge`，验证 `runtime.network: allow` 生效。
- `doctor --dataset live-smoke` 通过，数据集、ActSpace 命令行入口构建产物、Docker CLI 和 Docker 守护进程均通过。
- `live-smoke/final-response --docker --mock-agent --judge-command "node scripts/judge/static-judge.mjs"` 通过，生成 passed 报告，分数 0.95。
- `coding-basic/auth.empty-password --docker --mock-agent` 通过执行并生成结构化报告；评分失败符合预期，因为模拟 Agent 不执行工具调用或真实代码修改。
- `judge-basic/auth.response-context --docker --mock-agent --judge-command "node scripts/judge/static-judge.mjs"` 通过并生成 passed 报告。
- 外部评估仓库 `npm run ci` 通过，包括文档骨架、仓库基础卫生、GitHub Action 固定 SHA、TypeScript typecheck 和 18 个测试文件 / 34 条测试。
- ActSpace `packages/agent-cli` 目标测试通过，3 个测试文件、7 条测试。
- ActSpace `packages/agent-core` 权限模式目标测试通过，3 个测试文件、25 条测试。
- ActSpace `packages/agent-cli` 和 `packages/agent-core` package-local TypeScript 检查通过。
