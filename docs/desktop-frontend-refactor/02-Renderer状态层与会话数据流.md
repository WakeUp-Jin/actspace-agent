# 02 Renderer 状态层与会话数据流重构

> 范围：`apps/desktop/src/renderer/App.tsx`、`renderer/session/*`、`WorkbenchLayout.tsx` 中与会话数据相关的部分。
> 目标：App 只做装配；会话数据只有一个事实源；按会话的本地状态集中管理并能回收。
> 依赖：04（preload 分组）先做更顺；03（运行目标）在本文档 S4 之后做。
> 迁移去向：`docs/design-docs/frontend/front-会话状态与数据流规范.md`（新建）+ exec-plan。

## 1. 现状

### 1.1 规模

| 指标 | 数值 |
| --- | --- |
| `App.tsx` 总行数 | 2770 |
| 模块级 helper（`:60-790`） | 约 730 行，其中 `toolEntryToBlock` 约 290 行（`:400-686`）、`streamingStateToBlocks`（`:687-759`） |
| `App()` 内 hook | 41 useState、24 useRef、16 useEffect、48 useCallback |
| `window.actspace*` 直接调用 | App 80 处；全 renderer 49 个文件直接调用（SettingsPage 42、ProviderSettings 20、ModelSettings 14、Composer 13） |
| prop 钻取 | App → WorkbenchLayout 约 50 个（`:2713-2766`）；WorkbenchLayout → ConversationView 约 43 个（`WorkbenchLayout.tsx:572-613`） |
| `hasActspaceBridge()` 判断 | App 内 40 处，App 外 0 处 |

### 1.2 状态按领域分簇

| 领域 | 位置（App.tsx） | 说明 |
| --- | --- | --- |
| 会话列表与分页 | 795-800、808-836、1282-1316、1389-1397 | `readSidebarSessions` 内含远端 Host 离线补齐 |
| 活动会话与历史 | 796、801-805、839-842、888-925、1318-1387 | `sessionRecord`、`historyBefore`、`pageCacheRef`（上限 3）、`messageRequestRef` 序号 |
| 流式与 run | 846-851、868-869、1719-1776 | `sessionRunsRef` 是真源，`isStreaming` / `isAborting` / `activeAgentRunId` / `streamingBlocks` 是镜像 |
| 任务与队列 | 881-886、963-1058 | `taskSnapshotsRef`、`messageQueuesRef`、`steerContentRef`、`submittedOptionsRef` |
| 按会话的 Composer 状态 | 856、866、874、877-879 | `draftsRef`、`compactionFailuresRef`、`lastSendOptionsRef`、`composerStateBySession` |
| 模型选择 | 854-855、859、927-928、1227-1280 | `userPickedChatModelRef` |
| 工作区 / git / 分支 / 运行位置 | 844、862-865、1163-1205、2023-2075 | 一个 effect 同时写 3 个 state |
| Review | 867、927、1075-1100、1219-1226 | 请求序号防抖，做法正确 |
| 审批与失败 | 860-861、872-873、1100-1148 | `approvalVersionsRef` 版本号 |
| 远端 Host | 894、1955-1962、2005-2016、2331 | 见 03 |

### 1.3 正文到底从哪来

```text
                    ┌──────────── onAgentStream (逐 token / 工具进度)
                    │                 │
                    │          handleStreamEvent (App.tsx:1719)
                    │                 │
                    │          sessionRunsRef ── streamingStateToBlocks ──▶ streamingBlocks ─┐
                    │                                                                        │
window.actspace ────┤                                                                        ▼
                    │      getSessionPage ──▶ ClientSessionStore.applyEnvelope           messages (App.tsx:2187)
                    │             │                 │                                        ▲
                    │             │          selectChatSession ──▶ sessionRecord ────────────┤
                    │             └──── readSessionPage 再手工合并 events ──▶ sessionRecord ──┘
                    │
                    └──── onSessionLiveEvent ──▶ DesktopSessionBridge ──▶ 同一个 store
                                                     │
                              WorkbenchLayout 读 projection cell：只取 .length / phase / trajectory / context
```

结论（已核实）：

- **正文以 App 的 `messages` 为准**（`App.tsx:2187-2203`）：durable 块 + 本地流式块 + 压缩失败块 + 后台 bash 状态覆写。
- **projection cell 对正文没有决定权**：`selectSurfaceMessages` 只取 `.length` 作为 `durableSurfaceMessageCount`（`WorkbenchLayout.tsx:218`、`:576`）；`selectComposer` 只取 `phase`；`selectTrajectory` / `selectRequestContextEstimate` 分别给轨迹视图和 Context 面板。
- **本地流式重建不是遗留代码**：`@actspace/client` 的 `ClientLiveOverlay`（`packages/client/src/sessions/live-overlay.ts`）只有 `kind / message / callId / phase`，没有文本 delta 和工具进度，暂时替代不了 `onAgentStream`。

## 2. 问题清单

### P0-1 会话列表变化触发 2N 次 IPC

```ts
// App.tsx:1206-1213
useEffect(() => {
  if (!hasActspaceBridge()) return;
  refreshPendingApprovalStatuses(sessions.map((session) => session.id))...
  for (const session of sessions) void refreshTaskQueue(session.id).catch(console.error);
}, [refreshPendingApprovalStatuses, refreshTaskQueue, sessions]);
```

`sessions` 在标题更新、run 结束（`:755`、`:1770`）、Host 变更、分页加载时都会变。每次对**所有**会话各发 `listPendingApprovals` + `taskCommand snapshot`。远端会话每次还要走 Host 往返。

**方案**：审批与队列状态改为事件驱动（task snapshot 事件已存在：`applyTaskSnapshot`，`:963`）。启动时只对「活动会话 + busy 会话」做一次补齐；其余会话的审批 / 队列徽标由事件更新。

### P0-2 正文靠字符串前缀去重

- 流式块 id：`turn:${runId}:tool|user|assistant...`（`:401`、`:699`、`:1028`）。
- 去重规则：
  - `recoveredToolKeys`：`block.id.includes(":tool:")`（`:2171`）
  - `!block.renderKey?.startsWith(\`turn:${streamingAgentRunId}:\`)`（`:2175`）
  - `durableUserKeys`：按 `renderKey ?? id` 集合匹配（`:2190`）
- 历史合并：用正则 `/^v2-(\d+)/` 从事件 id 解析序号（`:1349-1350`）。

任何一侧改 id 格式，表现就是消息重复或消失，类型系统不会报错。

**方案**：引入类型化 identity：

```ts
type BlockIdentity =
  | { source: "durable"; journalSeq: number; blockIndex: number }
  | { source: "live"; runId: string; part: "user" | "assistant" | "thinking" | "tool"; callId?: string };

type TurnKey = { runId: string };      // 一个 turn 的 durable 块与 live 块按 runId 对齐
```

- durable 块由 projection 产出时带 `journalSeq` 和 `runId`；live 块带 `runId`。
- 合并规则只有一条：**某个 runId 一旦在 durable 里出现 `run_completed`（或已持久化到对应 part），该 runId 的 live 块整体让位**。
- 事件序号使用 envelope 自带的 `seq`，不再从 id 字符串解析。

### P0-3 `sessionRecord` 有两个写入者

- 写入者 A：`sessionStore.subscribe`（`:888-892`）——store cell 变化就 `setSessionRecord(selectChatSession(cell))`，**整体替换**。
- 写入者 B：`readSessionPage`（`:1346-1352`）、`loadEarlierMessages`（`:1376-1382`）——手工把旧 `events` 与新页合并，再 `createMessageBlocks(events)` **全量重算**。

两者交错时，A 的整体替换会冲掉 B 合并进来的 earlier 页。并且 store 的 `applyEnvelope` 已经按 seq 合并窗口、保留 earlier 页（`packages/client/src/sessions/session.ts:101-110`），B 的手工合并是重复劳动。

此外：

- 每加载一页都对**全部**事件重跑 `createMessageBlocks`，长会话下是 O(n) × 页数。
- `deferredToolDetail` 靠 Map 手工搬运（`:1351`、`:1381`），也是重复事实。

**方案**：durable 部分只认 `ClientSessionStore`。App 不再持有 `sessionRecord`，改为 `useSessionCell(sessionId)` + selector；`pageCacheRef`、手工合并、`createMessageBlocks` 重复调用全部删除。分页只调用 `store.loadEarlier(sessionId)`。

### P1-1 按会话 Map 只增不减

| Map | 有 delete | 备注 |
| --- | --- | --- |
| `sessionRunsRef` | 有 | |
| `messageQueuesRef` | 有 | |
| `draftsRef` | 有 | |
| `compactionFailuresRef` | 有 | |
| `steerContentRef` | 有 | |
| `taskSnapshotsRef` | **无** | P0-1 的 effect 会为所有会话建条目 |
| `pageVersionsRef` | **无** | |
| `approvalVersionsRef` | **无** | |
| `bashUpdatesRef` | **无** | |
| `lastSendOptionsRef` | **无** | |
| `submittedOptionsRef` | 部分 | task settle 时删 |
| `terminalRunIdsRef` | **无** | runId 永久累积 |
| `composerStateBySession`（state） | **无** | |
| `ClientSessionStore.#cells` | **无** | |

归档、删除会话、移除 Host 时都没有任何清理。

### P1-2 ref 镜像 state

`setActiveSessionId`（`:910-925`）一次把 7 个 Map 里的当前值复制到 7 个 state。每新增一个按会话的功能，就要在这里再加一行，漏一行就是串会话 bug。

### P1-3 渲染期读 ref

- `isRecoveredRun`（`:2158`）在 render 中读 `sessionRunsRef.current.get(...)`，变化不会触发重渲染，靠其他 `setStreamingBlocks` 碰巧刷新。
- `persistedEvents = sessionRecord?.events ?? agentRunResult?.events ?? []`（`:2157`）每次 render 新数组，使 `persistedMessages` 的 useMemo 在无 record 时每次重算。

### P1-4 不稳定的引用导致下游全量重渲染

- `messageQueueControls`（`:2228-2240`）每次 render 新对象 + 内联闭包。
- `SessionBrowseContext.Provider value={{...}}`（`:2711`）每次 render 新对象，所有消费者重渲染。
- `executionContext` 的 useMemo 依赖 `remoteTarget`，而 `useRemoteTarget` 每次返回新对象（见 03），useMemo 失效。
- `handleSend` 依赖 `remoteTarget`（`:1952`），同样每次重建。

### P1-5 订阅重复

- `window.actspaceHosts.onChanged`：App:1309、App:1956、`useRemoteTarget`、`ApprovalParts:110`、`HostConnectionsSettings:26`，各订阅一次。
- `onSessionLiveEvent`：DesktopSessionBridge、App:1048（队列）、App:1306（标题刷新），三处。

都有清理，不算泄漏，但每次事件触发多份刷新逻辑。

### P1-6 吞错

- `SessionProjectionContext.tsx:48`：`bridge.open(...).catch(() => undefined)`，打开会话失败界面无提示。
- `desktop-session-bridge.ts:61`：`catch { return; }` 直接终止整个 refresh 循环，无重试无上报。
- App 内约 14 处 `.catch(console.error)`，用户侧无反馈。

### P1-7 pending-submission 存取不对称

- 写入（`:1899`）：`host:` 会话写 `localStorage`，本地会话写 `sessionStorage`。
- 读取（`:916`）：只读 `localStorage`，且只对 `host:` 会话读。
- 结果：本地会话的「未确认提交」永远不会恢复；提交结果为 unknown 时关闭应用，条目永不清理。

### P1-8 SessionProjectionContext 的半接入状态

- App 传入 `store={sessionStore}`（`:2710`），所以 Provider 的 `ownsStore=false`，`bridge.open` 永远不会被调用，只剩 live 订阅和 refresh。
- `value.bridge` 在 render 中读 `bridgeRef.current`（Provider:75），首次渲染为 null。
- `useSessionProjection`（`:83`）无引用，全部使用 optional 版本。

### P2

- `:1895` 一个游离的裸 `{ ... }` 块，重构遗留。
- `agentRunResult` 只在浏览器 mock 下有意义（见 04）。
- `listSessionPage?` 可选 + `listSessions` 回退（`:810`、`:1406`），Electron 下回退永不走；但 quick-open（`:2118`）和归档（`:2586`）仍调用全量 `listSessions()`，应统一成分页接口。

## 3. 目标架构

```text
renderer/
  app/
    App.tsx                     ← 只做 Provider 装配 + 布局，目标 < 200 行
    providers.tsx
  api/                          ← 04：按域封装 window.actspace，唯一直接接触 bridge 的目录
    sessions.ts  tasks.ts  workspaces.ts  review.ts  settings.ts  hosts.ts  ...
  session/
    session-store.ts            ← ClientSessionStore 单例 + useSessionCell(selector)
    session-local-store.ts      ← 按会话本地状态（见 §3.1），含 evict
    live-runs/
      live-run-store.ts         ← onAgentStream → per-run 状态
      stream-blocks.ts          ← 从 App.tsx 迁出的 toolEntryToBlock / streamingStateToBlocks
    transcript.ts               ← durable + live 合并（类型化 identity，§2 P0-2）
    task-queue.ts               ← task snapshot → 队列 / 审批 / busy
    session-list.ts             ← 分页、分组、离线补齐
  target/                       ← 03：RunTarget
  features/
    composer/  conversation/  sidebar/  right-panel/  settings/ ...
```

### 3.1 按会话本地状态：一个 store

```ts
type SessionLocalState = {
  draft?: ComposerDraftRestore;
  composer: { mode: ComposerMode; selectedSkills: string[] };
  compactionFailure?: CompactionBlock;
  bashUpdates: Record<string, BashTaskUpdate>;
  lastSendOptions?: ComposerSendOptions;
  pendingSubmission?: PendingSubmission;    // 统一持久化规则，见 §2 P1-7
  approvalPending: boolean;
  failed: boolean;
};

interface SessionLocalStore {
  get(sessionId: string): SessionLocalState;
  update(sessionId: string, fn: (s: SessionLocalState) => SessionLocalState): void;
  subscribe(listener: () => void): () => void;
  evict(sessionId: string): void;              // 归档 / 删除 / Host 移除时调用
  evictWhere(pred: (id: string) => boolean): void;
}
// React 侧：useSessionLocal(sessionId, selector) 基于 useSyncExternalStore
```

- 组件按 `activeSessionId` 选择，不再需要 `setActiveSessionId` 里的 7 行镜像复制。
- 运行态（`sessionRunsRef`、`taskSnapshotsRef`、`steerContentRef`、`submittedOptionsRef`、`terminalRunIdsRef`）放进 `live-run-store` 与 `task-queue`，同样提供 `evict`。
- `terminalRunIdsRef` 改为只保留最近 N 个，或在 run 的 durable 完成事件到达后删除。

### 3.2 正文合并：`transcript.ts`

```ts
function selectTranscript(cell: SessionCell, live: LiveRunState | undefined, local: SessionLocalState): MessageBlock[]
```

规则：

1. durable 块来自 `selectSurfaceMessages(cell)`（不再自己 `createMessageBlocks`）。
2. live 块按 runId 分组；若 durable 已包含该 runId 的完成标记，整组丢弃；否则只追加 durable 尚未包含的 part（按 `BlockIdentity` 比较，不按字符串前缀）。
3. 压缩失败块、后台 bash 状态覆写作为最后一层装饰。
4. 纯函数，单测覆盖：正常流式、恢复中的 run、durable 先到 / live 先到、重复 user 消息、超长会话分页。

需要 `@actspace/session-projection` 配合：surface message 带 `runId` 和 `journalSeq`。若当前没有，列为本重构对投影层的唯一接口需求。

### 3.3 Context 取代 prop 钻取

| Context | 内容 | 替代的 prop |
| --- | --- | --- |
| `ActiveSessionContext` | `sessionId`、transcript selector、`isStreaming`、`isAborting`、`isCompacting`、`isSessionReady`、run 动作（send / abort / retryCompaction） | ConversationView 的约 20 个 |
| `ComposerContext` | mode、skills、model、draft 读写、队列 controls、notice | Composer 相关约 15 个 |
| `RunTargetContext` | 见 03 | workspace / branch / runLocation / remote 相关约 8 个 |
| `SessionActionsContext` | 新建 / 选择 / 置顶 / 重命名 / fork / 归档 / 复制 | Sidebar 相关约 10 个 |

每个 context value 必须 `useMemo`，动作函数用稳定引用（`useEvent` 模式或 store 方法）。

## 4. 实施步骤

| 步骤 | 内容 | 风险控制 |
| --- | --- | --- |
| S1 | 迁出纯函数：`toolEntryToBlock`、`streamingStateToBlocks`、`createCompactionBlock` 等 → `session/live-runs/stream-blocks.ts`；`getSessionTitle` 等小 helper → 各自模块 | 纯搬家，现有测试不变即通过 |
| S2 | 修 P0-1：删除 `sessions` effect 的全量刷新，改为启动补齐 + 事件驱动 | 补测试：列表刷新不触发 N 次 IPC |
| S3 | `SessionLocalStore` + `evict`；把 drafts / composerState / compactionFailure / bashUpdates / lastSendOptions / approval / failed 迁入；删除 `setActiveSessionId` 中的镜像 | 每迁一类跑一次 `app-*.test.tsx` |
| S4 | durable 单一事实源：删 `sessionRecord` state、`pageCacheRef`、手工合并；`useSessionCell` | 需要先确认 projection 是否带 runId / seq |
| S5 | `transcript.ts` + 类型化 identity；删字符串前缀去重 | 先写对照测试：新旧合并结果在现有 fixture 上一致 |
| S6 | live-run-store、task-queue 迁出；`terminalRunIdsRef` 有界 | |
| S7 | 4 个 Context 替换 prop；WorkbenchLayout / ConversationView prop 降到 < 10 | |
| S8 | 订阅合并：Host 变化、live event 各只订阅一次，内部分发 | |
| S9 | 吞错改为可见：打开会话失败显示错误态；bridge refresh 失败重试 + 上报 | |
| S10 | pending-submission 统一：本地与远端同一存储与恢复规则 | 需要拍板：本地会话未确认提交是否跨重启恢复 |

每步完成后 `App.tsx` 行数应单调下降；S7 结束时目标 < 400 行，最终 < 200 行。

## 5. 验收

- 单测：`transcript.ts` 合并规则全覆盖；`SessionLocalStore.evict`；列表刷新不触发全量 IPC。
- 现有 `app-*.test.tsx`（approval-recovery、message-queue、remote-host-refresh、response-annotations、session-actions、streaming-user-message）全部通过，必要时改为面向新 store 的断言。
- 性能：100 个会话、单会话 2000 条事件、连续加载 10 页早期历史 —— 记录 IPC 次数和 `createMessageBlocks` 调用次数，前后对比。
- Electron 真机：流式中切换会话再切回、流式中刷新窗口恢复、加载早期历史后再收到新消息、归档会话后内存不再增长（Performance 面板）。

## 6. 开放问题

1. 本地会话「已提交未确认」的草稿，是否也要跨应用重启恢复（远端目前会）？
2. `@actspace/session-projection` 的 surface message 是否已经带 `runId` / `journalSeq`？没有的话需要先在投影层补，这会跨出 Desktop 范围。
3. 是否引入状态库（zustand 等）？建议**不引入**，用 `useSyncExternalStore` + 小 store 足够，和 `ClientSessionStore` 的风格一致。
