# 14 状态层 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/14-状态层执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-14`，从 `refactor/desktop-frontend@d86be81f`（13 的 squash 提交）拉出
- **开始时间**：2026-10-06 05:55
- **结束时间**：2026-10-06 10:42

## 执行时间线

### T0：启动与基线

- 13 的 squash 提交 `d86be81f` 已登记到 13 的交接和 00 §11。
- **行号漂移**：App.tsx 从计划写的 2779 行变为 2516 行（10、13 删掉了本地会话和 bridge 检查），结构与计划背景一致。重新定位如下：
  - S1 纯函数：`getSessionTitle` :93；`hasFinishedAllActiveTools` :166 … `dropTrailingStreamSegments` :242；`getStreaming*Text` :278-348；`toolEntryToBlock` :350；`streamingStateToBlocks` :637；`CompactionBlock` :707；`createCompactionBlock` :710；`upsertCompactionSegment` :730；`upsertWorkspacePreparationSegment` :736。
  - S2：全量刷新的 effect 在 :1124-1129；`refreshTaskQueue` :978；`refreshPendingApprovalStatuses` :1032。
  - S3：各 Map 在 :786-910（`pageCacheRef` :786，`sessionRunsRef` :813，`terminalRunIdsRef` :814，`draftsRef` :819，`messageQueuesRef` :826，`bashUpdatesRef` :831，`taskSnapshotsRef` :909）。
  - S4：`sessionStore.subscribe` :833；`readSessionPage` 的手工合并在 :1252-1256，`loadEarlierMessages` 在 :1286。
  - S5 字符串去重：`/^v2-(\d+)/` :1252-1253；`:tool:` :2017；`renderKey.startsWith("turn:…")` :2021；`streamingTurnEventIds` :2007；`durableUserKeys` :2036。
  - S8：`eventsApi.sessionLive` 订阅在 :990 和 :1209。
  - S9：`SessionProjectionContext.tsx:67` 的 `bridge.open(…).catch(() => undefined)`；`desktop-session-bridge.ts:61` 的 `catch { return; }`。
  - S10：pending-submission 的读取在 :863，写入在 :1780 一带。
  - 归档 / 移除：`handleArchiveSession` :2323、`handleArchiveWorkspace` :2350、`handleRemoveWorkspace` :2392。
  - `SessionBrowseContext` 的 value 是内联对象字面量，在 :2457。
- **基准测试** `R/test/session-ipc-budget.test.tsx`（只记录，不断言）：
  - 用 `vi.mock("@actspace/shared")` 包住 `createMessageBlocks` 来计数。临时打栈确认：计数同时包含 App 的调用和 `@actspace/client` 内部 `chat.ts:73` 的调用。client 以 dist 形式内联，经 alias 解析到同一个被 mock 的模块。
  - 侧栏标题文本会被拆成多个节点，所以 100 个会话的场景用 `.session-row` 的数量等待。
  - 10 页早期历史加载完后，最新那条不在窗口里了（有界历史），所以不再断言它。

| 场景 | `approvals.listPending` | `tasks.command` | `sessions.getPage` | `createMessageBlocks` |
| --- | --- | --- | --- | --- |
| 100 个会话挂载 | 100 | 102 | 1 | 5 |
| 之后重命名 1 个标题（增量） | **100** | **100** | 0 | 0 |
| 打开 2000 条事件的会话（增量） | 1 | 2 | 1 | 5 |
| 连续加载 10 页早期历史（增量） | 0 | 0 | 10 | 30 |

  - 重命名一次就触发 100 + 100 次 IPC，即计划所说的 2N 风暴。
  - 每加载一页早期历史，`createMessageBlocks` 跑 3 次全量投影：App :1286 手工合并 1 次，selector / memo 2 次。

### T1：流式块生成与状态 helper 迁出

- `R/session/live-runs/stream-state.ts`：`hasFinishedAllActiveTools`、`isEmptyTodoPreview`、`upsertStreamingTool`、`updateStringSet`、`appendOrMergeSegment`、`dropTrailingStreamSegments`、`upsertCompactionSegment`、`upsertWorkspacePreparationSegment`。
- `R/session/live-runs/stream-blocks.ts`：`getStreaming*Text` 一组、`displayFileName`、`toolEntryToBlock`、`streamingStateToBlocks`、`CompactionBlock`、`createCompactionBlock`。
- 函数体原样搬迁（脚本按行段剪切，只给函数和类型加 `export`）。`copyWithSelection` / `copyTextToClipboard` 不在计划范围内，留在 App。App 删掉不再使用的 `BashStatus`、`ToolUiPreview`、`ToolEntry`、`StreamingSegment` 导入。
- App.tsx 2516 → 1967 行。
- T0 的基准测试在全量运行时，2000 条事件那一项接近 5 秒的默认超时（单独跑 3.9–4.9 秒），三个场景都改为 30 秒超时。
- 结果：desktop typecheck 0 错误；desktop 全量测试文件 146 / 1（已知）/ 1，用例 1101 / 1 / 2。比 13 结束时多 1 个文件、3 个用例，即 T0 的基准测试。

### T2：`getSessionTitle` 迁出

- `R/session/session-title.ts`：函数体原样搬迁，App 改为 import。
- 结果：typecheck 0 错误；全量测试文件 146 / 1（已知）/ 1，用例 1101 / 1 / 2，与 T1 一致。

### T3：审批 / 任务队列改为按会话 id 增量补齐

- 删除「`sessions` 每次变化就对全部会话调 `approvals.listPending` + `tasks.command(snapshot)`」的 effect。改为 `hydratedSessionIdsRef`：只补齐列表里新出现的 id，每个 id 一次。
- 「选中会话时补一次」原本就有：`handleSelectSession` 刷新审批，`selectedSessionId` effect 刷新队列。这次没有改。
- **计划外补充（行为保持）**：旧的全量刷新会顺带覆盖「Host 断线重连」。断线期间远端会话的审批 / 队列事件收不到，重连时的列表刷新会把它们重新拉一遍。改成增量之后，这条路径只剩活动会话（`hostsChanged` effect 里本来就有）。所以在 `hostsChanged` 里记下已连接的 Host（`connectedHostIdsRef`）：某个 Host 从未连接变为已连接时，把它的后台会话移出 `hydratedSessionIdsRef`，紧接着的列表刷新会重新补齐。活动会话不移出，避免重复。
- 断言：
  - `session-ipc-budget`：改标题后 `listPending` / `taskCommand` 增量为 0（T0 基线为 100 / 100）；新用例「侧栏再加载一页 M=15 个会话」，增量正好 15 / 15。
  - `app-remote-host-refresh`：新用例「Host 重连后，后台远端会话的审批被重新补齐一次」。
- 变异验证：
  - App 退回 T2 的全量刷新：两条预算断言都失败（改标题 100 / 100，加载一页 35 / 35）。
  - 去掉重连时的移出：重连用例失败（期望 2 次，实际 1 次）。
  - 第一版重连用例只有一个会话，它是活动会话，原有路径就会刷新，测不出改动。改为加一个后台会话。
- 结果：
  - typecheck 0 错误。
  - 全量测试文件 146 / 1（已知）/ 1，用例 1103 / 1 / 2。
  - `app-message-queue` 和 `app-approval-recovery` 共 18 个用例通过。
  - 有一次全量运行中 `composer.test` 的 ResponseAnnotationPill 用例失败，单独跑 3 次都通过，再跑全量也通过。这个文件不渲染 App，和已知的 HoverCard 定时器偶发问题是同一来源。

| 场景（增量） | listPending | taskCommand | getPage | createMessageBlocks |
|---|---|---|---|---|
| 改标题（T0 → T3） | 100 → 0 | 100 → 0 | 0 → 0 | 0 → 0 |
| 加载一页 15 个会话（T3 新增） | 15 | 15 | 0 | 0 |

### T4：SessionLocalStore

- `R/session/session-local-store.ts`：
  - `createSessionLocalStore()` 提供 `get / update / subscribe / evict / evictWhere / ids`。`update` 的 fn 返回同一对象时不通知；`evict` 只在确实删除了条目时通知。
  - `useSessionLocalState(store, id, selector)` 基于 `useSyncExternalStore`；`useSessionLocal(id, selector)` 从 `SessionLocalStoreContext` 取 store，缺 Provider 时抛错。App 自己就是 Provider，不能用 context 版本，所以保留带 store 参数的版本。
  - 没有条目的会话，以及 `sessionId === null`，都返回冻结的 `DEFAULT_SESSION_LOCAL_STATE`。
- 状态形状相对 02 §3.1 的调整：
  - 加了 `messageQueue`、`pageVersion`、`approvalVersion`，T5④ 要迁的就是这三个。
  - `composer` 改为可选，默认值仍由 App 的 `DEFAULT_COMPOSER_STATE` 提供。
  - `pendingSubmission` 不放进来：T20 单独做 `pending-submission.ts`（localStorage 持久化），到时再决定是否镜像到这里。
  - 多了 `ids()`，测试和「归档 20 个会话看内存」的检查要用。
- 测试 `R/test/session-local-store.test.tsx`（计划写 `.ts`，hook 用例要 JSX，所以用 `.tsx`），5 个用例：
  - evict 后返回默认值；
  - `evictWhere`；
  - 订阅通知，无变化时不通知；
  - selector 结果不变时不重渲染，切到 `null` 会话时返回默认值；
  - 缺 Provider 时抛错。
- 结果：typecheck 0 错误；全量测试文件 147 / 1（已知）/ 1。

### T5①：drafts 与 composerState 迁入 SessionLocalStore

- App 用 `useState(createSessionLocalStore)` 持有 store，`patchLocal(id, partial)` 合并写入。
- `draftsRef` 删除，读写改为 store 的 `draft` 字段。`composerDraftRestore` 镜像 state 暂时保留，由 `setActiveSessionId` 从 store 填入，T6 删除镜像。
- `composerStateBySession` state 删除：
  - 当前 composer 状态改为 `useSessionLocalState(localStore, composerStateKey, selectComposerState)`；
  - `handleRetryCompaction` 改为 `localStore.get(id).composer`，依赖里不再有整个 Map；
  - `"__draft__"` 提成常量 `DRAFT_COMPOSER_KEY`。
- 结果：typecheck 0 错误；全量测试文件 147 / 1（已知）/ 1，用例 1108 / 1 / 2。

### T5②：compactionFailure 与 bashUpdates 迁入

- `compactionFailuresRef`、`bashUpdatesRef` 删除，改为 store 的 `compactionFailure` / `bashUpdates`。写入点有 3 处：`applyTaskSnapshot` 的压缩失败、`setCompactionFailureForSession`、`bash_task_update` 事件。
- 镜像 state `compactionFailure`、`bashTaskUpdates` 保留到 T6。`bashTaskUpdates` 的类型改用 store 的 `BashTaskUpdate`；App 不再直接用 `BashBackgroundStatus`，删掉这个导入。
- 结果：typecheck 0 错误；全量测试文件 147 / 1（已知）/ 1，用例 1108 / 1 / 2。

### T5③：lastSendOptions、approval、failed 迁入

- `lastSendOptionsRef` 删除，改为 store 的 `lastSendOptions`。
- `approvalPendingSessionIds` / `failedSessionIds` 两个 Set state 删除，改为 store 的 `approvalPending` / `failed` 布尔字段。写入统一走 `setLocalFlag(id, flag, value)`，值不变时 update 返回原对象，不通知。
- App 和侧栏仍需要跨会话的集合（会话状态徽标、分叉 / 归档前的检查）。为此在 store 模块里新增 `useSessionLocalIds(store, predicate)`：成员不变就返回同一个 Set，`sessionStatuses` 的 useMemo 不会因为别的字段变化而重算。新增 1 个用例。
- `approvalVersionsRef` 留到 ④。
- 结果：typecheck 0 错误；全量测试文件 147 / 1（已知）/ 1，用例 1109 / 1 / 2。

### T5④：messageQueues、pageVersions、approvalVersions 迁入

- `messageQueuesRef` 删除，改为 store 的 `messageQueue`：`updateMessageQueue`、`applyTaskSnapshot`、插入 / 编辑队列项都读写 store。镜像 state `messageQueue` 保留到 T6。
- `pageVersionsRef` / `approvalVersionsRef` 删除，改为 store 的 `pageVersion` / `approvalVersion`。
- **版本号改为全局递增（计划外的小改动）**：旧写法按会话 `(get ?? 0) + 1`。T7 之后会话会被 evict，计数从 0 重来；evict 之前发出、还在途的旧请求可能和新请求撞号，旧响应就会被当成最新的。现在由 App 的 `requestVersionRef` 全局递增，store 只记每个会话最近一次发出的版本号。
- 版本号写入会通知订阅者，但 `useSessionLocalState` / `useSessionLocalIds` 的快照没有变，App 不会因此重渲染。
- 结果：typecheck 0 错误；全量测试文件 147 / 1（已知）/ 1，用例 1109 / 1 / 2。`session-ipc-budget` 的数字和 T3 一致。

### T6：删除镜像 state

- 删掉 4 个镜像 state：`bashTaskUpdates`、`composerDraftRestore`、`compactionFailure`、`messageQueue`。
  - 改为 `useSessionLocalState(localStore, selectedSessionId, select*)` 直接选当前会话的值。
  - `setActiveSessionId` 里的 4 行复制、各写入点上「是当前会话就 setX」的 8 行一起删除。
  - 计划写的「7 行」里另外 3 行（审批、失败、composer 状态）在 T5 迁移时就已经不是镜像了。
- **暴露的时序问题**：`useSyncExternalStore` 的更新是同步渲染的。发送被拒时，App 先写 store（草稿带格式化后的错误，比如「不是 UTF-8」，以及 attachmentIssue），再 throw。
  - 以前 `setState` 是批量更新，Composer 的 `catch` 先 `setSendError(原始 message)`，草稿恢复 effect 后执行，结果以草稿为准。
  - 现在顺序反过来，`catch` 覆盖了草稿恢复的错误。`chat-app-rejection` 的 2 个用例和 `app-response-annotations` 的 1 个用例失败。
  - 修法：Composer 的 `catch` 本来就是兜底（`setMessage(current => current || message)`），把 `setSendError` 改成同样的写法，即 `current ?? {…}`，已有错误就不覆盖。这样两种顺序结果都一样。
- 结果：typecheck 0 错误；全量测试文件 147 / 1（已知）/ 1，用例 1109 / 1 / 2。

### T7：归档 / 移除时 evict

- App 新增 `evictSession(id)`：
  - 释放 store 条目，同时把 id 移出 `hydratedSessionIdsRef`，取消归档后会重新补齐审批和队列；
  - 当前会话不释放；
  - 运行中的会话（`sessionRunsRef` 里有）放进 `pendingEvictionsRef`，等它离开 `busySessionIds` 再释放；
  - 在 run 结束前重新选中这个会话，就取消待释放。
- 调用点：
  - `handleArchiveSession`：归档成功后才释放，失败回滚时不丢草稿；
  - `handleArchiveWorkspace`：`archiveMany` 中失败的 id 不释放；
  - `handleRemoveWorkspace`：`setVisibility` 成功后释放。
- **范围补充**：写用例时发现 `WorkbenchLayout` 自己还有两份按会话的内存 Map，02 §1.2 没有列出：`composerDraftsRef`（输入框正文）和 `annotationDraftsRef`（回复批注草稿）。它们只增不减，取消归档后旧正文还在，计划要求的「草稿为空」做不到。
  - 两者改为 store 的 `composerText` / `annotationDraft` 字段。
  - App 用 `SessionLocalStoreContext.Provider` 把 store 交给 WorkbenchLayout；单独渲染 WorkbenchLayout（没有 Provider）时，退回到组件自己的 store。
- 没做：移除 Host 时的 evict。02 列了这一项，但计划 T7 只列 3 个 handler。移除 Host 后它的会话会以「离线」继续显示（`app-remote-host-refresh` 的现有约定），保留本地状态与此一致。
- 新增 `R/test/app-session-evict.test.tsx`，2 个用例：
  - 归档后取消归档再打开，正文、草稿错误和队列都为空。注意队列为空是 Host 快照决定的，不是严格的 evict 断言；严格的断言是草稿。
  - 运行中归档 → 取消归档再打开，流式内容和草稿都还在；再次运行中归档 → run 结束 → 取消归档再打开，草稿为空。
- 变异验证：
  - 去掉归档时的 evict：2 个用例都失败；
  - 运行中也立即 evict：用例 2 失败；
  - 去掉 run 结束后的补释放：用例 2 失败。
- 结果：typecheck 0 错误；全量测试文件 148 / 1（已知）/ 1，用例 1111 / 1 / 2。

### T8：`ClientSessionStore.evict` 与早期页前插

- `C/sessions/session.ts` 新增：
  - `evict(sessionId)`：删除 cell、overlay 和待发通知。拒绝 evict 当前选中的会话（返回 false）。evict 不通知订阅者：只给没人观察的会话用，而且 `#emitNow` 假定 cell 存在。
  - `cellIds()`：供 renderer 侧的 LRU 和内存检查使用。
- **不新增 `prependPage`**：决策记录写的是「如果 `applyEnvelope` 不能前插早期页才加」。用例证明它能：
  - 早期页与现有窗口相邻时会合并，事件按 seq 排序，`fromSeq` / `beforeSeq` 取早期页的值；
  - 早期页晚于 live 更新到达（快照修订号更旧）时，会保留已有事件和更新后的快照，只补进早期事件。
- `packages/client` 新增 3 个用例：
  - evict 后 `get` 为空 cell，`lastLiveSeq` 回到 -1，可以重新接收 live；选中会话不被 evict；不通知；
  - 前插早期页后 seq 有序，之后的 journal 更新照常接上；
  - 早期页在 live 更新之后到达，不丢 live 内容。
- 变异验证：去掉「选中会话不 evict」的判断，用例 1 失败。
- 结果：`pnpm --filter @actspace/client test` 4 个文件 21 个用例通过；client typecheck 通过；desktop typecheck 和全量测试与 T7 一致。
- 注意：desktop 经 `dist` 解析 `@actspace/client`，T9 用到 `evict` 前要先 `pnpm --filter @actspace/client build`。

### T9：`session-store.ts`（useSessionCell + cell 保留）与 `session-pages.ts`（loadEarlier）

- `C/sessions/session.ts` 补一个 `peek(sessionId)`：返回已存的 cell 或 null。原因是 `get` 对没有 cell 的会话每次都新建一个空 cell，放进 `useSyncExternalStore` 的 getSnapshot 会让快照永远不相等。client 的 evict 用例补了 peek 断言。
- 新增 `R/session/session-store.ts`：
  - `useSessionCell(store, sessionId, selector)`。与计划行写的 `useSessionCell(sessionId, selector)` 不同，store 改成显式传入，因为 App 自己就在 `SessionProjectionProvider` 之上，拿不到 context；这与 `useSessionLocalState(store, …)` 的写法一致。
  - selector 只在 cell 引用变化时重算，所以它可以返回派生的新对象。T10 的「按 cell 引用 memo」就靠这一点。
  - `createSessionCellRetention(store, limit = 5)`，提供 `viewed`、`retain(pinned)`、`forget` 和 `order`。
  - 常驻集合（活动会话加运行中的会话）不占名额；其余按查看先后只保留 5 个。
  - 有 cell 却从未被查看过的会话（例如后台读过页）视为最早，先淘汰。
  - `forget` 供归档 / 删除时直接释放；选中会话 evict 失败时，它仍留在查看记录里。
- 新增 `R/session/session-pages.ts`：`loadEarlier(store, sessionId, getPage = sessionsApi.getPage)`。
  - 按 cell 窗口的 `beforeSeq` 取上一页，交给 `applyEnvelope` 合并。
  - 同一会话同时只有一个请求。
  - 页回来时如果窗口的 `beforeSeq` 已经变了，就丢弃该页：cell 被 evict，或者窗口被一页不相邻的最新页替换，都会让它变。这一步是必须的：`applyEnvelope` 对不相邻的页会直接用新页替换窗口，一个迟到的早期页会把窗口换回早期内容。
  - 读取失败时抛出，由调用方显示错误。
- 新增 `R/test/session-store-lru.test.tsx`，共 8 个用例。计划写的是 `.ts`，这里用 `.tsx`，因为要渲染 hook。
  - 保留策略 3 个用例：
    - 查看第 6 个非活动会话时，最早的被淘汰，重新查看会刷新顺序；
    - 运行中的会话（包括从未打开过的后台 run）不被淘汰，也不占名额，run 结束后按原查看时间淘汰；
    - 未查看的 cell 先被淘汰，`forget` 直接释放，选中的会话不释放。
  - `useSessionCell` 1 个用例：别的会话变化时不重算、不重渲染；重渲染时派生对象引用不变。
  - `loadEarlier` 4 个用例：
    - 前插后 seq 连续，`beforeSeq` 归 null，之后不再请求；
    - 并发去重；
    - evict 或窗口替换后，迟到的页被丢弃；
    - 失败时抛出，之后可以重试。
- 变异验证，5 处都被用例抓到：
  - 名额多留 1 个：3 个用例失败；
  - 忽略常驻集合：第一次没被抓到，因为常驻会话都被查看过，补上从未打开过的后台 run 后失败；
  - 去掉 selector 缓存：1 个失败；
  - 去掉窗口检查：1 个失败；
  - 去掉并发去重：1 个失败。
- 结果：desktop typecheck 0 错误；全量测试文件 149 / 1（已知）/ 1，用例 1119 / 1 / 2，比 T7 多出 8 个新用例；client 21 个用例通过。
- 这一步只新增模块，App 还没接入。接入、删除 `pageCacheRef` 和手工合并在 T10。

### T10：durable 块从 cell 派生，删除 `sessionRecord` state 与手工合并

- `R/App.tsx`：
  - **`sessionRecord` 改为派生**：`useSessionCell(sessionStore, selectedSessionId, …)` 读到 cell 后，再 `useMemo(selectChatSession)` 得到它。
    - memo 的依赖只列 `selectChatSession` 读取的字段：snapshot、window、projectionValues、deferredToolCalls。live 事件只推进 `lastLiveSeq` 时 cell 引用会变，但不再重新投影。
    - `historyBefore = cell.window.beforeSeq`。
  - **删除的东西**：
    - `sessionRecord` / `historyBefore` 两个 state，以及原来把 cell 复制进 state 的订阅 effect；
    - `pageCacheRef`、`cacheSessionPage`、`SessionPageCache`；
    - run 上的 `record` / `historyBefore` 字段（`SessionRunState` 同步删除）；
    - `readSessionPage` 的 `restoreCache` 参数；
    - 全部 `setSessionRecord(…)` 调用，共 13 处。
  - **`readSessionPage`**：读最新页 → 检查版本号 → `applyEnvelope`，不再按 `v2-` 正则拼早期事件、也不再重算 `createMessageBlocks`。只有 store 里还没有这个会话的 cell 时，才显示加载中。
  - **`loadEarlierMessages`**：调用 `loadEarlier(sessionStore, id)`（T9），不再手工前插。
  - **cell 保留**：一个 effect 先 `retain(当前会话 + busySessionIds)`，再 `viewed(当前会话)`。`evictSession`（T7）同时调用 `cellRetention.forget`。
  - **新建 / 分叉会话**：改为直接调用 `sessionsApi.create` / `fork`，把原始 projection `applyEnvelope` 进 store，再用 `projectChatWindow` 取 meta。原来是把 record 写进 state。`api/sessions.ts` 的 `createSession` / `forkSession` 保留，它们有单测，App 不再用。
  - **删除死代码**：
    - 模式切换里的 `else if (sessionId)` 分支，紧跟在 `if (sessionId)` 之后，永远走不到；
    - 重命名里从未调用的 `updateSessionTitle`。
- **行为差异，需要验收留意**：
  1. **标题**：`getSessionTitle` 改为优先取列表项，再取 record。原先 App 在列表刷新和重命名后，把列表标题回写进 record，所以效果相同。`keeps New chat as a placeholder…` 用例曾因此失败，改完后通过。
  2. **加载中**：原先刷新当前会话（例如 run 结束后的 `readSessionPage`）时，只要没有缓存，就会把 `messageLoading` 置为 true。现在只要 store 里有 cell，就不显示加载中。
  3. **最新页与已加载窗口不相邻时**（中间隔了很多新事件），`applyEnvelope` 用新页替换窗口，早期页需要重新加载。原先的手工合并会留下一段有缺口的记录。现在的行为与 store 的合并规则一致，`beforeSeq` 也随之正确。
- **改写的 3 个用例**（计划写的行号是 :3280 / :3505 / :3548）：
  - `loads only the latest message page, prepends older messages, and keeps them when a live event arrives`：在 `beforeSeq: 10` 的断言之后，经 `events.sessionLive` 推一条 seq 21 的 `journal-update`，断言 Live、Earlier、Latest 三条都在，并且没有再次读页。
  - `rejects a stale history page…`：原断言不变，补注释说明拒绝来自 store 的修订号规则。
    - 变异：去掉 App 的页版本号检查，这个用例仍然通过，因为陈旧页的修订号更旧，store 本身就会拒绝。所以版本号检查是第二道防线，保留。
  - `keeps a running session resident while more than five other histories are viewed`：原用例只看 3 个别的会话（< 5，不会触发淘汰），而且只断言流式内容（流式内容不在 cell 里）。
    - 现在：运行中的会话先带一条 durable 历史，再看 6 个别的会话，然后回来，读页请求一直不返回，断言 durable 历史、流式内容和停止按钮都在。
    - 变异：保留策略不把 busy 会话当常驻时，这个用例失败。
- **T0 基准里的 `createMessageBlocks` 调用次数**（在 `session-ipc-budget` 中加了上限断言）：

  | 场景 | T0 / T9 | T10 |
  |---|---|---|
  | mount100 | 5 | 4 |
  | open2000 | 5 | 5 |
  | earlier10 | 30 | 10（每页一次） |

  IPC 计数不变。
- **结果**：desktop typecheck 0 错误；全量测试文件 149 / 1（已知）/ 1，用例 1119 / 1 / 2。

### T11：`MessageBlock` / `SessionEvent` 新增 `runId`、`sourceSeq`

- `S/session.ts`：
  - `SessionEvent` 新增 `sourceSeq?`，表示投影来源的 Journal envelope seq。
  - `MessageBlock` 的公共部分新增 `runId?` 和 `sourceSeq?`。
- `S/session-selectors.ts`：`createMessageBlocks` 原先每个 `switch` 分支直接返回块，现在整个 switch 移进内部函数 `blocksForEvent`，外层统一调用 `withIdentity(block, event)`：
  - 每个块都写入 `runId = event.agentRunId`；
  - 只有事件带 `sourceSeq` 时，才写入 `sourceSeq`；
  - 与计划写的「每个分支写入」等价，而且以后加分支不会漏。
- `S/test/session-selectors.test.ts`：
  - 6 个 `toEqual` 用例的期望值补上 `runId`；
  - 新增 1 个用例：每个块都带 runId，sourceSeq 只在事件有时出现（没有时连键都不出现）。
- 影响面：`createMessageBlocks` 只在 shared / client / desktop 中使用，desktop 和 client 没有因为新字段失败的用例。
- 结果：shared 149 个用例通过，shared typecheck 和 build 通过；client 21 个用例通过；desktop typecheck 0 错误，全量测试文件 149 / 1（已知）/ 1，用例 1119 / 1 / 2。

### T12：client 投影写入 `sourceSeq`

- `C/sessions/chat.ts`：在 `projectChatEvents` 每条 envelope 的 `base` 里加入 `sourceSeq: event.seq`。
  - 所有经 `base` 投影出的事件都带上它，包括 `projectSurfaceNode` 的 user、assistant 和派生的 thinking，以及 tool_call / tool_result / llm_usage / error / aborted / compaction。
  - 同一条 envelope 投影出的多个事件共用同一个 seq，所以 sourceSeq 标识的是来源，不是块的唯一键。
- **subagent 合成事件不用改**：`projectSubagentTranscript` 的 chunk / live-tool 事件和 `projectSubagentList` 的 `subagent:` 事件都是直接构造的，不经过 `base`，天然只带 `agentRunId`。经 T11 的 `createMessageBlocks` 处理后，只有 `runId`。
- 新增 `C/test/chat-identity.test.ts`，2 个用例：
  - user / thinking / assistant 事件的 `[type, agentRunId, sourceSeq]` 与来源 envelope 一致；
  - subagent 块带 `runId`，没有 `sourceSeq` 键。
- 写用例时更正了一个误解：`assistant/message` 走 surface 分支后直接 `continue`，不会再投影出 `llm_usage`（`llm_usage` 只来自 `step/end`）。
- 变异：去掉 `sourceSeq: event.seq`，用例 1 失败。
- 结果：client 23 个用例通过，typecheck 和 build 通过；desktop typecheck 0 错误，全量测试文件 149 / 1（已知）/ 1，用例 1119 / 1 / 2。

### T13：live 块写入 `runId`

- `R/session/live-runs/stream-blocks.ts`：
  - `streamingStateToBlocks(state, agentRunId)` 在返回前，给每个还没有 `runId` 的块补上 `runId = agentRunId`。thinking、assistant、tool、retry / model-wait 状态、workspace-preparation、steer 插入的 user 块都由这一步覆盖。
  - `createCompactionBlock` 自己写入 `runId = input.agentRunId`。手动 /compact 的 runId 是任务 id，本地的压缩失败块（`compactionFailure`）也走这个函数。
  - 不传 `agentRunId` 时不补，`streaming-*` 这类旧 id 路径保持原样。
- `R/App.tsx`：在 App 自己构造的 live 块上显式写入 runId。
  - 由任务快照生成的 user 块（`run.userBlock`）：它在 `refreshStreamingBlocks` 里拼在 `streamingStateToBlocks` 结果之前，不经过上面的补写，所以必须显式写。这就是计划里说的「user 块也写」。
  - steer 插入的 user 块；
  - workspace-preparation 的 running / completed 两个块。
- 新增 `R/test/stream-blocks-identity.test.ts`，2 个用例：
  - 7 种 live 块都带同一个 runId，而且都没有 sourceSeq；
  - 压缩块保留自己的 runId，不传 run 时不补写。
- 变异：去掉补写这一步，用例 1 失败。
- 结果：desktop typecheck 0 错误；全量测试文件 150 / 1（已知）/ 1，用例 1121 / 1 / 2。

### T14：`mergeTranscript` 与新旧对照测试

- 新增 `R/session/transcript.ts`，是纯函数，App 暂不接入（T15 接）：
  - `durableTranscript(durable, live)`：
    - 正在流式的 run（live 有块、不是恢复的 run）在 durable 里按 `block.runId === live.runId` 隐藏；
    - 恢复的 run 只隐藏 live 已有的工具块；
    - record 没有块时，退回用 events 现算。
  - `mergeTranscript(durable, live, local)`：在上面的基础上依次做三件事：user 身份去重、追加 live、追加本地压缩失败块并覆写后台 bash 状态。
  - 归属判断不再解析 id / renderKey 字符串。
- 先写对照基准 `R/test/helpers/legacy-transcript.ts`：逐字复制 T13 时 App 的 `persistedMessages` / `messages` 两个 useMemo，改成纯函数。
- 新增 `R/test/transcript.test.ts`，9 个用例。
  - 每次调用都断言 `mergeTranscript` 与 legacy 的输出 `toEqual`，另外断言场景本身确实走到了目标分支。
  - 输入都由真实生产者产出：durable 走 `recordProjectionFixture` → `projectChatWindow`，live 走 `streamingStateToBlocks`，App 那块 user 块按 App 的 id 规则构造。
  - 覆盖的场景：
    - handoff（对应 app-streaming-user-message:1155）的三个阶段：live 先到、durable 先到但 live 未清、run 完成；
    - 恢复的任务不重复 user（对应 app-message-queue:185）；
    - background-runs fixture：前一轮在 durable，新一轮在流式，含两个 read 工具；第二轮 durable 也到达时被整体隐藏；
    - 恢复的 run 只隐藏 live 已有的工具块；
    - 恢复时 durable 的 todo 不被隐藏；
    - events 兜底，含恢复的 run；
    - 重复 user；
    - steer、workspace-preparation、compaction 在三个时点：进行中、刚完成但 live 未清、恢复后；
    - 压缩失败块和后台 bash 覆写。
- **对照中发现的一处差异，已按旧行为对齐（不算设计偏离）**：
  - 旧实现在恢复时只把 id 含 `:tool:` 的 live 块当作工具块。todo 块虽然也由 `toolEntryToBlock` 产出，但 id 是 `turn:<run>:todo`，所以旧实现不会隐藏 durable 里 renderKey 相同的 todo。
  - 新实现最初按「非对话类 kind 即工具块」判断，会隐藏它。现在把 `todo` 加进 `NON_TOOL_KINDS`，结果与旧实现深度相等。
  - 副作用：恢复中的 run 如果 durable 和 live 都有 todo，会出现两块 todo。这是旧行为原样保留，交给验收判断要不要另开一项修复。
- 非恢复分支等价性的推理：
  - durable 块的 runId 一律来自 `event.agentRunId`（T11 的 `withIdentity`）。
  - 旧实现的两个条件（id 属于该 run 的事件 id、renderKey 前缀为 `turn:<run>:`）也都由同一个 `agentRunId` 推出，所以两者隐藏的集合相同。
- 写用例时注意到：测试用的 projection fixture 按工具名投影，todo 结果会变成 read 块，所以 todo 用例改用 `createMessageBlocks` 直接产出 durable。
- 变异：
  - 去掉 `todo` / 不隐藏流式 run / 去掉 user 去重 / 兜底不过滤 / 流式时也追加压缩失败块，均有用例失败。
  - 「恢复的 run 也按流式处理」起初存活，原因是恢复时只有兜底分支用到它。补了兜底 + 恢复的断言后失败。
- 结果：desktop typecheck 0 错误；transcript 9 个用例通过；全量测试文件 151 / 1（已知）/ 1，用例 1130 / 1 / 2。

### T15：App 改用 `mergeTranscript`，renderer 不再解析字符串

- `R/App.tsx`：`persistedMessages` / `messages` 两个 useMemo（47 行）合并为一次 `mergeTranscript(durable, live, local)` 调用。
  - `sessionRecord` 为空时，events 改用模块级空数组。以前每次渲染都新建一个 `[]`，导致 memo 在没有会话时次次重算。
- **5 处字符串去重点的去向**（14 S5 表）：
  - `includes(":tool:")`、`renderKey?.startsWith("turn:<run>:")`、`streamingTurnEventIds`：随 App 的旧代码删除，改为按 runId 判断。
  - `durableUserKeys`：迁入 `mergeTranscript`。它比较的是 renderKey 身份，不解析字符串，保留。
  - `/^v2-(\d+)/`（原 :1349）：已在 T10 随 `readSessionPage` 的手工合并删除。
- **计划 grep 额外命中一处**：`response-annotation-context.ts` 的 `isAnnotatableMessageId`（`/^v2-\d+$/`，判断回复能否批注）。它不在 S5 表里，但验收 grep 要求为 0，所以一并改掉：
  - 改为 `annotatableMessageIds(blocks)`：带 `sourceSeq` 的块可以批注。
  - 等价性：projection 产出的 durable 事件，id 一律是 `v2-<seq>`（`chat.ts` 的 `eventId`），且同时带 `sourceSeq = seq`（T12）；live 块两者都没有。
  - 只有顶层 `messages` 里的 assistant 块会渲染成带 `data-assistant-message-id` 的 `AssistantReply`。延迟展开的工具详情不会产出回复，所以按 `messages` 收集不会漏掉。
  - `ConversationView` 从 `messages` 算出可批注 id 集合，经 ref 读取，`canAnnotate` 保持稳定，选区监听不会在每次流式刷新时重挂。`useResponseAnnotationState` 改为接收 `canAnnotate`。
  - 测试同步改动：
    - `response-selection-menu` 的 Harness 按块构造，live 回复不带 sourceSeq；
    - `response-annotation-markers` 改测 `annotatableMessageIds`；
    - 两个只关心调用的 fixture 用 `() => true`，原先也没有用例依赖它返回 false。
  - 新增 `R/test/conversation-view-annotations.test.tsx`：durable 回复出菜单，live 回复不出；live 回复落盘后（换成 `v2-3` + sourceSeq）出菜单。
- **对照基准移位**：T14 的 `legacy-transcript.ts` 原样保留旧的字符串判断，放在 `src/renderer` 下会让 grep 不为 0，所以从 `R/test/helpers/` 移到 `apps/desktop/test-fixtures/`。它经 import 进入 tsc，仍受类型检查。
- **App 测试影子对照**：新增 `R/test/helpers/transcript-shadow.ts`。
  - `app-streaming-user-message`、`app-message-queue`、`app-approval-recovery` 三个文件通过 `vi.mock("../session/transcript")` 包一层：每次 `mergeTranscript` 调用都与旧实现 `isDeepStrictEqual`，不一致就记下来，由 afterEach 断言为空。
  - 61 个用例全部通过，没有任何不一致。
- 变异：
  - 不隐藏流式 run：影子对照让 4 个 App 用例失败。
  - 去掉 user 去重：2 个 App 用例失败。
  - 恢复时什么都不隐藏：App 用例存活。这三个文件里没有「恢复的 run 且 live 工具块与 durable 重叠」的场景，由 T14 的 transcript 用例兜住。
  - `canAnnotate` 恒为 true、可批注 id 集合不随 messages 更新：新增用例失败。
  - `annotatableMessageIds` 不看 sourceSeq：markers / selection-menu 共 2 个用例失败。
- 结果：
  - 计划 grep `startsWith\("turn:|includes\(":tool:"\)|\^v2-` 在 `apps/desktop/src/renderer` 下为 0，加上模板字符串写法也为 0。
  - desktop typecheck 0 错误；全量测试文件 152 / 1（已知）/ 1，用例 1131 / 1 / 2。

### T16：live-run-store 与 task-queue 迁出

- 新增 `R/session/live-runs/live-run-store.ts`（`createLiveRunStore`），迁入：
  - `sessionRunsRef`：`get` / `has` / `start` / `end(sessionId, expected?)`。`start` / `end` 同时维护 busy 集合，替代 App 里 6 处 `setBusySessionIds(updateStringSet(...))`。
  - `terminalRunIdsRef`：改为 `createBoundedSet(TERMINAL_RUN_LIMIT = 200)`，按插入顺序淘汰最旧的；重复加入的移到最新。
  - `streamingBlocks`、`isStreaming`、`isAborting`、`activeAgentRunId`、`isRecoveredRun`：合成为 `view(sessionId)`，按会话缓存，`refresh` 时失效。App 用 `useLiveRunView(liveRuns, selectedSessionId)` 读取，替代 4 个 state 和 `refreshStreamingBlocks`。
    - 旧 `refreshStreamingBlocks` 只在会话可见时 setState；新视图在切换会话时按 `selectedSessionId` 派生，所以 `setActiveSessionId` 里不再需要手动刷新。
    - `isRecoveredRun` 以前每次渲染都从 ref 读取。现在随视图在 `refresh` 时更新。逐一核对了 run 的就地修改（`recovered = false`、`aborting`、`userBlock`、审批恢复写入的工具），之后都有 refresh：`agent_run_started` 经 `applyStreamEvent` 收尾时 refresh。
  - `handleStreamEvent` 的 switch 原样迁入 `applyStreamEvent`。与原文 diff，只有 steer 分支的 3 行改成调用 `onSteered(sessionId, messageId)` 回调；App 在回调里取 steer 正文并更新本地队列。
  - `busyIds()` 成员不变时返回同一个 Set。类型保持 `Set<string>`，Sidebar / WorkbenchLayout 的 4 处 prop 签名不用改。
  - `evict(sessionId)`：run 仍在时不释放。run 结束时 `end` 已经清掉视图缓存，所以 evict 只是兜底。
- 新增 `R/session/task-queue.ts`：
  - `createTaskQueueStore` 迁入 `taskSnapshotsRef`、`submittedOptionsRef`、`steerContentRef`，每项记下所属会话，`evict(sessionId)` 整体释放。
  - `applyTaskSnapshot(snapshot, effects)` 是从 App 原样迁出的纯函数，依赖经 `effects` 注入（tasks / runs / patchLocal / notice / refreshSession）。
- App 的 `evictSession` 增加 `liveRuns.evict` 和 `taskQueue.evict`。归档后的会话重新出现时，`hydratedSessionIdsRef` 已删除，会重新补齐快照；`previous` 为空时不重放历史操作的提示（原有逻辑）。
- `messageQueueControls` 用 `useMemo` 包住，`steerBlockedReason` 先算成值再放进依赖。
- 删除 App 中不再使用的导入：`taskOperation`、`projectTaskQueue`、`taskAttachments`、`StreamingState`、`SessionRunState`、6 个 stream-state 函数、`createCompactionBlock`、`streamingStateToBlocks`、`QueuedComposerMessage`、`RuntimeStreamEvent`。
- App.tsx 从 1874 行降到 1545 行；live-run-store.ts 381 行，task-queue.ts 118 行。
- 新增 `R/test/live-run-store.test.ts`，7 个用例：
  - 第 201 个 runId 挤掉最旧的，近期的仍被拒绝；
  - 重复加入的移到最新；
  - 视图缓存与 refresh；busy Set 引用稳定（含同会话替换 run）；
  - `end` 只卸下仍是自己的 run；
  - user 块在前、steer 块落在被读到的位置，不属于当前 run 的事件不取 steer 正文；
  - task-queue 的修订保护与按会话 evict；
  - 快照挂上恢复的 run，Host 报告结束后卸下并记入 terminal。
- 变异：
  - 不限长度 / 不移到最新 / 视图不缓存 / `end` 忽略 expected / evict 不清 options / 不卸下已结束的恢复 run，均有用例失败。
  - 「busy 每次都换新 Set」起初存活，补了替换 run 的引用断言后失败。
- 计划指定的用例：
  - `app-approval-recovery` 的「does not resurrect a Run from a snapshot overtaken by its terminal stream event」（原 :91）通过；
  - `app-streaming-user-message` 中后台运行相关的「keeps background runs and tool state alive across session switches」「keeps a running session resident…」通过。
- 结果：desktop typecheck 0 错误；全量测试文件 153 / 1（已知）/ 1，用例 1138 / 1 / 2。

### T17：live 事件分发器

- 新增 `R/api/live-events.ts`：
  - `createLiveEventHub(source)` 返回 `subscribe(listener)` 和 `onMessage(message, listener)`。`subscribe` 的签名与 `eventsApi.sessionLive` 相同。
  - 按引用计数订阅：第一个消费者挂上时向 bridge 订阅一次，最后一个退订时释放；之后再有消费者就重新订阅。测试会在用例之间替换 bridge，所以不在模块加载时订阅。
  - 同一个函数挂两次算两个消费者；重复退订是空操作。
  - 某个消费者抛错时打到控制台，其他消费者照常收到。旧实现是各自独立订阅，互不影响，这里保持一致。
  - 默认实例 `liveEvents` 包在 `eventsApi.sessionLive` 上。
- 接入：
  - App 任务队列刷新改为 `liveEvents.onMessage("task-queue-updated", …)`；
  - 侧栏标题刷新改为 `liveEvents.onMessage("session-title-updated", …)`；
  - `SessionProjectionProvider` 把 `onSessionLiveEvent` 改为 `liveEvents.subscribe`，`DesktopSessionBridge` 本身不改。
  - App 里其他 `eventsApi` 订阅（agentStream、hostsChanged、reviewChanged、quickOpenRequested）不是 sessionLive，不在本 T 范围。
- 新增 `R/test/live-events.test.ts`，2 个用例：
  - 3 个消费者只产生 1 次 source 订阅，按 message 分发；重复退订不影响其他消费者；最后一个退订时释放；之后重新订阅。
  - 一个消费者抛错不影响其他消费者；同一个函数挂两次算两个。
- `app-session-evict.test.tsx` 新增 App 级用例：挂载并切换会话后 bridge 上只有 1 个 sessionLive 订阅，卸载后为 0。
  - fixture 的订阅集合改为每次订阅单独计数。原来用 `Set` 存回调，同一个 `dispatch` 订阅多次会被去重，「每次都向 source 订阅」的变异因此在 App 级存活。
- 变异：
  - 每次都订阅 / 从不释放 / 不按 message 过滤 / 不隔离消费者异常 / App 任务队列改回直连 bridge，均有用例失败。
- 检查：`check:renderer-bridge`、`check:ipc-channels`、`check:frontend-tokens` 通过。
- 结果：desktop typecheck 0 错误；全量测试文件 154 / 1（已知）/ 1，用例 1141 / 1 / 2。

### T18：ActiveSession / Composer / SessionActions 三个 Context

- 新增：
  - `R/session/active-session-context.tsx`：sessionId、title、messages、上下文用量、运行状态（isStreaming / isAborting / isCompacting / isSessionReady）、两个请求计数，以及 onSend / onAbort / onRetryCompaction。
  - `R/components/composer/composer-context.tsx`：模式、技能、模型、草稿读写、消息队列、一次性提示、draftRestore。草稿读写由 `useSessionDrafts(localStore, sessionId)` 生成，从 WorkbenchLayout 迁到 App。
  - `R/session/session-actions-context.tsx`：会话的新建 / 选择 / 置顶 / 重命名 / 复制 id / 复制正文 / fork / 归档，以及工作区的打开 / 归档 / 移除。
  - `R/app/providers.tsx`：`AppProviders` 按原来的顺序挂上 SessionProjection、SessionBrowse、SessionLocalStore 和这三个 Context，再挂 RightPanel。
  - 三个 hook 在缺少 Provider 时抛错，和 `useSessionLocal` 一致。
- Context 字段名沿用原来的 prop 名，组件只把解构从参数移到 hook 调用，函数体不变。`sessionId` 对应原来 WorkbenchLayout 的 `activeSessionId`；Sidebar 内部把 `onRenameSession` / `onForkSession` / `onArchiveSession` 映射回原来的 `onRename` / `onFork` / `onArchive`。
- 合并后的值仍作为 prop：WorkbenchLayout 把 App 的上下文用量、`isSessionReady` 与投影合并后传给 ConversationView 和 RightPanel，所以 ConversationView 的 `contextSnapshot` / `contextState` / `isSessionReady` 保留为 prop。Context 里放的是 App 的原始值。
- App 中四个 value（browse / activeSession / composer / sessionActions）都用 `useMemo`；`SessionBrowseContext` 原来内联的 `retryList` / `retryMessages` 改为 `useCallback`。`handleComposerModeChange`、`handleSelectedSkillsChange` 原来是普通函数，改为带完整依赖的 `useCallback`。
- prop 数量（改造前 → 改造后）：
  - WorkbenchLayout 50 → 13；
  - ConversationView 40 → 14；
  - Sidebar 21 → 9。
  - 剩下的 workspaceOptions / selectedWorkspaceRoot / onSelectWorkspace / executionContext 由 15 的 RunTargetContext 接走，「< 10」在 15 结束时验收（决策记录 2026-10-05 S7）。
- 行数：App.tsx 1545 → 1526；WorkbenchLayout 877 → 756；ConversationView 1266 → 1216；Sidebar 1306 → 1287。
- value 稳定性实测：临时探针（未提交）mock 掉 WorkbenchLayout，记录每次渲染时四个 Context value 中变化的字段，触发两次 `session-title-updated`：
  - activeSession 每次都变，原因是 onSend / onRetryCompaction 的依赖 `remoteTarget`：`useRemoteTarget` 每次返回新对象，03 / 15 S3 会修。
  - composer 的 `onComposerModeChange` 依赖 `visibleSessions`；sessionActions 的 onCopyTranscript / onArchiveWorkspace / onRemoveWorkspace 依赖 `sessions`；browse 的 `groups`。列表刷新返回了新数组，这些变化与数据变化一致。
  - 改造前 WorkbenchLayout 不是 memo 组件，App 每次渲染都会重渲染它，所以改造后没有新增渲染。
- 测试：
  - 新增 `R/test/helpers/workbench.tsx`：`TestConversationView` / `TestSidebar` / `TestWorkbenchLayout` 接受改造前的平铺 prop，按字段表拆进 Provider，其余传给组件。字段表用 `satisfies Record<keyof …, true>`，Context 增减字段时编译失败。`TestWorkbenchLayout` 用自己的内存 store 存草稿，与改造前没有 Provider 时的退回行为一致。
  - 9 个测试文件和 5 个视觉 fixture 改为使用 Test* 组件，只改了 import、标签名和 2 处 `Parameters<typeof …>`。
  - 新增 `R/test/app-workbench-context.test.tsx`：三个 hook 缺少 Provider 时抛错；quick open 打开指定会话后，输入框获得焦点。
- 变异：
  - composer 不带 messageQueue / sessionActions 不带归档 / Sidebar 重命名映射错 / 草稿不按会话分 / 不带 onRetryCompaction / 不带提示，均有用例失败。
  - 「composerFocusRequestId 恒为 0」起初存活（改造前也没有用例覆盖 quick open 的聚焦），补了 quick open 用例后失败。
- 检查：typecheck 0 错误；`check:renderer-bridge`、`check:frontend-tokens` 通过。临时开启 `--noUnusedLocals` 检查，本 T 引入的未用导入已清理；剩下的 App `ModelId` / `ModelKey` / `findWorkspaceOption`、Sidebar `Sparkles` / 两个状态点常量、WorkbenchLayout `setUsageSnapshot` 是原有的，不在本 T 范围，记入 16 的拆分清单。
- 结果：全量测试文件 155 / 1（已知）/ 1，用例 1143 / 1 / 2。

### T19：吞错改为可见

- `R/session/desktop-session-bridge.ts`：
  - live 事件触发的 refresh 失败后不再 `catch { return; }`，按 1s、2s、4s 退避重试，最多 3 次。每次失败 `#load` 都已调用 `markError`，cell 变为 `status: "error"`，下一次成功的 `applyEnvelope` 把它清回 `ready` / `null`。
  - 重试用完仍失败时停下，错误留在 cell 上，并打到控制台（"Session refresh failed after retries"）。
  - 等待期间会话被切走或 bridge 被 dispose，就不再重试；dispose 立即结束等待中的计时器。
  - 重试间隔可经 `createDesktopSessionBridge(api, store, { retryDelaysMs })` 覆盖，默认值写在 `REFRESH_RETRY_DELAYS_MS`。
- `R/session/SessionProjectionContext.tsx`：`bridge.open(...).catch(() => undefined)` 保留，只用来避免未处理的 rejection，加注释说明失败已写进 cell、由会话视图显示。
- `ConversationView`：
  - 新增 `sessionError = browse.messageError ?? projectionError`。`projectionError` 在投影 cell 为 `status === "error"` 时取「会话同步失败：<error>」。
  - 原来只读 `browse.messageError` 的两处（空会话整页提示、有正文时顶部提示）改读 `sessionError`，「重试」统一走 `retrySession`：有 App 时调 `browse.retryMessages`（重读页，`applyEnvelope` 同时清掉 cell 错误）；单独挂 Provider 时重新 `bridge.open`。
  - 「初始输入框」判定里的 `!browse?.messageError` 同步改为 `!sessionError`。
- App：
  - 新增 `reportSessionFailure(sessionId, text)`：打到控制台，并且只在该会话是当前会话时设置输入框上方的提示（3 秒后消失，复用 `composerNotice`）。
  - 改用它的位置：任务队列刷新 4 处（选中会话、`task-queue-updated`、首次补齐、发送后刷新），队列命令 4 处（插入、继续发送、移除、上移）。
  - 保留 `console.error` 的 2 处，不影响用户可见状态：
    - `refreshSession` 调用的 `readSessionPage` 内部已捕获错误并写入 `messageError`，外层 `.catch` 只兜意外异常；
    - run 结束后的侧栏列表后台刷新，失败时列表保持原样，下一次刷新会补上。
- 测试：
  - `R/test/session-store.test.ts` 新增 3 个用例（fake timers）：
    - 第一次 refresh reject、第二次 resolve：断言 1s 后才重试，`cell.error` 先被设置后被清除；
    - 一直失败：断言 1s / 2s / 4s 各重试一次，之后不再重试，错误留在 cell；
    - dispose 后不再重试。
  - 新增 `R/test/app-session-errors.test.tsx`，3 个用例：
    - 本地会话打开失败时显示错误和「重试」，重试后显示正文；
    - 打开后 resync 失败时，正文上方显示「会话同步失败：Host 不可用」，点「重试」后消失；
    - 当前会话的队列刷新失败时，输入框上方显示「队列状态读取失败，请稍后重试。」。
  - 本地会话的读取错误原样显示（`sessionReadError` 只改写远端错误），断言按现状写；远端会话的改写由 `host-feedback` 覆盖。
- 变异：
  - 不重试 / 间隔改成等长 / dispose 后仍重试 / 视图不读 cell 错误 / 重试按钮不动作 / 队列失败不提示，均有用例失败。
- 检查：typecheck 0 错误；`check:renderer-bridge`、`check:frontend-tokens` 通过。
- 结果：全量测试文件 156 / 1（已知）/ 1，用例 1149 / 1 / 2。

### T20：未确认提交记录统一处理

- 新增 `R/session/pending-submission.ts`：
  - `readPendingSubmission / writePendingSubmission / clearPendingSubmission / sweepExpiredPendingSubmissions`，键仍为 `actspace:pending-submission:<sessionId>`，旧数据可直接读。
  - 记录新增 `createdAt`。读取时校验 `content`、`id` 为字符串，`draft.sessionId` 与键一致，`draft.text` 为字符串；不合格返回 null。
  - 启动清理：无法解析的删除；超过 7 天（`PENDING_SUBMISSION_TTL_MS`）的删除；没有 `createdAt` 的旧记录补上当前时间，从现在起算，不直接丢掉未确认的草稿。
  - 类型命名为 `PendingSubmissionRecord`，与 main 进程 remote-hosts 的 `PendingSubmission` 区分。
- App：
  - 本地会话原先存 `sessionStorage`（重启即丢），远端存 `localStorage`；现在全部存 `localStorage`。
  - `setActiveSessionId` 里只对 `host:` 会话生效的同步恢复删除，`useCallback` 依赖变为 `[]`。
  - 新增恢复 effect（依赖 `selectedSessionId` 等，`taskQueue` 为 `useState` 创建的稳定实例）：已有草稿或没有记录时跳过；否则先 `refreshTaskQueue`，快照里已有相同 `submissionId` 就只清记录；查询失败打到控制台并降级为恢复草稿；等待期间切走会话、出现草稿或记录 id 变化（例如又发送了一次）就不覆盖。只写草稿，永不自动重发。
  - `handleSend` 改用这 4 个函数，逻辑不变：内容相同时复用记录里的 submissionId；配置失败、明确被拒、确认收到时清除；unknown 时保留。
  - 已知的瞬时情况：发送尚未返回时切走再切回，快照里可能还没有这条任务，会先恢复草稿；随后 `handleSend` 成功时清掉草稿与记录，unknown 时用同样内容覆盖，不会造成重复提交。
- 测试：
  - `R/test/setup.ts` 的 afterEach 清掉 `actspace:pending-submission:*`，避免本地会话的记录跨用例残留。
  - `app-message-queue`：原「明确被拒」用例的 `sessionStorage` 断言改为 `localStorage`；新增 4 个用例：
    - 本地会话两次 unknown 后卸载再挂载，选中会话时草稿和「上次提交尚未确认…」回到输入框，期间查询了 snapshot、没有调用 `submitTask`，记录仍在；
    - 快照已含相同 submissionId：记录被清，输入框为空，不提示；
    - 快照查询失败：降级恢复草稿并打日志，不重发；
    - 恢复后原样发送：复用记录里的 submissionId，成功后记录被清。
  - 新增 `R/test/pending-submission.test.ts`，3 个用例：写入带 createdAt 并可读回、清除；格式错误 / 属于其他会话 / 缺字段时读到 null；清理过期与损坏记录、保留未过期、给旧记录补时间、不碰无关键。
  - fixture 返回值新增 `taskCommand`、`seedTasks`。
- 变异（8 个均有用例失败）：跳过快照比对、不恢复、查询失败当作已收到、不复用 submissionId、清理忽略 TTL、旧记录直接删、unknown 也清记录、恢复后自动重发。
- 检查：typecheck 0 错误；`--noUnusedLocals` 在改动文件里只有既有项；`check:renderer-bridge`、`check:frontend-tokens` 通过。
- 结果：全量测试文件 157 / 1（已知）/ 1，用例 1156 / 1 / 2。

### T21：现行规范与 02 更正

- 新增 `docs/design-docs/frontend/front-会话状态与数据流规范.md`，12 节：三类数据的归属与模块表；durable（cell 唯一事实源、读页、早期历史、版本号、LRU）；identity 字段（`runId` / `sourceSeq` 的写入方与条件展开，`sourceSeq` 不是唯一键，禁止解析 id 字符串）；`mergeTranscript` 的四步规则与对照测试要求；SessionLocalStore（字段、接口、「新增按会话状态加字段到这里」、同步渲染的时序注意）；live run 与任务队列（busy、terminal 有界集合、`task-queue-updated` 是信号、按 id 补齐一次与 Host 重连）；live 事件分发器；三个 Context 与测试 helper；未确认提交；evict 时机表；错误可见；已知限制。
- 写规范时逐条对照代码：`applySnapshot` 清错误、选中会话时刷新审批、`console.error` 剩余位置。最后一条与初稿不符：初稿写「只打控制台的必须在注释里说明理由」，实际 App 里还有约 25 处设置 / 工作区 / 复制等路径只打控制台、没有注释，不在 T19 范围内。改为如实说明范围，规则只约束新增的会话数据路径。
- `02-Renderer状态层与会话数据流.md`：头部加「已按 14 实施」与现行规范链接，说明 §1–§2 是实施前的记录；新增 §7「实施后的更正」13 条（Map 清理表不准、WorkbenchLayout 漏列的两份 Map、`task-queue-updated` 是信号、补齐方式、目录、状态形状、identity 没有联合类型、合并规则方向、分页接口与 `prependPage`、cell LRU、Context 与行数目标移到 15、订阅合并只做了 live 事件、P1-8 现状、未确认提交的判定依据、evict 范围）。
- 登记：`docs/design-docs/frontend/README.md` 加一行；`scripts/check-current-docs.mjs` 的 `currentTruthFiles` 加入新规范（13 的 bridge 规范也是这样登记的）。
- 检查：`pnpm check:current-docs` 通过。

### 复核处理

T21 后用只读 Sonnet 子智能体对整个 14 的改动做了一轮复核。新引入的问题有 3 个，都已修复：

1. **发送进行中被恢复**：发送尚未返回时切走再切回，恢复 effect 看到记录、快照里还没有这条任务，就把正在发送的内容放回输入框。
   - 修复：新增 `sendsInFlightRef`（按会话计数）。`handleSend` 从写入记录到确认结束包在 try/finally 里计数；恢复 effect 开始时和等待快照之后都检查，有发送进行中就跳过。
2. **覆盖用户输入**：等待快照期间用户已经在输入框里打字，恢复会用草稿覆盖。
   - 修复：开始时和等待之后都检查 `composerText` 非空，有内容就跳过。
3. **evict 后被重新建出状态**：
   - (a) evict 之前发出的任务快照，evict 之后才回来，`applyTaskSnapshot` 把释放掉的队列重新建出来。修复：新增 `evictionCountRef`，`evictSession` 每次加一；`refreshTaskQueue` 在请求前后比较，变了就丢弃。
   - (b) 移除工作区后，它的会话已 evict 并移出已补齐集合，但仍在 `sessions` 里，下一次列表刷新会再补齐它们。修复：补齐只看 `visibleSessions`（useMemo 上移到补齐 effect 之前）。

复核还列出几项既有行为，不是本计划引入的，记入交接的已知问题：同一会话重叠发送共用一条记录；切回会话时草稿会再次写入输入框；`sessionRecord` 为 null 时跳过 worktree 校验；恢复中的 run 可能出现两块 todo。

- 测试（4 个）：
  - `app-message-queue`：新增 `holdSnapshots` helper。「发送进行中不恢复」：已有同内容记录、快照被挡住，发送并放行快照，输入框保持为空，发送成功后记录被清，不提示；「等待快照期间打的字不被覆盖」。
  - `app-session-evict`：fixture 新增按会话挡住 `tasks.command`；「evict 前请求的快照不建出状态」：挡住快照，推入迟到任务，归档，放行，取消归档并打开，看不到这个任务。
  - `app-streaming-user-message`：「移除工作区后列表刷新不再补齐它的会话」：移除后通过 `hostsChanged` 触发一次列表刷新，`approvals.listPending` 不再收到被移除会话的请求。
- 变异（4 个均有用例失败）：去掉发送中检查、去掉已输入检查、去掉 evict 计数比较、补齐改回 `sessions`。补齐那一条起初没有专门用例，第一次全量有一个用例偶发失败、重跑通过，属于偶发，所以补了上面最后一个用例。
- 规范：§6 补「只补齐可见会话」；§9 补发送中 / 已输入的跳过规则；§10 补 evict 计数。
- 检查：typecheck 0 错误；全量测试文件 157 / 1（已知）/ 1，用例 1160 / 1 / 2；`check:current-docs` 通过。

### Electron 检查与内存修复

环境：`ACTSPACE_DATA_DIR=/tmp/actspace-cdp-data`（临时目录），本机 mock 模型服务（OpenAI 兼容流式，127.0.0.1:18765，每次回复 40 个片段），通过 CDP（9222）驱动和截图，不碰真实用户数据。

1. **流式中切换会话再切回**：通过。后台流继续，切回时正文已到「片段25」，结束后完整，无重复。
2. **流式中重载渲染进程**：run 恢复，停止按钮在，用户消息不重复，结束后完整回复出现。重载后到 run 结束前看不到实时文本：恢复的 run 丢弃 `assistant_text_delta`，基线代码相同，不是本计划引入，记入已知问题。
3. **加载更早历史后收到新消息**：会话填到 47 轮（约 2400 条 journal 事件，超过一页）。重载后打开只有最近 20 轮；滚到顶部依次加载到 40、46 轮，无重复；随后发送一条新消息，追加为第 47 轮，回复完整。
4. **归档 20 个会话后内存不再增长**：第一次测得**不通过**，修复后通过。
   - 方法：循环「新建会话 → 发送 → 切回会话 A → 归档新会话」，每 5 轮强制 GC 三次后读 JS 堆。
   - 修复前：22.9 → 25.0 → 32.6 → 41.8 → 51.4 → 60.4 MB（第 0/1/5/10/15/20 轮），每轮约 1.9 MB，不收敛。
   - 基线（`d86be81f` 的 renderer，在临时 worktree 里构建、临时替换 `dist` 后测，测完换回）：10.5 → 12.7 → 16.0 → 17.3 → 18.3 → 19.2 MB，后段每轮约 0.2 MB。所以这是本计划引入的回归。
   - 定位：用堆快照按字符串内容做差，增长的是已归档会话的 `request/context` 内容（系统提示词、技能列表、AGENTS.md、工具定义）。最短持有路径：当前 Composer 的 `onSend` → 一串旧渲染作用域（`handleArchiveSession` ↔ `handleForkSession` ↔ `handleCopyTranscript` 交替）→ 作用域变量 `sessionCell` / `contextState` → 该会话的 cell window。同一函数里的闭包共用一个作用域，`useCallback` 互相引用，把旧渲染的作用域一层层留住。T10 把 cell 放成 App 的局部变量（被 `useMemo` 工厂读到），T18 的 Context value 用 `useMemo` 工厂读到 messages / contextState，于是这些数据进了每个被留住的作用域。store 本身已正确释放（jsdom 用例证明）。
   - 修复：
     - `useChatSessionRecord`（`R/session/session-store.ts`）：订阅 cell 并投影出 `sessionRecord`、`historyBefore`，cell 只存在于 hook 内部。
     - `useShallowStable`（`R/hooks/useShallowStable.ts`）：四个 Context value 改用它，字段逐个相等时返回上一次的对象，没有工厂闭包。
   - 只做第一项：11.0 → 12.8 → 16.0 → 17.8 → 19.3 → 20.7 MB，与基线相当但仍缓慢增长（再 10 轮 +2.9 MB，剩下的是 `contextState`）。
   - 两项都做：11.0 → 12.6 → 14.7 → 15.0 → 15.04 → 15.06 → 15.08 → 15.08 MB（第 0/1/5/10/15/20/25/30 轮），第 10 轮起不再增长，好于基线。
   - 测试：新增 `R/test/use-shallow-stable.test.ts`（字段相同保持引用；字段变化 / 增加 / 删除返回新对象），两个方向的变异（恒不等、恒等）都有用例失败。内存本身无法在 jsdom 里断言，规范 §8 写明规则与实测数字。
5. 检查过程中的其它发现（不属于本计划，记入交接，由你判断）：
   - **强杀后 30 秒内重启，会话一直写不进去**。被杀进程的写锁心跳不到 30 秒时，启动补齐的第一次 `tasks.command` 会得到 `SESSION_WRITER_LOCKED`（这一刻是对的）。但 `AgentService.#manager`（`packages/agent-service/src/service.ts:107-121`）按设计缓存失败的打开（注释「never bypass a recovery/durability failure by retrying in memory」），之后这个会话的快照和发送一直报同一个错，直到再次重启。main 没有 SIGTERM 处理，`before-quit` 不会在 SIGTERM / 强杀时触发，锁留在磁盘上。界面上错误可见（T19），草稿留在输入框。
- 检查：typecheck 0 错误；全量测试文件 158 / 1（已知）/ 1，用例 1162 / 1 / 2；`check:renderer-bridge`、`check:frontend-tokens`、`check:current-docs` 通过。
