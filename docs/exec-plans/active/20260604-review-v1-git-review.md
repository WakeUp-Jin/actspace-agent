# 2026-06-04 Review V1 Git Review 执行计划

## 目标

实现 V1 Codex-style Git Review：Composer 上方的 Review 入口不再使用硬编码统计，而是读取当前 workspace 的 Git repository state；右侧 `Review` Tab 默认展示 `Uncommitted` changes（staged + unstaged + untracked），无 Git repository 时提示用户显式创建 Git repository。V1 只做人工浏览和 Git 初始化引导，不启动 AI Review，不把 Review 等同于提交动作。

派生自 `docs/design-docs/core-review-change-sources.md` 和 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`。设计文档回答为什么 Git-first；本计划回答按什么文件、什么顺序实现，以及如何验证。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/SECURITY.md`
- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/tool-system/agent-subprocess-runner-guidelines.md`

## 范围

包含：

- `@actspace/shared` 新增 Review V1 IPC 类型与 `ReviewChangeSet` 契约。
- desktop main 新增 Git Review provider，使用受控 `git` 子进程读取当前 workspace 的 uncommitted changes。
- 新增 `review:get-workspace-changes` IPC，用结构化结果返回 `ReviewChangeSet` 或 provider 状态。
- 新增 `review:init-git` IPC，只有用户在无 Git 空态中显式点击时才执行 `git init`。
- preload / `global.d.ts` 暴露 Review API。
- renderer 将 Composer Review strip 从硬编码 `+4253 -5` 改为 Git review summary 驱动。
- 右侧面板新增 `review` tab kind 和 `ReviewRenderView`，默认展示 Git uncommitted changes。
- 覆盖 main service、renderer Composer 和右侧 Review view 的单元测试。

不包含：

- AI Review findings、模型审查、用户自定义 review prompt。
- Commit / Push / PR、stage / unstage / revert、文件写操作。
- V2 Session Review / Last Turn scope。
- Snapshot baseline。
- 多 workspace 聚合、远端 PR diff、external patch。
- Git branch picker、base branch 配置和 merge-base `Since Base` 完整实现。

## 前端 V1 方案

### Composer 入口

- 现有 `Composer.tsx` 的 `renderReviewActionsStrip()` 保留位置和视觉密度，但统计改为来自 `ReviewSummary` props。
- `status === "changes"`：显示 `Review +N -M`，点击打开右侧 Review Tab。
- `status === "notAvailable"` 且 reason 为 `not_a_repository`：显示 `Review`，无增删计数，点击打开右侧 Review Tab 的 Git 初始化空态。
- `status === "empty"`：不显示按钮，或显示 disabled 空态；V1 采用不显示，避免干扰 Composer。
- `status === "loading"`：可显示 disabled `Review` skeleton，防止首次加载闪烁。
- overflow `MoreHorizontal` V1 保留但不扩展菜单；后续 Commit / Push / PR 再接入。

### 右侧 Review Tab

- `RightPanelTab` 新增 `{ kind: "review"; title: "Review"; workspaceRoot?: string; scope: "uncommitted" }`。
- 打开 id 使用 `review:<workspaceRoot>:git:uncommitted`，重复点击只刷新并聚焦。
- `RightPanelBody` 新增 `ReviewRenderView`。
- 顶部采用 Codex-style 极简对象栏：
  - 右侧 Tab 行只显示 `Review` tab 和必要窗口 / 面板图标。
  - Review 内容顶部是一条单行操作栏：左侧 `Uncommitted` scope 下拉和总 `+N -M`，右侧放 `More` / search / diff display / `Refresh` 等图标按钮。
  - `N Uncommitted Changes` 不再作为大 summary card 常驻显示；需要保留在操作栏的 `aria-label`、tooltip 或可访问说明中，供屏幕阅读器和测试稳定读取。
- 主体布局：
  - 文件列表是主体；不做说明型大标题、不做 summary card、不做营销式卡片。
  - 文件列表每个文件一行：chevron、status icon、path、`+N -M`。
  - `New` / `Deleted` / `Renamed` / `Modified` 不再作为固定可见文字列；状态由图标、颜色和文件行 `aria-label` / accessible name 表达，视觉行尾只保留 `+N -M`。
  - 点击文件行展开 / 收起该文件的具体 unified diff；展开态位于该文件行下方，不跳转到另一个页面。
  - V1 默认展开第一个有 diff body 的文件；其余文件保持折叠，避免大变更一次性铺满右侧面板。
  - 键盘可达：文件行是 button 或具有 button 语义，`Enter` / `Space` 切换展开，`aria-expanded` 反映状态。
  - 展开内容按 diff 行展示行号和增删背景；新增文件可从 line 1 展示，删除文件展示删除行，binary / truncated 文件展示 warning 占位。
  - V1 默认采用单列 accordion 文件 diff 列表，避免在 320px 最小右栏宽度下挤出不可读双栏。后续宽屏双栏属于视觉增强，不进入 V1 验收。
- 空态：
  - `empty`：说明 Git provider 成功运行但没有改动。
  - `not_a_repository`：说明当前 workspace 还不是 Git repository，提供主按钮 `Initialize Git`。
  - `failed`：展示脱敏错误和 `Refresh`，不显示 raw command。
  - `partial`：展示可用 diff，同时在顶部显示裁剪 / binary skipped warning。

### 视觉约束

- 使用现有主题 token：`border-line`、`bg-surface`、`bg-surface-subtle`、`text-text-*`、`text-success`、`text-danger`。
- diff 行复用 `packages/desktop/src/renderer/styles/diff.css` 的增删颜色语义；不新增写死 `#hex` / `text-black` / `bg-white`。
- Review 是工作台工具面板，采用紧凑、可扫描的密度，不做营销式卡片、大 hero、说明型大标题或大 summary card。
- 图标使用 lucide：`GitBranch` / `RefreshCw` / `FileText` / `Plus` / `AlertTriangle`。

## 后端 V1 方案

### Git provider

新增 `packages/desktop/src/main/review-git-service.ts`：

- 使用 `node:child_process` 的 `execFile` 或 `spawn`，不走 shell。
- 所有命令使用 `git -C <workspaceRoot> ... -- .`，保证只看当前 workspaceRoot 以内的 pathspec。
- 子进程需要 timeout、stdout/stderr 字节上限和脱敏错误。
- repository 检测：
  - `git -C <workspaceRoot> rev-parse --is-inside-work-tree`
  - 失败返回 `notAvailable` + `reason: "not_a_repository"`。
  - `git` 命令不存在返回 `failed` + `reason: "git_not_found"`。
- baseline：
  - 有 `HEAD`：baseline label 为 `HEAD`，tracked diff 用 `git diff --find-renames --unified=3 HEAD -- .`。
  - 无 commit：baseline label 为 `No commits`，tracked staged diff 可用 `git diff --cached --find-renames --unified=3 -- .`；untracked 仍作为 added。
- untracked：
  - 用 `git ls-files --others --exclude-standard -- .` 发现。
  - 文本小文件生成 `/dev/null -> path` 的 pseudo unified diff。
  - 二进制或超限文件只生成 file entry + `binary_skipped` / `truncated` warning。
- parse：
  - 解析 `diff --git` file header、`new file mode`、`deleted file mode`、`rename from/to`、`@@` hunk。
  - `ReviewChunk.unifiedText` 保存 hunk 文本；additions / deletions 统计忽略 `+++` / `---` header。
  - status map 由 diff header 与 `git status --porcelain=v1 -z -- .` 辅助确认。

### Git 初始化

同一 service 暴露 `initializeGitRepository(input, roots)`：

- 解析 workspaceRoot 并确认在应用允许的 workspace root 输入内。
- 如果已经是 Git repository，返回 `{ ok: true, alreadyRepository: true }`。
- 如果不是，执行 `git -C <workspaceRoot> init`。
- 不自动 `git add`，不自动 commit，不改 `.gitignore`。
- UI 必须通过用户显式点击触发；页面加载、打开 Review 或 Agent turn 都不能隐式初始化 Git。

## IPC 契约

修改 `packages/shared/src/ipc.ts`，新增：

```ts
type ReviewSource = "git" | "session" | "snapshot" | "external";
type ReviewBaselineKind = "session-preview" | "git-ref" | "snapshot";
type ReviewScope = "uncommitted";
type ReviewProviderStatus = "changes" | "empty" | "notAvailable" | "noBaseline" | "partial" | "failed";

type ReviewChangeSet = {
  id: string;
  sessionId?: string;
  workspaceRoot?: string;
  source: ReviewSource;
  scope: ReviewScope;
  baseline?: { kind: ReviewBaselineKind; label: string };
  files: ReviewFileChange[];
  totalAdditions: number;
  totalDeletions: number;
  generatedAt: string;
  warnings?: ReviewWarning[];
};

type ReviewFileChange = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  previousPath?: string;
  additions: number;
  deletions: number;
  chunks: ReviewChunk[];
};

type ReviewChunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  unifiedText?: string;
};

type ReviewWarning = {
  kind: "truncated" | "binary_skipped" | "ignored_path" | "provider_failed";
  message: string;
  filePath?: string;
};

type ReviewGetWorkspaceChangesInput = {
  workspaceRoot?: string;
  scope?: ReviewScope;
};

type ReviewGetWorkspaceChangesResult = {
  provider: "git";
  status: ReviewProviderStatus;
  changeSet?: ReviewChangeSet;
  reason?: "not_a_repository" | "git_not_found" | "unsupported_scope" | "command_failed";
  message?: string;
};

type ReviewInitGitInput = { workspaceRoot?: string };
type ReviewInitGitResult = {
  ok: boolean;
  alreadyRepository?: boolean;
  workspaceRoot: string;
  error?: "git_not_found" | "command_failed" | "invalid_workspace";
  message?: string;
};
```

V1 只暴露 `scope: "uncommitted"`；`Staged` / `Unstaged` / `Since Base` 等 scope 等 V1 稳定后再扩。

## 相关代码路径

- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/desktop/src/main/review-git-service.ts`（新增）
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/ReviewRenderView.tsx`（新增）
- `packages/desktop/src/renderer/styles/diff.css`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/main/test/review-git-service.test.ts`（新增）
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-review.test.tsx`（新增）

## 并行边界

- 本计划 owns Review V1 Git provider、Review IPC、Composer Review strip、右侧 Review tab。
- 不修改 Agent tool preview、session persistence、Kairos、workspace file tree、visualize reply。
- 不把 session provider 接进 V1；如果执行期间需要 session diff，只能作为 mock fixture 或后续任务记录。
- 不新增 Git 写操作，除了用户显式触发的 `review:init-git`。

## V1 实施任务

### Task 1：shared Review 契约

修改 `packages/shared/src/ipc.ts`。`packages/shared/src/index.ts` 已有 `export * from "./ipc"`，本任务只需确认新增类型能从 `@actspace/shared` 导入，不新增额外 re-export。

- 新增 Review 类型。
- 保持 `ReviewChangeSet` 与 `core-review-change-sources.md` 字段一致。
- V1 `ReviewScope` 只支持 `uncommitted`。

验证：

- `pnpm --filter @actspace/shared typecheck`
- shared 类型可被 desktop main / preload / renderer 引用。

### Task 2：main Git Review service

新增 `packages/desktop/src/main/review-git-service.ts`。

- 实现 `getWorkspaceGitChanges(input, roots)`。
- 实现受控 Git 命令 runner。
- 实现 repository 检测、HEAD 检测、tracked diff、untracked pseudo diff、diff parser、warnings。
- 实现 `initializeGitRepository(input, roots)`。

测试 `packages/desktop/src/main/test/review-git-service.test.ts` 覆盖：

1. 非 Git 目录返回 `notAvailable` + `not_a_repository`。
2. 空 Git repo 返回 `empty`。
3. tracked modified 文件返回 `modified` 和正确 `+N -M`。
4. staged + unstaged 都能进入 `uncommitted`。
5. untracked 文本文件返回 `added` pseudo diff。
6. untracked binary / 超限文件返回 warning，不塞乱码 diff。
7. rename / delete 至少有状态映射。
8. `review:init-git` 只创建 `.git`，不 add、不 commit。

验证：

- `pnpm --filter @actspace/desktop test -- review-git-service`

### Task 3：IPC 注册、preload 和全局类型

修改：

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`

新增：

- `ipcMain.handle("review:get-workspace-changes", ...)`
- `ipcMain.handle("review:init-git", ...)`
- `window.actspace.getWorkspaceReview(input)`
- `window.actspace.initGitRepository(input)`

验证：

- `pnpm --filter @actspace/desktop typecheck`

### Task 4：renderer Review 状态接入

修改 `App.tsx` / `WorkbenchLayout.tsx` / `ConversationView.tsx` / `Composer.tsx`。

- 在 App 层维护当前 `selectedWorkspaceRoot` 的 `ReviewGetWorkspaceChangesResult`。
- 初次加载、workspace 切换、turn 完成后刷新 Review summary。
- Composer 接收 `reviewSummary` 和 `onOpenReview`。
- `renderReviewActionsStrip()` 移除硬编码 `+4253 -5`。
- 点击 Review 调 `openTab({ kind: "review", ... })`。

验证：

- 更新 `composer.test.tsx`：
  - dirty summary 显示 `Review +N -M`。
  - empty 不显示 Review strip。
  - not_a_repository 显示 Review 入口但不显示计数。
  - 点击 Review 调用传入的 open handler。

### Task 5：右侧 Review tab 和 view

修改 / 新增：

- `RightPanelContext.tsx` 增加 `review` tab kind。
- `RightPanel.tsx` 在 `RightPanelBody` 中渲染 `ReviewRenderView`。
- 新增 `ReviewRenderView.tsx`。

`ReviewRenderView` 行为：

- 根据 tab.workspaceRoot 调 `window.actspace.getWorkspaceReview({ scope: "uncommitted" })`。
- loading / empty / failed / notAvailable / partial 全状态渲染。
- not_a_repository 空态的 `Initialize Git` 按钮调用 `window.actspace.initGitRepository`，成功后刷新。
- 文件列表 + diff body 复用主题 token 和 diff CSS。
- 文件级 accordion 是 V1 必做：每个文件行先展示 status icon / path / `+N -M`，点击后展开该文件具体 diff；再次点击收起。状态文字进入 `aria-label` / accessible name，视觉上不再额外显示状态标签列。
- 浏览器 mock 无 IPC 时显示开发降级空态，不崩溃。

验证：

- 新增 `right-panel-review.test.tsx`：
  - 渲染 ready changes 的文件列表、统计和 diff。
  - 默认展开第一个 changed file；点击第二个文件行展开其 diff，`aria-expanded` 更新。
  - 再次点击已展开文件行会收起 diff。
  - 新增 / 删除 / 重命名文件行分别通过 status icon 和 accessible name 表达 `New` / `Deleted` / `Renamed` 语义；视觉行尾只保留 `+N -M`。
  - not_a_repository 空态点击 Initialize Git 调 IPC 并刷新。
  - failed 状态展示错误和 Refresh。
  - partial 状态展示 warning。

### Task 6：前端视觉与真实桌面验证

如 `ReviewRenderView.tsx` 需要新增局部 className 或 CSS，只能使用主题 token / Tailwind 语义类；不得新增非主题感知 `#hex`、`text-black`、`bg-white`。

验证：

- 浏览器 mock：Review dirty / empty / not_a_repository / failed / partial 状态。
- 浅色、深色主题各看一次：按钮、状态、diff 增删行、空态不出现非主题感知颜色。
- Electron 真实验证：
  - Git repo 中修改文件，Composer 显示真实 `+N -M`。
  - 点击 Review 打开右侧 Review tab。
  - 点击文件行能展开 / 收起该文件具体改动。
  - 新建 untracked 文本文件能显示为 added。
  - 非 Git workspace 打开 Review，显示 Initialize Git；点击后 `.git` 创建，随后 Review 刷新为空或显示 untracked。

## 验证方式

自动化：

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test -- review-git-service`
- `pnpm --filter @actspace/desktop test -- composer`
- `pnpm --filter @actspace/desktop test -- right-panel-review`
- `pnpm typecheck`
- `pnpm build`

前端 / 桌面：

- 浏览器 mock 验证 `ReviewRenderView` 多状态和浅 / 深主题。
- 因涉及 preload、IPC、本地 Git 和文件系统，最终必须跑 `pnpm dev:log` 或 `pnpm dev` 做 Electron 真实验证。

## 风险与缓解

- Git 命令不可用：返回 `failed` + `git_not_found`，UI 不崩溃。
- workspaceRoot 是 repo 子目录：Git 命令必须带 `-- .` pathspec，避免展示 workspace 外的 repo 改动。
- untracked 大文件拖慢 Review：单文件和总 diff 设置上限，超限返回 warning。
- raw diff parser 误判：main service 单测覆盖 modified / added / deleted / renamed / untracked；V1 先保存 `unifiedText`，不强依赖 oldText/newText。
- `git init` 是写操作：只由用户显式点击触发；不自动 add/commit。
- 前端重复请求：App 层做 refresh debounce 或 request id guard，旧请求结果不能覆盖新 workspace 的状态。

## 失败回退

- Task 2 不稳定时：保留 shared 类型，先让 IPC 返回 `failed`，前端只展示空态；不接入 Composer 统计。
- Task 4 出现状态漂移：Review 按钮临时只在点击时请求，不做实时 summary。
- Task 5 视觉不稳定：先用单列文件 diff 列表，后续再拆左右布局。

## 进度记录

- [x] 2026-06-04：确认 V1 路线为 Codex-style Git Review；Session Review 降为 V2 scope。
- [x] 2026-06-04：梳理现有 Composer、RightPanel、IPC、workspace service 代码路径。
- [x] 2026-06-04：创建本 execution plan。
- [ ] Task 1：shared Review 契约。
- [ ] Task 2：main Git Review service。
- [ ] Task 3：IPC 注册、preload 和全局类型。
- [x] Task 4：renderer Review 状态接入。
- [ ] Task 5：右侧 Review tab 和 view。
- [ ] Task 6：自动化、浏览器 mock 和 Electron 真实验证。
- [ ] 完成后更新 `docs/histories/2026-06/20260604-0112-review-change-sources-design.md` 或新增对应实现 history。
- [x] 2026-06-04：补齐 App 层 Review summary 刷新状态：初次加载、workspace 变化、turn 完成和右侧 Review 变更后同步 Composer 入口统计；重复点击 Review 入口会刷新右侧 Review tab。

## 决策记录

- 2026-06-04：V1 学习 Codex App，Review 主入口以 Git repository state 为事实来源；无 Git 时提示显式创建 Git repository。
- 2026-06-04：V1 只实现 `Uncommitted` scope，避免一开始同时铺开 Staged / Unstaged / Since Base。
- 2026-06-04：renderer 只消费结构化 Review 数据，不解析 raw `git diff`，也不直接访问文件系统。
- 2026-06-04：`git init` 单独做显式 IPC，不跟打开 Review 或刷新 Review 混在一起。
