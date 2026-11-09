# 会话状态与数据流规范

bridge 与 `api/<域>` 的约定见 [Preload bridge 与 Mock 规范](front-preload-bridge与mock规范.md)；分页与浏览索引见[会话浏览按需加载](../agent-runtime/agent-progressive-session-loading.md)；设计由来见归档的 [Renderer 状态层与会话数据流](../../exec-plans/completed/design-archive/desktop-frontend-refactor/02-Renderer状态层与会话数据流.md)。

renderer 里一个会话的数据分三类，每类只有一个归属：

| 类别 | 内容 | 归属 |
| --- | --- | --- |
| durable | 已写入 Journal 的事件、投影快照、窗口（分页位置） | `ClientSessionStore` 的 cell（`@actspace/client/sessions`） |
| live | 正在运行的 run 的流式块、工具进度、busy 状态、任务快照 | `LiveRunStore`、`TaskQueueStore` |
| local | 只在本机、不进 Journal 的按会话状态：草稿、输入框正文、模式、队列展示、压缩失败、后台 bash 状态等 | `SessionLocalStore` |

另有一项跨重启的本地记录：**未确认提交**（§9），存在 `localStorage`。

App 只负责把这些 store 装配起来、把事件接到对应的 store，以及生成 Context value。组件从 store 或 Context 读取，不另存副本。

## 1. 模块

| 位置 | 作用 |
| --- | --- |
| `R/session/session-store.ts` | `useSessionCell(store, sessionId, selector)`；`createSessionCellRetention(store, limit = 5)`：cell 的 LRU 保留 |
| `R/session/session-pages.ts` | `loadEarlier(store, sessionId)`：读早期一页并交给 store 合并 |
| `R/session/transcript.ts` | `mergeTranscript(durable, live, local)`：会话视图的消息序列（纯函数） |
| `R/session/session-local-store.ts` | `createSessionLocalStore()`、`useSessionLocalState`、`useSessionLocalIds`、`useSessionLocal`、`SessionLocalStoreContext` |
| `R/session/live-runs/live-run-store.ts` | `createLiveRunStore()`：run 状态、流式事件处理、busy 集合、terminal runId 有界集合；`useLiveRunView`、`useBusySessionIds` |
| `@actspace/client/live`（`packages/client/client/src/live/`） | 流式状态 → 块（`streamingStateToBlocks`、`toolEntryToBlock`、`createCompactionBlock`）、`createEmptyStreamingState` 与状态变更 helper（`upsertStreamingTool`、`upsertCompactionSegment` 等）；desktop 与 Web 共用，渲染层直接 import |
| `R/session/task-queue.ts` | `createTaskQueueStore()`：任务快照、提交参数、steer 正文；`applyTaskSnapshot(snapshot, effects)` |
| `R/session/pending-submission.ts` | 未确认提交记录：`read / write / clear / sweepExpired` |
| `R/session/desktop-session-bridge.ts` | 把 live 事件接到 `ClientSessionStore`：增量 refresh、失败退避重试 |
| `R/session/SessionProjectionContext.tsx` | 挂 bridge，向下提供当前会话的 projection cell |
| `R/session/active-session-context.tsx`、`session-actions-context.tsx`、`R/components/composer/composer-context.tsx` | 三个 Context（§8） |
| `R/api/live-events.ts` | `liveEvents`：`events.sessionLive` 的单一订阅分发器（§7） |
| `R/app/providers.tsx` | `AppProviders`：按固定顺序挂所有 Provider |
| `C/sessions/session.ts` | `ClientSessionStore`：`applyEnvelope`、`applySnapshot`、`select`、`markError`、`get`、`peek`、`evict`、`cellIds`、`subscribe` |

（`R` = `apps/desktop/src/renderer`，`C` = `packages/client/client/src`，`S` = `packages/util/shared/src`。）

不引入状态库。每个 store 是一个带 `subscribe` 的小对象，React 侧用 `useSyncExternalStore` 读取。`SessionProjectionProvider` 接收 App 传入的 store，不调用 `bridge.open`，bridge 只负责 live 订阅和 refresh；读页由 App 的 `readSessionPage` 负责。

## 2. durable：cell 是唯一事实源

- App 不持有 `sessionRecord` state。当前会话的 record 由 `useSessionCell(sessionStore, selectedSessionId, …)` 读出 cell，再 `useMemo(selectChatSession)` 派生。memo 只依赖 `selectChatSession` 读取的字段（snapshot、window、projectionValues、deferredToolCalls），live 事件只推进 `lastLiveSeq` 时不重新投影。
- `useSessionCell` 的 selector 只在 cell 引用变化时重算，可以返回派生的新对象。没有 cell 时传给 selector 的是 `null`（内部用 `peek`，不用每次新建空 cell 的 `get`）。
- **读最新页**：`readSessionPage` 读页 → 比较页请求版本号 → `applyEnvelope`。只有 store 里还没有这个会话的 cell 时才显示加载中。
- **早期历史**：`loadEarlier(store, sessionId)` 按 cell 窗口的 `beforeSeq` 读上一页，交给 `applyEnvelope` 前插。同一会话同时只有一个请求；页回来时窗口的 `beforeSeq` 已经变了（cell 被 evict，或窗口被一页不相邻的新页替换）就丢弃该页。读取失败时抛出，由调用方显示错误。
- **合并规则由 store 决定**：相邻的页按 seq 合并；不相邻的最新页替换整个窗口，早期页需要重新加载；修订号更旧的快照不覆盖新的。renderer 不手工拼接 events，不从 id 字符串解析 seq，也不为每页重算 `createMessageBlocks`。
- 页请求和审批请求的版本号由 App 全局递增（`requestVersionRef`），`SessionLocalStore` 只记每个会话最近一次发出的号。不能改回按会话从 0 计数：evict 之后会话的计数会重来，在途的旧响应可能和新请求撞号。
- 新建、分叉会话：`sessionsApi.create` / `fork` 返回的 projection 直接 `applyEnvelope` 进 store。
- 从助手回复分叉：回复块带 `turnId`（来自 durable 事件，live 块没有），回复「…」菜单调用 `onForkSession(sessionId, turnId)`，`sessionsApi.fork({ sessionId, turnId })` 由 Host 用 `resolveTurnBoundary`（`@actspace/side-chat`）解析成该轮结束（含 run finish）的 Journal 边界；整会话分叉仍按当前末尾。该轮仍在运行（回复所在轮 `isActive`）或没有 turnId 时菜单项禁用，提示「请等待当前轮次结束后再分叉」。新会话标题 = 原标题 + 「（分叉）」，已带后缀不重复追加。分叉不继承可执行状态（队列由 `projectTasks` 按 sessionId 过滤，新会话为空）。

### 2.1 cell 保留（LRU）

- 常驻：当前会话和运行中的会话（`busySessionIds`）。常驻的不占名额。
- 其余按查看先后只保留 `SESSION_CELL_RETAIN_LIMIT = 5` 个，更早的 evict，下次打开时重新读页。
- 有 cell 却从未被查看过的（例如后台读过页）视为最早，先淘汰。
- App 的 effect 先 `retain(当前会话 + busy)`，再 `viewed(当前会话)`。
- `ClientSessionStore.evict` 拒绝 evict 当前选中的会话，也不通知订阅者（只用于没人观察的会话）。

### 2.2 流式输出的渲染预算

流式输出时每个 delta 都会来事件，每秒可达上百个。渲染成本 = 渲染次数 × 渲染范围 × 每次解析量，三项都要压住：

- **流式文字不进日志**：新会话不写 `assistant/chunk`，正文 / 思考增量只走实时通道（[流式输出只走实时通道](../agent-plugin-runtime/agent-spec-live-assistant-stream.md)）。日志里只有每次调用一条 `assistant/message`，流式期间没有逐 token 的 journal-update。
- **主进程先合并**：正文 / 思考增量只走 `agentStream` 一条通道，`FixedRendererStreamAdapter` 在桌面端以 `RENDERER_STREAM_INTERVAL_MS`（33ms，`main/runtime-v2/runtime-registry.ts`）合并同一条消息的连续增量。`sessionLiveEvent` 不转发 `assistant-delta` / `reasoning-delta`，只转发 `run-state` 与 journal 事件，逐条直接发送。任何 journal 事件（工具、`assistant/message`、run 边界、审批）发送前先冲掉积压的增量帧，定稿消息不会越过它之前的片段。
- **实时底稿**：主进程的 `LiveOutputBuffer`（`@actspace/shared/runtime-v2` 的 `live-output.ts`）保存每个会话当前运行里还没定稿的正文与思考，按 `messageId` 分组，带请求的 `requestId`。
  - 每接受一个增量，全局 `revision` 加一；合并后的增量帧带上它包含的最后一个 `liveRevision`。
  - `assistant/message` 写入日志后删掉这条消息，运行结束时整份删除。
  - `sessions.liveOutput({ sessionId })` 先冲掉积压帧再读底稿，所以之前发出的帧都不超过底稿的 `revision`，之后的帧都更大。远程会话返回 `null`，由远程适配器在 `agent_run_started(recoveredReset)` 之后自己推底稿。
- **按帧合并通知**：`R/session/frame-batch.ts` 的 `scheduleFrame` 是渲染进程共用的帧调度器。`LiveRunStore`（`createLiveRunStore(limit, { scheduleNotify })`）对 `assistant_text_delta`、`assistant_thinking_delta`、`tool_call_streaming` 只登记、下一帧统一通知；Session bridge 收到的 journal 事件都是结构性的，直接应用。
- **结构性事件立即生效**：run 开始 / 结束、工具结果、`assistant/message` 等不排队，顺序不变。新增高频事件类型时才往 LiveRunStore 的延迟集合里加，结构性事件不能加。
- **Chat 投影不读 chunk**：Chat 投影忽略 `assistant/chunk`（旧会话里有，新会话没有），崩溃留下的孤儿 chunk 不显示为进行中。正文由 LiveRunStore 按帧显示，历史块保持引用不变。
- **恢复运行**（渲染进程重载、窗口重开后重新挂上的 run，`isRecoveredRun`）：
  - LiveRunStore 先缓存这个运行的正文 / 思考增量，任务队列（`task-queue.ts`）和审批恢复调用 `attachLiveBaseline`（`R/session/live-runs/live-baseline.ts`）读 `sessions.liveOutput`，以 `live_output_baseline` 事件灌入运行状态。
  - 底稿作为起点；缓存的帧和之后的帧里 `liveRevision` 不大于底稿的丢掉，其余照常追加，不重复、不缺字。没带 `liveRevision` 的帧照常追加。只认第一份底稿；读取失败时给空底稿，缓存的增量照常显示。
  - 底稿的 `runId` 与这个运行不同（读取时运行已换）时只用 revision 截断，不灌文字。
  - 压缩操作恢复的 run 没有底稿，直接丢弃它的正文增量。
  - 远程会话（Web 端、远程 Host）的适配器按 `afterRevision` 分页回放底稿，跳过投影里已经定稿的消息，再推 `live_output_baseline`，界面侧逻辑相同。
- **订阅隔离**：每帧变的数据不进 App 状态和粗粒度 context。消息序列在 `R/session/transcript-context.tsx` 的 transcript store 里，消息区用 `useTranscriptMessages()`，外壳只用 `useTranscriptSelect(selector, isEqual)` 取派生小值；投影派生值用 `SessionProjectionContext.tsx` 的 `useProjectionSelect(selector, isEqual)`，只认当前会话自己的 cell / overlay，后台会话的事件不触发重渲染。App 只从 live run 取 `useLiveRunSelect` 给的小状态。侧栏、右栏外壳、输入框外壳、`WorkbenchLayout` 用 `memo`，流式时不随帧渲染；selector 和 isEqual 用模块级函数。`render-isolation.test.tsx` 守住这条：100 帧流式下侧栏、右栏、输入框外壳渲染 0 次。
- **按引用跳过**：`TurnView` 逐条比较消息块引用，`AssistantReply`、`MarkdownProse` 用 `memo`。新增给这些组件的 props 必须是稳定引用（`useCallback` / 常量），否则整页历史每帧都会重渲染。
- **Markdown 分块**：`MarkdownProse` 用 `components/messages/markdown-blocks.ts` 按顶层块切分，除最后两块外冻结复用，只重新解析尾部；每块单独交给 react-markdown，`MarkdownSourceContext` 给的是本块源码。引用式链接定义、脚注会跨块生效：全文收集后，追加到引用它们的块，脚注区整条回复只渲染一次，不再退回一块。代码块不做语言自动识别，没标语言的按纯文本显示。流式时 `MarkdownProse` 按帧平滑放出积压的文字，每帧只重渲染最后一块；`ReplyStreamingContext` 结束后，要等积压放完才退出流式显示。详见[聊天区 Markdown 渲染规范](front-聊天区Markdown渲染规范.md)的「流式输出」「分块与性能」。

## 3. 块的身份字段

`MessageBlock` 与 `SessionEvent` 上有两个可选字段，只在 renderer 本地计算，不属于 Runtime / Host / Session 协议：

| 字段 | 含义 | 谁写入 |
| --- | --- | --- |
| `runId` | 块所属的 agent run | durable：`createMessageBlocks` 的 `withIdentity` 从 `event.agentRunId` 写入，每个块都有；live：`streamingStateToBlocks(state, agentRunId)` 补写，`createCompactionBlock` 自己写，App 构造的 user / steer / workspace-preparation 块显式写 |
| `sourceSeq` | 投影来源 Journal envelope 的 seq | 只由 client 的 `projectChatEvents` 写入（`base` 里的 `sourceSeq: event.seq`）。live 块（含恢复运行从实时底稿开始的块）和 subagent 合成事件没有这个键 |

规则：

- 两个字段都用条件展开：没有值时连键都不出现，不写 `undefined`。
- 同一条 envelope 可能投影出多个事件（如 user + thinking），它们共用一个 `sourceSeq`。**`sourceSeq` 标识来源，不是块的唯一键。**
- `sourceSeq` 表示可指向单条 Journal envelope 的直接投影；没有它不等于底层事实未落盘。回复批注只允许批注带 `sourceSeq` 的块（`annotatableMessageIds`），未定稿的 live 块须等完整消息接手。
- `renderKey` 保留，只用于 DOM 复用和 user 块去重，不用来判断归属。
- renderer 里不允许解析 id / renderKey 字符串来判断归属或序号：不写 `startsWith("turn:…")`、`includes(":tool:")`、`/^v2-/`。新代码需要归属信息时读 `runId` / `sourceSeq`。

## 4. 正文合并：`mergeTranscript`

```ts
mergeTranscript(
  durable: { blocks: MessageBlock[] | undefined; events: SessionEvent[] },
  live: { blocks: MessageBlock[]; runId: string | null; recovered: boolean },
  local: { compactionFailure: MessageBlock | undefined; isStreaming: boolean; bashUpdates: Record<string, BashTaskUpdate> },
): MessageBlock[]
```

按顺序：

1. **durable 部分**（`durableTranscript`）：
   - 正在流式输出的 run（live 有块且不是恢复的 run）：durable 里 `runId` 相同的块隐藏，由 live 显示。run 结束、live 卸下后，durable 接手，相同 renderKey 复用 DOM。
   - 恢复的 run（渲染进程重载后重新挂上）：durable 显示全部已定稿内容并全部保留，只隐藏 live 里已有的工具块（按 renderKey 比较）。`todo` 不算工具块，恢复时 durable 的 todo 不隐藏。
   - record 没有块时，退回用 events 现算，同样过滤正在流式的 run。
2. **user 去重**：durable 已有相同 renderKey 的 user 块时，丢掉 live 的占位 user 块，保留 durable 的。
3. **追加 live 块**。没有 durable 对应物的块（steer 插入的 user、workspace-preparation）保持原样显示，不套用「run 完成后整组让位」。恢复的 run 里 live 的正文 / 思考从实时底稿开始：消息定稿后 durable 里出现同一 run、同样内容的块，live 的这一块不再显示；live 块的序号从底稿重新数，与 durable 同一 run 的 renderKey 撞上时加 `:live` 后缀。规则与 Web 端（`apps/web` 的 transcript-model）一致。
4. **本地装饰**：不在流式时追加压缩失败块；后台 bash 状态（`bashUpdates`）覆写 durable bash 块的 `backgroundStatus` / `exitCode`。
5. **回退进行中**（`local.rewindFromSeq`，来自 `SessionLocalState.rewinding`）：durable 部分截到 `sourceSeq >= fromSeq` 的第一块之前，被编辑轮及之后不再显示，新提问由乐观 run 显示。会话重载完清掉。

`mergeTranscript` 是纯函数。改动它时，`R/test/transcript.test.ts` 的场景必须全部通过；App 级用例经 `R/test/helpers/transcript-shadow.ts` 与基准实现（`apps/desktop/test-fixtures/legacy-transcript.ts`）逐次对照，有意改变行为时要同时更新对照基准。

恢复中的 run 如果 durable 和 live 都有 todo，会出现两块 todo，这是保留的既有行为。

## 5. SessionLocalStore

```ts
type SessionLocalState = {
  composerText?: string;                       // 输入框正文（WorkbenchLayout 切会话时读回）
  annotationDraft?: ResponseAnnotationReference[];
  attachments?: ComposerAttachment[];          // 输入框里还没发送的附件
  draft?: ComposerDraftRestore;                // 发送失败 / 未确认提交恢复到输入框的草稿
  composer?: ComposerSessionState;             // mode、selectedSkills
  compactionFailure?: CompactionBlock;
  bashUpdates: Record<string, BashTaskUpdate>;
  rewinding?: { fromSeq: number };            // 编辑提问重发进行中，见 §4 第 5 步、§6.1
  lastSendOptions?: ComposerSendOptions;
  approvalPending: boolean;
  failed: boolean;
  messageQueue: SessionMessageQueue;
  pageVersion: number;
  approvalVersion: number;
};
```

- 接口：`get / update / subscribe / evict / evictWhere / ids`。`update` 的函数返回同一对象时不通知；`evict` 只在确实删除了条目时通知。`evict` / `evictWhere` 同时释放 `attachments` 和 `draft.attachments` 里图片预览的 blob URL。
- 没有条目的会话和 `sessionId === null` 返回冻结的 `DEFAULT_SESSION_LOCAL_STATE`。
- 读取：
  - 单个会话：`useSessionLocalState(store, sessionId, selector)`（App 自己是 Provider，用带 store 参数的版本）；组件里用 `useSessionLocal(sessionId, selector)`，缺 Provider 时抛错。
  - 跨会话的集合（状态徽标、分叉 / 归档前检查）：`useSessionLocalIds(store, predicate)`，成员不变就返回同一个 Set。
- **新增按会话的本地状态，加字段到这里**。不要在 App 或组件里另开 `Map<sessionId, …>` ref，也不要再写「切换会话时把当前值复制进 state」的镜像；按 `selectedSessionId` 选择即可。
- `useSyncExternalStore` 的更新是同步渲染的。写 store 后紧接着 throw 的路径（如发送被拒时先写带错误的草稿再 throw），下游的 `catch` 不能无条件覆盖 store 已写入的值（Composer 用 `current ?? …` 兜底）。

## 6. live run 与任务队列

- `LiveRunStore`：
  - `start / end(sessionId, expected?)` 同时维护 busy 集合。`end` 只卸下仍是自己的 run。
  - `view(sessionId)` 合成 `streamingBlocks`、`isStreaming`、`isAborting`、`activeAgentRunId`、`isRecoveredRun`，按会话缓存，`refresh` 时失效。App 用 `useLiveRunView(liveRuns, selectedSessionId)`。就地修改 run 后必须 `refresh`，否则视图不更新。
  - terminal runId 是有界集合，只保留最近 `TERMINAL_RUN_LIMIT = 200` 个，重复加入的移到最新。用于拒绝被 terminal 事件超越的旧快照（不让结束的 run 复活）。
  - `busyIds()` 成员不变时返回同一个 Set。
- `TaskQueueStore`：任务快照、提交参数（`rememberOptions / forgetOptions`）、steer 正文，每项记下所属会话，`evict(sessionId)` 整体释放。
- **`task-queue-updated` 只是信号**，收到后要再调一次 `tasks.command({ op: "snapshot" })` 拿快照，再 `applyTaskSnapshot`。
- **补齐（hydrate）**：每个会话 id 只补齐一次审批和任务快照（`hydratedSessionIdsRef`）。启动时补齐当前列表；分页新增的 id 补齐一次；之后靠事件。列表变化（改标题、run 结束、分页）不能再触发对全部会话的刷新。
  - 只补齐侧栏可见的会话（`visibleSessions`）。移除工作区后，它的会话已被 evict 但仍在 `sessions` 里，不能因为下一次列表刷新又被补齐回来。
  - Host 从未连接变为已连接时，把它的后台会话移出已补齐集合，紧接着的列表刷新会重新补齐（断线期间收不到它们的事件）。
  - 选中会话时另外刷新一次审批和队列（原有行为）。
- `session-ipc-budget.test.tsx` 记录并约束各场景的 IPC 次数与 `createMessageBlocks` 调用次数；改动补齐或读页逻辑时看它的数字。
- **乐观 run**：空闲发送和编辑重发在提交前用客户端生成的 `agentRunId` 先 `liveRuns.start`，用户块 id 为 `turn:${agentRunId}:user:0`，与 durable 的 renderKey 相同，落盘后按 §4 第 2 步去重。`rememberOptions(…, agentRunId)` 记下申请的 run id：`applyTaskSnapshot` 不把这条任务投影进托盘；任务没开始就结束（取消、开始前失败）时卸下乐观 run。提交失败同样卸下。

### 6.1 会话回退后的重载

Host 回退会话时日志被改写成更短的前缀，序号和任务快照修订号都会变小，增量合并不再成立（[编辑提问重发](../agent-runtime/agent-edit-resend-rewind.md) §5.4）。

- 收到 `session/rewound`（以及发起回退的窗口在提交成功后）：`ClientSessionStore.reset(sessionId)` 丢掉在途读取、拒绝日志增量，下一份信封整体替换 cell；`DesktopSessionBridge` 对它整页重读（未被观看的保留 cell 也 reset，重新打开时直接替换）。
- App 同时 `taskQueue.forgetSnapshot`（下一份更小修订号的快照直接接受）、清空本地队列投影和压缩失败块、重读任务快照，重载完清掉 `rewinding`。
- Web 端 `SessionObserver` 同样处理：reset store、丢掉任务快照、卸下已结束的 run，再整页刷新并重取任务快照。

## 7. live 事件订阅

- `events.sessionLive` 在整个 renderer 里只订阅一次，由 `liveEvents`（`R/api/live-events.ts`）分发：
  - `liveEvents.subscribe(listener)`：收全部事件；
  - `liveEvents.onMessage(message, listener)`：只收 `runtime-live` 中指定 `message` 的事件。
- 按引用计数：第一个消费者订阅底层源，最后一个退订时释放，之后再订阅会重新连上。同一个函数订阅两次算两个消费者；重复退订无效。
- 一个消费者抛错只打控制台，不影响其他消费者。
- 新增 live 事件消费者用 `liveEvents`，不要直接调 `eventsApi.sessionLive`。

## 8. Context

| Context | 内容 | hook |
| --- | --- | --- |
| `ActiveSessionContext` | sessionId、title、messages、contextSnapshot / contextState、isStreaming、isAborting、isCompacting、isSessionReady、发送滚动 / 聚焦请求号、onSend、onAbort、onRetryCompaction | `useActiveSession()` |
| `ComposerContext` | 草稿读写（draftKey、readDraft / writeDraft、批注草稿）、messageQueue、composerNotice、模型、mode、skills、draftRestore | `useComposerContext()` |
| `SessionActionsContext` | 新建、选择、置顶、重命名、复制 id / 正文、分叉、归档、打开 / 归档 / 移除工作区 | `useSessionActions()` |

- 三个 hook 缺 Provider 时都抛错，不静默渲染空值。
- 嵌套顺序固定在 `AppProviders`：SessionProjection > SessionBrowse > SessionLocalStore > ActiveSession > RunTarget > Composer > SessionActions > SideChatRuntime > RightPanel。`RunTargetContext` 提供工作区、分支、运行位置与远端目标。
- App 用 `useShallowStable`（`R/hooks/useShallowStable.ts`）生成每个 value：字段逐个相等时返回上一次的对象。动作函数用 `useCallback` 保持稳定引用。新增字段时同时检查它是否稳定；不稳定的上游会让 value 每次重建。
- **App 里不要用带工厂函数的 `useMemo` 拼 Context value，也不要把 cell 放成 App 的局部变量。** 同一函数里的闭包共用一个作用域，被任何闭包读到的局部变量都会进这个作用域。App 的 `useCallback` 之间会一层层留住旧渲染的作用域（`handleArchiveSession` → `handleForkSession` → 更早的 `handleArchiveSession` …），作用域里的 messages、contextState、cell 原始事件（系统提示词、技能列表）就跟着留下，归档后的会话释放不掉。cell 由 `useChatSessionRecord`（`R/session/session-store.ts`）在 hook 内部投影，App 只拿到 `sessionRecord` 和 `historyBefore`。
- 测试里单独渲染 `WorkbenchLayout` / `ConversationView` / `Sidebar` 时，用 `R/test/helpers/workbench.tsx` 的 `TestWorkbenchLayout`、`TestConversationView`、`TestSidebar`：它们接受平铺的 prop，拆进对应的 Provider。Context 增减字段时，那里的键表（`satisfies Record<keyof X, true>`）会编译失败，提醒同步。

## 9. 未确认提交（pending-submission）

一次发送在 Runtime 确认收到之前，可能因为崩溃、断线或 IPC 失败而结果未知。这类提交按下面的规则处理，**本地会话和远端会话相同**：

- 存储：`localStorage`，键 `actspace:pending-submission:<sessionId>`，值 `PendingSubmissionRecord = { content, id, draft, createdAt }`。
  - `content`：序列化后的提交内容；`id`：submissionId；`draft`：恢复到输入框用的内容（附件去掉 `previewUrl`，blob URL 跨重启无效）。
  - renderer 侧的类型叫 `PendingSubmissionRecord`，与 main 进程 remote-hosts 的 `PendingSubmission` 不是一回事。
- 写入与清除（`handleSend`）：
  - 提交前写入；内容与已有记录相同时复用记录里的 submissionId，让 Runtime 按 submissionId 去重。
  - 配置任务失败、明确被拒（`acknowledgement: "rejected"`）、确认收到时清除。
  - 结果为 `unknown` 时，先用同一 submissionId 重试一次；仍为 `unknown` 就保留记录，草稿留在输入框。
- 恢复（激活会话时，App 的 effect）：
  - 已有草稿、输入框里已有文字、这个会话有发送正在进行（`sendsInFlightRef`，`handleSend` 用 try/finally 计数），或没有记录时跳过。
  - 先刷新任务快照：`tasks[].submissionId` 已含记录的 id，说明 Runtime 收到了，只清除记录，不恢复。durable user_message 的投影里不带 submissionId，不能用来判定。
  - 快照查询失败：打控制台，降级为恢复草稿。
  - 恢复为草稿，附提示「上次提交尚未确认，再次发送将核对同一次提交。」。等待快照期间切走了会话、出现了草稿、用户在输入框里打了字、开始了一次发送，或记录 id 变了，就不覆盖。
  - **永不自动重发**。用户原样再次发送时复用同一 submissionId。
- 清理：启动时 `sweepExpiredPendingSubmissions()` 删除无法解析的记录和超过 7 天（`PENDING_SUBMISSION_TTL_MS`）的记录；没有 `createdAt` 的旧格式记录补上当前时间，从现在起算。
- 测试：`R/test/setup.ts` 的 afterEach 清掉所有 `actspace:pending-submission:*` 键。

## 10. evict 时机

`App.evictSession(id)` 一次释放一个会话的全部 renderer 状态：`SessionLocalStore`、`LiveRunStore`、`TaskQueueStore`、cell 保留记录（`cellRetention.forget` → `ClientSessionStore.evict`），并把 id 移出已补齐集合（取消归档后会重新补齐）。

| 时机 | 调用点 | 说明 |
| --- | --- | --- |
| 归档会话 | `handleArchiveSession` | 归档成功后才释放；失败回滚时不丢草稿 |
| 归档工作区 | `handleArchiveWorkspace` | `archiveMany` 中失败的 id 不释放 |
| 移除工作区 | `handleRemoveWorkspace` | `setVisibility` 成功后释放 |
| cell 超出 LRU 名额 | `createSessionCellRetention` | 只释放 cell，本地状态保留 |

- 当前会话不释放。
- 每次释放给该会话的 evict 计数加一（`evictionCountRef`）。`refreshTaskQueue` 在请求前后比较计数，变了就丢弃这次快照：释放之前发出、之后才回来的快照不能把释放掉的队列重新建出来。
- 运行中的会话放进 `pendingEvictionsRef`，等它离开 busy 集合再释放；run 结束前重新选中它就取消。
- **未做**：移除 Host 时的 evict。移除后它的会话以「离线」继续显示，本地状态保留与此一致。没有「删除会话」的入口。
- 未确认提交记录不随 evict 删除，由 §9 的规则管理。

## 11. 错误可见

- cell：`#load` 失败时 `markError`，cell 变为 `status: "error"` 并带 `error`；下一次成功的 `applyEnvelope` / `applySnapshot` 清回 `ready` / `null`。
- bridge refresh（live 事件触发）失败后按 1s、2s、4s 退避重试，最多 3 次；用完仍失败时停下，错误留在 cell 上并打控制台。等待期间会话被切走或 bridge 被 dispose 就不再重试。
- `ConversationView` 显示 `browse.messageError ?? 「会话同步失败：<cell.error>」`，带「重试」。重试走 `browse.retryMessages`；单独挂 Provider 时重新 `bridge.open`。
- 队列刷新 / 队列命令失败：`reportSessionFailure(sessionId, text)` 打控制台，并且只在该会话是当前会话时在输入框上方提示（「队列状态读取失败，请稍后重试。」「队列操作没有完成，请重试。」）。
- 有意只打控制台的：run 结束后侧栏列表的后台刷新（失败时列表保持原样，下一次刷新会补上）、`refreshSession` 外层的兜底 `.catch`（`readSessionPage` 内部已把错误写进 `messageError`）。
- 设置、工作区、复制、重命名、分叉、归档等其余路径的失败只打控制台，不在本规范范围内。新增会话数据路径时，失败要像上面一样让用户看得到；确实只需打控制台的，在代码注释里写明理由。
