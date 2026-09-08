# P05：CLI run、replay 与 clean-room 验收单

关联总计划：[README.md](./README.md)

状态：BLOCKED（no-tool/tool/replay/SIGINT/clean-room 已通过；deterministic retry/error fixture 尚未提供）

## 验收目标

证明 CLI 单次无头任务使用唯一生产 Profile 启动结果与 headless.runner 完成 boot → run → flush → dispose，Session 可以从 Journal replay，SIGINT 能稳定退出，并且当前脏工作区不会被破坏性 clean checkout 操作影响。

## 目标文件

- `apps/cli/src/args.ts`
- `apps/cli/src/cli.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/cli/src/runtime-v2/llm-adapter.ts`
- `apps/cli/src/test/runtime-v2.test.ts`
- `apps/cli/src/test/runtime-v2-host-parity.test.ts`
- `scripts/test/agent-cli-process.test.mjs`
- `packages/runtime/src/runtime/session-controller.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/session/persistence/src/session-store.ts`
- `packages/session/persistence/src/session.ts`

## CLI 必须检查

1. 默认 run 是 ephemeral；`--persist` 写入 `dataRoot/sessions-v2/<sessionId>/journal.jsonl`；`--resume <sessionId>` 继续同一 Session。
2. stdout 的 JSON/JSONL 是稳定协议，diagnostic 不混入 stdout；notification observer 失败不改变业务 exit code。
3. SIGINT 返回 130，已提交 chunk/result 保留，二次 SIGINT 不留下悬挂进程。
4. no-tool、tool、retry、error、abort 都必须有确定性 fixture 或 process 证据。当前 `apps/cli/src/runtime-v2/llm-adapter.ts` 的基础 mock 只覆盖成功文本和 abort，不能冒充 tool/retry/error 覆盖。

## CLI 命令

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/agent-cli build
pnpm run test:agent-cli:process
```

然后使用总计划 README 第 10 节的 ephemeral、persistent/resume 和 mock CLI 命令，保存 JSON 结果与 Journal 路径。

## Replay 必须检查

使用 `RuntimeSessionController.inspect()`、`inspectEvents()` 或现有 Journal golden tests，从 `journal.jsonl` 重建 snapshot、surface、relations 和 accessState。人为让一个 notification listener throw/reject 后，仍需证明已提交事件可 inspect；live notification 到达不能作为 replay 证据。

## clean-room 必须检查

不能在原工作区运行 `git clean -fdx` 或 `git reset --hard`。使用明确的临时目录复制当前工作区，排除 `.git`、`node_modules`、`dist`、`.turbo`、`.vite`、`coverage`、`.env` 和 `.env.local`，然后在副本内执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @actspace/runtime... build
pnpm run typecheck
pnpm test
pnpm run check:packages
pnpm run check:package-cutover -- --strict
pnpm run check:v2-legacy-removal -- --strict
pnpm --filter @actspace/agent-cli build
node apps/cli/dist/cli.js run --input 'isolated cli smoke' --mock --workspace "$CHECK_ROOT" --data-dir "$CHECK_ROOT/.acceptance-data" --json
```

这证明的是当前工作区快照可复现，不是远端 Git commit 的 clean checkout。若要证明远端 clean checkout，必须另有包含实现的 commit；提交不在本验收单范围。

## 通过证据

P05 必须同时附：CLI JSON 结果、Session Journal 摘要、replay snapshot、SIGINT process test 结果、隔离副本命令日志、产物扫描结果和未覆盖外部边界。任何 tool/retry/error/replay/clean-room 项缺失时，P05 标记 BLOCKED，不能把总计划归档到 completed。
