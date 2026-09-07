# ActSpace Cordis 事件 ABI 与 CLI run 最终验收 — 执行摘要

## 执行状态警告

> 当前批次不能归档为 completed：P05 的 deterministic retry/error fixture 尚未提供。另发现 DSH 事件模型文档与当前 Session Format v1 对 seq 起点的规范矛盾。

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-cordis-event-abi-final-acceptance/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成；P00–P04 有通过证据，P05 BLOCKED

## 验收矩阵

| Gate | 结果 | 关键证据 |
|---|---|---|
| P00 Session Journal | PASS（按当前 v1） | `CORE_EVENT_TYPES` 恰好 13 项；Journal 9/9、Persistence 34/34；真实 Journal header/seq/replay/accessState；secret scan CLEAN |
| P01 Cordis dispatch | PASS | Cordis 20 passed、1 个明确 skipped real Loader smoke；9 个 intervention 与 5 个 notification 声明存在 |
| P02 Agent Loop / ToolRuntime | PASS | Agent Loop 4/4、ToolRuntime 17/17、Headless 2/2；真实 provider 完成 read_file 两步 loop 和 durable tool/result |
| P03 Scope / Subject / Lifecycle | PASS | core-agent dispatch 11/11、scope 18/18、runtime lifecycle 自动化通过；two-agent isolation/observer failure 测试通过 |
| P04 EventHub removal | PASS | source + built dist 扫描无 EventHub/createEventHub/eventEmitter/EventContext 运行时命中 |
| P05 CLI run / replay / clean-room | BLOCKED | no-tool、tool、resume/replay、SIGINT、clean-room 已通过；deterministic retry/error fixture 未覆盖 |

## 真实 provider 证据

### 插件启动与路由

- Provider：使用配置的真实 DeepSeek endpoint；模型请求头为 `deepseek-v4-flash`，不是 mock adapter。
- 成功 Session `47cef122-ec63-4393-8cab-749f4030f4e5` 的 header 声明 `actspace.kernel@2.0.0`、`actspace.core@2.0.0`、`profileId=actspace.default`、`runtimeContractVersion=actspace.runtime.v2`、manifestDigest 和 codecSetDigest。
- 成功工具 Session `0c83b861-4091-46fa-999c-c0d072812686` 的 request/context 显示 18 个可用工具，且上下文脱敏检查无 key/authorization/Bearer 命中。

### Agent Loop 与工具

- no-tool：`REAL_PROVIDER_OK`，1 step，正常 `turn/end` 与 `session/end-seed`。
- resume：同一 sessionId 返回 `REAL_RESUME_OK`，turn/step/message/event 计数递增且 seq 连续。
- tool：模型先输出 tool call，ToolRuntime 以 `actspace.core-tools/read_file` 执行，结果 `status=completed`，第二个 step 读取结果后返回 `TOOL_READ_OK`；没有文件写入。
- 观察：`--jsonl` live projection 没有单独输出 `tool/result`，而是由 durable Journal/snapshot 提供完整工具事实；live `throughJournalSeq` 在运行中保持 `-1`，最终 snapshot 才返回正确 checkpoint。这不影响本轮 durable/replay 结论，但若 CLI 消费者需要实时工具进度或 cursor，应另开观察面修正。

### 持久化事件顺序（tool Session）

```text
session/title-set
agent/inbox/spliced (enqueue)
agent/inbox/spliced (claim)
turn/start
step/start
request/header
request/context
assistant/chunk*
assistant/message (finishReason=tool-calls)
tool/call
tool-workflow/run-start
tool/result (completed)
step/end (tool-use)
step/start
request/header
request/context
assistant/chunk*
assistant/message (finishReason=stop)
step/end (completed)
turn/end
session/end-seed
```

该 Journal 的 event seq 为 0–91 严格连续；末尾 `session/end-seed.lastSeq=90`，与当前 Session Format v1 的 checkpoint 语义一致。

## clean-room 证据

隔离副本：`/private/tmp/actspace-clean-room.LyP2Yu`

- `pnpm install --frozen-lockfile`：PASS（在线补齐 `esbuild@0.21.5`）
- `pnpm --filter @actspace/runtime... build`：PASS
- `pnpm --filter @actspace/agent-cli build`：PASS
- `pnpm run typecheck`：PASS
- `pnpm test`：PASS，Desktop 522/522，CLI 14/14
- `pnpm run test:agent-cli:process`：PASS，2/2，SIGINT exit 130
- `pnpm run check:packages`：PASS
- `pnpm run check:package-cutover -- --strict`：PASS，0 findings
- `pnpm run check:v2-legacy-removal -- --strict`：PASS
- 构建产物 EventHub 扫描：PASS，无旧运行时引用
- 隔离 CLI mock smoke：PASS，`ok:true,status:completed`

## 已知风险和遗留事项

- **P05 retry/error**：需要补一个 deterministic CLI fixture 或可复现 process fixture，覆盖 `agent/request-error` 的 retry/abort/escalate decision 与 `llm/retry*` durable events；补齐前不可归档最终计划。
- **seq 规范冲突**：DSH event model 写从 1 开始，Session Format v1 写从 0 开始且实现/测试均从 0 开始。需要确认是否以当前 v1 为最终 ActSpace ABI，或调整实现与全部 golden/test。
- **provider env 权限**：`/Users/wakeup-jin/.config/actspace/cli-real.env` 当前为 `0644`。建议用户在本机执行 `chmod 600`；本轮未修改用户目录凭据文件。
- **成本统计**：provider 返回的 usage 已落盘；当前 adapter 的 `cost=0` 不应被解释为实际账单为零。
- **live 观察面**：实时 JSONL 目前不是 durable event 的一一映射；工具事件和 journal cursor 以最终 snapshot/Journal 为准。

## 后续建议

1. 先决定 seq 起点规范，并同步两份设计文档或实现测试。
2. 在 CLI mock adapter 增加 deterministic tool/retry/error fixture（不修改 read/list 等 executor body），再重跑 P05。
3. 将 real-provider smoke 保留为补充人工验收，不把它当作 deterministic retry/error 的替代。
