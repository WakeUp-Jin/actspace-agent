# App 装配层拆分：把 1670 行的 `App.tsx` 拆成按职责的 hook

## 目标

`apps/desktop/src/renderer/App.tsx` 是 renderer 唯一的"上帝组件"：1670 行，11 个 `useState`、18 个 `useEffect`、65 个 `useCallback`、12 个 `useRef`，会话列表加载、工作区目录、模型选择、任务队列、发送与中止、evict、侧边对话、会话动作全部写在一个函数体里。它违反了清单里"单文件超过 500 行就要拆"的规则，也是前端规范里唯一长期游离在技术债表之外的超标文件。

做完这个计划后：

1. `App.tsx` 只剩**装配**：创建 store、调用各职责 hook、生成 Context value、渲染 `AppProviders` + `WorkbenchLayout`，目标 300 行以内；
2. 每个职责是一个 `use-*.ts`（或 `.tsx`）文件，放在它所属的目录（`session/`、`target/`、`components/right-panel/side-chat/`），有自己的输入输出类型，能单独写测试；
3. **对外行为不变**：`AppProviders` 的 Provider 顺序、三个 Context 的字段、`WorkbenchLayout` 的 prop 都不动；现有 16 个 `test/app-*.test.tsx` 一行不改地通过。

## 状态

2026-11-10 立项，未开始。前置条件已满足：`useExhaustiveDependencies` 已清零并升 error（#67），`noNonNullAssertion` 已收口（#74），拆分时不会把 hook 依赖问题一起搬走。

## 范围

**包含：**

- `App.tsx` 里的状态、`useEffect`、`useCallback` 按下表拆成职责 hook；App 只保留装配。
- 每个 hook 的输入（store、ref、回调）显式声明，不隐式共享 App 作用域里的变量。
- 跨 hook 的少数共享 ref（`messageRequestRef`、`activeSessionIdRef`、`sendsInFlightRef`）收进一个 `session/app-refs.ts` 或作为 hook 返回值传递，不再散落。
- 拆出的纯函数（`createWorkspaceOptionsFromRoots`、`firstVisibleWorkspaceRoot`、`sessionReadError`、`copyWithSelection` 等）移到对应目录的 `.ts` 并补单测。
- 同步 `front-会话状态与数据流规范.md` §1 模块表、§8 Context 说明，以及 `app/providers.tsx` 头注释。

**不包含：**

- 不改 Context 字段、不改 `WorkbenchLayout` prop、不改 IPC 调用；不借机修 §10 的 evict 时机或技术债表里的 Composer 跨会话状态。
- 不引入状态库；仍是"小 store + `useSyncExternalStore`"。
- 不动 `SessionTranscriptProvider`、`LiveRunStore`、`TaskQueueStore`、`SessionLocalStore` 的内部实现。

## 背景

- 相关文档：`docs/design-docs/frontend/front-会话状态与数据流规范.md`（§1 模块、§8 Context 的"App 里不要用带工厂函数的 `useMemo`"约束）、`front-新功能开发清单.md` §4（文件拆分规则）、`completed/design-archive/desktop-frontend-refactor/02-Renderer状态层与会话数据流.md`（14 期状态层设计）。
- 相关代码路径：`apps/desktop/src/renderer/App.tsx`、`app/providers.tsx`、`session/*`、`target/use-run-target.ts`（已有的职责 hook 范例）、`hooks/useShallowStable.ts`、`test/helpers/workbench.tsx`。
- 现状数据（2026-11-10，`main@b0bc9cc4`）：

| 职责 | 相关行数（粗估） | 主要内容 | 目标文件 |
|---|---:|---|---|
| 会话列表与分页 | ~120 | `sessions` / `browseGroups` / `listLoading` / `listRetry`、`loadedListPages`、`readSidebarSessions`、`loadMoreSessions`、列表刷新 effect、Host 断线补齐 | `session/use-session-list.ts` |
| 当前会话读取 | ~150 | `selectedSessionId`、`messageRequestRef`、`historyPendingRef`、`readSessionPage`、`loadEarlierMessages`、bootstrap effect、`setActiveSessionId`、`retryMessages` | `session/use-active-session-page.ts` |
| 工作区与模型 | ~130 | `workspaceRegistry`、`selectedWorkspaceRoot`、`workspaceGitContext`、`selectedBranch`、`runLocation`、`defaultModelId` / `selectedChatModelId` / `usableChatModels`、settings 读取 effect、`handleSettingsChange`、`handleSelectedChatModelChange`、`refreshWorkspaces`、`pickAndRegisterWorkspace` 等 4 个工作区动作 | `target/use-workspace-selection.ts`、`target/use-chat-model.ts`（与已有的 `use-model-catalog.ts` 同目录） |
| 任务队列与审批 | ~160 | `taskQueue`、`applyTaskSnapshot`、`refreshTaskQueue`、`taskCommand`、`continueQueue`、steer / unsteer / resume / edit、`refreshPendingApprovalStatuses`、pending-submission 恢复 effect | `session/use-task-queue-actions.ts` |
| 发送、中止、流事件 | ~250 | `sendsInFlightRef`、`startOptimisticRun`、`sendToSession`、`resendTurn`、`handleSend`、`abortSession`、`handleAbort`、`handleRetryCompaction`、`handleStreamEvent`、`agentStream` effect、`handleSessionRewound` | `session/use-session-send.ts` |
| evict 与 cell 保留 | ~70 | `cellRetention`、`evictionCountRef`、`pendingEvictionsRef`、`hydratedSessionIdsRef`、`evictSession`、`retainSideChat` | `session/use-session-eviction.ts` |
| 会话动作 | ~230 | 新建、选择、置顶、重命名、复制 id / 正文、分叉、归档、恢复、Composer 模式 / 技能变更 | `session/use-session-actions.ts` |
| 侧边对话 | ~60 | `openSideChatIds`、`openSideChat`、`listSideChats`、`abortSideChat`、`setSideChatMode`、`markSideChatRead`、`renameSideChat` | `components/right-panel/side-chat/use-side-chat-runtime.ts` |
| 装配 | ~120 | store 创建、`useShallowStable` 生成 6 个 Context value、JSX | 留在 `App.tsx` |

- 已知约束：
  - §8 的内存约束是硬约束：**App 的 `useCallback` 闭包会层层留住旧渲染作用域**。拆成 hook 后每个 hook 是独立函数作用域，这个问题会自然缓解，但 hook 之间传递的回调仍要用 `useCallback` 保持稳定，不能传整个 `sessionRecord`。
  - 16 个 `test/app-*.test.tsx` 直接渲染 `<App />` 并通过 `test/helpers/bridge.ts` 的 mock bridge 驱动，是这次拆分的特征测试；它们覆盖审批恢复、消息队列、远端 Host 刷新、批注、会话动作 / 错误 / evict、流式用户消息、工作区注册、worktree 创建。
  - `useExhaustiveDependencies` 是 error：拆出的 hook 必须把依赖写全，不允许为了"保持原行为"加 `biome-ignore`。

## 风险

- 风险：拆分时把本来共享一个闭包的两段逻辑拆到两个 hook，中间多了一次渲染或 ref 更新时序变了，表现为审批 / 队列状态偶尔不刷新。缓解：每个里程碑只拆一个职责，拆完跑全部 `app-*.test.tsx`；涉及 ref 的（`messageRequestRef`、`sendsInFlightRef`）保持同一个 ref 对象通过参数传入，不复制。
- 风险：hook 返回大对象导致 App 每次渲染重建 Context value。缓解：hook 的返回值也过 `useShallowStable`，或直接返回已经稳定的字段；验证方式里用 `test/session-ipc-budget.test.tsx` 的渲染计数思路加一个 Context value 引用稳定性测试。
- 风险：拆到一半停下，App 变成"一半在 hook 一半在函数体"。缓解：每个里程碑独立成 PR、独立可合；技术债表记录到哪一步。

## 里程碑

每个里程碑一个 PR，顺序按"依赖少、测试覆盖好"排：

1. **M1 侧边对话 + evict**（约 130 行）：两块与其它职责耦合最少；`retainSideChat` 与 `evictSession` 共用 `pendingEvictionsRef`，一起拆。特征测试 `app-session-evict`、`right-panel-side-chat`。
2. **M2 工作区与模型**（约 130 行）：`use-workspace-selection` 与 `use-chat-model`；settings 读取 effect 随 `use-chat-model`。特征测试 `app-workspace-register`、`app-worktree-create`。
3. **M3 会话列表与分页**（约 120 行）：`use-session-list` 吞掉 `readSidebarSessions`、`loadMoreSessions` 与 Host 断线补齐 effect。特征测试 `app-remote-host-refresh`。
4. **M4 任务队列与审批**（约 160 行）：`use-task-queue-actions`；pending-submission 恢复 effect 也进来。特征测试 `app-approval-recovery`、`app-message-queue`。
5. **M5 发送、中止、流事件**（约 250 行，最大也最核心）：`use-session-send`。依赖 M4 的 `refreshTaskQueue` / `continueQueue`。特征测试 `app-streaming-user-message`、`app-session-errors`、`app-response-annotations`。
6. **M6 会话动作 + 当前会话读取**（约 380 行）：`use-session-actions`、`use-active-session-page`。特征测试 `app-session-actions`、`app-workbench-context`。
7. **M7 收尾**：纯函数移出并补单测；`App.tsx` 行数核对（≤ 300）；更新规范 §1 / §8 与 `providers.tsx` 注释；技术债表划掉；计划移到 `completed/`。

## 验证方式

- 命令（每个里程碑）：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test -- test/app-` 及该里程碑列出的特征测试；M7 跑全量 `pnpm --filter @actspace/desktop test`
  - `npx biome lint --diagnostic-level=error apps/desktop/src/renderer`（`useExhaustiveDependencies` 不允许新 ignore）
  - `pnpm check:renderer-bridge`、`pnpm check:hot-path-reads`（发送 / 流事件路径是高频路径）
  - `wc -l apps/desktop/src/renderer/App.tsx` 记进执行过程
- 手工检查（M5、M6 之后在 Electron 里过一遍）：新建会话 → 发送 → 中止 → 重发；审批卡出现与通过；切换会话时输入框草稿保留；归档后内存不涨（DevTools Memory 快照里归档会话的 cell 释放）。
- 观测检查：`test/session-ipc-budget.test.tsx` 的 IPC 调用预算不变。

## 进度记录

- [ ] M1 侧边对话 + evict
- [ ] M2 工作区与模型
- [ ] M3 会话列表与分页
- [ ] M4 任务队列与审批
- [ ] M5 发送、中止、流事件
- [ ] M6 会话动作 + 当前会话读取
- [ ] M7 收尾与文档

## 决策记录

- 2026-11-10：拆成职责 hook 而不是拆成多个子组件。App 的问题是状态与副作用堆在一起，不是 JSX 太多；拆组件会把 prop drilling 变多，拆 hook 不改渲染树。
- 2026-11-10：hook 放在职责所属目录（`session/`、`target/`、`side-chat/`），不新建 `app/hooks/`。规范 §4 说"按区域放，不新建 `features/`"，`target/use-run-target.ts` 已经是这个模式。
- 2026-11-10：共享 ref 通过参数传入而不是各 hook 自建。`messageRequestRef` 被会话读取和发送两块同时用来丢弃过期响应，复制成两个 ref 会改变语义。

## 执行模式

- **交互模式**：M1–M3 边界清晰，可以在一个会话里连续推进但每个里程碑独立 PR；M4–M6 涉及发送与审批时序，每个 PR 合并前要在 Electron 里手工过一遍，不适合夜间模式。

## 执行文档

执行开始时在 `docs/exec-runs/20261110-app-assembly-split/` 创建 `execution-process.md` 与 `execution-summary.md`（模板见 `docs/exec-runs/templates/`）。每个里程碑结束时把 `App.tsx` 行数和特征测试结果记进 `execution-process.md`。
