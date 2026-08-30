# ActSpace Tool Name 全量切换 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-tool-name-contract/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-tool-name-contract/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（本地代码/测试验证完成；真实 Provider smoke 作为凭据门禁推迟）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Agent Tool identity 改为扁平 `name` | `packages/tools/**`, `packages/core/agent-loop/**`, `packages/subagent/**` | Registry、prepared execution、policy、approval、Cordis payload 和 result 使用同一合法名称 |
| Provider wire 改为直接使用 `name` | `packages/llm/service/**`, `packages/llm/pi-ai/**` | OpenAI Chat/Responses、Anthropic、pi-ai 均不再把 namespace 拼进函数名 |
| Session 与 projection 改为 `name` | `packages/session/**`, `packages/runtime/**`, `packages/shared/src/runtime-v2/**` | `tool/call` 与 `tool/result` 要求 `name`，不接受旧 `toolId` fallback |
| Host 与测试夹具收口 | `apps/cli/src/runtime-v2/**`, `apps/desktop/src/main/runtime-v2/**` | CLI/桌面审批、artifact owner、live progress 和 renderer 使用直接名称 |

## 人工验证指引

### 必须验证

1. **名称契约与 Runtime capture**
   - 验证方式：`pnpm --filter @actspace/tools-runtime test`
   - 预期结果：16 tests passed；非法 `plugin/name` 被 admission 拒绝，`read` 可直接 capture。

2. **Session codec 与恢复**
   - 验证方式：`pnpm --filter @actspace/session-journal test && pnpm --filter @actspace/session-persistence test`
   - 预期结果：39 tests passed；`tool/call` / `tool/result` 没有 `name` 或 name 含 `/` 时失败。

3. **CLI 单次无头 mock run**
   - 验证方式：`node apps/cli/dist/cli.js run --input '请简单回答 OK' --model deepseek-chat --json --workspace /tmp --mock`
   - 预期结果：stdout 是单条 JSON，`ok: true`、`status: "completed"`，进程正常退出。

### 建议验证

1. **真实 DeepSeek smoke**
   - 验证方式：在不把 key 写入日志的环境中运行同一 CLI 命令并移除 `--mock`。
   - 预期结果：含工具 schema 的请求中 `function.name` 为 `read_file` 等扁平合法值，不再出现 400 pattern 错误。

2. **CLI v2 Cordis 测试夹具迁移**
   - 验证方式：为 `apps/cli/src/test/runtime-v2.test.ts` 提供 `runtime.runtimeCordisConfigPath()` 对应的 `cordis` 配置后重跑 `pnpm --filter @actspace/agent-cli test`。
   - 预期结果：两项当前因 legacy boot 报错的测试恢复通过。

## Agent 已完成的验证

- `pnpm run typecheck`：通过。
- `pnpm test`：通过；CLI 14 tests、Desktop 522 tests 及 workspace package tests 均通过。
- `pnpm run check:docs`：通过。
- `pnpm run check:current-docs`：通过。
- `pnpm run check:package-cutover`：0 finding(s)。
- 生产代码旧 Agent `toolId` 扫描：无命中；保留 Workspace Open Tool 的独立字段。

## 已知风险和遗留事项

- 全量切换是 breaking ABI（`abiVersion: 2`），旧 Session 不 importer、不双写；部署前必须确认新 Journal 起点。
- 当前真实 Provider 未执行；CLI mock 只能证明 boot、flush 和 JSONL 进程生命周期，不能证明网络服务端接受请求。
- 当前环境未提供真实 Provider credential；真实 DeepSeek 请求仍需人工门禁验证。

## 后续建议

- 先迁移 CLI 测试夹具到 DSH Cordis boot，再运行一次不带 `--mock` 的 DeepSeek smoke。
