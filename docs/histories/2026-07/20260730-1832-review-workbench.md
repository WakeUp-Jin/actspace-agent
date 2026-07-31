## [2026-07-30 18:32] | Task: 完整实现 Review Workbench

### 🤖 Execution Context

- **Agent ID**: `Codex /root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop worktree`

### 📥 User Query

> 参考 Codex 的 Review 功能、UI、操作和设计，先形成完整规范与执行计划，再把 Review Workbench、Git actions 和 AI Code Review 一起实现。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、Review 设计与执行文档

**Key Actions:**

- **统一事实模型**：新增六种 `ReviewSelection`、generation-stamped `ReviewSnapshot`、结构化 file/hunk/line、capability matrix、mutation、finding、comment 和 run 契约。
- **Git Engine**：实现 Last Turn、Uncommitted、Unstaged、Staged、Committed、Branch，使用 NUL-delimited Git 输出处理中文、空格、引号、rename 与 repo 子目录，并支持词级差异、上下文扩展、大 diff cap。
- **安全写操作**：实现 file/hunk stage、unstage、revert，使用 generation 与 patch fingerprint 拒绝过期动作；未跟踪文件回退通过 Electron Trash adapter。
- **Review Workbench**：Review 保持为右侧对象 Tab，采用单列 diff 与按需 Files/Review activity 浮层，加入 filter/jump、unified/split、wrap/whitespace、图片预览、viewed、Commit/Push/Create PR 和响应式降级。
- **Review Agent**：建立只读 runtime、受限 read/list/grep、prompt injection 边界、`submit_review` 结构化终止、finding 校验、inline/detached、取消与 session projection。
- **反馈回注**：支持行级评论、finding 状态、评论汇总后进入普通 Agent turn；Review 模型可独立配置并回退 chat model。
- **V1 收口**：删除旧 `review:get-workspace-changes`、单一 `ReviewScope`、`ReviewChangeSet` 与 raw `unifiedText` 主链；Composer summary 改用新 Coordinator。

### UI 验收纠正

- 首次真实窗口打开暴露出三个问题：Review 被错误提升为全屏主内容、工具栏与 macOS 自定义 chrome 命中区重叠、开发态 bootstrap 使用下载目录导致错误的 `No changes`。
- 删除 `WorkbenchLayout` 的 Review Focus Mode 分支，恢复右侧 Tab、聊天区与常规关闭行为。
- 工具栏改为两行紧凑布局并显式声明 `no-drag` / pointer 命中；Files 与 Review activity 改为按需浮层。
- `BootstrapState.workspaceRoot` 改为启动解析出的 runtime workspace；没有 workspace/session 时显示 `Select a workspace`，不请求隐式默认目录。

### 🧠 Design Intent (Why)

人工浏览、Git mutation 和 AI Review 必须共享同一 selection、snapshot 与 generation，否则 UI 摘要、实际 Git 状态和模型看到的变更会逐渐漂移。Main-owned Coordinator 负责 workspace 重新解析、缓存与失效；renderer 只渲染结构化数据；Review Agent 只读且以严格 schema 结束，从而把并发改动、过期 hunk、路径越界和 prompt injection 都变成可验证的边界。

### 📁 Files Modified

- `packages/shared/src/review.ts`
- `packages/shared/src/session.ts`
- `packages/agent-core/src/review/`
- `packages/desktop/src/main/review-coordinator.ts`
- `packages/desktop/src/main/review-git-engine.ts`
- `packages/desktop/src/main/review-agent-service.ts`
- `packages/desktop/src/main/review-comment-service.ts`
- `packages/desktop/src/renderer/components/review/`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `docs/design-docs/core-review-change-sources.md`
- `docs/exec-plans/active/20260730-review-workbench/`

### ✅ Verification

- `pnpm --filter @actspace/shared test`：8 files / 69 tests passed。
- `pnpm --filter @actspace/agent-core exec vitest run src/review/test/review-agent.test.ts`：3 tests passed。
- `pnpm --filter @actspace/desktop test`：78 files / 595 tests passed。
- `pnpm check:frontend-theme`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，仅保留既有 renderer chunk-size warning。
- `git diff --check`：通过。
- agent-core 全量测试中，Review 无失败；全仓仍有 1 条既有 ToolManager 断言差异和 10 条受沙盒 Unix socket `EPERM` 影响的 Browser 测试，未把它们误记为本功能回归。
- UI 纠正后重新运行 `pnpm --filter @actspace/desktop test`：78 files / 595 tests passed；右侧 Review + workbench targeted regression 为 7 tests passed。
- 使用 `pnpm dev:log` 启动真实 Electron，确认 Review 保留聊天与左栏，Scope、Files 浮层、浮层关闭和 Review Tab 关闭均可点击；启动日志确认 runtime workspace 指向当前开发 worktree。
- 未在 disposable repo 中执行 stage/revert/commit，也未调用真实付费 Review provider 或真实 GitHub remote；这些仍保留为用户验收边界。

### 2026-07-30 后续产品纠正

用户在真实 UI 对照中进一步明确最终范围与交互：Branch 应比较本地分支与 upstream remote-tracking ref；零值统计应隐藏；actions 应合并到第一行右侧；AI Review 不需要。

- Branch selection 从自由输入 `baseBranch` 改为 Main 枚举带 upstream 的本地分支，并展示 `local → upstream`；不自动 fetch。
- 工具栏从两排改为单排 actions，Branch 比较关系仅占轻量 metadata 行；移除重复关闭按钮。
- additions/deletions 分别按正数渲染，不再显示 `+0`、`-0`。
- Review Options 接入 Refresh、word wrap、full-file loading、rich preview、word diff、white space 和安全 patch 导出的真实行为。
- 按用户明确决策完整删除 AI Review，而不是只隐藏入口：移除 Agent runtime、findings/comments、相关 IPC/session events、Review 模型设置和测试。
- 正式设计与执行计划改为 Git-first Review Workbench；自动化与真实远端验收继续分开记录。

本轮纠正后的验证：

- `pnpm --filter @actspace/shared test`：8 files / 68 tests passed。
- `pnpm --filter @actspace/desktop test`：76 files / 592 tests passed。
- `pnpm --filter @actspace/agent-core exec vitest run src/persistence/test/meta.test.ts`：9 tests passed。
- `pnpm typecheck`、`pnpm check:frontend-theme`、`pnpm build`、`git diff --check`：通过；build 仅保留既有 renderer chunk-size warning。
- `pnpm dev:log` 成功启动 Vite `127.0.0.1:5173` 与 Electron，供用户继续手动 UI 验收。

### 2026-07-31 Electron 交互与布局修复

用户真实操作继续暴露出两个直接问题：toolbar 多个按钮看起来没有响应；打开 Files 后文件区覆盖了中间 Diff 的大半内容。

- 根因一是 toolbar 使用横向 `overflow`，Scope、Options、Jump 和 Commit 的绝对定位弹层仍挂在滚动容器内部，实际已经打开但被祖先裁切。弹层改为 portal 到 `document.body`，按触发器矩形定位并处理 viewport 碰撞。
- 根因二是 Files 采用带遮罩的左侧 overlay，而且响应式读取整个窗口宽度。现在改为测量 Review 自身容器：`>= 560px` 时文件树右侧停靠、无遮罩；更窄时文件列表独占 Review 内容区，选中文件后返回 Diff；split diff 仅在 `>= 640px` 时开放。
- 空 snapshot 下的 Expand、Jump、Files、split 改为明确 disabled 反馈，避免执行无结果的点击。
- Review 对象改为稳定单例并读取当前工作台 workspace；切换 workspace 后不再继续查询创建 Tab 时捕获的旧路径。Main 在执行 Git 前先 canonicalize workspace，已删除目录会显示 workspace unavailable，而不是误报 Git 不存在。
- 文件 totals 继续分别隐藏零值，文件树行也不显示 `+0` / `-0`。

本轮验证：

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/right-panel-review.test.tsx src/main/test/review-git-engine.test.ts`：2 files / 12 tests passed。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- 使用 `pnpm dev:log` 启动真实 Electron，并通过 Computer Use 确认 Scope、Review Options、Expand/Collapse all、Jump to file、Files、Commit or push 都可点击。
- 真实 worktree 中 Files 在 620px Review 面板右侧停靠且不遮罩 Diff；Branch 子菜单展示 `main → origin/main · 18 ahead`。
- 没有执行 stage/revert/commit/push/Create PR；这些 mutation 与远端动作继续作为独立验收边界。

### 2026-07-31 大 Diff 性能纠偏

真实大变更暴露出旧实现虽然视觉上进入 capped mode，后台仍把展开文件映射为逐文件 IPC、逐文件 Git 和全量 React DOM，最终出现长时间 Loading、`spawn EBADF` 与 Electron 失去响应。

- Snapshot 改用显式 `all-files | single-file` load policy，集中使用 128 files、9,000 changed lines、12 MiB estimated bytes 三条严格大于阈值。
- Renderer 请求集合不再由 `expandedFileIds` 推导：Standard 一次请求全部文本 patch；capped 始终只请求 `selectedFileId`，文件树继续展示全部变更文件。
- 新增 batch patch 与独立 full-content IPC；删除 renderer 可见的旧单文件 diff IPC。Coordinator 合并重叠请求、缓存逐文件 outcome，并在 generation invalidation 时 Abort 与清理失败 pending。
- tracked patch 按 context 分组，并按 96 KiB argv budget 拆批；Git child、patch 拆分和 hunk/word-diff 解析迁移到专用 worker。
- tracked full content 在 worker 中使用 `cat-file --batch-check` 与最多 4 blob 的 `cat-file --batch`；working-tree 内容只读取前 2 MiB，并保留路径 containment/symlink 检查。
- Diff canvas 改为 `@tanstack/react-virtual` variable-height row renderer；wrap/split 会重新测量但不重取 patch，Jump 使用 virtual index。
- Options 中 whitespace 改为真实 Git 查询语义；full files 只影响可见附近文件的正文补齐，不清空或重取 patch。
- data-directory 初始化改为 single-flight，避免高频 Review IPC 重复 mkdir 与启动日志。
- 通用 Git runner 不做自动命令重放；worker crash 最多重建一次，文件读取失败通过显式 Retry，避免 mutation 重复副作用。

新增自动化覆盖阈值等于/超过边界、50 tracked files 单 patch command、9,000 行虚拟 DOM 上限、capped 当前文件请求、Coordinator 去重/取消/Retry 和 worker crash lifecycle。真实 Electron 双模式、快速文件切换与浅/深主题验收继续与自动化分开记录。

本轮自动化验证：

- `pnpm --filter @actspace/shared build && pnpm --filter @actspace/shared test`：8 files / 68 tests passed。
- `pnpm --filter @actspace/desktop test`：79 files / 604 tests passed。
- `pnpm typecheck`、`pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check`：通过。
- `pnpm build`：通过；仅保留既有 renderer chunk-size warning。
- production-compiled Review worker smoke：真实 Git command、patch parse 与 `cat-file` object loading 通过。
- `pnpm dev:log` 启动成功；data directories 只初始化一次，日志未发现 Review `spawn EBADF`、uncaught 或 unhandled rejection。
- 使用 worktree 专属 bundle ID 完成 capped 核心路径验收：Scope、Options、Files、Jump、Collapse/Expand、Commit 菜单均可点击；文件树展示 183 个变更文件，中央只挂载当前文件，切换文件与连续三屏滚动无永久 Loading，底部大 Diff 提示稳定。
- Standard、浅/深主题、390px/620px、至少 20 个文件快速切换以及 Git mutation/远端动作仍保留为独立验收边界，未在本轮宣称完成。
