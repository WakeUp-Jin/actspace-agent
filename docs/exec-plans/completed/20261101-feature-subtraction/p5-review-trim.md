# P5 Git Review 只留查看

## 目标

Review（改名「改动」见 P4）只负责“看清改动”：选范围、看逐文件 diff、浏览分支和提交。删掉所有动手操作 git 的入口和实时文件监听。输入框的 +N/−M 在每轮结束、打开面板和手动刷新时强制刷新一次。

## 范围

- 包含：删暂存 / 取消暂存 / 还原、“已查看”、复制 apply 命令、创建 PR、初始化 Git（死代码）、Review 内的「提交或推送」对话框、「上一轮」范围、实时监听与忽略过滤；补强制刷新；测试与文档。
- 不包含：
  - 顶部工作区菜单的提交 / 推送 / 新建分支（`WorkspaceChromeControls.tsx`、`workspace-environment-service.ts`）。
  - 本轮改动卡与 `TurnReviewView`。
  - Review git 后台线程 `ReviewGitWorkerClient`（保留，见 README 决策记录）。
  - 磁盘上旧的 `<dataRoot>/review/view-state.json`（不读也不删）。

## 必读

- `AGENTS.md`
- [01 功能减法设计](../../../design-docs/架构优化/01-功能减法设计.md) 第 8、10 节
- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/core-review-large-diff-loading.md`

## 步骤

路径相对仓库根，`D=apps/desktop/src`。行号以 `b590e02f` 为准，动手前复核。

### 1. 先搬 `reviewSelectionKey`

它定义在要删的 `D/main/review-view-state-service.ts`，但 `review-coordinator.ts` 和 `review-git-engine.ts` 都在用。搬到 `review-coordinator.ts` 并导出，改 engine 的 import。

### 2. 删除整文件

- `D/main/review-view-state-service.ts`、`review-pr-service.ts`、`review-git-service.ts`、`review-workspace-watcher.ts`、`review-ignore-filter.ts`。
- 测试：`D/main/test/review-view-state-service.test.ts`、`review-pr-service.test.ts`、`review-git-service.test.ts`、`review-workspace-watcher.test.ts`、`review-ignore-filter.test.ts`。
- `apps/desktop/tsconfig.electron.json`：删对应条目（`review-view-state-service.ts` 约 37 行，其余按实际列出的条目删）。

### 3. main

- `D/main/review-git-engine.ts`：
  - 删 `applyMutation`（约 562 行起）、`mutateFile`、`mutateHunk`、`runSteps`、`buildHunkPatch`、`rejected()`、`failed()`、`createPatch`、`SelectionCommand.patchAllArgs` 中仅 `createPatch` 使用的部分。
  - 删 options 的 `trashFile`、`loadLastTurn`、`loadLastTurnFileDiff` 和 `lastTurn` 分支（约 229、339 行）。
  - `this.fileDiffs` 删除；`this.snapshots` 若删 mutation 后只剩 `invalidateWorkspace` / `dispose` 使用，一并删除。`preparedSnapshots` 保留。
  - `capabilitiesFor` 只返回 `canLoadFullFile`；去掉 `implements ReviewMutationProvider`。
  - `toFileSummary` 删 `viewed: false`（约 946 行）。
- `D/main/review-coordinator.ts`：
  - 删 `applyMutation`、`failedMutation`、`ReviewMutationProvider`、`mutationProvider` 选项、`getLoadedSnapshot`、`setFileViewed`、`ReviewViewStateService` 选项、`loadSnapshot` 里读 `isViewed` 的部分。
  - 删 `scheduleInvalidation`、`debounceMs`、`filterWatchPaths`、`MAX_FILTERED_WATCH_PATHS`、`WorkspaceReviewState` 的 `debounce*` 字段、`dispose` 里的 `clearTimeout`、对 `./review-ignore-filter` 的 import。
  - 保留 `refreshSnapshot`（唯一递增 generation 的路径）。
- `D/main/runtime-v2/desktop-shell-ipc.ts`：
  - 删 `applyMutation`、`setFileViewed`、`copyGitApplyCommand`、`getPullRequestCapability`、`createPullRequest` 五个 handler。
  - 删 `new ReviewViewStateService(...)`、`new ReviewPullRequestService()`、`ReviewWorkspaceWatcher` 的创建、`reviewWatcher.ensure(...)`、`createReviewIgnoredPathFilter(...)`、`reviewWatcher.dispose()`、`quoteShellArgument`。
  - `resolveWorkspace` 回调简化为直接传 `resolveWorkspace`。
  - 不再使用的 import（`mkdir`、`writeFile` 等）删除；`openExternalSafely` 先 grep 确认是否还有别处使用。
- `D/main/runtime-v2/fixed-renderer-ipc.ts`：删 `initializeGitRepository` import（约 64 行）与 `contract.review.initGit` handler（约 528–531 行）。

### 4. 契约

- `packages/shared/src/review.ts`：
  - 删 `ReviewMutation*`、`ReviewApplyMutationInput`、`ReviewSetFileViewed*`、`ReviewPullRequest*`、`ReviewCreatePullRequest*`、`ReviewCopyApplyCommand*`、`ReviewInitGit*` 类型。
  - `ReviewCapability` 删 stage / unstage / revert 成员；`ReviewCapabilities` 收缩为 `{ canLoadFullFile: boolean }`。
  - `ReviewFileSummary.viewed` 删除；`ReviewSelection` 删 `lastTurn`。
  - `ReviewHunk.patchFingerprint` 只服务 hunk mutation，删除；`ReviewFileDiff.patchFingerprint` 参与 diff 去重，保留。
  - `ReviewChangeNotification.reason` 收缩为 `"refresh"`。
- `packages/shared/src/desktop-bridge/contract.ts`：`review` 域只留 `getSnapshot`、`refreshSnapshot`、`getFileDiffs`、`getFileContents`、`listBranches`、`listCommits`。
- `packages/shared/src/runtime-v2/fixed-renderer.ts`：删 `applyReviewMutation`、`setReviewFileViewed`、`initGitRepository`、`copyReviewGitApplyCommand`、`getReviewPullRequestCapability`、`createReviewPullRequest`。

### 5. renderer

- `components/review/ReviewDiffCanvas.tsx`：删暂存 / 取消暂存 / 还原按钮（约 329–331 行）、hunk 头的“暂存此段变更”“取消暂存此段变更”（约 337 行）、“已查看”勾选（约 186 行）、`onMutation`、`onViewed`、`capabilities` 中除 `canLoadFullFile` 外的判断、`ListPlus` / `Undo2` / `RotateCcw` 图标。
- `components/review/ReviewFileTree.tsx`：删 `onViewed`、勾选按钮、`file.viewed` 置灰样式、`Check` 图标。
- `components/review/ReviewToolbar.tsx`：删“复制 git apply 命令”、`onCopyApply`、`onCreatePr`、`onCommitOrPush`、`gitTriggerRef`、整个 `menu === "git"` 菜单、`ToolbarMenu` 的 `"git"`、`Clipboard` / `GitPullRequestArrow` 图标。
- `components/review/ReviewScopeMenu.tsx`：删「上一轮」（约 22 行）。
- `components/review/ReviewWorkspace.tsx`：删 `onMutation`、`onViewed`、`copyGitApplyCommand()`、`dialog` 状态、`GitDialog`、`PullRequestDialog`、`DialogShell` 及相关 import。
- `components/review/review-store.ts`：删 `applyMutation`、`mutationFeedback`、`setViewed`。挂载时 `loadSnapshot(selection, true)`。`reviewChanged` 监听里，`notification.generation === snapshot.generation` 时跳过，避免 diff 闪一下。`stale_generation` 自愈逻辑保留。
- `components/review/use-review-summary.ts`：`load` 增加 `force` 参数，`force` 时调用 `reviewApi.refreshSnapshot`。切换 workspace / session 时 `force`。
- 强制刷新触发点：
  - `App.tsx` 约 804 行，`agent_run_finished` / `aborted` / `failed` 后的 `refreshReviewSummary()` 改为 force。
  - `openReviewTab` 里的 `onReviewChanged?.()` 改为 force。
  - `WorkspaceChromeControls` 提交 / 推送 / 新建分支后的 `onWorkspaceChanged` 改为 force。
- 非 Git 目录文案：`components/workspace/WorkspaceChromeControls.tsx` 约 288 行“请先在变更页面初始化 Git，再创建分支。”改为“当前目录不是 Git 仓库。”；`ReviewStrip.tsx` 约 29 行“Git 仓库尚未初始化”改为“当前目录不是 Git 仓库”。

### 6. 测试

- `D/main/test/review-coordinator.test.ts`：删 mutation 用例和四个 debounce / watch 用例；保留缓存、stale diff、去重、失败移除、取消 generation 用例，helper 里的 `invalidate` / `scheduleInvalidation` 改用 `refreshSnapshot`。
- `D/main/test/review-git-engine.test.ts`：删 “stages and unstages a file”“stages one selected hunk”（约 167 行起）和 lastTurn 用例（如有）。
- `D/main/test/runtime-v2-desktop-shell-ipc.test.ts`：约 94–110 行依赖 `reason: "watch"` 和真实 `fs.watch` 的段落改为“`refreshSnapshot` 之后 generation 递增并广播”。
- `D/main/test/runtime-v2-workspace-picker.test.ts`：跑一遍确认。
- `renderer/test/right-panel-review.test.tsx`：删复制 apply 命令、提交与 PR 对话框用例；`reason: "git"` 的用例改为 `"refresh"`。
- `renderer/test/use-review-summary.test.tsx`：`reason` 改 `"refresh"`；新增“force 时调用 `refreshSnapshot`”“agent 结束触发 force”用例。
- `renderer/test/review-diff-virtualization.test.tsx`：去掉 `onViewed` / `onMutation` props。
- `renderer/test/composer-toolbar.test.tsx`：改文案断言（约 55 行）。
- `packages/shared/src/test/review-contracts.test.ts`：删 mutation 用例与 `ReviewMutation` import。
- App 级测试 mock 删 `review.initGit` 键：`app-streaming-user-message`、`app-approval-recovery`、`app-message-queue`、`app-remote-host-refresh`、`app-response-annotations`、`app-session-errors`、`app-session-evict`、`chat-app-rejection`、`host-feedback`、`session-ipc-budget`；`apps/desktop/test-fixtures/session-background-runs.tsx` 删 `initGitRepository`。

### 7. 文档

- `docs/design-docs/core-review-change-sources.md`：删 Git actions、mutation、viewed、PR、复制命令、初始化、监听与 debounce 内容（约 5–17、28、39–40、58、68–70、90–95、147、171–173、202–207、232–248、258–274 行）；新增「刷新时机」一节：每轮 Agent 结束、打开面板、手动刷新、顶部菜单提交后，均强制刷新。
- `docs/design-docs/core-review-large-diff-loading.md`：改约 219 行的 mutation 重放措辞。
- `front-右侧面板与文件渲染规范.md`（约 13、463、474 行）、`front-聊天输入框规范.md`（约 137、286、289 行）、`front-environment-and-git-actions.md`（约 150、167 行）、`docs/ARCHITECTURE.md`（约 83 行）、`docs/design-docs/index.md`（约 55 行）。
- 站点 `apps/site/src/content/docs/review.md`：标题改为“查看改动”，删“检查并处理改动”中的暂存 / 恢复 / 提交，说明提交在顶部工作区菜单。
- `docs/learnings/2026-07/review-mutations-need-generation-and-fingerprint.md` 末尾加一行“2026-11 Review mutation 已移除”。
- `docs/histories/` 记一条，注明 `docs/exec-runs/20261008-review-resource-test/` 下的基准脚本已无法再运行。

## 验证

- 命令：README「统一验证命令」。
- 资源复测：用 `tmp/review-bench/` 的 turn-end 模式重跑一次，结果写入执行过程，应与设计文档第 10 节的“减法后”列同量级。
- 残留检查：`grep -rn "applyMutation\|setFileViewed\|createPullRequest\|copyGitApplyCommand\|initGit\|ReviewWorkspaceWatcher\|scheduleInvalidation" apps/desktop/src packages/shared/src` 无命中。
- 手工检查（Electron）：
  - Agent 改两个文件，本轮结束后输入框 +N/−M 更新。
  - 打开「改动」面板，显示最新改动；范围菜单没有「上一轮」；diff 区没有暂存 / 还原 / 已查看；工具栏没有 git 菜单。
  - 顶部菜单提交后，+N/−M 归零。
  - 手动在终端改文件后（不经过 Agent），点刷新能看到。
  - 非 Git 目录显示“当前目录不是 Git 仓库”。

## 风险

- 去掉监听后漏了某个刷新点，用户看到旧数字。缓解：步骤 5 列全触发点，手工检查逐条覆盖；面板保留手动刷新。
- `ReviewFileDiff.patchFingerprint` 误删影响 diff 去重。缓解：只删 hunk 级的，文件级保留。

## 回滚

`git revert` 本子计划的提交。旧 `view-state.json` 未删除，回滚后“已查看”状态仍在。
