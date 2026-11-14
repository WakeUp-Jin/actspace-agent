## [2026-11-13 14:30] | Task: Agent Loop 请求路径：首次请求和重试合成一份，回合的 abort 监听器用完就摘

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）M1、M2、M3 可以；L1 到 L6 都可以修。……都可以按照你的建议去做吧。……继续执行

这是审查修复批次的第 4 个 PR，计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。包含 L5、M2、M1 三个条目，五个提交。

### 🛠 Changes Overview

**Scope:** `packages/core/agent-loop`、`packages/llm/llm-service`、`packages/core/tool-runtime`、`packages/core/runtime`（测试）、`apps/desktop`（一句注释）、`docs/design-docs/agent-plugin-runtime`、`docs/design-docs/agent-runtime`

**Key Actions:**

- **L5 删掉「没有 `contextSources`」的分支**：`AgentLoop` 的 `contextSources` 改成必填。原先没传时走另一套拼装（`RequestAssembler`、把模式写成 runtime-context 块追加到用户消息末尾、把步数预算提示作为一条 user 消息追加），生产的两个构造点都传了，只有测试夹具在走。夹具改成默认带对话和工具两个透传来源，id、owner、顺序和生产一致。
- **M2 首次请求和重试共用 `openRequest`**：`runTurn` 里「组装上下文、准备调用、写请求记录」原来写了两遍，现在是一个函数，`runTurn` 的循环只负责派发。这一个提交不改行为。
- **M2 没派发的调用一律释放**：准备好的 LLM 调用在派发之前出错时归还它占着的路由。原来只有首次请求的四个步骤失败时会归还，漏了三处：重试的同样四步、首次和重试都有的两个在 `try` 之外的步骤、`llm/stream` 钩子在派发前抛错。
- **M2 重试也经过 `agent/request`**：钩子每次尝试都被调用，payload 多一个 `attempt`（从 1 开始）；钩子返回的消息和工具对这一次尝试生效。路由和模型只在首次请求采纳，重试沿用。
- **M2 `prepareCaptured` 复制并冻结消息和工具**：`llm-service` 的 `prepareCaptured`、`prepareCapturedAsync` 现在和 `prepare` 一样先复制一份。传进来的可能是钩子给的数组，调用方之后再改不应该影响这次请求。
- **M1 abort 监听器用完就摘**：`PreparedLlmCall.dispatch` 在流结束时、`PreparedToolExecution` 在释放时，把挂在调用方 `AbortSignal` 上的监听器摘掉。

### 🧠 Design Intent (Why)

**L5。** 夹具走的是一条生产不存在的路径，测到的行为（模式块写在用户消息末尾）生产里没有。先让夹具和生产一致，M2 才有可信的测试做基准。

**M2 为什么分三个提交。** 两份代码只在四处不同：经不经过 `agent/request`；用 `prepareAsync` 还是 `prepareCapturedAsync`；写记录失败时释不释放；`request/header` 的 `attempt`。第一个提交把这四处原样留在分支里，用对拍确认行为没变；后两个提交各改一处，每一处有自己的测试，出问题时能单独回退。

**没派发的调用为什么必须释放。** 调用在准备时占一个路由 lease，派发后由流结束时归还；没派发就被丢掉的调用不会自己归还。路由注销时要等所有 lease 归还，默认等 30 秒，等不到就抛 `did not drain`。也就是一次写记录失败，会让之后的设置变更或关闭多等 30 秒再报一个无关的错。

还有一种情况这次没有处理：`llm/stream` 钩子在派发**之后**抛错。这时 lease 会归还，但那条已经派发的流没有人读也没有人中止，要等回合被中止或 Provider 那边结束才停。适配器拿到的是整个回合共用的 signal，要单独中止一次请求得给每次请求派生自己的 signal，是另一项改动；目前没有生产插件注册 `llm/stream` 钩子。记在技术债。

**重试为什么沿用路由和模型。** `agent-llm-core-pi.md` §13 约定重试可以重新组装消息，但继承同一个模型和连接。所以消息和工具每次都按钩子的返回值来，路由和模型不换：重试时交给钩子的就是这一步已经定下的那一组，钩子返回别的也不采纳；重试仍然从首次请求的 registration 派生，同名路由中途被新的顶替，这一步也不换到新连接上。目前没有生产插件注册 `agent/request` 钩子，这一条对现有行为没有影响，改的是给插件的约定：往请求里补消息的钩子碰上一次自动重试，补的内容原先会悄悄丢掉。

**M1。** 监听器带 `{ once: true }`，但那只在 abort 真的触发时才摘。Agent Loop 给的是整个回合共用的 signal，回合正常跑完的话监听器一个都不会摘，连同闭包里的东西留到回合结束：LLM 这边是那条流和请求快照（整份消息的副本），工具这边是整个 `PreparedToolExecution`（参数、结果、finalizer）。步数越多留得越多。

摘的时机选在「不会再有东西需要被中止」的那一点：流读完、出错、被中止都走同一个结束回调，和归还路由 lease 在一处；工具调用的释放在 `execute` 的 `finally` 和 `dispose` 里，走到时工具体已经结束。顺带的变化：回合被中止时，已经结束的请求不会再被调一次 `adapter.cancel`；目前没有生产适配器实现 `cancel`。

**M1 留住多少内存，随步数和工具定义的数量变。** 修之前和修之后各量了一遍：合成回合，每步调一次工具、结果 2 KB，在最后一次请求派发前强制 GC 后读 `heapUsed`。两者之差就是监听器多留住的。

| 回合 | 修之前 | 修之后 | 相差 |
| --- | --- | --- | --- |
| 200 步，请求带 1 个工具定义 | 54.8 MB（signal 上 398 个监听器） | 47.7 MB（0 个） | 约 7 MB |
| 400 步，请求带 1 个工具定义 | 76.7 MB（798 个） | 50.5 MB（0 个） | 约 26 MB |
| 200 步，请求带 30 个工具定义 | 58.2 MB（398 个） | 47.7 MB（0 个） | 约 10.5 MB |

第 1 步时都是 43.7 MB 上下。第三行把工具结果换成 20 KB，相差还是约 10.5 MB（65.0 对 54.5 MB）。

原因在请求快照的做法：每个被留住的快照带着当时整份消息列表的副本和全部工具定义的副本，副本是新建的对象，字符串是共用的。所以步数翻倍，留住的量是原来的 3.7 倍左右；工具定义多了也变大；工具结果本身多大没有影响。

审查报告和计划里写的「200 步累积 55.8 MB」是审查时另一个合成场景的数字。那个探针没有留下来，这次没有复现，两组数字不能直接比；以上表为准。

**核对 §13 时发现设计和实现不一致，这次没有改实现。** §13 写的是由 `LlmRetryScope` 持有一个覆盖全部尝试和退避等待的 lease。代码里没有这个类型：每次尝试的 lease 在它的流结束时归还，重试时重新取一次（registration 在排空中也放行），两次尝试之间没有 lease。退避期间 registration 被完整注销的话，重试会报 `LLM registration … is disposed.`。生产里走不到：路由随 Harness 的一代一起注册和注销，进行中的 Run 持有那一代的 lease，那一代要等 Run 结束才注销。所以只在 §13 末尾补了一段实现现状，并记到技术债，没有在这个 PR 里实现 `LlmRetryScope`。

### ✅ Verification

- **M2 不改行为的那一步**：同一个场景（一步里失败两次再成功，分带和不带 `agent/request` 钩子两种）在重构前后各跑一遍，把会话日志、实时事件和适配器收到的消息、工具、选项导出来，ID 和时间归一后逐字节比较，两份一致。对拍脚本没有入库。
- **M2 释放**：`request-release.test.ts` 四个用例。回到上一个提交的 `loop.ts`，后三个失败，报的是 `did not drain`；第一个（首次请求写记录失败）原来就通过。
- **M2 重试过钩子**：`request-hook-retry.test.ts` 三个用例。回到上一个提交的 `loop.ts`，前两个失败；第三个钉的是原有行为（同名路由被顶替后重试仍派发给原来的适配器），原来就通过。去掉「只有首次请求采纳路由和模型」的判断，第二个失败；把重试改成重新取路由，第三个失败。和重构前对拍：不带钩子时三份导出逐字节相同；带钩子时会话日志和实时事件相同，差别只有钩子被调用三次、三次请求都带钩子追加的消息。
- **M1**：`turn-signal-listeners.test.ts` 让一个回合跑四步（三步各调一次工具），在每次请求派发前数回合 signal 上的 abort 监听器。修之前 `[0, 2, 4, 6]`，只修 `llm-service` 是 `[0, 1, 2, 3]`，都修了是 `[0, 0, 0, 0]`。`llm-service`、`tool-runtime` 各加两个用例：同一个 signal 上连续跑三次，每次结束后监听器数都是 0；正在进行的流 / 工具体在 signal 触发时仍然被中止。去掉 `addEventListener` 那一行，后一类用例失败。
- **L5**：跟着改的测试断言的是被删的行为（模式写在用户消息末尾、下一步重放同一个 runtime-context 块），改成断言生产的约定：用户消息原样落盘，每一步组装上下文时来源都能读到这一轮的模式。
- `agent-loop` 19 个文件 95 个用例、`llm-service` 8 个文件 40 个用例、`tool-runtime` 5 个文件 85 个用例通过；`pnpm lint`、`pnpm typecheck`、`pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。

### 📁 Files Modified

- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/testing.ts`
- `packages/core/agent-loop/src/test/request-release.test.ts`（新增）
- `packages/core/agent-loop/src/test/request-hook-retry.test.ts`（新增）
- `packages/core/agent-loop/src/test/turn-signal-listeners.test.ts`（新增）
- `packages/core/agent-loop/src/test/{tool-stream,context-conversion,auto-compaction}.test.ts`
- `packages/llm/llm-service/src/prepared-call.ts`
- `packages/llm/llm-service/src/service.ts`
- `packages/llm/llm-service/src/test/service.test.ts`
- `packages/core/tool-runtime/src/prepared-execution.ts`
- `packages/core/tool-runtime/src/test/runtime.test.ts`
- `packages/core/runtime/src/harness/english-learning.test.ts`
- `apps/desktop/src/renderer/trajectory/node-data.ts`
- `docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-cordis-event-abi-and-eventhub-retirement.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-request-record.md`
- `docs/design-docs/agent-runtime/agent-forms-and-modes.md`
- `docs/exec-plans/tech-debt-tracker.md`
