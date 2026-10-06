# 15 运行目标 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/15-运行目标执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-15`，从 `refactor/desktop-frontend@07e0f2b8`（14 的 squash 提交）拉出
- **开始时间**：2026-10-06 10:45
- **结束时间**：2026-10-06（收尾验收与复核修复之后 squash）

## 执行时间线

### T0：启动与重新定位

- 14 的 squash 提交 `07e0f2b8` 已登记到 14 的交接和 00 §11。
- **基线**：与 14 结束时相同。desktop 测试文件 158 / 1（已知 `workspace-git-context-service`）/ 1，用例 1162 / 1 / 2；App.tsx 1565 行。

**会话 key（S1）**

- 编解码在 `M/remote-hosts/session-router.ts:21-29`，与计划一致。
- main 侧调用方：
  - `desktop-adapter.ts` 13 处；
  - `projection.ts` :2 / :5 / :17；
  - `fixed-renderer-ipc.ts` :2 / :128；
  - `session-router.ts` :13。
- renderer 手写解码：
  - `R/hooks/useRemoteTarget.ts:6-9`（`remoteSessionRef`），`catch` 后返回 null；
  - `remoteHostId` :10；
  - 调用方 `ConversationView.tsx:858`、`hooks/remoteArtifact.ts:5`。
- `R/mock/mock-db.ts:62-66` 还有一份手写编码（13 加的 mock），计划没有列。T2 一并改为 `encodeSessionLocator`。

**`startsWith("host:")`（S2）**

14 之后 App 只剩 3 处，另外 2 处随代码迁到 `session/` 或被删掉了。

| 端 | 位置 |
| --- | --- |
| renderer | `App.tsx` :908 / :931 / :983 |
| renderer | `TurnOutputArtifacts.tsx:214`、`useRemoteTarget.ts:7`、`session/message-queue.ts:9` |
| main | `session-router.ts:23`、`desktop-adapter.ts:197`、`desktop-shell-ipc.ts:59` |

测试中手写 key 的位置：

- `host-feedback.test.tsx:44`、`app-remote-host-refresh.test.tsx:10-11` 用 `btoa`（带 `=` 填充，严格解码会判为非法，T2 改写）；
- `remoteArtifact.test.ts:5`；
- `message-queue-tray.test.tsx:31` 的 `"host:remote-session"` 本身就是非法 key，按决策（非法 key 按远端处理）行为不变，保留；
- `composer.test.tsx:1293` 直接构造 `useRemoteTarget` 的返回值（T6 / T14 改写）。

**remote 分支（S4）**

- `WorkbenchLayout.tsx` 7 处：:388 / :399 / :485 / :486 / :558 / :597 / :604。
- `Composer.tsx` 15 行：
  - 类型 :103（`remote?: ReturnType<typeof useRemoteTarget>`）；
  - :648 / :656 / :658 / :660 / :991 / :1158 / :1678 / :1744-1746 / :1998 / :2131 / :2213 / :2395-2405。
- `App.tsx` 中的 `remoteTarget`：
  - :291 创建；
  - :501 / :527（worktree effect）；
  - :890-893 / :931 / :971（handleSend）；
  - :983 / :987（hostsChanged）；
  - :1030-1041（新建页选 Host）；
  - :1250-1261（`executionContext`）。
- 14 之后 WorkbenchLayout 13 个 prop、ConversationView 14 个。剩下的 `workspaceOptions` / `selectedWorkspaceRoot` / `onSelectWorkspace` / `executionContext` 由本计划的 `RunTargetContext` 接走，目标 < 10。

**`useRemoteTarget.ts`（43 行）**

- `host.describe` 在 :24，`.catch(() => undefined)` 吞错；
- `actspace:remote-models` 读 :17、写 :19；
- `hostsApi.activate` :38；
- 路径反查 `workspaceId` :42。

**Host 订阅（S3）**

| 类型 | 位置 |
| --- | --- |
| list + onChanged | `useRemoteTarget.ts:28` |
| onEvent | `useRemoteTarget.ts:29` |
| onChanged | `App.tsx:639`（列表刷新）、`App.tsx:974`（重连补齐，14 T3 加的） |
| list + onChanged | `ApprovalParts.tsx:108-109` |
| list + onChanged | `settings/HostConnectionsSettings.tsx:29-30`，操作后 :34 再 list 一次 |
| 只 list | `App.tsx:227`（移除工作区时判断已知 Host） |

**审批 id（S7）**

- 拼接：`desktop-adapter.ts` :54 / :83 / :90 / :176 / :251，与计划一致。
- 解析：
  - main 在 `fixed-renderer-ipc.ts:122`。11 之后分流移进了 `createIpcRegistrar` 的 `middleware`（:119-131），不再在 `handle()` 里；
  - renderer 在 `ApprovalParts.tsx:103`（`split(":")[0]`）。
- 类型：`S/session.ts:107/108`、`S/ipc.ts:409`，与计划一致。
- **14 之后 `approvalRequestId` 的位置**：没有进 task-queue。
  - live 侧在 `session/live-runs/live-run-store.ts`（:234 / :264 / :283 / :329），由 `stream-blocks.ts` 写进块；
  - durable 侧由 `S/session-selectors.ts` 的 preview 投影；
  - 重载后的审批恢复在 App 的 `refreshPendingApprovalStatuses`（:446-473）。
  - 消费方是 `ApprovalParts.tsx` 的 `useApprovalDecision(requestId)`，被 5 个块组件调用。

**远端会话的模型存放位置**

- 会话 meta（`RuntimeV2SessionSnapshot.metadata`）只有 title / pinned / archived，没有模型。
- 模型通过 `tasks.command({ op: "configure" })` 下发（`S/runtime-v2/tasks.ts:40-50`），只出现在已运行的 `RunRecord.configuration` 里；没有运行过的会话、最近一次 configure 都不会回读。
- **结论**：模型不在 meta 里，按决策写入 `remote-session-prefs`。

**git 实现（01 S9）**

| 实现 | 位置 |
| --- | --- |
| `workspace-environment-service.ts` | :574 |
| `review-git-service.ts` | :96；gitMissing :135 |
| `workspace-git-context-service.ts` | :415；gitMissing :448 |
| `review-pr-service.ts` | :117 |
| `review-git-engine.ts`（不并入） | :832 |
| `review-git-worker.ts`（不并入） | :93 |

**shared 子路径接线**

- `package.json` 的 exports 每项都是 `{ types, import, require, default }`，指向 `dist/`。
- desktop 的 `vite.config.mts`、`vitest.config.ts` 把子路径 alias 到 `src/`，`tsconfig*.json` 用 `@actspace/shared/*` 指向 dist，不用逐项加。
- `session-list-page` 没有从 `index.ts` 再导出。`session-locator` 按计划两边都加。

### T1：`S/session-locator.ts`

- `encodeSessionLocator` / `decodeSessionLocator` / `InvalidSessionLocatorError`，规则与 `session-router.ts` 原实现一致：不以 `host:` 开头返回 null；形状、类型、非空、长度 ≤ 128、round-trip，任何一项不符就抛错。
- **偏差**：计划写「`TextEncoder` 加手写编码」。shared 的 tsconfig 只有 `lib: ES2022`，也没有 `@types/node`，`TextEncoder` 没有类型。所以 UTF-8 和 base64url 都是手写的。解码是严格的：只接受 base64url 字母表、不带填充；不是规范编码的输入，最后都会被 round-trip 检查拒绝。所以和原来宽松的 `Buffer.from(…, "base64url")` 加 round-trip 相比，接受的 key 集合相同。
- 接线：`package.json` exports、`index.ts`、desktop 的 `vite.config.mts` / `vitest.config.ts` alias（写在 `@actspace/shared` 之前）。
- `session-router.ts` 的 `remoteSessionKey` / `parseRemoteSessionKey` 改为对它的薄封装，调用方不变。
- 测试 `S/test/session-locator.test.ts`，14 个用例：
  - 合法 key 的往返，本地 id 返回 null；
  - 11 种非法输入：非法字符、带 `=` 填充、截断、不是 JSON、长度 1 或 3、元素不是 string、空串、超长、非规范 JSON、空 payload；
  - 128 长度上限可以通过；
  - 200 组随机输入（含中文、emoji、控制字符、孤立代理项、引号和反斜杠）与 `Buffer.toString("base64url")` 逐字节一致。
- 变异：去掉 round-trip 检查、长度上限放宽 1、UTF-8 三字节编码的位移改错，都有用例失败。
- 结果：
  - shared build 通过，测试 163 个（+14）；
  - desktop typecheck 0 错误；main 的 `remote-host-*` 5 个文件通过；
  - desktop 全量测试文件 158 / 1（已知）/ 1，用例 1162 / 1 / 2，与基线一致。

### T2：`locateSession` 与替换

- 新增 `R/target/locate-session.ts`：
  - `locateSession(key)` 返回 `local` / `remote` / `invalid`，不抛错；
  - `isLocalSession(key)`：只有 `local` 为 true，损坏的 key 不当本机会话。
- shared 补一个 `hasSessionLocatorPrefix(key)`，只看前缀。main 的两处（`desktop-adapter.ts` 列表 id、`desktop-shell-ipc.ts` 拒绝远端）只关心「是不是 `host:` key」，不需要解码，也不该在损坏的 key 上抛另一种错。
- 替换：
  - renderer：`App.tsx` 3 处（worktree 校验、configure 选模型、Host 重连时刷新活动会话）、`TurnOutputArtifacts.tsx`、`message-queue.ts`、`remoteArtifact.ts`、`ConversationView.tsx`；
  - `useRemoteTarget.ts` 删掉 `remoteSessionRef` / `remoteHostId`，改用 `locateSession`；
  - `mock-db.ts` 的手写编码改为 `encodeSessionLocator`。
- App 的 Host 重连 effect 原来用 `remoteTarget.hostId` 判断活动会话属于哪台 Host，改为直接从活动会话的 key 解出来，依赖里去掉了 `remoteTarget.hostId`。两者在有活动会话时等价。
- `kind: "invalid"` 时，会话视图显示「会话标识损坏，无法打开这个会话。」，不给「重试」。空会话和有正文两处错误条都处理了。message-queue 遇到损坏的 key 按远端处理：不信任本地附件路径。
- 测试：
  - 3 个测试文件的手写 key 改为 `encodeSessionLocator`。原来 `btoa` 生成的 key 带 `=` 填充，按严格规则其实是非法的，只是旧的 renderer 解码比较宽松。
  - 新增 `locate-session.test.ts`（2 个用例）；`app-session-errors` 新增「key 损坏时显示错误态、没有重试、不白屏」。
  - 变异：去掉 `locatorError`、`invalid` 改返回 `local`，都有用例失败。
- 验证：
  - `grep -rn 'startsWith("host:")' apps/desktop/src --include=*.ts --include=*.tsx | grep -v /test/` 为 0；
  - `grep -rn "remoteSessionRef\|remoteHostId" apps/desktop/src` 为 0。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 159 / 1（已知）/ 1，用例 1165 / 1 / 2（+1 个文件、+3 个用例）；
  - `check:renderer-bridge`（320 个文件）、`check:ipc-channels` 通过。

### T3：`R/target/host-directory.ts`

- `createHostDirectory(source)` 加上模块级单例 `hostDirectory`（数据源是 `hostsApi` / `eventsApi`），以及 `useHostDirectory(selector)`（基于 `useSyncExternalStore`）。
- 快照字段：`loaded`、`hosts`、`listError`、`descriptions`、`describeErrors`、`describing`。
- 订阅方式与 14 的 `liveEvents` 相同：第一个消费者挂上时 list 并订阅 `hostsChanged` / `hostEvent`；最后一个退订时释放并清空快照，测试会在用例之间替换 bridge。`subscribe`、`onHostsChanged`、`onHostRemoved` 都算消费者。
- describe：
  - 每个 Host 在一次连接期间只 describe 一次。Host 新出现、或从未连接变为已连接时，重新 describe。
  - 原来的 `useRemoteTarget` 每收到一次 `hostsChanged` 就对所有已连接的 Host 再 describe 一遍。
  - 失败原因记在 `describeErrors`，成功后清除。
  - 断开、移除或释放之后才返回的结果丢弃。
- 计划外发现：第一次 list 进行中如果先收到 `hostsChanged`，list 返回的旧列表会覆盖事件，还会把事件里新出现的 Host 当成「被移除」。改为：list 期间收到过事件，就丢弃 list 的结果。用例「does not treat the first list as removing anything」最初就是因此失败的。
- `refresh()` 重新 list，返回最新列表，给设置页的操作之后用。
- 测试 `R/test/host-directory.test.ts`，8 个用例：
  - 多个消费者只订阅一次、最后一个退订后释放；
  - 每次连接只 describe 一次，重连后重新 describe；
  - describe 失败时记录原因，重连成功后清除；
  - 断开后迟到的 describe 结果丢弃；
  - 移除 Host 时通知并清掉 description；
  - 第一次 list 不算移除；
  - Host 状态事件更新 description；
  - list 失败时可见。
- 变异 4 个，都有用例失败：重连不再 describe、去掉迟到结果的判断、list 覆盖事件、永不释放。
- 结果：typecheck 0 错误；本文件 8 个用例通过。App 等消费方在 T4 接入。

### T4：消费方改用 HostDirectory

- `useRemoteTarget`：hosts 和 descriptions 改从 `useHostDirectory` 读，删除自己的 list / 订阅 / describe。`HostDescription` 类型移到 `host-directory.ts`，这里转导出。`hostsApi.activate` 的 effect 保留。
- `ApprovalParts.useApprovalDecision`：「审批所在的 Host 是否在线」改为 `useHostDirectory` 的 selector，删除自己的 list / 订阅。审批 id 的解析留到 T11。
- `HostConnectionsSettings`：列表从 directory 读；list 失败时沿用原来的 `connectionError` 文案；操作之后改调 `hostDirectory.refresh()`。
- App：
  - 侧栏刷新判断「已知 Host」时改读 directory 快照。快照还没读到或读失败时，退回 `refresh()`。
  - 侧栏刷新和重连补齐两处 `hostsChanged` 改为 `hostDirectory.onHostsChanged`。
  - **`onHostsChanged` 只在收到事件时通知**，第一次 list 不算。原来这两处订阅的就是事件；如果 list 的结果也通知，启动时会多刷新一次侧栏。
- **Host 被移除时 evict**：App 订阅 `onHostRemoved`，对侧栏里属于这台 Host 的会话调用 14 的 `evictSession`（当前会话和运行中的会话沿用 14 的规则）。会话仍留在侧栏，显示「远端 · 未连接」（03-3）。
  - evict 会把会话移出「已补齐」集合。会话仍在侧栏，下一轮补齐会对一台已不存在的 Host 再发 `listPending` / `tasks.command`，然后报错。
  - 所以补齐的 effect 增加了一条：远端会话要等 directory 读到 Host 列表，并且它的 Host 在列表里才补齐。Host 离线或撤销时仍在列表里，照常补齐，与原来一致。
  - 已知差异：Host 列表读取失败时，远端会话不补齐。原来会照常发请求，大概率也是失败。
- 计划写的 grep 用的是 `hosts.(onChanged|onEvent|list)(`，实际的 API 名是 `hostsApi.list` / `eventsApi.hostsChanged` / `eventsApi.hostEvent`。改为 `grep -rnE "hostsApi\.list\(|hostsChanged\(|hostEvent\(" apps/desktop/src/renderer --include=*.ts --include=*.tsx | grep -v /test/`，结果只剩 `host-directory.ts` 的 3 行。
- 测试：`app-remote-host-refresh` 新增 3 个用例：
  - 整个窗口只 list 一次、只有 1 个 `hostsChanged` 订阅；
  - Host 被移除后，它的会话不再补齐；
  - Host 被移除后，后台会话的待审批标记被清掉，会话仍在侧栏。
  - 变异 3 个，都有用例失败：去掉已知 Host 的过滤、侧栏刷新改回直接订阅、移除时不 evict。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 160 / 1（已知）/ 1，用例 1176 / 1 / 2；
  - `check:renderer-bridge`（322 个文件）通过。
  - App.tsx 1583 行（+18）。T6 / T12 拆出 remote 逻辑后会下降。

### 插曲：`renderer/target/` 被 .gitignore 忽略

- 根目录 `.gitignore` 的 `target/`（给 Rust 构建目录用的）同时匹配了 `apps/desktop/src/renderer/target/`。T2 的 `locate-session.ts`、T3 的 `host-directory.ts` 都没进提交；工作区里文件一直在，所以测试和 typecheck 没暴露。T5 做 `git status` 时发现新文件不出现。
- 处理：加否定规则 `!apps/desktop/src/renderer/target/`，单独提交 `3959463d`，补交这两个文件（内容与 T4 时一致）。没有改历史，T2–T4 的提交单独检出时仍缺文件；收尾 squash 后主线不受影响。
- 之后每个 T 提交前用 `git status --short` 确认新文件都在。另查了 `git status --ignored`：其余被忽略的只有构建残留（`apps/desktop/packages/`、`packages/tools/core-tools/`、`apps/site/.astro/`），没有源码。

### T5：RunTarget 类型、prefs、useRunTarget、RunTargetContext

- `run-target.ts`：`RunTarget` 加了计划之外的第三种 `invalid { key }`，对应 T2 的损坏 key；它的能力全部禁用（原因「会话标识损坏」），附件也不收。
  - `capabilitiesOf(target, { gitStatus })`：本机的 `newWorktree` 要求 Git 状态 `ready`，`branchSwitch` 要求 `ready` 或 `no_head`（与 Composer 现有判断一致）；远端全部禁用，原因「远端机器暂不支持」。
  - 附件：本机只收图片，远端图片和文件都收（Composer 现状，Chat 形态由 Composer 自己放开文件）。
- `remote-session-prefs.ts`：`localStorage["actspace:remote-session-prefs"]`，`{ [sessionKey]: { workspaceId?, modelId?, recordedAt } }`。
  - store 带内存缓存，`get` 返回稳定引用，供 `useSyncExternalStore` 用；读写失败（隐私模式、配额、内容损坏）都当作没有记录。
  - `resolveRemoteWorkspaceId` 是纯函数，返回 `{ workspaceId, fromPath }`。写回放在 `useRunTarget` 的 effect 里，渲染中不写存储。
- `use-run-target.ts`：
  - 输入：会话 id、会话 meta 的工作区路径、`locked`、本机的 workspaceRoot / branch / worktree / gitStatus。
  - 远端会话的 workspaceId 先看 prefs；没有记录时按路径反查，反查到就写回，之后不再反查。
  - **T6 的「删除 `useRemoteTarget` 的路径反查」提前在这里做了**：`useRemoteTarget` 第二个参数从路径改为解析好的 workspaceId，路径反查只剩 `resolveRemoteWorkspaceId` 一处。没有记录也没有路径时传 undefined，沿用 `useRemoteTarget` 自己的选择，与原来一致。
  - 返回 `{ target, capabilities, locked, remote }`，用 `useShallowStable` 保持引用（14 的规则：Context value 不用工厂 `useMemo`）。`remote` 是过渡字段，给 Composer 远端的 3 个 select 用，T14 删除。为了让它也稳定，`useRemoteTarget` 的 `selectModel` 改用 `useCallback`，返回值再过一次 `useShallowStable`。附带效果：App 的 `executionContext` 不再每次渲染都变。
- `run-target-context.tsx`：默认值是「本机、未锁定」，直接渲染 Composer 等组件的测试不用包 Provider。挂在 `AppProviders` 的 ActiveSession 之内、Composer 之外。
- App：
  - `useRemoteTarget` 换成 `useRunTarget`，`remoteTarget = runTarget.remote`，其余用法 T6 迁移。
  - 新建远端会话后，`remoteSessionPrefs.set(id, { workspaceId })`。
  - `evictSession` 增加 `remoteSessionPrefs.remove(id)`（计划：evict 时删除条目）。
- 测试：
  - `run-target.test.ts` 5 个：本机 Git 仓库、非仓库 / no_head、worktree 与本机一致、远端禁用并给原因、损坏 key。
  - `remote-session-prefs.test.ts` 5 个：store 合并 / 跳过相同写入 / 持久化 / 删除；存储损坏或不可用；反查优先级；旧会话按路径反查一次并写回、之后路径变了仍用记录；值不变时引用不变。写回用例特意选第二个工作区，避免与新建页默认选第一个碰巧一致。
  - `app-remote-host-refresh` 的 Host 移除用例加一条断言：被 evict 的后台会话 prefs 条目被删除。
  - 变异 5 个，都有用例失败：不写回、evict 不删 prefs、远端放开 `newWorktree`、去掉 `useShallowStable`、不把解析结果传给 `useRemoteTarget`。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 162 / 1（已知）/ 1，用例 1186 / 1 / 2；
  - `check:renderer-bridge`（328 个文件）、`check:ipc-channels`、`check:frontend-tokens`、`check:current-docs` 通过。
  - App.tsx 1593 行（+10）。

### T6-1：WorkbenchLayout 读 RunTargetContext

- `RunTargetValue` 增加 `workspaceOptions` / `selectedWorkspaceRoot` / `onSelectWorkspace` / `execution`，App 用 `useShallowStable` 把 `useRunTarget` 的结果和这几项合成 Context value。`execution` 暂时就是原来的 `ComposerExecutionContext`（含 `remote`），T6-3 收窄。
- WorkbenchLayout：
  - 删除 4 个 prop（`workspaceOptions` / `selectedWorkspaceRoot` / `onSelectWorkspace` / `executionContext`），改从 Context 读；**prop 13 → 9**，达到目标（< 10）。ConversationView 这一步仍按 prop 接收，T6-2 再改。
  - 原来 6 处 `executionContext?.remote?.hostId` 改为 `capabilities.review`（Review 入口、改动摘要条、工作区标题栏控件）和 `capabilities.terminal`（右侧面板的开发对象）。
  - 行为差异：损坏 key 的会话（`invalid`）原来按本机处理，现在也隐藏这些入口。这类会话本身只显示「会话标识损坏」的错误态，无可用入口更一致。
- 测试 helper `test/helpers/workbench.tsx`：按 14 的做法加 `RUN_TARGET_KEYS` 和 `legacyRunTarget`，把旧 prop 拆进 `RunTargetContext`；另可用 `runTarget` 直接指定目标。
- 测试：`right-panel-review` 新增「远端运行目标下隐藏工作区控件和开发对象」（同一组 prop 先渲染本机确认控件存在，再渲染远端确认消失）。变异 2 个（review / terminal 能力恒为 true），改动前全量测试都不失败，加用例后都失败。
  - 跑 terminal 变异时 `composer.test` 的「opens a card listing selected text and comments」失败过一次，单独连跑 3 次都通过，全量也通过，判断为满载下的时序抖动，与本改动无关；后面继续观察。
- 结果：typecheck 0 错误；全量测试文件 162 / 1（已知）/ 1，用例 1187 / 1 / 2。

### T6-2：ConversationView、TurnOutputArtifacts 读 RunTargetContext

- ConversationView：
  - 删除 `workspaceOptions` / `selectedWorkspaceRoot` / `onSelectWorkspace` / `executionContext`，改从 Context 读，再原样传给两处 Composer（T6-3 再让 Composer 自己读）。
  - 读文件时「是不是远端」改看 `target.kind`，损坏 key 的错误态也改看 `target.kind === "invalid"`，不再自己调 `locateSession`。
  - **`trajectory` prop 删除**：`TrajectoryView` 在没有传 snapshot 时本来就从投影 cell 读同一份 `selectTrajectory`，WorkbenchLayout 算好再传是重复的。变异「trajectory 恒为 null」时全量测试不失败，也说明了这一点。
  - **prop 15 → 9**（目标 < 10）。WorkbenchLayout 9 个。
- TurnOutputArtifacts：打开 / 下载产物时「是不是远端」改看 `target.kind`，删除 `isLocalSession` 的导入。`openRemoteFile` 内部仍按 key 解码 hostId（它需要真实的 hostId / sessionId）。
- 测试 helper：`TestConversationView` 也按 `RUN_TARGET_KEYS` 拆旧 prop。
- 测试：`turn-output-artifacts` 新增 2 个用例，都只靠 Context 声明远端：
  - 远端运行目标下读文件走 `files.reference`，不调本地 `readFile`；
  - 远端运行目标下打开产物走 `hosts.preview`，右键走 `hosts.download`，不调本地 `readFile` 和本地右键菜单。
  - 变异 3 个，都有用例失败：ConversationView 读文件不看远端、TurnOutputArtifacts 不看远端、错误态不看 `invalid`。
- `grep -rnE 'remote\??\.hostId|remoteTarget\.hostId'`（不含测试）还剩 26 处，都在 Composer 和 App，T6-3 处理。
- **偶发失败**：`composer.test.tsx:1253`「opens a card listing selected text and comments」。用例最后用默认 1 秒的 `waitFor` 等 Radix 弹层关闭，全量满载时偶尔超时。已提交的 T6-1 HEAD 上同样复现（stash 后连跑 2 次失败 1 次）；改动后的工作区连跑 3 次失败 1 次。这个用例直接渲染 Composer，不经过 RunTargetContext，与本计划无关；不在本计划里改，记入总结的遗留项。
- 结果：typecheck 0 错误；全量测试文件 162 / 1（已知）/ 1，用例 1189 / 1 / 2（偶发那次另记）。

### T6-3：Composer、App 改读 RunTarget

- `ComposerExecutionContext` 删除 `remote` 和 `targetLocked`，只剩本机的 Git 状态、分支、运行位置和两个工作区入口。
- Composer 从 `RunTargetContext` 读 `target` / `capabilities` / `locked` / `remote`：
  - 「是不是远端」统一为 `target.kind === "remote"`，用在这些地方：模型可用性、configure 的模型、选文件对话框、发送时的锁、停止按钮、状态行文案。
  - 附件「图片与文件」改看 `capabilities.attachments.files`；审查条改看 `capabilities.review`。
  - 远端 3 个 select 仍读过渡字段 `remote`（保留到 09），「会话运行位置」的值改用 `target.hostId`，锁定改用 `locked`。
  - **偏离**：计划写的是「`ComposerExecutionContext.remote` 换成 `RunTargetContext`」。Composer 的工作区和 Git prop（`workspaceOptions` / `selectedWorkspaceRoot` / `executionContext` 等）这次没有一起移进 Context：直接渲染 Composer 的用例有 20 多处在用，Composer 也仍由 ConversationView 显式传入，删掉不会减少层级。等 16 拆 Composer 时再收。
- App：
  - git context 的 effect、`executionContext.gitContext`、`handleSend` 的远端分支都改看 `runTarget.target`。`createSession` 的 `hostId` 取自 `target.hostId`。
  - `executionContext` 的依赖去掉了 `remoteTarget` 和 `sessionRecord`（远端字段已不在里面），会话记录变化不再让它变化。
- 测试：
  - `host-feedback` 的 Harness 改用 `useRunTarget` 加 `RunTargetContext.Provider`，与 App 的接法相同。T14 的 Harness 改写因此提前完成，T14 只剩删除 `useRemoteTarget`。
  - `composer.test` 的「已移除 Host 仍显示为锁定的目标」改为经 Context 声明远端和锁定。
  - 新增 3 个用例：
    - App 新建页选远端 Host 和第二个工作区后发送，`sessions.create` 收到 `{ hostId, workspaceId: "w2" }`，并且 prefs 记下 `w2`；
    - 远端 Composer 的 Agent 模式也提供「图片与文件」；
    - 远端不显示审查条。
  - 变异 7 个，6 个有用例失败：远端判断恒为 false、锁定恒为 false、附件不看能力、审查条不看能力、「会话运行位置」的值不取 target、App 发送不走远端。
  - 剩下 1 个「App 的 `gitContext` 不看 target」不失败。这是等价变异：target 不是本机时，git effect 已经把 `workspaceGitContext` 设成 null。保留这个判断是为了在 effect 运行之前的那一帧也不显示本机分支。
- 写测试时 heredoc 把一个中文字符写坏了（变成 U+FFFD），导致新用例找不到按钮。已修正，并扫描了 `src` 和本次 docs，没有其他 U+FFFD。
- 计划的 grep `grep -rnE 'remote\??\.hostId|remoteTarget\.hostId' apps/desktop/src/renderer` 为 **0**（含测试）。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 162 / 1（已知）/ 1，用例 1192 / 1 / 2；
  - `check:renderer-bridge`、`check:frontend-tokens` 通过。
  - App.tsx 1591 行。

### T7：readiness

- 新增 `R/target/readiness.ts`：
  - `resolveReadiness({ target, directory, workspaceId, modelId })` 按顺序判断：
    - 本机 → `ready`；损坏的 key → `removed`。
    - Host 不在列表中：第一次 list 前算 `connecting`，之后算 `removed`。
    - Host 的连接状态 `connecting` / `offline`（带 `host.error`）/ `revoked` / `incompatible` 直接对应。
    - 已连接时依次看：`describeErrors`（`describe-failed`）、有没有 description（`describing`）、description 的 state、工作区（没选为 `workspace-missing`；选了但 Host 上已没有，另带 `workspaceId`）、模型（`model-missing`）。
  - `describeReadiness(readiness, hostName)` 返回 `{ tone, label, reason }`，文案用 06 §4.5。
  - `describe-failed` 按 15 T7（09 T16 的断言也是这句）写「无法读取机器信息：{摘要}」，没有用 06 表中的「无法读取 {host} 的信息」。
  - `summarizeError` 只取第一行，去掉 IPC 前缀和错误类名，最长 80 字。
- **偏离（`pauses.md` P1，2026-10-06 用户选方案 A，已写进决策记录并同步 06 §4.5）**：Host 已连接、但 describe 报告 `draining` / `blocked` 时，新增第 11 种取值 `host-unavailable`。先按建议方案实现，不阻塞后续 T。
- `useRunTarget` 新增 `readiness`，由 HostDirectory 的整份快照、`target`、工作区和模型算出，`useShallowStable` 保持引用稳定。`RunTargetContext` 的默认值和测试辅助 `legacyRunTarget` 默认 `ready`。
- Composer：
  - 远端能否发送、configure 能否下发都改看 `readiness.state === "ready"`；
  - 不能发送时，发送按钮 tooltip 和 aria-label 显示 `reason`；
  - 状态行显示「{host} · {label}」；
  - 新建页原来的「Host 未就绪，草稿仍可编辑」换成 `reason`。
- App 的 `handleSend` 改看 `runTarget.readiness`。`useRemoteTarget` 删除 `canSend`。
- 测试：
  - 新增 `readiness.test.ts`，共 33 个用例：解析 18 种情况，每种未就绪状态各一条文案断言（12 条），另有 Host 名兜底和错误摘要；
  - `composer.test` 新增 3 个用例：ready 能发送；offline 不能发送、草稿保留、tooltip 和状态行正确；configure 只在 ready 时下发；
  - `host-feedback`：blocked Host 的用例改为断言新文案和按钮名；新增「记下的工作区在 Host 上已不存在」，经 `useRunTarget` 得到 `workspace-missing`。
- 变异 9 个，8 个有用例失败：
  - Composer 恒 ready、tooltip 不给原因、状态行不给 label、新建页不给原因、configure 不看 readiness；
  - hook 不传模型、hook 写死工作区、`description.state` 不检查。
  - 剩下 1 个「App 的 `handleSend` 不看 readiness」不失败。这是兜底判断：Composer 在未就绪时已经拦下发送，界面上触发不到，属于等价变异。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 162 / 2 / 1，用例 1228 / 2 / 2。2 个失败是已知的 `workspace-git-context-service`，以及 T6-2 记下的 composer 偶发用例（单独跑通过）。
  - 4 项 `check:*` 通过。

### T8：模型目录与 `actspace:remote-models` 迁移

- 新增 `R/target/use-model-catalog.ts`：
  - 结构 `ModelCatalog { source, groups, defaultModelId? }`（03 §2.5）。本机用 `localModelCatalog` 按服务商连接分组（复用 `groupModelsByProvider`）；远端用 `hostModelCatalog`，一个分组，标题为 Host 名。`useModelCatalog(target, sessionId, local)` 按 target 返回目录、选中值和 `selectModel`。09 的 ModelPicker 直接读它；本计划没有改 Composer 的两套模型 UI（远端 `<select>` 保留到 09）。
  - 远端模型的记忆规则 `useRemoteModel(sessionId, hostId)`：
    - 远端会话的选择写进 `remote-session-prefs` 的 `modelId`（T0 已确认模型不在会话 meta 中）；
    - 新建页按 Host 记在 `actspace:new-session-model:<hostId>`（决策记录）；
    - 会话没有自己的记录时，退到该 Host 新建页上次的模型（与改造前 `models[sessionKey] ?? models["new:<hostId>"]` 一致）；
    - 记录的模型在 Host 上已不存在时用 Host 默认模型。
  - `migrateLegacyRemoteModels`：远端会话条目写进 prefs，`new:<hostId>` 写进新建页记录；本机条目（`new:local`、本地会话）丢弃；已有新记录的不覆盖；内容损坏也删除旧 key。在 `main.tsx` 渲染前调用一次。
- `useRemoteTarget` 的模型部分改用 `useRemoteModel`，不再读写 `actspace:remote-models`。
- App 创建远端会话时，把新建页选的模型一起记进 prefs，之后切换会话模型不变。
- 计划的 grep `grep -rn "actspace:remote-models" apps/desktop/src` 只剩迁移代码（常量和注释）。
- 测试：
  - 新增 `model-catalog.test.ts`，共 11 个用例：两种目录结构、Host 默认模型兜底、迁移 3 条（迁移后删除旧 key、不覆盖新记录、损坏内容、没有旧 key）、新建页记住每个 Host 的模型、切换远端会话后模型保持不变、旧会话退到新建页记录、本机不写存储、`useModelCatalog` 按 target 返回；
  - `host-feedback` 的创建远端会话用例补断言 prefs 记下 `modelId`。
- 变异 8 个，全部有用例失败：
  - 迁移不删旧 key、覆盖新建页记录、保留 `new:local`、覆盖会话记录；
  - 会话选择写到新建页、记录的模型不存在时不兜底、App 不记模型、会话不退到新建页记录。
- 未覆盖：`main.tsx` 里的迁移调用。入口文件没有测试，迁移函数本身已覆盖。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 164 / 1（已知）/ 1，用例 1240 / 1 / 2；
  - 4 项 `check:*` 通过。

### T9：main 侧 session gateway

- 新增 `M/session-gateway.ts`：`createSessionGateway(remote)` 返回 `IpcMiddleware`，`fixed-renderer-ipc` 的分流（11 之后在 `createIpcRegistrar` 的 middleware 里，T0 记的 :119-131）原样搬进来；`fixed-renderer-ipc` 只剩 `middleware: createSessionGateway(options.remote)`。
  - 带 `hostId` 的 `createSession` → `remote.create`；
  - 远端审批 → `remote.decide`（仍按 `remote-approval:` 前缀，T10 改为按 `hostId`）；
  - `sessionId` 是远端 key → `remote.handle(channel, input, ref)`，key 由 shared 的 `decodeSessionLocator` 解码，损坏的 `host:` key 抛 `InvalidSessionLocatorError`，不会落到本机；
  - 其余走本机 handler，结果交给 `remote.mergeList`；
  - 没有 remote adapter 时全部走本机。
- 与计划的差别：计划写的是「按 locator 决定走本地还是 `remote.*`」，main 里 renderer 发来的 key 解码用的是 `remote-hosts/session-router.ts` 的 `parseRemoteSessionKey`，它只是 `decodeSessionLocator` 的别名；gateway 直接用 shared 的函数。`desktop-adapter` 内部仍用别名，不在本计划改。
- 计划的 grep `grep -n "parseRemoteSessionKey\|decodeSessionLocator" apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts` 为 **0**。
- 测试：新增 `M/test/session-gateway.test.ts`，共 7 个用例：带 hostId 的新建走 `remote.create`；不带 hostId 走本机并 merge；远端 key（hostId 含 `:`）解码后走 `remote.handle`；损坏的 key 抛错且不走本机；远端审批走 `remote.decide`；本机 channel 先走本机再 `mergeList`；没有 adapter 时全部走本机。
- 变异 5 个，全部有用例失败：新建不走远端、审批不走远端、远端 key 不走远端、不 merge、吞掉损坏 key 的错误。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 165 / 1（已知）/ 1，用例 1247 / 1 / 2；
  - `check:renderer-bridge`、`check:ipc-channels` 通过。

### T10：审批带 hostId

- shared：
  - `tool_approval_required` / `tool_approval_resolved` 事件新增 `hostId?`（`S/session.ts`）；
  - `PendingApprovalInfo` 新增 `hostId?`，`ApprovalDecideInput`（`S/ipc.ts`）和 `RuntimeV2ApprovalDecisionInput`（`S/runtime-v2/desktop-ipc.ts`）新增 `hostId?`。最后一个计划没有列出，renderer 提交审批用的是它，T11 要带上 `hostId`，所以一起加。
- `desktop-adapter`：
  - 拼审批 id 的 5 处改用 `remoteApprovalId(hostId, requestId)`，格式不变（`remote-approval:<hostId>:<requestId>`），已有的待审批项不受影响；
  - 2 个流事件、全局 pending 列表（`mergeList`）、会话 pending 列表（`handle`）都写入 `hostId`；
  - `decide` 收到的 `hostId` 与记下的审批不一致时报错，不会把决定发到别的 Host。
- gateway：`submitApproval` 带 `hostId` 就走远端。**过渡**：T11 之前 renderer 还不带 `hostId`，暂时保留 `remote-approval:` 前缀判断，T11 删除。
- 测试：
  - 新增 `M/test/remote-host-approval.test.ts`（adapter 第一次有单测，用假的 registry 和窗口），共 4 个用例：
    - 全局 pending 列表带 `hostId`，hostId 含 `:` 时 id 格式不变；
    - 会话 pending 列表带 `hostId`，经 gateway 按 `hostId` 提交后，`approvals.decide` 发到正确的 Host（hostId 含 `:`）；
    - `hostId` 不一致时拒绝；
    - 两个流事件都带 `hostId`。
  - `session-gateway.test` 新增 1 个用例：带 `hostId` 的审批走远端，不带的走本机。
- 变异 6 个，全部有用例失败：gateway 不看 `hostId`、全局列表 / 会话列表 / required 事件 / resolved 事件不带 `hostId`、不检查 Host 不一致。
- shared 改了类型，`pnpm --filter @actspace/shared build` 后 desktop 的 typecheck 才能看到（desktop 的 tsconfig 指向 shared 的 dist，dist 不入库）。
- 结果：
  - typecheck 0 错误；
  - shared 测试 20 / 163 全部通过；
  - desktop 全量测试文件 166 / 1（已知）/ 1，用例 1252 / 1 / 2；
  - `check:renderer-bridge`、`check:ipc-channels` 通过。

### T11：renderer 审批改读 hostId

- `ApprovalParts.useApprovalDecision`：删除 `split(":")`。远端审批所在的 Host 取自 `RunTargetContext` 的 `target.hostId`；提交审批时带上 `hostId`，本机审批不带。Host 未连接时仍禁用。
  - **与计划的差别**：计划写的是「改为读取 `hostId`」，没有说从哪里读。审批块都画在当前会话里（5 个块组件只拿到 `approvalRequestId`），会话的 Host 就是审批的 Host，所以从 RunTarget 读；没有把 `hostId` 逐层加进 6 种消息块类型和 live-run 的工具状态。T10 写进事件和 pending 列表的 `hostId` 留给以后不在会话内显示的审批入口使用。
  - task-queue（14）里没有拆审批 id 的代码，不用改。
- gateway 删除 T10 留下的 `remote-approval:` 前缀判断，审批只按 `hostId` 路由。main 里只剩 `remoteApprovalId` 拼 id 一处出现这个前缀。
- 计划的 grep `grep -rn "remote-approval" apps/desktop/src/renderer` 为 **0**（`app-remote-host-refresh` 的夹具改为 `{ requestId: "r1", hostId: "server" }`）。
- 测试：
  - `approval-parts.test` 新增 3 个用例：远端会话提交时带会话的 `hostId`（含 `:`，requestId 是任意字符串）；Host 离线时禁用且不提交；本机会话提交不带 `hostId`；
  - `session-gateway.test` 删除按前缀路由的用例（由 T10 的「按 hostId 路由，不带的走本机」覆盖）。
- 变异 4 个，全部有用例失败：提交不带 `hostId`、远端 Host 恒为空、本机也带 `hostId`、gateway 改回按前缀路由。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 166 / 1（已知）/ 1，用例 1254 / 1 / 2；
  - `check:renderer-bridge`、`check:ipc-channels`、`check:frontend-tokens` 通过。

### T12：renderer 侧 session gateway

- 新增 `R/session/session-gateway.ts`：`createSessionGateway(deps)` 返回 `{ ensureSession, submit }`，依赖全部注入（建会话、plan 模式、prefs、configure、submit、pending 存取、队列选项、提示、恢复草稿、id、时间），可以单测。
  - `ensureSession(sessionId, sendTarget, options)`：远端目标没有 ready 就拒绝（已有会话也一样，沿用 T7）；已有会话直接返回；否则按目标建会话：远端带 `hostId` 和工作区，建好后记下工作区和模型；本机带工作区。plan 模式在这里设。
  - `submit(sessionId, text, options, model)`：沿用 14 T20 的 pending 规则，代码原样搬入：
    - 先写 pending 记录，再 configure，再 submit；
    - 结果未知时提示并用同一个 `submissionId` 再核对一次；
    - 明确被拒绝时清除记录并放回草稿；
    - 结果仍未知时保留记录并放回草稿；
    - 成功后清除记录。
- App 的 `handleSend` 只剩会话级的事：本机工作区切换、`lastSendOptions`、失败标记、发送计数、清草稿、滚动、刷新队列、`resumeAfterAcceptance`。gateway 用 `useMemo` 生成，依赖都是稳定的回调和 store。
  - 不是 Context value，14 的 `useShallowStable` 规则不适用。
  - App 删掉了随之不再使用的 `attachmentForRuntime` 和两个 format 函数的 import。App.tsx 从 1591 行降到 1549 行。
- 小改动：被拒绝时放回草稿，原来把整个失败结果（含 `status`、`acknowledgement`）展开进草稿，现在只带 `attachmentIssue` / `referenceIssue`。草稿类型本来就只有这两个字段，界面不变。
- 测试：
  - 新增 `R/test/session-gateway.test.ts`，共 10 个用例：
    - `ensureSession`：已有会话、本机新建（工作区和 plan）、远端新建（`hostId`、工作区、记录 prefs、chat 形态）、未就绪拒绝、创建失败；
    - `submit`：顺序为写记录 → configure → submit，成功后清除；附件去掉 `previewUrl`；结果未知时复用 id、保留记录、放回草稿，换了内容就换 id；抛错按未知处理再核对一次；被拒绝时清除记录并只带 issue；configure 失败时不提交。
  - 计划要求的 app 测试、`app-remote-host-refresh`、`host-feedback` 全部通过。
- 变异 10 个，全部有用例失败：
  - 不检查 ready、不记 prefs、不设 plan、不复用 id、不再核对；
  - 被拒绝时不清除、成功后不清除、不去 `previewUrl`、configure 失败仍提交、草稿带上整个结果。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 167 / 1（已知）/ 1，用例 1264 / 1 / 2；
  - 3 项 `check:*` 通过。

### T13：run-git

- 新增 `M/git/run-git.ts`：`runGitCommand: GitRunner` 和 `isGitRunSuccess`。
  - 总是带 `-C cwd`（同时传 `cwd`），设置 `GIT_TERMINAL_PROMPT=0`、`windowsHide`、utf8。
  - timeout、maxBuffer 由调用方传入，各 service 保持原来的常量（8s/2MiB、15s/256KiB、10s/1MiB）。
  - `truncated`：输出超过 `maxOutputChars`，或错误码是 `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`。原来 review-git 用 `error.message.includes("maxBuffer")`，改成按错误码识别。maxBuffer 超限时 Node 也会 kill 子进程，这种情况不算 `timedOut`（单独一个提交）。
  - `startError: { code, message }`：execFile 回调里 `code` 是字符串的错误，以及 `child.on("error")`（只 settle 一次）。
  - runner 注入保留：三个 service 的 runner 参数类型都换成 `GitRunner`，原来各自导出的 `WorkspaceGitCommandRunner` / `GitCommandRunner` / `GitCommandResult` 在仓库里没有别的引用，直接删掉。
- 三个 service 各一个提交，判断函数都留在原文件，只改读取的字段：
  - `workspace-environment-service`：原来 startError 记的是 code。`gitMissing` 改读 `startError.code`（`=== "ENOENT"` 或正则），`sanitizeGitError` 兜底也用 code，与原来一致。原来不带 `-C`，现在带。`isSuccess` 与 `isGitRunSuccess` 完全相同，换成共用的。
  - `review-git-service`：原来 startError 记的是 message。`isGitMissing`、`sanitizeGitError` 改读 `startError.message`。新增 `GIT_TERMINAL_PROMPT=0`。
  - `workspace-git-context-service`：原来 startError 记的是 message，没有 truncated。`isGitMissing` 改读 `startError.message`。新增 `GIT_TERMINAL_PROMPT=0`；stdout/stderr 现在按 `maxOutputChars` 截断（原来超过 maxBuffer 时 Node 就会报错，所以实际行为不变）。
  - `not_repository` 的判断都没有动：environment 看 `rev-parse --is-inside-work-tree` 是否成功且输出 `true`；git-context 看错误文本是否匹配 `/not a git repository/i`。
- `review-pr-service` 不并入，理由：
  - 它的 runner 同时跑 `git` 和 `gh`，签名多一个 `command` 参数；
  - 它显式关闭 stdin（`gh` 需要），run-git 不关；
  - 失败时 `exitCode` 记为 1（超时也是 1），没有 `timedOut` / `truncated`；
  - `startError` 是给人看的「X is not installed」，只在 ENOENT 时设置；
  - 不带 `-C`，不设 `GIT_TERMINAL_PROMPT`。
  - 并入要么让 run-git 支持 `gh`，要么拆开 `review-pr-service` 的 runner 并改它的测试脚本（`scriptedRunner` 按 command 分派），都不是语义一致的搬运。
- 基线已知失败用例 `workspace-git-context-service` 「hides Git controls for a non-repository workspace」：
  - 迁移前后都失败，结果相同（`status: "failed"`，期望 `not_repository`）。
  - 根因：本机 `LANG=zh_CN.UTF-8`，git 输出「致命错误：不是 Git 仓库……」，`/not a git repository/i` 匹配不上。
  - 这也是产品问题：中文系统的用户打开非仓库目录时，看到的是「检查失败」而不是「不是 Git 仓库」。修它要改语义（例如给 git 设 `LC_ALL=C`，或者改用退出码 / `--is-inside-work-tree` 判断），超出 T13「判断不变」的范围，单独提给用户判断。
- 测试：
  - 新增 `M/test/run-git.test.ts`，共 7 个用例：`-C` 和环境变量、成功、非零退出、ENOENT（清空 PATH）、超时（`hash-object --stdin` 等 stdin）、截断，以及 `isGitRunSuccess` 对注入结果的判断。
  - 非零退出的 stderr 随系统语言变化，所以只核对它包含出错的子命令。
  - 三个 service 测试各补注入 runner 的用例：
    - environment：ENOENT → 不可用 / `git_not_found`；其他启动错误 → 可用但不是仓库 / `not_repository`；
    - review-git：ENOENT → `git_not_found`；其他启动错误展示 message；
    - git-context：ENOENT → `git_not_found`；英文非仓库错误 → `not_repository`。
- 变异：
  - run-git 7 个，6 个有用例失败。存活的是去掉 `stdout.slice`：Node 的 maxBuffer 已按字节截断，utf8 下字符数不会更多，属于等价变异，保留作防御。
  - environment 4 个，3 个有用例失败。存活的是 `isGitRunSuccess(repo)` 换成只看退出码：真实 runner 有 startError 时退出码一定是 null，属于等价变异。
  - review-git 3 个，2 个有用例失败。存活的是去掉 `isGitMissing(init)` 分支：只有 rev-parse 能启动、init 却 ENOENT 时才走到，是原有的防御分支。另有一个把正则输入换成 `code + "x"` 的变异也存活，那是等价的（`ENOENTx` 仍然匹配），已换成有效变异重跑，有用例失败。
  - git-context 3 个，全部有用例失败。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 168 / 1（已知）/ 1，用例 1276 / 1 / 2；
  - `check:renderer-bridge`、`check:ipc-channels` 通过。

### T14：删除 useRemoteTarget

- 删除 `R/hooks/useRemoteTarget.ts`，它剩下的逻辑并进 `useRunTarget`：
  - 新建页的 Host 选择（`useState`）；已有会话的 Host 由会话 key 决定，`selectHost` 对它不起作用（与原来一致）。
  - 工作区选择：换 Host 或该 Host 的第一个工作区变化时，回到第一个。
  - `hostsApi.activate(sessionId)`：打开会话时调用，Host 列表变化后再调一次。
  - 模型：`useRemoteModel(sessionId, hostId)`（T8）。
- 过渡字段 `RunTargetState.remote`（`ReturnType<typeof useRemoteTarget>`）换成带类型的 `choices: RunTargetChoices`，包含 `hosts`、`description`、`modelId`、`selectHost` / `selectWorkspace` / `selectModel`。
  - 选中的 Host 和工作区不再重复放一份，直接读 `target.hostId` / `target.workspaceId`。原来的 `remote.host` 由 Composer 按 `target.hostId` 在 `hosts` 里查。
  - `RunTargetValue.choices` 可以不给：组件测试没有 Provider 时，Composer 不显示远端的 select（沿用原来 `remote` 可选时的行为）。
  - 09 T13 / T18 换成菜单后仍从 `choices` 取 Host 列表和写入口；模型菜单按 09 计划改用 `useModelCatalog`。
- App：`remoteTarget` 换成 `targetChoices`。发送时的 `remoteWorkspaceId` 取自 `target.workspaceId`，`remoteModelId` 取自 `choices.modelId`；`handleCreateSession` 读 `choices.hosts.length` 和两个 select 函数。
- Composer：3 个 select、停止按钮的 Host 连接判断、configure key 都改读 `choices`。新增 `remoteHostState`，替代原来的 `remote.host?.state`。UI 不变。
- `host-feedback` 的 Harness 在 T6 已改成 `useRunTarget` + `RunTargetContext`，本步不用再改。
- 测试：
  - 原来 `useRemoteTarget` 没有直接的测试，先做变异检验，7 个里有 6 个没有用例失败。
  - 新增 `R/test/run-target-choices.test.tsx`，3 个 hook 用例：
    - 新建页选 Host，工作区默认第一个，模型取 Host 默认，可以换工作区，换 Host 时工作区回到第一个，取消选择回到本机；
    - 已有会话不受 `selectHost` 影响，Host 不在列表里时名称回落为 id；
    - 打开会话时 activate，Host 列表变化后再 activate。
  - composer 测试的两份 `remote` fixture 改成 `choices`。
- 变异 7 个，全部有用例失败：
  - 不重置工作区、不 activate、activate 不随 Host 列表重跑、会话 Host 被新建页选择覆盖；
  - 会话工作区被忽略、Host 名称不回落为 id、`choices` 不带 description。
- 小改动：`workspaceId` 的条件 `sessionId && sessionWorkspaceId !== undefined ? … : …` 简化为 `sessionWorkspaceId ?? …`。`sessionWorkspaceId` 只在远端会话上有值，两者等价。
- 验收：
  - `grep -rn "useRemoteTarget" apps/desktop/src` 为 0；
  - `host-feedback` 通过。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 169 / 1（已知）/ 1，用例 1279 / 1 / 2；
  - 3 项 `check:*` 通过。

### T15：文档

- `docs/design-docs/frontend/front-workspace-git-worktree-context.md` 新增「运行目标（本机与远端）」一节，放在「Session 与存储边界」之前，内容包括：
  - 会话定位（shared `session-locator` 的严格解码；renderer `locateSession` 的 `invalid`）；
  - `RunTarget` 和 `useRunTarget` / `RunTargetContext`；
  - 能力表（按 `capabilitiesOf` 的实际取值和禁用原因）；
  - readiness 的 11 种状态；
  - HostDirectory；
  - 远端会话的本地记录（prefs、新建页模型、旧 key 迁移）；
  - 发送与审批（renderer / main 两个 gateway、审批 `hostId`）。
  - 「Run on 菜单」补一句指向新章节和 09；「已确认决策」加 2026-10-06 一条。
- 03 开头标注「已按 15 实施」，新增「§6 实施后的更正」，格式与 02 §7 相同，共 10 条：
  - 背景中的行号和遗漏；
  - `RunTarget` / `locateSession` / 能力表 / readiness / hook 形状与 §2 的差别；
  - 模型记忆为什么仍在本地；
  - gateway 的实际形状；
  - 保留到 09 的 select；
  - run-git 的范围。
- 计划外的两处小改动：
  - 03 的「迁移去向」要求在 Host 指南的 Desktop 部分加链接，已在 `agent-host-guide.md` 的「新会话选择运行位置……」一段末尾补上；
  - `desktop-frontend-refactor/README.md` 的 03 行标注「已按 15 实施」，迁移去向改为「已合并」。
- `pnpm check:current-docs` 通过（47 个 truth 文件）。

### 收尾验收：浏览器 mock（`?mock=remote-host`）

- 方法：vite 开发服务器（5199）加 headless Chrome（独立临时 profile，CDP 9333），脚本 `/tmp/fe15-cdp.mjs`。13 的 mock bridge 没有实现 `hosts.call`，在页面加载前注入一层，按 URL hash 返回 `host.describe`：`#devbox=blocked` / `#devbox=draining` 改 describe 的 state，`#fail=devbox` 让 describe 抛错。hash 变化不会重载页面，每次另加 `&r=N`。
- 不打补丁时：新建页选 devbox 显示「无法读取机器信息：Mock bridge does not implement hosts.call」（`describe-failed`）。13 时这里是笼统的「Host 未就绪」。
- 打补丁后：

| 场景 | 结果 | 截图 |
| --- | --- | --- |
| 新建页选 devbox | 工作区 `devbox-api`、模型 `devbox/fast`（Host 默认）；没输入时发送按钮名「输入消息后发送」 | `mock-new-page-devbox-ready.png` |
| 换成 web / smart 后发送 | 建出远端会话「New chat」；`new-session-model:devbox` = `devbox/smart`；prefs 记下 `{ workspaceId: "devbox-web", modelId: "devbox/smart" }`；会话里 3 个 select 锁定，显示 web / smart | `mock-remote-session-created.png` |
| 切到本机会话 | 只有本机 UI：没有「会话运行位置」以外的远端 select，模型选择器是本机的，状态行「本机」 | `mock-switch-to-local.png` |
| 再切回远端会话 | 位置 `devbox`（锁定）、模型 `devbox/smart`、工作区 `devbox-web`，没有变 | `mock-switch-back-remote.png` |
| `#devbox=blocked` | 位置行右侧「开发机 devbox 恢复上次的任务时出错，暂不接受新任务」；草稿可编辑；发送按钮 `aria-disabled`，名称就是这句原因；点击后侧栏会话数不变 | `mock-new-page-devbox-blocked.png` |
| `#devbox=draining` | 同上，文案「开发机 devbox 正在停止，暂不接受新任务」 | `mock-new-page-devbox-draining.png` |
| `#fail=devbox` | 「无法读取机器信息：describe timed out」，IPC 前缀和堆栈都去掉了；工作区、模型显示「等待 Host 工作区 / 模型」；发送禁用，点击无效 | `mock-new-page-fail-devbox.png` |
| `#devbox=ready` 对照 | 发送按钮可用，点击后建出会话 | — |

- 全程页面 console 没有 error / warn。
- **已知问题（与基线相同）**：mock 预置的远端会话「devbox：跑集成测试」，meta 路径与 Host 的两个工作区都对不上。readiness 是不带 id 的 `workspace-missing`，文案「选择一个远端工作区」；但已有会话的 select 是锁定的，视觉上显示第一项（`mock-existing-session-path-mismatch.png`）。基线 `useRemoteTarget` 同样反查不到，表现一致。真实 Host 上会话路径来自 Host 自己的工作区，一般不会出现；文案和锁定态的取舍留给 09（新菜单）。

### 收尾验收：Electron（空 Host、git 三态）

- 临时数据目录 `/tmp/actspace-cdp-empty`（新建，空），CDP 9222，`pnpm --filter @actspace/desktop build` 之后启动。
- **没有 Host**：`hosts.list()` 为 `[]`；新建页「会话运行位置」只有「本机 Mac」，没有远端工作区 / 模型 select，状态行「本机」，console 无报错（`electron-empty-hosts-new-page.png`）。
- **git 三态**：往临时数据目录的 `workspaces.json` 加了两个临时目录作工作区（`/tmp/fe15-nonrepo` 空目录、`/tmp/fe15-nohead` 只 `git init`），重启后逐个在新建页选中：

| 工作区 | `getGitContext` | 新建页 | 截图 |
| --- | --- | --- | --- |
| `/tmp/fe15-nonrepo` | `status: "failed"`，`error`「致命错误：不是 Git 仓库（或者任何父目录）：.git」 | 不显示分支按钮 | `electron-git-fe15-nonrepo.png` |
| `/tmp/fe15-nohead` | `status: "no_head"`，分支 `master` | 显示分支按钮「master」 | `electron-git-fe15-nohead.png` |
| 本仓库 | `status: "ready"`，分支 `refactor/desktop-fe-15` | 显示分支按钮 | `electron-git-actspace-agent.png` |

  - 未注册的目录调 `getGitContext` 会被 `WorkspaceAccessError: workspace_not_…` 拒绝，这是既有的访问控制，所以要先写进 `workspaces.json`。
  - **非仓库在中文系统下是 `failed` 不是 `not_repository`**，与 T13 记下的基线失败用例同一根因。查了影响面：
    - renderer 对两者的处理相同：`capabilitiesOf` 和 Composer 只区分 `ready` / `no_head` / 其他，`composer.test` 的 `it.each(["not_repository", "failed", …])` 就是按同一种情况测的；
    - main 里唯一区别对待两者的是 `prepareExecutionContext`（`not_repository` 放行，`failed` 返回 `command_failed`），但它只被测试调用，生产代码里没有调用方；
    - review-git、workspace-environment 用 `rev-parse --is-inside-work-tree` 的成功与否判断，不受语言影响。
    - 结论：目前用户看不到差别，属于潜在问题，会让以后依赖 `not_repository` 的代码在中文系统下出错。需要你判断，见交接文档。
- 默认工作区指向 `~/Downloads`，这是应用的默认值。没有在这个工作区上做任何操作。

### 复核处理

Sonnet 只读子智能体对照基线复核整份 diff。没有发现高、中严重度的确定缺陷；IPC 分流、locator 编解码、审批路由、run-git 的判断、`handleSend` 逐项确认等价。6 条存疑逐条核实：

| # | 存疑 | 核实 | 处理 |
| --- | --- | --- | --- |
| 1 | describe 失败后不重试，直到 Host 重连 | **属实**。T3 改成「每次连接 describe 一次」，原来每次 `hostsChanged` 都重新 describe，偶发超时能自愈 | 修复：有失败记录的 Host，下一次列表变化或 `refresh()` 时重试 |
| 2 | 记录的工作区 id 优先于路径 | **属实**。Host 的工作区 id 由管理员在配置里写（`agent-host/src/config.ts`），可以改；改了 id、路径不变时，原来按路径反查不受影响，现在会变成 `workspace-missing` | 修复：记录的 id 在 description 里找不到时按路径反查并写回；路径也对不上才保留记录的 id |
| 3 | evict 时删除 prefs，取消归档后模型回到默认 | 属实，但这是决策记录里定的（「会话被 evict 时删除对应条目」）。工作区仍能按路径找回，丢的只有模型选择 | 不改，记入已知问题 |
| 4 | describe 回来之前 `resolveRemoteModel` 返回记录的模型（基线返回空串） | 属实，只影响展示：此时 select 只有「等待 Host 模型」一项，值对不上时浏览器显示第一项，看起来一样；readiness 不是 ready，不会用它发送 | 不改 |
| 5 | 审批的 Host 取自当前 RunTarget，切换会话的瞬间可能对不上 | 不成立。审批块只画在当前会话的正文里，正文和 RunTarget 都从同一次渲染的活动会话 id 算出，不会一个是旧会话、一个是新会话。T11 已记下这个选择 | 不改 |
| 6 | 断开后 `describeErrors` 不清，重连后先显示 `describe-failed` | **属实**（重连后、新结果回来之前，readiness 先看到旧的失败） | 修复：开始 describe 时清掉上次的失败，期间显示「正在读取」 |

- 修复提交 `3a879d32`。
- 测试：`host-directory.test` 新增「失败后下一次列表变化时重试，期间显示正在读取，在途时不重复发，成功后不再 describe」；`remote-session-prefs.test` 的反查用例补 3 条断言（id 失效按路径找回、路径也对不上保留 id、describe 未到不判断）。
- 变异 6 个，5 个有用例失败。存活的是「在途时不重试」的判断：开始 describe 时已经清掉失败记录，在途的 Host 不会命中重试条件，这个判断是多余的，已删除。
- 结果：
  - typecheck 0 错误；
  - 全量测试文件 168 / 2 / 1，用例 1279 / 2 / 2。2 个失败是已知的 `workspace-git-context-service` 和 T6-2 记下的 composer 偶发用例（单独跑 70 个用例全过）；
  - `check:renderer-bridge`、`check:frontend-tokens` 通过；没有 U+FFFD。

### 收尾

- **history 补建**：00 §9 要求计划开始时建 history 文件，15 开始时漏了，收尾时按开始时间补建 `docs/histories/2026-10/20261006-1045-desktop-fe-15-run-target.md`。
- 学习沉淀：命中「有陷阱」「可迁移」，写了 `docs/learnings/2026-10/20261006-cli-output-locale.md`。
- 清理：停掉本次启动的 vite（5199）、headless Chrome（9333）和 Electron（9222）。
