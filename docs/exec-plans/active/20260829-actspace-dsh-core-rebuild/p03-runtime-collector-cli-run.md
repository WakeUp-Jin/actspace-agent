# P03：Runtime Collector 与单次 CLI run

状态：完成候选（P03 已实施，待计划归档）

## 目标与依赖

把 Session firehose、Agent/Hook 通知和现有 Tool progress 接到 Runtime-level collector，完成单次无头 `cli run`：一次 boot、一次输入入队、等待 Agent idle/quiescent、flush、dispose 和稳定退出。依赖 P02；Session `session/event` 的产生和 13-event persistence 由外部 Session 会话提供。

## 文件范围

- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/run-controller.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/runtime/src/runtime/shutdown.ts`
- `packages/runtime/src/projection/live-progress.ts`
- `packages/runtime/src/projection/cursor-stream.ts`
- `packages/runtime/src/test/`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `apps/cli/src/runtime-v2/types.ts`
- `apps/cli/src/test/`
- 不修改 `packages/session/**` 和具体 Tool executor；只调用既有 `append/flush/session/event` 与 ToolRuntime 公共接口。

## 步骤

1. Runtime 每个进程只 boot 一个 root，创建/恢复 Session，公开 Agent lookup、`followup`、wait idle/quiescent、flush 和 dispose；不再在 `runTurn()` 内隐式 new AgentLoop。
2. Collector 在 root Context 订阅 `session/event`、5 个主要通知和既有 Tool progress，生成统一 live/projection cursor；CLI 不直接读取 AgentLoop 私有 liveSeq。
3. `apps/cli` 的 `run` 改为 boot → Session create/resume → `agent.followup()` → wait idle → flush → dispose；stdout 只输出协议 JSONL，diagnostics 进入 stderr。
4. 保持当前 `--json`/`--jsonl` 用户可见包装，但事件来源改为 collector；通知丢失时允许从 Session replay 重建 projection，CLI 不补写事实。CLI 与 Desktop 默认共享平台 `ActSpace` data root，显式 `--data-dir` / `ACTSPACE_DATA_DIR` 可覆盖。
5. 覆盖 fresh/resume、no-tool/tool、retry/error/abort、SIGINT、followup 入队失败、flush 超时、dispose 超时、stdout 污染和稳定 exit code。

## 验证命令

```bash
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/runtime typecheck
pnpm --filter @actspace/agent-cli typecheck
pnpm test:agent-cli:process
```

通过标准：一次 CLI run 只创建一个 Runtime 和一个 main Agent driver；`followup()` 返回后仍等待 idle/quiescent；flush 完成后才退出；工具 executor 的 stdout 不进入协议输出；`session/event` 完整流由 Session 提供且没有第二个 writer。

## 失败与回退

若 collector 漏事件，优先从 Session replay 修复投影，不在 CLI 添加事实源。若新 run 入口无法稳定退出，Host 可暂时切回旧 run 选择，但不得同时启动两套 Runtime 或删除 Session 数据。
