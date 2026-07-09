## [2026-07-09 17:50] | Task: Agent 评估后处理产物采集

### User Request

- 继续完成 ActSpace Agent 评估执行计划。
- 补齐执行结果和上下文质量评分所需的评估证据，让 mock/scripted E2E 不再依赖手写 `command-results.json` 和 `git-diff.patch`。

### Changes

- ActSpace `packages/agent-cli`：
  - 在 `--out` 模式下新增 `context-snapshots/001-final.json`。
  - 快照来自 Agent loop 返回的真实 `messages`，用于上下文质量评分。
  - 不改变未传 `--out` 时不写评估产物的行为。
- 外部 `actspace-agent-eval` 仓库：
  - 新增 post-run artifact 采集模块。
  - Agent 命令成功后，在一次性 workspace 中执行 case `verifyCommands`。
  - 写出 `command-results.json`。
  - 使用 `git diff --no-index` 对比 fixture 原件和一次性 workspace。
  - 写出路径归一化后的 `git-diff.patch`。
  - `runCase` 接入后处理链路，mock command E2E 现在通过真实后处理生成执行评分证据。
  - 命令执行器支持 `env`，用于 mock command 接收 `{workspacePath}` 等占位符。
- 更新中文设计文档和执行计划，明确：
  - context snapshots 由 ActSpace CLI 写出。
  - verification command 和 diff artifacts 由 eval runner 后处理写出。
  - 真实 live model 仍不进入默认 CI。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - 目标测试 `npm test -- src/test/post-run-artifacts.test.ts src/test/run-case-e2e.test.ts` 通过。
  - `npm run ci` 通过，13 个测试文件、25 条测试。

### Notes

- ActSpace 仓库侧 `pnpm --filter @actspace/agent-cli test/build` 仍被本机依赖重装和 registry DNS 限制阻断：
  - `pnpm` 触发重建 `node_modules`。
  - `registry.npmjs.org` 返回 `ENOTFOUND` 并进入长时间重试。
  - 为避免进程长时间挂起，本轮手动中断。
- Docker daemon 仍未运行，真实容器级 `--mock-agent` 闭环待 Docker 可用后复验。
