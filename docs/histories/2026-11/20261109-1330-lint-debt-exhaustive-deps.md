## [2026-11-09 13:30] | Task: lint 债务第四批——useExhaustiveDependencies 清零并升为 error

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 那么我们继续任务吧，还有 B 和 C（B = `useExhaustiveDependencies` 134 处）

### 🛠 Changes Overview

**Scope:** `biome.jsonc`、`docs/coding-standards/lint-conventions.md`，desktop 渲染层 25 个文件、web 1 个文件

**Key Actions:**

- 134 处里 71 处是「多余依赖」（`useEffect(fn, [refreshKey])`、`[tab.revision]`、`[visibleTick]` 这类把 key / revision / tick 当触发器的写法），全部有意为之，React 官方的 `exhaustive-deps` 也不把 effect 的多余依赖当错误。开 `reportUnnecessaryDependencies: false`，只追漏依赖。
- 剩下 63 处漏依赖逐处核对，没有用 `biome-ignore`，分四类处理：
  - **稳定回调直接补进依赖**（App.tsx 15 处、`use-panel-layout`、`WorkbenchLayout`、`ReviewWorkspace`、`use-trajectory-selection`）：`readSidebarSessions` / `setActiveSessionId` / `refreshTaskQueue` 都是 `useCallback` 且依赖链到底是 `useState` 初始化的 store，身份不变，补上不改触发时机。`sessionStore.applyEnvelope` 补的是 `sessionStore`（`useMemo(() => new …, [])`）。
  - **把每次渲染新建的函数改成 `useCallback`**，再补进依赖：`useComposerOverlay.close`、`useSlashMenu.dismiss / reset`、`useComposerSkills.load`（依赖 `workspaceRoot`）、`useComposerAttachments.setAttachments`（依赖 `draftKey` / `writeAttachmentDraft`）、`ConnectionDetailPage.commitRemoval`、`useTrajectorySelection.remember`、`SplitView` 的 `getAvailableMaxWidth → getBoundedWidth → resizeSide` 链。`SplitView` 顺带把原来漏掉的 `containerWidth` 收进依赖（拖拽期间容器变宽时上限不再是旧值）。Composer 里只在 effect 用的 `closeFloatingPanels()` 直接展开成 `overlays.close(); slash.dismiss();`。
  - **回调是「事件」不是依赖**：`useComposerDraft` 的 `onSwitched` / `onRestored` 由调用方每次渲染新建，但只该在换会话 / 恢复草稿时触发。改成 `const ref = useRef(cb); ref.current = cb;`，effect 里读 `ref.current`（App.tsx 的 `sidebarSessionsRef` 已经是这种写法）。`TurnPromptEditor` 读一次附件列表同理。
  - **依赖比捕获更具体**（`[focus?.revision]` 但 body 读 `focus.taskId`）：先把字段取成变量 `const focusRevision = focus?.revision; const focusTaskId = focus?.taskId;`，effect 只用这些变量。`BackgroundTasksPanel`、`SubagentsPanel`、`AddModelPanel`、`model-fields.RatePair`、`LocalUpdateSection`、`TrajectoryTimeline`、`ComposerPalette`（改依赖 `activeRowId` 字符串）、`review-store`（从已有的 `stateRef` 读快照）、web `DetailHeader`。
  - `MarkdownProse` 的脚注编号表：编号就是标识在表里的顺序，所以从 `numbersKey` 原样重建 `Map`，不再依赖 `definitions` 的对象身份，顺带删掉仓库里最后两条已失效的 `eslint-disable` 注释（另一条在 `ReviewWorkspace`）。
  - 由父组件传入的 `RefObject`（`inputRef`、`composerRef`、`scrollRef`）Biome 不知道它稳定，把 ref 对象本身补进依赖即可。
- 规则升为 `error`。

### 🧠 Design Intent (Why)

- 先试过 `--write --unsafe`：它会把 `activeRow`、`focus`、`state`、`initial` 这类对象整个塞进依赖，每次渲染重跑 effect，还会把 `inputRef.current` 写进依赖数组。全部撤掉手改。
- 不用 `biome-ignore` 的原因：每一处漏依赖都有一个不靠注释就能表达意图的写法（稳定化、事件 ref、字段取变量），下次改代码时规则还能继续起作用。
- `reportUnnecessaryDependencies` 关掉是定性判断：仓库里 70 多处触发器写法要么改成 `useEffect` 内部手动比较上一次的 key，要么加注释，两种都比现在更差。

### ✅ Verification

- `pnpm exec biome lint .`：0 error。
- `pnpm --filter ./apps/desktop --filter ./apps/web typecheck` 通过。
- desktop 测试 301 文件 2898 用例通过，web 29 文件 141 用例通过；`check:hot-path-reads`、`test:contract-matrix` 通过。
- 根级 `pnpm typecheck` 在本地卡在 `apps/site` 的 `astro check`（等待安装 `@astrojs/check` 的交互提示），与本次改动无关，CI 上有缓存不受影响。

### 📁 Files Modified

- `biome.jsonc`
- `docs/coding-standards/lint-conventions.md`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/{Composer,SplitView,WorkbenchLayout}.tsx`
- `apps/desktop/src/renderer/components/composer/{ComposerAttachments,ComposerInput,ComposerPalette,SlashMenu}.tsx`、`composer/use-composer-{draft,overlay,skills}.ts`
- `apps/desktop/src/renderer/components/conversation/TurnPromptEditor.tsx`
- `apps/desktop/src/renderer/components/messages/MarkdownProse.tsx`
- `apps/desktop/src/renderer/components/review/{ReviewWorkspace.tsx,review-store.ts}`
- `apps/desktop/src/renderer/components/right-panel/{BackgroundTasksPanel,SubagentsPanel}.tsx`、`right-panel/use-code-selection.ts`
- `apps/desktop/src/renderer/components/settings/models/{AddModelPanel,ConnectionDetailPage,model-fields}.tsx`、`settings/sections/LocalUpdateSection.tsx`
- `apps/desktop/src/renderer/components/trajectory/{TrajectoryTimeline.tsx,use-trajectory-selection.ts}`
- `apps/desktop/src/renderer/components/workbench/use-panel-layout.ts`
- `apps/web/src/pages/session/DetailHeader.tsx`
