# 流式输出只走实时通道 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261105-live-assistant-stream.md`
- **设计规范**：`docs/design-docs/agent-plugin-runtime/agent-spec-live-assistant-stream.md`
- **执行模式**：交互
- **开始时间**：2026-11-05（规范、计划经用户确认后）
- **结束时间**：2026-11-05 23:03（自动化验证完成；实机内存对比待用户跑）

任务前后有依赖，全部由主智能体按 T1→T13 顺序自己写，没有开写作子智能体。

## 执行时间线

### T1 Agent Loop 不再写 chunk

- **操作**：`collectStream` 不再 `session.append("assistant/chunk")`，保留 `emitLive` 与 `llm/chunk` hook；第一次出现非空增量时记 `firstTokenAt`，成功、失败、中断的 `assistant/message` 都写（有才写）。
- **影响文件**：`packages/core/agent-loop/src/loop.ts`、`src/test/partial-output.test.ts`。
- **验证**：日志里没有 chunk；有输出的消息带 `firstTokenAt` 且不早于请求头；没有片段时省略。

### T2 Codec

- **操作**：`assistant/message.firstTokenAt` 存在时必须是合法时间；`assistant/chunk` codec 保留，注释为只读兼容旧会话。重跑契约矩阵生成脚本。
- **影响文件**：`packages/session/session-journal/src/core-codecs.ts`、`scripts/contract-matrix/generate.mjs`、`agent-contract-matrix.generated.md`。

### T3 计时读取方

- **操作**：`facts.ts` 的 `applyTiming` 优先用消息的 `firstTokenAt`，chunk 分支留给旧会话；历史窗口不覆盖已有的 `firstTokenAt`；轨迹 builder 同样先读字段。
- **影响文件**：`packages/session/session-projection/src/facts.ts`、`src/test/facts.test.ts`、`packages/core/runtime/src/session/session-controller.ts`、`apps/desktop/src/renderer/trajectory/builder.ts`。

### T4 投影开销

- **操作**：`requestContext` 对规范 §7.1 之外的事件返回原状态；注册表 `detached` 去掉 JSON 深拷贝，改成校验后深冻结共享，已冻结子树提前返回。
- **影响文件**：`packages/core/runtime/src/projection/durable-session.ts`（含测试）、`packages/session/session-projection/src/registry.ts`、`packages/core/runtime/src/session/session-projection-updates.test.ts`（新增）。
- **验证**：无关事件不再让 `requestContext` 进 `changedValues`；返回值冻结且与快照共享引用。

### T5 关系校验只在需要时读历史

- **操作**：`EventCodec.readsHistory`；`previous` 改成惰性，未声明的 codec 访问时抛错；JSONL 写盘前的检查同样只看 `readsHistory`。
- **影响文件**：`codec-registry.ts`、`invariant-validator.ts`、`session-persistence-jsonl/src/storage.ts`（含测试）。

### T6 删除实时事件缓冲

- **操作**：删掉 `DesktopRuntimeV2Registry` 的 `#eventBuffer`、`replayLiveEvents` 和只服务它的类型。

### T7 实时底稿

- **操作**：
  - 新增 `LiveOutputBuffer`（`packages/util/shared/src/runtime-v2/live-output.ts`），全局单调 revision，按消息分组，`settle` / `clear` / `baseline` / `page` / `describe`。
  - 桌面主进程先进底稿拿 revision，再交给 `FixedRendererStreamAdapter`，增量帧带 `liveRevision`；`assistant/message` 投影到达时 `settle`，运行结束清除；新增 `sessions.liveOutput`（先冲刷再读）。
  - 远程 Host 的 `HostLiveOutput` 改为包 `LiveOutputBuffer`，`sessions.output` 参数从 `offset` 改为 `afterRevision`；桌面远程适配器与 Web `session-observer` 按 revision 分页回放，跳过已定稿消息，再推 `live_output_baseline`。
- **决定**：底稿类放在 `@actspace/shared/runtime-v2`，桌面主进程、远程 Host 都已依赖它，不需要新增依赖方向。
- **验证**：`live-output.test.ts`（shared）6 例、`runtime-v2-live-output.test.ts`（desktop main）2 例、agent-host `live-output.test.ts`。

### T8 渲染进程恢复运行

- **操作**：
  - `live-run.ts`：恢复运行先缓存正文 / 思考增量，收到 `live_output_baseline` 后从底稿开始，丢掉 `liveRevision` 不大于底稿的帧；压缩操作恢复的 run 没有底稿，直接丢弃增量。
  - `attachLiveBaseline`（`live-runs/live-baseline.ts`）由任务队列与审批恢复调用。
  - `transcript.ts`：恢复运行也显示实时块，消息定稿后按同一运行、同样内容去重，renderKey 撞上时加 `:live`。
  - 删除 `includePendingChunks` / `projectPendingChunks` / `onlyStreamChunksSince` 与 bridge 的 chunk 排队。
- **验证**：`live-run-recovered.test.ts` 3 例、`live-baseline.test.ts` 3 例；`transcript.test.ts` 恢复场景改写为显式断言；`stream-frame-batching.test.ts` 新增「孤儿 / 迟到 chunk 不显示」。

### T9 子 Agent 面板

- **操作**：`projectSubagentTranscript` 接收子会话底稿，`getSubAgentTranscript` 传入 `liveOutput(child)`。
- **验证**：`runtime-v2-fixed-renderer-projection.test.ts` 改写子 Agent 用例：底稿段显示，孤儿 chunk 忽略，定稿消息只剩日志里的一份。

### T10 轨迹流式层

- **操作**：
  - builder 为每个未结算请求生成占位记录（`placeholder: true`），`liveMessageIds` 已知时 id 与定稿消息相同；旧会话 chunk 仍由 builder 合并。
  - 实时运行的文字段和流式工具带 `llmCallId`（即 requestId），`requestOutputs(run)` 按请求归组；`LiveRunsProvider` / `useRequestOutputs(sessionId)` 给轨迹视图。
  - `live.ts` 删掉 chunk 拆分与累加器，`streamingCells(cells, outputs)` 只填占位 cell；`TrajectoryView` 只在 `liveMessageIdsKey` 或快照变化时重建定稿层。
  - fixture 改为每帧 `{ snapshot, live }`；`trajectory-complete.json` 保留 chunk 作为旧格式回归。
  - `verify-trajectory-electron.mjs` 不再写 chunk，`assistant/message` 带 `firstTokenAt`。
- **验证**：`trajectory-live.test.ts` 9 例；`trajectory-streaming.test.tsx` 4 例（五帧流式只构建一次，加工具调用后再构建一次，行 DOM 不重挂）；`trajectory-layout.test.ts` 按占位行更新期望并新增「轮次结束没有回复仍是请求占位行」；opt-in 性能测试每帧 p95 约 0.05ms（2000 片段）。

### T11 删除 chunk 专用批处理

- **操作**：删除 `live-envelope-batcher.ts`，`fixed-renderer-ipc.ts` 直接发送，保留「发 journal 事件前先冲刷增量」；`api/live-events.ts` 删掉 batch 拆分，`RuntimeV2DesktopLiveEnvelope.batch` 字段删除；合并间隔常量改名 `RENDERER_STREAM_INTERVAL_MS` 放进 `runtime-registry.ts`。
- **验证**：`runtime-v2-live-batching-ipc.test.ts` 改名为 `runtime-v2-live-stream-ipc.test.ts` 并改写，5 例。

### T12 文档

- **影响文件**：设计规范补「实现约定」；`front-会话状态与数据流规范.md`（流式、恢复运行、transcript 合并）、`front-轨迹视图规范.md`（§1、§2、§5）、`front-聊天输入框规范.md`（计时来源）、`front-web-pwa客户端规范.md`（底稿分页）、`docs/tools/session-viewer/README.md`。

### T13 验证

见执行摘要「Agent 已完成的验证」。

## 遇到的问题

- **问题**：`{ ...update, liveRevision }` 赋给运行时事件联合类型时报 TS2352 / TS2345。
  - **应对**：只对 `assistant-delta` / `reasoning-delta` 收窄后再附加。
- **问题**：轨迹布局测试 4 例失败。
  - **原因**：有意的行为变化，未结算请求从「请求占位行」变成「占位助手行」。
  - **应对**：更新期望，并补一例证明轮次结束而没有回复时仍是请求占位行。
- **问题**：shared 与主进程底稿测试的期望里缺 `requestId`。
  - **原因**：T10 给片段加了 `requestId`，期望值没跟上。
  - **应对**：补进期望值。
- **问题**：`test:contract-matrix` 第一次失败。
  - **原因**：生成文件的 source digest 落后于后续源码改动。
  - **应对**：重跑 `gen:contract-matrix`。
- **问题**：统计差异时 `git add -N` 加 `git reset` 把之前暂存的删除和重命名撤出了暂存区。
  - **应对**：重新暂存，工作区文件未受影响。

## 跳过或推迟的事项

- **实机内存对比与规范 §9 功能清单**：需要用户在本机启动应用、真实模型运行，交给用户执行。
- **Web 端 `BashRow` 读 `sessions.output` 当 bash 输出**：这是改动前就有的问题，这个接口一直返回模型的未定稿正文，不是 bash 输出。本次只把参数名改成 `afterRevision`，没有修，另行处理。
- **远程侧自动化测试**：桌面远程适配器的底稿回放和 Web `session-observer` 没有新增单测，靠已有用例和实机验证覆盖。
