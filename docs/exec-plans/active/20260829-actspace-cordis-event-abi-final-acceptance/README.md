# ActSpace Cordis 事件 ABI 与 CLI run 最终验收计划

状态：部分完成（P00–P04 已有通过证据；P05 因 deterministic retry/error fixture 缺失保持 BLOCKED）

日期：2026-08-29

执行模式：交互模式。其他子 Agent 完成实现后，由主 Agent 按本计划逐项复核；任何一个必选门禁未通过，都不能把 P00–P05 标记为整体完成。

## 1. 这份计划解决什么问题

前一轮已经按 P00–P05 拆分了 DSH/Cordis 重构，但“实现已完成”和“最终可验收”被混在了一起。尤其当前工作区存在大量用户已有的未提交、未跟踪和删除中的改动，不能直接在原工作区执行 `git clean`、`git reset` 或以“当前目录看起来能跑”为 clean checkout 证据。

这份计划是主 Agent 的最终验收作业单，不重新设计实现，也不要求主 Agent 重新修改工具 executor。它要回答四个问题：

1. Session Journal 是否真的以 DSH 的 13 种核心持久化事件为内核，并能 replay/recovery；
2. Agent Loop 是否真的通过 Cordis Context 提供 9 个干预点，而不是留下第二套 EventHub；
3. 5 个主要通知是否只承担观察职责，失败不会破坏已提交事实；
4. CLI `run` 单次无头任务是否能稳定 boot → run → flush → dispose，且源代码、构建产物和隔离副本都没有旧事件总线可达路径。

## 2. 背景与事实来源

### 2.1 用户已确认的边界

- 本轮只验收 CLI `run` 的单次无头任务；CLI `chat` 不在本计划范围。
- 工具的 definition、schema、read/list/edit/write/bash/Browser Bridge 等具体 executor 行为是 ActSpace 资产，不因事件重构而改写。
- 工具权限、审批、事件收集、ToolRuntime 外壳和 Cordis 接入可以重构，但必须做行为 parity。
- 旧 EventHub 不需要兼容保留；终态应直接使用真实 Cordis Context。
- `goal/change`、`schedule/change` 可以有 codec/replay 目录，但当前没有 producer，不得把“有 codec”误报成业务能力已实现。

### 2.2 设计真源

- [DSH 风格 Session 事件模型](../../../design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md)
- [Agent Loop Cordis 插入面与通知面](../../../design-docs/agent-plugin-runtime/agent-spec-agent-loop-cordis-surface.md)
- [Cordis 原生事件 ABI 与 EventHub 退役规范](../../../design-docs/agent-plugin-runtime/agent-spec-cordis-event-abi-and-eventhub-retirement.md)
- [Tool Runtime 内核与外壳边界](../../../design-docs/agent-plugin-runtime/agent-spec-tool-runtime-boundary.md)
- [Agent v2 测试策略](../../../design-docs/agent-plugin-runtime/agent-testing.md)
- `tmp/deepseek-harness/packages/core/session/src/types.ts`
- `tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts`
- `tmp/deepseek-harness/docs/persistence-catalog.md`
- `/Users/wakeup-jin/Downloads/session/干预主链和相关通知.md`

### 2.3 当前运行入口

~~~text
CLI 解析与进程输出
  apps/cli/src/args.ts
  apps/cli/src/cli.ts
        |
        v
单次无头 run
  apps/cli/src/runtime-v2/run.ts
        |
        v
Host 组装、LLM adapter、Runtime boot
  apps/cli/src/runtime-v2/host-adapter.ts
  apps/cli/src/runtime-v2/llm-adapter.ts
  packages/runtime/src/runtime/boot.ts
        |
        v
Profile Boot / Headless Runner / Agent Loop
  packages/runtime/src/runtime/runtime-handle.ts
  packages/runtime/src/runtime/session-controller.ts
  packages/headless/src/runner.ts
  packages/core/agent-loop/src/loop.ts
        |
        +--> Cordis Context: packages/cordis-adapter/src/{event-contract.ts,dispatch.ts}
        +--> Session Journal: packages/session/journal/src/{core-codecs.ts,journal.ts}
        +--> Session persistence: packages/session/persistence/src/{session-store.ts,session.ts}
        +--> Tool shell: packages/tools/runtime/src/{prepared-execution.ts,registry.ts}
~~~

本计划涉及的文件超过 8 个，主 Agent 必须按包边界和下面的证据矩阵执行，不能只运行一个根目录命令后下结论。

## 3.5 批次子计划

本目录是一批验收计划的统一入口。主 Agent 先读本 README，再按 P00 → P05 的顺序执行对应验收单：

| 验收单 | 文件 | 责任边界 |
|---|---|---|
| P00 | [p00-session-journal-acceptance.md](./p00-session-journal-acceptance.md) | 13 个核心 Session 事件、codec、Journal append/replay/recovery |
| P01 | [p01-cordis-dispatch-acceptance.md](./p01-cordis-dispatch-acceptance.md) | 9 个 Cordis 干预事件、waterfall/serial/parallel/contained emit |
| P02 | [p02-agent-loop-tool-runtime-acceptance.md](./p02-agent-loop-tool-runtime-acceptance.md) | Agent Loop、ToolRuntime 外壳和既有工具行为 parity |
| P03 | [p03-scope-subject-lifecycle-acceptance.md](./p03-scope-subject-lifecycle-acceptance.md) | Scope、Subject、插件 effect 和 Runtime 生命周期 |
| P04 | [p04-eventhub-removal-acceptance.md](./p04-eventhub-removal-acceptance.md) | EventHub 物理删除、源码/导出/构建产物无旧路径 |
| P05 | [p05-cli-run-replay-clean-room-acceptance.md](./p05-cli-run-replay-clean-room-acceptance.md) | CLI run、resume、SIGINT、replay、隔离副本和最终门禁 |

## 3. 验收对象清单

### 3.1 Session 的 13 种核心持久化事件 `[S]`

唯一清单位于 `packages/session/journal/src/core-codecs.ts` 的 `CORE_EVENT_TYPES`，必须保持恰好 13 项：

~~~text
turn/start
turn/end
step/start
step/end
user/message
assistant/chunk
assistant/message
tool/call
tool/result
todo/write
request/header
request/context
session/end-seed
~~~

验收重点不是“数组长度为 13”而已，还要证明：codec 唯一、Envelope 校验、`seq` 单调、append 后可重放、崩溃恢复不重写历史，`session/end-seed` 只用于正常 flush/dispose 收尾。

### 3.2 Agent Loop 的 9 个 Cordis 干预事件 `[I]`

唯一声明位于 `packages/cordis-adapter/src/event-contract.ts` 的 `AgentLoopIntervention`，必须按下列模式和语义存在：

| 事件 | 模式 | 必须证明 |
|---|---|---|
| `system-prompt/assemble` | waterfall | 能包装或替换 prompt assembly |
| `agent/pre-step` | waterfall | 能改写 step context 或短路 |
| `agent/request` | waterfall | `next()` 是真实 continuation，可包装 request |
| `llm/stream` | waterfall | 包围完整 `AsyncIterable`，不是 chunk observer |
| `agent/request-error` | waterfall | 能返回 retry/abort/escalate decision |
| `tools/pre-execute` | waterfall | 权限前可改写 policy/args，改写后重新校验 |
| `tools/execute` | waterfall | 包装既有 executor shell，不替换工具业务语义 |
| `tools/post-execute` | waterfall | 在 result commit 前规范化、脱敏 |
| `agent/turn-stopping` | serial | 首个 bail value 阻止后续 listener |

### 3.3 Session 的 5 个主要通知事件 `[N]`

唯一声明也位于 `event-contract.ts` 的 `AgentNotification`：

~~~text
agent/session-start
agent/status
agent/error
tools/result
session/event
~~~

前四个是 contained notification；`session/event` 必须在 Journal append commit 后发布。通知 listener 的 throw/rejection 不能回滚已提交事件，也不能阻塞其他 listener。`session/flush` 是 checkpoint 语义，不计入这 5 个主要通知。

### 3.4 可持久化扩展，不等于核心 13 项

在 `packages/session/journal/src/core-codecs.ts` 的 `PERSISTED_EXTENSION_EVENT_TYPES` 中核对以下目录：

- LLM：`llm/retry`、`llm/retry-started`；
- compaction：`compaction/start`、`compaction/summary`、`compaction/prune`、`compaction/end`；
- approval/permission：`approval/asked`、`approval/decided`、`approval/policy`、`permission/preset`；
- hook/command：`hook/invoked`、`hook/result`、`command/run`、`command/done`；
- tool workflow：`tool-workflow/*`、`tool/code-dispatch*`；
- agent/delegation：`agent/inbox/spliced`、`subagent/descriptor`、`delegation/*`；
- mode/plan：`plan/mode`、`sandbox/mode`、`goal/change`、`schedule/change`；
- session/user：`session/title*`、`session/pinned-set`、`session/archived-set`、`session/workspace-set`、`feedback/record`；
- recovery/surface：`recovery/*`、`surface/replaced`。

验收时要区分“可 replay 的 codec 已存在”和“当前已有 producer”。`goal/change`、`schedule/change` 只验 codec、未知事件策略和 replay，不验不存在的业务入口。

## 4. P00：Typed Events 与 Session Journal 契约

重点文件：

- `packages/session/journal/src/core-codecs.ts`
- `packages/session/journal/src/event-envelope.ts`
- `packages/session/journal/src/invariant-validator.ts`
- `packages/session/journal/src/codec-registry.ts`
- `packages/session/journal/src/journal.ts`
- `packages/session/journal/src/test/journal.test.ts`
- `packages/session/persistence/src/session-store.ts`
- `packages/session/persistence/src/session.ts`
- `packages/session/persistence/src/recovery.ts`
- `packages/session/persistence/src/test/golden/acceptance.test.ts`
- `packages/session/persistence/src/test/recovery-fork.test.ts`

通过标准：

- `CORE_EVENT_TYPES` 恰好 13 项，名称与第 3.1 节完全一致；
- 13 项和扩展项都有唯一 codec，非法 payload、缺 codec、断 seq、损坏尾部按 fail-closed/browse-only 规则处理；
- `SessionJournal` seed 后的 projection 与原始 append 相同；recovery/fork/compaction 不覆盖原记录；
- `onEvent` 只在 writer append/fsync 后触发，通知失败不影响 durable journal；`onFlush` 只在 batch flush 后触发。

证据命令：

~~~sh
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/session-journal typecheck
pnpm --filter @actspace/session-persistence typecheck
~~~

## 5. P01：真正的 Cordis dispatch

重点文件：

- `packages/cordis-adapter/src/event-contract.ts`
- `packages/cordis-adapter/src/dispatch.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/index.ts`
- `packages/cordis-adapter/tests/cordis-lifecycle.spec.ts`
- `packages/cordis-adapter/tests/lifecycle.spec.ts`
- `packages/cordis-adapter/tests/service-contract.spec.ts`

通过标准：

- Waterfall 顺序是 outer → inner → built-in，handler 的最后参数是真实 `next()`；不调用 `next()` 时下游不执行；
- `serial` 按注册顺序执行并在首个非空 bail value 处停止；`parallel` 等待所有 listener settlement；
- `emitContained` 中同步 throw 和异步 rejection 都被逐 listener 隔离，兄弟 listener 仍执行；
- `packages/cordis-adapter/src/events.ts` 不存在，不能通过别名、空壳或字符串 adapter 复活 EventHub。

证据命令：

~~~sh
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/cordis-adapter typecheck
~~~

## 6. P02：Agent Loop / Tool Runtime 接入

重点文件：

- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/core/agent-loop/src/test/service.test.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/tools/runtime/src/registry.ts`
- `packages/tools/runtime/src/test/runtime.test.ts`
- `packages/headless/src/runner.ts`
- `packages/headless/src/plugin.ts`

通过标准：

- Agent Loop 直接拿 Cordis Context 或 scoped carrier，不接收 `EventHub`、`eventEmitter` 或手工 listener registry；
- `llm/stream` 替换的是完整 stream，`agent/request-error` 的 decision 能真正改变 retry/abort 路径；
- Tool Runtime 的 `pre-execute → execute → post-execute` 围绕现有 executor body，权限/审批 fail closed，最终只提交一次 `tool/call` 和一次 `tool/result`；
- read/list/edit/write/bash/Browser Bridge 的参数、路径安全、排序、截断、artifact、redaction、退出码和副作用 parity 测试不回归；
- executor 不直接污染 CLI stdout，通知只从统一 runtime/session seam 发布。

证据命令：

~~~sh
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/headless test
pnpm --filter @actspace/core-agent-loop typecheck
pnpm --filter @actspace/tools-runtime typecheck
pnpm --filter @actspace/headless typecheck
~~~

## 7. P03：Scope、Subject 与 Lifecycle

重点文件：

- `packages/core/scope/src/scope.ts`
- `packages/core/scope/src/test/scope.test.ts`
- `packages/core/scope/src/test/lifecycle.test.ts`
- `packages/core/agent/src/registry.ts`
- `packages/core/agent/src/test/registry.test.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/session-plugin.ts`
- `packages/runtime/src/runtime/agent-runtime-lifecycle.test.ts`

通过标准：

- Agent、Session、Tool execution 的 subject 与 scope carrier 成对绑定；不能拿 Agent A 的 subject 配 Agent B 的 scope；
- parent scope 可按规则观察 child，child 不会收到 sibling 或未授权 descendant 的干预；
- 两个 Agent 并行运行时事件不串线；
- plugin fiber dispose 后 listener、timer、lease、in-flight dispatch 都能收束，重复 dispose 幂等；
- Runtime boot partial failure 按逆序清理，`stopAcceptingWork → flush → close → Cordis dispose` 顺序可被测试或日志证明。

证据命令：

~~~sh
pnpm --filter @actspace/core-scope test
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/core-scope typecheck
pnpm --filter @actspace/core-agent typecheck
pnpm --filter @actspace/runtime typecheck
~~~

## 8. P04：删除 EventHub 和旧调用点

重点文件与目录：

- 必须删除：`packages/cordis-adapter/src/events.ts`
- 必须删除：旧 `packages/cordis-adapter/tests/events.spec.ts`
- `packages/cordis-adapter/src/index.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/headless/src/runner.ts`
- `packages/headless/src/plugin.ts`
- 全部 `apps/`、`packages/`、`scripts/` 运行时源码与 package exports

通过标准：

- `EventHub`、`createEventHub`、`createCordisEventHub`、`eventEmitter`、`EventContext` 不再出现在运行时路径；
- 不存在旧 `activate()` 事件适配器、字符串 payload bridge、第二套 listener registry；
- 构建产物 `dist/` 也不含旧运行时路径；
- `check:package-cutover -- --strict`、`check:v2-legacy-removal -- --strict` 均通过；
- 不删除用户 Session 数据、不修改具体工具 executor、不触碰与本次重构无关的 dirty-worktree 文件。

证据命令：

~~~sh
rg -n 'EventHub|createEventHub|createCordisEventHub|eventEmitter|EventContext' apps packages scripts
pnpm run check:package-cutover -- --strict
pnpm run check:v2-legacy-removal -- --strict
pnpm run check:packages
~~~

`rg` 允许命中历史设计文档或测试负向 fixture，但任何命中都必须在验收记录中标注“文档/fixture”还是“运行时可达源码”，不能只看命中数量。

## 9. P05：CLI run、replay、隔离副本与仓库验收

重点文件：

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

通过标准：

- `run` 使用生产 Profile 与 Headless runner 完成 boot、headless run、session flush、`session/end-seed`、dispose 和稳定退出；
- 默认 run 是 ephemeral；`--persist` 写入 `dataRoot/sessions-v2/<sessionId>/journal.jsonl`；`--resume <sessionId>` 继续同一 Session；
- SIGINT 返回 130，保留已经提交的 chunk/result，并且第二次 SIGINT 不留下悬挂进程；
- CLI stdout 的 JSON/JSONL 是稳定协议，diagnostic 不混入 stdout，observer 失败不改变业务 exit code；
- replay 使用 `RuntimeSessionController.inspect()` / `inspectEvents()` 或现有 Journal golden tests 从持久化事件重建 snapshot，不能把 live notification 当恢复证据；
- no-tool、tool、retry、error、abort 五种路径都有确定性证据。当前 `apps/cli/src/runtime-v2/llm-adapter.ts` 的 `--mock` 只产生成功文本或 abort，不产生 tool/retry/error；因此不能用单一 `--mock` happy path 冒充后三种覆盖，必须使用已有 fake/fixture 或明确记录为阻塞。

## 10. CLI 单次无头验收步骤

以下命令从仓库根目录执行。先建立 Runtime 依赖闭包，再构建 CLI，避免只构建 app 导致消费旧 `dist`：

~~~sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/agent-cli build
~~~

### 10.1 Ephemeral no-tool

~~~sh
WORKSPACE=$(mktemp -d /tmp/actspace-cli-work.XXXXXX)
DATA_ROOT=$(mktemp -d /tmp/actspace-cli-data.XXXXXX)
node apps/cli/dist/cli.js run \
  --input 'cordis no-tool smoke' \
  --mock \
  --workspace "$WORKSPACE" \
  --data-dir "$DATA_ROOT" \
  --json
~~~

必须观察：`status=completed`、`exitCode=0`、`ok=true`、`steps=1`；`DATA_ROOT/sessions-v2` 不应因未传 `--persist` 而产生 durable Session。

### 10.2 Persistent + resume

~~~sh
FIRST=$(node apps/cli/dist/cli.js run \
  --input 'first persistent turn' \
  --mock \
  --persist \
  --workspace "$WORKSPACE" \
  --data-dir "$DATA_ROOT" \
  --json)
SESSION_ID=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.sessionId)' "$FIRST")
test -s "$DATA_ROOT/sessions-v2/$SESSION_ID/journal.jsonl"
rg -n '"recordKind":"header"|"type":"turn/start"|"type":"request/header"|"type":"assistant/chunk"|"type":"session/end-seed"' "$DATA_ROOT/sessions-v2/$SESSION_ID/journal.jsonl"
node apps/cli/dist/cli.js run \
  --input 'second resumed turn' \
  --mock \
  --resume "$SESSION_ID" \
  --workspace "$WORKSPACE" \
  --data-dir "$DATA_ROOT" \
  --json
~~~

必须观察：resume 使用原 `sessionId`，message/event 数量增长，Journal 仍保持连续 seq 和可验证尾部。

### 10.3 SIGINT process smoke

~~~sh
pnpm run test:agent-cli:process
~~~

该测试对应 `scripts/test/agent-cli-process.test.mjs`，必须同时覆盖一次 SIGINT 和二次 SIGINT；结果是进程正常退出且 code=130，不是被 SIGINT signal 杀死。

### 10.4 Tool / retry / error 的证据规则

当前 mock adapter 不生成 tool call 或 retry/error stream。主 Agent 必须先检查：

- `apps/cli/src/runtime-v2/llm-adapter.ts` 是否已有 deterministic fixture switch；
- `packages/core/agent-loop/src/test/` 是否已有 fake LLM stream 和 request-error decision fixture；
- `packages/tools/runtime/src/test/runtime.test.ts` 是否已有 tool shell / approval / cancellation fixture。

若已有 fixture，执行对应 package tests，并把 fixture 名称、输入、输出 Journal 类型写入验收记录。若没有 fixture，P05 的 tool/retry/error 门禁保持“未通过/阻塞”，不得用真实网络临时替代，也不得把只有 no-tool 的 CLI 结果写成全场景通过。

## 11. Replay 与持久化证据

Replay 的目标是证明“通知可以丢，事实不能丢”：

~~~mermaid
sequenceDiagram
    participant L as Agent Loop
    participant J as SessionHandle/Journal
    participant W as JSONL Writer
    participant N as session/event observer
    participant R as RuntimeSessionController.inspect
    L->>J: append(candidate)
    J->>W: validate + append + fsync
    W-->>J: commit success
    J-->>N: post-commit notification
    N--xJ: observer may fail
    R->>W: read journal.jsonl
    W-->>R: header + envelopes
    R->>R: project snapshot / relations / surface
~~~

主 Agent 必须保存以下证据：

1. `journal.jsonl` 的 header、event seq、event type、`session/end-seed`；
2. `SessionStore.inspect(sessionId)` 的 validation/accessState；
3. `RuntimeSessionController.inspect(sessionId)` 的 snapshot；
4. `inspectEvents(sessionId)` 与原始 Journal 的事件类型/seq 一致；
5. 人为让一个 notification listener throw/reject 后，业务 run 仍完成或按业务错误结束，且 Journal 可正常 inspect。

## 12. clean-room 隔离验收

### 12.1 为什么不能直接 clean checkout

当前主工作区包含大量已有用户修改，且有未跟踪新包、删除中的历史文档和其他并行重构。直接运行 `git clean -fdx`、`git reset --hard` 或清空仓库会破坏用户工作，不属于本计划授权范围。

因此主 Agent 应创建一个明确的临时隔离副本。它验证的是“当前工作区快照能否在无本地 `dist`/`node_modules` 依赖的环境中复现”，不会伪称为远端 Git commit 的 clean checkout。若要证明真正的 clean checkout，必须先有一个包含本次实现的 commit；提交不在本计划范围。

### 12.2 隔离副本步骤

~~~sh
REPO_ROOT=/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent
CHECK_ROOT=$(mktemp -d /tmp/actspace-cordis-acceptance.XXXXXX)

rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.turbo' \
  --exclude='.vite' \
  --exclude='coverage' \
  --exclude='.env' \
  --exclude='.env.local' \
  "$REPO_ROOT/" "$CHECK_ROOT/"

cd "$CHECK_ROOT"
pnpm install --frozen-lockfile
pnpm --filter @actspace/runtime... build
pnpm run typecheck
pnpm test
pnpm run check:packages
pnpm run check:package-cutover -- --strict
pnpm run check:v2-legacy-removal -- --strict
pnpm --filter @actspace/agent-cli build
node apps/cli/dist/cli.js run --input 'isolated cli smoke' --mock --workspace "$CHECK_ROOT" --data-dir "$CHECK_ROOT/.acceptance-data" --json
~~~

隔离副本通过条件：依赖从 lockfile 安装，Runtime dependency closure 可构建，typecheck/full test/static cutover 全通过，CLI dist 能启动并完成单次无头任务。验证完成后只允许删除明确的临时目录 `CHECK_ROOT`，不得对原工作区执行清理。

### 12.3 构建产物扫描

在隔离副本构建完成后执行：

~~~sh
rg -n 'EventHub|createEventHub|createCordisEventHub|eventEmitter|EventContext' \
  packages/cordis-adapter/dist \
  packages/core/agent-loop/dist \
  packages/tools/runtime/dist \
  packages/headless/dist \
  packages/runtime/dist \
  apps/cli/dist
~~~

允许命中测试负向 fixture 或文档 bundle 的情况必须单独解释；运行时 JavaScript、package export 和 CLI entry 不得命中。

## 13. 仓库级最终门禁

主 Agent 在原工作区只运行非破坏性检查，并记录哪些失败是本计划问题、哪些是已有 dirty-worktree 漂移：

~~~sh
pnpm run typecheck
pnpm test
pnpm run check:docs
pnpm run check:current-docs
pnpm run check:packages
pnpm run check:package-cutover -- --strict
pnpm run check:v2-legacy-removal -- --strict
git diff --check -- \
  docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance \
  docs/exec-plans/README.md
~~~

`pnpm test` 已包含 `test:package-boundaries` 和 `test:current-docs`；单独运行它们是为了在报告中区分失败来源。`check:docs` 若因其他 active plan 的历史状态漂移失败，不得静默忽略，应记录具体路径和是否与本次 Cordis 验收相关。

## 14. 证据记录格式

主 Agent 应在 `docs/exec-runs/20260829-actspace-cordis-event-abi-final-acceptance/` 创建并维护：

- `execution-process.md`：按时间记录每个门禁、命令、失败和决定；
- `execution-summary.md`：最终逐项列出 P00–P05 的 pass/fail/blocked、证据路径和未覆盖边界。

每条证据至少包含：

~~~text
Gate: P00/P01/P02/P03/P04/P05
Command or fixture:
Exit code:
Observed artifact:
Expected invariant:
Result: PASS | FAIL | BLOCKED | NOT RUN
Failure scope:
Next action:
~~~

只有 P00–P05 必选项全部 PASS，且 clean-room、CLI process、replay、源码/产物扫描均有证据时，才能把计划移动到 `docs/exec-plans/completed/`。存在 BLOCKED 或 NOT RUN 时，计划继续留在 `active/`，并在摘要中说明阻塞原因。

## 15. 不在本次验收范围的门禁

以下事项不能被本计划的 fake/mock 结果替代，也不应被误报为已验收：

- 真实 DeepSeek/Kimi/OpenRouter 网络请求、真实凭据和真实 provider resume；
- 真实工具副作用超出已有 fake parity 的现场验证；
- Browser Bridge、Chrome Extension、Native Messaging；
- Electron 主窗口、preload、IPC、reload/quit 和真实 `userData`；
- macOS DMG、签名、公证、安装和首次启动；
- CLI `chat` 交互体验；
- Goal/Schedule producer、动态不可信插件市场和沙箱。

这些属于后续宿主/发布门禁；本计划的完成只表示 Cordis 事件 ABI、Session 核心、Agent Loop/Tool shell 接入和 CLI 单次无头路径在本地可复现、可重放、可清理验证。

## 16. 风险、停止条件与回退

- 任何旧 EventHub 运行时引用、伪 waterfall、通知阻断 durable commit、scope 串线或 Session seq/replay 失败，都立即停止最终归档。
- Tool parity 失败时只报告 shell/kernel 边界差异，不擅自改写 read/list 等 executor；需要代码修复时另开变更并更新计划。
- clean-room 依赖安装失败时记录网络/lockfile/环境原因，不回退到使用原工作区 `node_modules` 的假验证。
- 原工作区保持不变；隔离副本和 `/tmp` 数据是可删除的临时产物，Session 用户数据不删除、不迁移、不覆盖。

## 17. 主 Agent 交接清单

主 Agent 开始执行时按以下顺序：

1. 先读本文件、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/agent-plugin-runtime/agent-testing.md`；
2. 检查 `git status --short`，确认不对 dirty-worktree 做破坏性操作；
3. 逐包完成 P00–P04 contract/lifecycle/static 检查；
4. 构建 CLI，完成 10.1–10.4 的单次无头和 process smoke；
5. 用 Session Store/RuntimeSessionController 完成 replay 证据；
6. 创建 clean-room 快照，重新安装依赖、构建、测试、扫描产物并执行 CLI smoke；
7. 创建 `docs/exec-runs/...` 两份执行记录，明确每项 PASS/FAIL/BLOCKED；
8. 只有全部必选项 PASS 才能归档计划；否则保留 `active/`，把下一步写成具体失败修复任务。

## 决策记录

- 2026-08-29：将原先混在 P05 里的“实现完成”和“最终验收”分开；本计划只负责主 Agent 的证据闭环。
- 2026-08-29：clean checkout 改为临时隔离副本验证，避免破坏当前工作区；同时明确它不是远端 commit 的证明。
- 2026-08-29：工具 executor body 保持不动，工具验收只检查 ToolRuntime 外壳、权限/审批、事件和结果 parity。

## 2026-09-09 文档复核

DSH 事件模型中的 seq 起点已按当前 Session Format v1、Journal 与实现证据改为从 0 开始；这项是文档校准，不是 ABI 或数据迁移。旧执行摘要保留当时发现冲突的记录。

P05 deterministic retry/error CLI/process fixture 仍待提供；本次未重跑 P00–P05 或真实 Provider，不改变原验收结果，也不满足最终归档条件。
