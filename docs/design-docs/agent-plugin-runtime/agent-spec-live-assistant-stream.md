# 流式输出只走实时通道：assistant/chunk 不再持久化

> 管模型流式输出从 Agent Loop 到界面的两条路径（持久事实与实时片段）的边界，以及每个持久事件在投影、校验、IPC 上的开销约束。事件词汇见[事件模型](agent-spec-dsh-event-model.md)，投影架构见[Runtime Projection](agent-spec-runtime-projection.md)。

## 1. 为什么改

2026-11-05 用全程记录器（`ACTSPACE_INSPECT_MAIN=9229 pnpm dev` + CDP 分配采样）测一次约 60 秒的运行：

| 指标 | 数值 |
|---|---|
| 主进程累计分配 | 约 11.5 GB |
| 主进程 JS 堆峰值 | 约 1 GB（锯齿式反复回收） |
| 跑完后主进程常驻堆 | 307 MB |
| 性能面板总内存峰值 | 1921 MB（主进程约 1.2 GB，界面进程约 0.65 GB） |

分配来源：

- 58%：投影注册表。每个 `assistant/chunk` 都让 `requestContext` 投影产生新状态，注册表对约 0.9 MB（随对话增长）的 view 做一次 JSON 校验加 `JSON.parse(JSON.stringify())` 深拷贝。
- 17%：日志校验。上下文插件的两个事件规则声明了 `validateRelations`，每次写入都从磁盘读出整段会话历史拼成 `previous`，但规则本身只看当前事件。写盘前 `storage.ts` 又按同样条件再读一遍。
- 跑完后的 307 MB：`DesktopRuntimeV2Registry` 的 512 条实时事件缓冲，每条都带一份上下文副本；它的读取方法 `replayLiveEvents` 没有调用方。
- 界面进程：每个 chunk 的 `journal-update` 都携带整份 `requestContext`，33ms 一批经 IPC 结构化克隆。

根因是**每个流式片段都作为持久事件写入日志**（`agent-loop/src/loop.ts` 每个 delta 一次 `session.append("assistant/chunk")`，chunk 约占日志事件的 97%）。之后的校验、投影、持久化、IPC 都按 token 数线性放大。DeepSeek harness 的 v2 格式不持久化 chunk（参考 `tmp/deepseek-harness/.agents/notes/archived/architecture/2026-08-31-live-assistant-stream-frames.zh.md`、`.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.zh.md`），本规范照此收敛，并去掉上面几处与 chunk 无关、但同样按事件放大的开销。

## 2. 两条路径

| | 持久事实（Journal） | 实时片段（进程内） |
|---|---|---|
| 内容 | 每次模型调用一条 `assistant/message`（成功、失败、中断都有） | 正文 / 思考 / 工具参数的增量 |
| 生命周期 | 永久，冷读、重放、统计、模型历史都以它为准 | 只在当前进程、当前调用期间存在 |
| 去向 | 校验 → 投影 → 持久化 → `journal-update` | `emitLive` → `FixedRendererStreamAdapter` → `agentStream` IPC；`llm/chunk` hook 不变 |
| 断线后 | 按 seq 重读 | 主进程的实时底稿（§5）补回当前调用 |

规则：

- 新会话不写 `assistant/chunk`。Agent Loop 仍按片段调用 `emitLive` 和 `llm/chunk` hook，只删掉 `session.append`。
- 持久路径不依赖实时片段推断任何事实；实时片段也不推进 journal cursor。
- 一条 `journal-update` 发往界面前，先冲刷实时通道里已经排队的片段，保证定稿消息不会跑到它之前的片段前面（`fixed-renderer-ipc.ts` 里已有的规则，保留）。

## 3. assistant/message 新增 firstTokenAt

- 字段：`firstTokenAt?: string`，ISO 时间。取这次调用里第一个内容非空的片段（正文、思考或工具参数增量，与原来「首个非空 chunk」口径一致）到达 Agent Loop 的时间。
- 所有 `finishReason`（完成、失败、中断）都写；一个片段都没收到时省略。
- 字段是附加的，`assistant/message` 的 `eventVersion` 保持 1；codec 只在字段存在时校验它是合法时间字符串。
- 计时的读取方一律先读 `firstTokenAt`，没有时才从旧会话的 chunk 补算：`session-projection/src/facts.ts` 的 `activity.timing`（TTFT / TPS），`session-controller.ts` 历史窗口里的补算，轨迹 `builder.ts` 的单条消息计时。

不做：不在消息里嵌入逐片段的流记录（DeepSeek 的 `AssistantStreamRecord[]`）。当前没有任何消费方需要逐片段重放；以后需要再加字段，不冲突。

## 4. 失败、中断与崩溃

- 进程内的失败和中断保持现状：Agent Loop 写一条 `finishReason` 为 `failed` / `aborted` 的 `assistant/message`，内容是内存里已累积的部分。重试只发生在还没有任何输出时（`llm/retry`）。不新增 `assistant/attempt`。
- 应用在消息写入前崩溃：这次调用已输出的文字不进入持久记录，恢复流程照旧补一条空内容、`recovery: "outcome-unknown"` 的消息。这与改动前的实际结果相同（改动前 chunk 虽在盘上，但没有代码用它重建消息）。实时片段不是预写日志，不做定期落盘。

## 5. 实时底稿

主进程为每个会话保存「当前运行里还没定稿的输出」，供界面重新接上时补回。

- 内容：按 `messageId` 分组的正文与思考文本（`kind` + 累积文本），外加当前 `runId` 和单调递增的 `revision`（每接受一个片段加一）。
- 清理：某个 `messageId` 的 `assistant/message`（任何 `finishReason`）写入日志后删掉这一组；运行结束时整份删除。底稿只覆盖未定稿的输出，已定稿的内容一律从日志读。
- 发给界面的实时片段帧带上它包含的最后一个 `revision`。
- 取底稿时主进程先冲刷实时通道，再读底稿；因为两步在主线程上连续执行，之前发出的帧都不超过底稿的 `revision`，之后的帧都更大。
- 界面侧的「恢复运行」（渲染进程重载、窗口重开、远程会话重新观察）：
  - 先缓存这个运行的实时片段；
  - 拿到底稿后把它作为起点；
  - 丢掉 `revision` 不大于底稿的帧，之后的帧照常追加。

  恢复运行不再忽略实时片段，也不再从日志 chunk 拼进行中文本（删除 `chat.ts` 的 `includePendingChunks` / `projectPendingChunks`）。
- 远程 Host 的 `HostLiveOutput` 使用同一语义：定稿清组，带 `revision`。远程适配器回放底稿页后接实时片段，界面侧逻辑与本地相同。
- 内存上界：只有未定稿的文本，定稿即释放。

实现约定：

- 底稿类是 `LiveOutputBuffer`（`packages/util/shared/src/runtime-v2/live-output.ts`），桌面主进程（`runtime-registry.ts`）和远程 Host（`HostLiveOutput` 包一层）共用。
  - `revision` 全局单调，跨会话、跨运行不归零，所以运行切换后旧帧也能按它截断。
  - 每段带产生它的请求 `requestId`（旧版远程 Host 不带），轨迹按它把文字放进占位行（§6）。
  - 过长的单个增量按 8192 字拆成多片，每片一个 revision。
- 桌面 IPC：`sessions.liveOutput({ sessionId })` 返回 `{ runId, revision, segments }`；远程会话返回 `null`。界面侧把底稿包装成 `live_output_baseline` 事件（`packages/util/shared/src/session/stream-events.ts`）交给 `LiveRunStore`，只认恢复运行的第一份。
- 远程协议：`sessions.output` 的参数从 `offset` 改成 `afterRevision`，返回 revision 大于它的片段（每页最多四片）和 `next`。页按 revision 定位，两页之间有消息定稿也不会错位。这是不兼容改动，桌面端、Web 端与远程 Host 要同版本。
- 恢复运行的界面合并：消息定稿后，日志里出现同一运行、同样内容的块，实时块就不再显示（`transcript.ts` 的 `recoveredLiveBlocks`，与 Web 端一致）。
- 合并间隔常量 `RENDERER_STREAM_INTERVAL_MS`（33ms）移到 `runtime-registry.ts`，随 `live-envelope-batcher.ts` 一起删掉的只是 chunk 批处理。

## 6. 子 Agent 面板与轨迹

- **子 Agent 面板**：`getSubAgentTranscript` 返回子会话日志的投影，加上子会话实时底稿里未定稿的文本（替代原来从 chunk 拼出的 pending 文本）。面板的刷新方式不变。
- **轨迹视图**：结构不变，仍然是定稿层加流式层。
  - 定稿层仍由日志构建。有 `request/header`、还没被 `assistant/message` / `llm/retry` 结算、所在轮次也没有 `turn/end` 的请求，生成一条占位记录。实时运行已报出这个请求的 `messageId` 时，占位的记录 id 与定稿消息相同，定稿后这一行不换 id；没报出时 id 用 `request:<requestId>`。
  - 流式层的数据源从「日志 chunk」换成界面进程里该会话的实时运行状态（正文、思考、正在流式生成的工具调用），按 `llmCallId`（即 `requestId`）归组后填进占位（`requestOutputs`，`@actspace/client/live`）。
  - 子会话轨迹读子会话的实时运行状态。
  - 旧会话里已定稿消息的 chunk 仍由 builder 合并（`sourceSequences`、首 token 回退），它们不会再处于「正在输出」。

## 7. 每个持久事件的开销约束

chunk 移出日志后，工具调用、请求头等事件仍会走同一条路径，以下约束适用于所有事件：

1. **投影对无关事件返回原状态。** 投影的 `apply` 遇到不影响自己的事件，必须返回同一个引用。注册表靠引用判断是否变化，不变就不算 view、不复制、不推送。
   - `requestContext` 只在这些事件上变化：带 `surface` 的事件、`request/header`、`request/context`、`compaction/end`、`surface/replaced`、`turn/start`、`turn/end`。（2026-11-06 起由 `contextEstimate` 取代，变化事件见[请求记录规范](agent-spec-request-record.md) §6.3。）
   - 它的 `throughJournalSeq` / `updatedAt` 是「最后一次改变上下文的事件」的 seq 和时间，不再随每个事件变化。
2. **注册表不深拷贝 view。** 变化的 view 深冻结后共享，`assertJson` 校验保留；去掉 `detached` 里的 `JSON.parse(JSON.stringify())`。下游不得原地修改投影值，冻结会让违规写入直接报错。
3. **IPC 只带变化的投影。** `journal-update.values` 只含这次真正变化的投影；`requestContext` 只在它变化时随事件发出。
4. **关系校验只在需要时读历史。**
   - 事件规则要读历史，必须在 codec 上显式声明 `readsHistory: true`，校验器和 JSONL 写盘前的检查才会物化 `previous`。
   - 没声明的规则访问 `previous` 直接抛错，不静默给空数组。
   - 上下文插件的两个规则只检查当前事件，不声明。
5. **删除无调用方的实时事件缓冲。** `DesktopRuntimeV2Registry` 的 `#eventBuffer` 与 `replayLiveEvents` 一并删除。
6. **删除只为 chunk 存在的快速路径**，新会话里这些路径不会再被触发：
   - 主进程 `LiveEnvelopeBatcher`；
   - 渲染进程 `desktop-session-bridge` 的 chunk 排队；
   - `session-store` 的 `onlyStreamChunksSince` 复用；
   - 轨迹 `live.ts` 从 chunk 拆流式层的部分。

## 8. 旧会话兼容

- 不迁移、不改写已有会话文件。`assistant/chunk` 的 codec 保留在注册表里，只读不写。
- 读取方对旧数据保留的处理：
  - 历史窗口照旧剔除已定稿消息的 chunk；
  - 计时缺 `firstTokenAt` 时从 chunk 补算；
  - 轨迹 builder 合并已定稿消息的 chunk。
- 旧会话不会处于「正在输出」，所以 §5、§6 的实时路径与它们无关。
- 崩溃留下的孤儿 chunk（没有同 `messageId` 的消息）不再被当作进行中文本显示。
- 轨迹 fixture `fixtures/trajectory-complete.json` 保留 chunk，作为旧格式的回归样例；`streaming` / `streaming-long` fixture 改成「日志快照 + 实时输出」逐帧回放。

## 9. 验收

用同一套全程记录器、同一工作区和问题重跑，与 §1 对比：

- 主进程累计分配、JS 堆峰值、跑完后常驻、面板总内存峰值都应明显下降；具体数值写进 history。
- 功能逐项确认：
  - 实时出字；
  - 渲染进程重载后正在输出的文字补回且不重复；
  - 子 Agent 面板显示子会话进行中文字；
  - 轨迹流式层逐帧更新；
  - TTFT / TPS 与改动前口径一致；
  - 旧会话（含 chunk）正常显示与计时；
  - 远程会话重新观察。

## 10. 排除的方案

- **在消息里嵌入完整流记录**：没有消费方需要，消息体积翻倍。
- **新增 `assistant/attempt`**：失败与中断已有带 `finishReason` 的消息。
- **定期落盘进行中文本**：等于按时间重新引入持久事件，只为崩溃这个低频场景。
- **迁移旧会话文件**：要改写用户数据并重排 seq，风险大，读取兼容已足够。
- **保留 chunk、只在投影或 IPC 层过滤**：日志写入、校验、持久化仍按 token 放大，属于治标。
