# 流式输出只走实时通道（assistant/chunk 不再持久化）

## 目标

新会话不再把流式片段写成持久事件 `assistant/chunk`，而是：
- 流式片段只走实时通道；
- `assistant/message` 记录 `firstTokenAt`；
- 主进程保存「未定稿输出」的实时底稿，供界面重载、子 Agent 面板和轨迹流式层使用。

同时去掉每个持久事件在投影、校验、IPC、实时缓冲上的放大开销。

一次约 60 秒的运行里，主进程累计分配、JS 堆峰值、跑完后常驻、面板总内存峰值（改前分别为 11.5 GB / 1 GB / 307 MB / 1921 MB）都要明显下降，功能与改前一致。

## 范围

- 包含：设计规范 [agent-spec-live-assistant-stream.md](../../design-docs/agent-plugin-runtime/agent-spec-live-assistant-stream.md) 的全部条目（§2–§8）。
- 不包含：
  - 消息内嵌逐片段流记录；
  - `assistant/attempt` 事件；
  - 进行中文本定期落盘；
  - 旧会话文件迁移；
  - Composer、设置等无关界面。

## 背景

- 必读：
  - 上面的设计规范；
  - [Runtime Projection](../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)；
  - [front-会话状态与数据流规范](../../design-docs/frontend/front-会话状态与数据流规范.md) 的流式一节；
  - [front-轨迹视图规范](../../design-docs/frontend/front-轨迹视图规范.md) §5。
- 证据：`tmp/heap/run1/`（`samples.jsonl`、`main.heapprofile`、`chart.html`）。记录器是 `tmp/heap/monitor.mjs`，分析脚本是 `tmp/heap/profile.py`。
- DeepSeek 参考：`tmp/deepseek-harness/packages/core/agent-loop/src/assistant-stream.ts`、`packages/session/session-projection/src/index.ts:887-935`。

## 任务（按顺序，由主智能体自己写；前后有依赖，不开写作子智能体）

### T1 Agent Loop 不再写 chunk
- `packages/core/agent-loop/src/loop.ts`：
  - 删除 `collectStream` 回调里的 `session.append(core("assistant/chunk", …))`，保留 `emitLive` 和 `llm/chunk` hook。
  - `collectStream` 在 `sawObservableDelta` 第一次变真时记录 `firstTokenAt = new Date().toISOString()` 并返回。
  - 失败、中断的消息（`:223`）和正常消息（`:272`）都写入 `firstTokenAt`（有才写）。
- 测试：
  - agent-loop 测试断言日志里没有 `assistant/chunk`；
  - 有输出的消息带 `firstTokenAt`，且不早于 `request/header` 的时间；
  - 失败、中断的消息也带；
  - 没有任何片段时省略。

### T2 Codec
- `packages/session/session-journal/src/core-codecs.ts`：
  - `assistant/message` 的 `firstTokenAt` 字段存在时必须是可解析的时间字符串；
  - `assistant/chunk` 保留，加注释说明「只读兼容旧会话，新会话不写」。
- 契约矩阵：`pnpm` 生成脚本重跑（`scripts/contract-matrix/generate.mjs`）。如果矩阵有状态列可以标记只读兼容，就照实标注；不手改生成文件。

### T3 计时读取方
- `packages/session/session-projection/src/facts.ts` 的 `applyTiming`：
  - 遇到 `assistant/message` 时，如果当前步没有 `firstTokenAt`，就用消息里的 `data.firstTokenAt`；
  - chunk 分支保留给旧会话。
  - 状态形状不变，不升 `stateVersion`。
- `packages/core/runtime/src/session/session-controller.ts`（`slimHistoryWindow` 约 `:465`）：消息已经带 `firstTokenAt` 时不覆盖，只给旧消息补算。
- `apps/desktop/src/renderer/trajectory/builder.ts`：确认 `firstTokenAt` 优先读 `data.firstTokenAt`，chunk 只作回退。
- 测试：
  - facts 计时：新格式下 TTFT/TPS 与改前口径相同，旧格式 chunk 回退；
  - 历史窗口与 builder 各一例。

### T4 投影开销
- `packages/core/runtime/src/projection/durable-session.ts` 的 `requestContext`：
  - 只有规范 §7.1 列出的事件才产生新状态，其余事件 `return state`；
  - `throughJournalSeq` / `updatedAt` 取最后一次改变上下文的事件；
  - `contextMemo` 与 `fixedWatermark` / `fixedTime` 语义保持。
- `packages/session/session-projection/src/registry.ts`：
  - `detached` 去掉 `JSON.parse(JSON.stringify())`，改成 `assertJson` 加深冻结后共享；
  - 已冻结子树提前返回。
- 先查清所有拿到投影值后原地修改的下游：`session-controller` 合并 values、`runtime-registry`、`fixed-renderer-ipc`、`packages/client` 的 session cell、`apps/web`。逐个改成不可变写法。
- 测试：
  - `assistant/message`、`tool/result` 之外的无关事件不再让 `requestContext` 出现在 `changedValues`；
  - 相关事件仍会出现；
  - 返回值是冻结的且与 snapshot 共享同一引用；
  - IPC 一侧断言普通事件的 `journal-update.values` 不含 `requestContext`。

### T5 关系校验只在需要时读历史
- `packages/session/session-journal/src/codec-registry.ts`：
  - `EventCodec` 加 `readsHistory?: boolean`；
  - `EventCodecRelationContext.previous` 改成惰性：声明了的 codec 第一次访问时才物化，没声明的访问时抛错。
- `packages/session/session-journal/src/invariant-validator.ts:85`：按上面的规则构造上下文。
- `packages/session/session-persistence-jsonl/src/storage.ts:194`：`needsHistory` 改看 `readsHistory === true`。
- `packages/context/context-engine/src/codec.ts` 的 `noSurface` 不声明，行为不变。
- 测试：
  - 写入上下文事件时不调用历史读取（用计数桩）；
  - 声明了 `readsHistory` 的 codec 仍能拿到完整 `previous`；
  - 未声明的 codec 访问 `previous` 时抛错。

### T6 删除无调用方的实时事件缓冲
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`：删除 `#eventBuffer`（约 `:70`、`:537-538`）、`replayLiveEvents`（`:428`）。
- 同时删除只服务于它的类型 `RuntimeV2LiveReplay`。删之前 grep 确认没有其他引用。

### T7 实时底稿（主进程与远程 Host）
- 底稿类：基于 `packages/host/agent-host/src/live-output.ts` 的 `HostLiveOutput` 扩展。
  - 新增：`revision` 对外暴露；`settle(sessionId, messageId)` 删除一组；`baseline(sessionId)` 返回 `{ runId, revision, messages: [{ messageId, kind, text }] }`。
  - 保留：远程的 `page` 接口加上 `revision`。
  - 放在桌面主进程和远程 Host 都能引用的位置。agent-host 已被桌面依赖，优先原地导出；依赖方向不合适时移到 `packages/client/client/src/live/`。
- 桌面主进程 `runtime-registry.ts`：
  - 实时事件先进入底稿、拿到 revision，再交给 `FixedRendererStreamAdapter`；
  - 合并后的增量帧带上它包含的最大 `revision`（`stream-adapter.ts` 的 `#emitDelta`，以及 `packages/util/shared/src/session.ts` 的 `assistant_text_delta` / `assistant_thinking_delta` 类型加可选 `liveRevision`）；
  - 日志写入 `assistant/message` 时 `settle`，运行结束时清除。
- IPC：
  - 新增 `sessions.liveOutput({ sessionId })`：先 `flushRendererStream()`，再返回 `baseline`；
  - 同步修改 `@actspace/shared/desktop-bridge` 契约、preload 和 mock handlers，并跑 `check:ipc-channels`、`check:renderer-bridge`。
- 远程：
  - `bootstrap.ts` 在 projection 更新是 `assistant/message` 时调用 `output.settle`；
  - `desktop-adapter.ts:135-145` 回放底稿页时带上 revision；
  - `apps/web` 的 `session-observer.ts` 同步。
- 测试：
  - 底稿类：累积、定稿清组、运行切换、revision 单调；
  - 主进程：增量帧带 revision，`liveOutput` 返回前会先冲刷。

### T8 渲染进程恢复运行
- `packages/client/client/src/live/live-run.ts:114`：恢复运行不再丢弃增量，改为先缓存，等底稿到达后按 `liveRevision` 截断。没带 revision 的旧帧照常追加。
- 恢复入口统一调用 `sessions.liveOutput`，然后把底稿灌入运行状态：
  - `apps/desktop/src/renderer/session/task-queue.ts:94-104`；
  - `App.tsx` 审批恢复（约 `:433`）；
  - 远程 `recoveredReset`（约 `:772`）。
- `apps/desktop/src/renderer/session/transcript.ts:35-38`：恢复运行也显示实时块，已定稿的消息由日志提供，按 messageId 去重。
- 删除：
  - `session-store.ts` 的 `includePendingChunks` / `onlyStreamChunksSince` 分支；
  - `packages/client/client/src/sessions/chat.ts` 的 `projectPendingChunks` 与选项；
  - `desktop-session-bridge.ts:30-34` 的 chunk 排队。
- 测试：
  - 重载场景：底稿与之后的增量拼接后不重复、不缺字；
  - 底稿 revision 之前的帧被丢弃；
  - 定稿消息出现后实时块被替换；
  - 孤儿 chunk 不再显示为进行中。

### T9 子 Agent 面板
- `chat.ts` 的 `projectSubagentTranscript(snapshot, journal, pending?)`：`pending` 是子会话底稿，转成未定稿的正文和思考事件。
- `fixed-renderer-ipc.ts:706` 的 `getSubAgentTranscript` 传入子会话底稿。
- 测试：子会话运行中，transcript 包含底稿文本；定稿后只剩日志里的消息。

### T10 轨迹流式层
- 定稿层：
  - 正在输出的调用由「有 `request/header`、但还没有对应 `assistant/message` 或 `llm/retry` 结算、所在轮次也没有 `turn/end`」的请求生成占位记录，按 `requestId` 识别；
  - 已定稿的旧 chunk 仍由 `builder.ts` 合并。
- 流式层：
  - `TrajectoryView.tsx:63-84` 的流式累加器改读界面进程里该会话的实时运行状态，用 `LiveRunStore` 的 selector 按 `llmCallId` 取正文、思考和流式工具调用；
  - 子会话轨迹读子会话的运行状态（子会话的 `agent_run_started` 带 `parentSessionId`，`App.tsx:772` 已为它建立运行）；
  - 先确认 `LiveRunStore` 保留了 `llmCallId`，没有就补上。
- `live.ts`：删除从 chunk 拆分流式组的部分（`splitLiveChunks` 的 open 组、`createLiveAccumulator` 的 chunk 版本），保留 builder 仍需要的 `chunkKey` / `closedKey`。
- 更新 fixtures：`trajectory/fixtures.ts` 的 `streaming` / `streaming-long`、`fixtures/trajectory-complete.json`、`scripts/verify-trajectory-electron.mjs`。
- 测试：
  - 占位记录按请求生成；
  - 流式层随实时状态逐帧更新，只有这一行重渲；
  - 定稿后流式 cell 被完整记录替换；
  - 旧会话 fixture 显示不变。

### T11 删除 chunk 专用批处理
- 删除 `apps/desktop/src/main/runtime-v2/live-envelope-batcher.ts`。`fixed-renderer-ipc.ts` 改为直接发送，但保留「发送日志事件前先 `flushRendererStream()`」这条规则。
- `api/live-events.ts` 拆 `batch` 的逻辑：如果没有别的发送方，一并删除。
- 改写 `runtime-v2-live-batching-ipc.test.ts`：保留「定稿消息不越过之前的片段」和「冲刷顺序」两条，删掉 chunk 批处理的用例。
- `projection-view.ts:25-35` 的 `contextRevisionOf` 跳过 chunk 的逻辑保留（旧会话无害），不额外改。

### T12 文档与记录
- 更新 `front-会话状态与数据流规范.md` 流式一节：
  - 删除 `live-envelope-batcher`、chunk 排队、`onlyStreamChunksSince`、`includePendingChunks` 的描述；
  - 写清实时底稿、revision 截断，以及恢复运行如何显示。
- 更新 `front-轨迹视图规范.md`：第 30 行（chunk 进 accumulator）和 §5（占位按请求、流式层读实时运行状态）。
- 更新 `front-聊天输入框规范.md:201`：计时来源改成「`assistant/message.firstTokenAt`，旧会话从 chunk 补算」。
- `docs/tools/session-viewer/README.md`：说明 chunk 只出现在旧会话。
- 写执行记录 `docs/exec-runs/20261105-live-assistant-stream/` 与 history。

### T13 验证
- 命令：
  - `pnpm typecheck`；
  - 涉及包的测试：agent-loop、session-journal、session-projection、session-persistence-jsonl、runtime、client、agent-host、`apps/desktop` 全量、`apps/web`；
  - `pnpm check:current-docs`、`check:docs`、`check:ipc-channels`、`check:renderer-bridge`、`check:frontend-tokens`、`check:frontend-theme`。
- 全部通过后再让用户实机跑：
  - 用户用 `ACTSPACE_INSPECT_MAIN=9229 pnpm dev` 加 `node tmp/heap/monitor.mjs tmp/heap/run2 --wait-new`，同一工作区 `learn-subagent`、同一问题；
  - 对比 run1 与 run2 的四个指标和分配来源。
- 实机功能清单见规范 §9。

## 风险

- **深冻结后下游原地修改会抛错。** T4 先 grep 全部消费方，测试覆盖 IPC 与渲染进程合并路径。
- **恢复运行的拼接重复或缺字。**
  - revision 截断，加上「取底稿前先冲刷」；
  - 测试覆盖底稿之前、之后和跨越底稿的帧。
- **轨迹占位的识别变化。** 以请求为单位，加旧会话 fixture 回归。
- **远程 Host 与 Web 端协议变化。** `revision` 是新增可选字段，旧客户端忽略它。
- **回退方式：** 每个任务单独提交，出问题可以按任务回退。T1 单独回退即可恢复写 chunk，读取方都保留了旧格式兼容。

## 进度记录

- [x] T1 Agent Loop 不再写 chunk
- [x] T2 Codec
- [x] T3 计时读取方
- [x] T4 投影开销
- [x] T5 关系校验
- [x] T6 删除实时事件缓冲
- [x] T7 实时底稿
- [x] T8 渲染进程恢复运行
- [x] T9 子 Agent 面板
- [x] T10 轨迹流式层
- [x] T11 删除 chunk 批处理
- [x] T12 文档与记录
- [ ] T13 验证（2026-11-05 自动化部分全部通过；实机内存对比与规范 §9 功能清单待用户跑）

## 决策记录

- 2026-11-05：用户确认规范的决策 1–8，全部按建议（`firstTokenAt`、不加 attempt、接受崩溃丢失、实时底稿、子 Agent 面板与轨迹读实时状态、不迁移旧会话、一并修补每事件开销）。

## 执行模式

交互模式：协议与持久格式改动，人在线。

## 执行文档

`docs/exec-runs/20261105-live-assistant-stream/execution-process.md`、`execution-summary.md`。
