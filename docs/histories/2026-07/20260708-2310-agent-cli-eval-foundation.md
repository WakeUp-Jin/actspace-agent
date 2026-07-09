# Agent CLI Eval Foundation

## 用户诉求

继续推进 Agent 评估执行计划，先完成 ActSpace 侧的 `agent-cli` 最小闭环：CLI run 命令、`--out` artifact 契约、事件采集和 `yolo` 权限模式初版。

## 变更

- 新增 `packages/agent-cli` workspace package。
- 增加 `actspace-agent run` CLI 入口。
- 支持 `--input` / `--input-file`、`--workspace`、`--permission-mode`、`--json`、`--out`、`--mock`。
- 默认不写 eval artifacts；只有显式传入 `--out` 时写入 `result.json`、`trace.jsonl`、`final-response.md`。
- 通过现有 `AgentEventSink` 采集 Agent 运行事件并写入 JSONL trace。
- 增加 CLI 级 `yolo` auto approval gate 初版：workspace-local request 自动批准，显式 workspace 外路径拒绝。
- 将根 `build` / `clean` 脚本纳入 `@actspace/agent-cli`。
- 更新 `docs/exec-plans/active/20260708-agent-evaluation/README.md` 的 Phase 1 状态。
- 更新外部 `actspace-agent-eval` 项目的 `README.md`、`docs/ARCHITECTURE.md`、`AGENTS.md`，将模板占位内容替换为评估仓库真实说明。
- 标记执行计划 Task 2.1 完成。

## 设计说明

- 这一轮只完成 ActSpace 侧 CLI 基础，不实现外部 `actspace-agent-eval` Docker runner。
- `yolo` 目前仍是 CLI 层初版，不是完整共享 runtime policy；后续需要继续下沉到 `agent-core` 和桌面端模式切换。
- `--out` 保持显式开关，避免普通 CLI 或桌面端执行产生评估文件。

## 验证

- `pnpm --filter @actspace/agent-cli test`
- `pnpm --filter @actspace/agent-cli build`
- `node packages/agent-cli/dist/cli.js run --input "Say hi" --workspace /private/tmp --mock`
- `node packages/agent-cli/dist/cli.js run --input "Say hi" --workspace /private/tmp --mock --json --out /private/tmp/actspace-agent-cli-smoke-out`
- 在外部 `actspace-agent-eval` 仓库运行 `npm run ci`

## 影响文件

- `package.json`
- `packages/agent-cli/package.json`
- `packages/agent-cli/tsconfig.json`
- `packages/agent-cli/src/cli.ts`
- `packages/agent-cli/src/run.ts`
- `packages/agent-cli/src/args.ts`
- `packages/agent-cli/src/artifacts.ts`
- `packages/agent-cli/src/event-collector.ts`
- `packages/agent-cli/src/permission.ts`
- `packages/agent-cli/src/types.ts`
- `packages/agent-cli/src/test/*.test.ts`
- `docs/exec-plans/active/20260708-agent-evaluation/README.md`
- External side-project: `actspace-agent-eval/README.md`
- External side-project: `actspace-agent-eval/docs/ARCHITECTURE.md`
- External side-project: `actspace-agent-eval/AGENTS.md`
