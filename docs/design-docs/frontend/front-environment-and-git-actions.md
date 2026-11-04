# Environment 与本地 Git 操作规范

Environment 是聊天态顶栏里的本地工作区控制面（`components/workspace/WorkspaceChromeControls.tsx`），回答三个连续问题：当前会话运行在本机目录还是 Git worktree；工作区有哪些未提交变更、在哪个分支；用户要执行哪一个明确的本地 Git 动作。它不是远程代码托管中心，也不替代完整 Review 工作台（见 [front-右侧面板与文件渲染规范.md](front-右侧面板与文件渲染规范.md)）。

- 用户不离开会话即可确认真实 workspace、Git 分支和变更规模；高频动作一跳可达（查看变更、创建分支、提交、推送）。
- 所有状态来自当前工作区的真实文件系统和 Git 结果，不展示无法执行的假入口；写操作必须由用户显式触发，失败时保留可理解、可恢复的本地状态。
- 视觉与交互遵循 [front-视觉token规范.md](front-视觉token规范.md)、[front-组件与交互模式规范.md](front-组件与交互模式规范.md)。

## 顶栏位置

- Environment 是单个 icon-only 按钮（`aria-label="查看工作区环境"`，tooltip「工作区环境」），挂在中间栏右侧，popover 向下对齐末端展开；右侧对象栏的对象菜单与右侧面板不跟着它堆叠。
- 只在聊天态且 Review 可用、非 Chat 模式、有执行根时显示（`WorkbenchLayout`）；非聊天页面和 Chat 会话不显示，避免误导为绑定当前会话 workspace。
- 紧凑窗口（< 880px）下右侧对象覆盖层打开后，中间栏的 Environment 暂时退场，避免挡住对象 Tab；popover 做碰撞避让，不参与主区宽度计算。
- 「在外部应用中打开」不在这里：它是右侧文件视图里针对当前文件的 `OpenInAppMenu`，见右侧面板规范；支持的外部应用（VS Code、Cursor、Finder、Terminal、iTerm2）的探测、图标和打开都在 main，renderer 只传稳定 tool id 和 workspaceRoot / relativePath，不传命令或应用路径。

## 信息模型

popover 宽 304px，每次打开刷新环境状态，workspace 变化时清空旧状态；行高约 32px，图标 14–16px，分组用分隔线，不堆大卡片。顺序为：

1. **变更**：当前 workspace 相对 `HEAD` 的 staged、unstaged、untracked 全部变更，行尾 `+N -M`（additions 用 success、deletions 用 danger），无变更显示「无变更」，加载中是 spinner。点击创建或聚焦当前 workspace 的右侧 Review Tab，不在 popover 内重复渲染 diff；Review 返回 partial 或 warning 时仍展示可用统计。
2. **本机 / 工作树**：`git rev-parse --git-dir` 与 `--git-common-dir` 指向不同目录时显示「工作树」，否则「本机」（非 Git 目录也是「本机」）；只展示环境类型，完整路径放 `title` / 次级可访问文本，避免同名目录歧义。
3. **分支**：有 symbolic branch 时显示真实短名称并可打开分支菜单；无分支（detached HEAD 或尚未初始化）时显示「创建分支」。非 Git 目录点击只提示「当前目录不是 Git 仓库。」，不隐式 `git init`。
4. **提交或推送**：仅在 Git repository 中可用，直接打开统一 Git 面板。
5. **来源**：见下。

### 分支菜单

嵌套 Popover，贴在分支按钮左侧（放不下翻到右侧），宽 288px，打开即聚焦「搜索分支」输入框：

- 只列本地分支，不 fetch、不混入远端 tracking 分支；当前分支置顶并打勾；点其他分支执行安全的 `git switch <branch>`。
- 已被其他 worktree checkout 的分支继续展示但禁用，标「位于工作树」，完整路径只在 tooltip；无分支时写「暂无分支」。
- 底部固定「创建并切换到新分支…」。切换失败不自动 stash / force / 丢弃改动，保留原 checkout 并展示脱敏后的 Git 错误。

### 创建并切换分支

模态窗口，标题「创建并切换分支」；输入框「分支名称」预填 `actspace/<session-title-slug>` 且可完整编辑；「默认前缀」允许把前缀保存为本机偏好（renderer localStorage，不进跨进程 settings）。main 用 `git check-ref-format --branch` 校验后执行 `git switch -c <name>`；按钮「创建并切换」，成功后刷新 Environment、Composer 和 Review。

### 提交或推送（统一 Git 面板）

宽约 420px 的对话框（顶层 overlay，不被 popover 圆角裁切），不再先展开多级菜单：

- 顶部是当前分支（detached HEAD 时是「新分支」并默认进入新分支模式、预填 `actspace/<session-title-slug>`）和 `+N -M`；下方「提交说明」留空时 main 用本地确定性规则生成默认 message（不调用付费模型）。
- 「包含未暂存的变更」默认勾选：`git add -A` + `git commit -m <message>`；取消勾选只提交已暂存内容，没有 staged changes 时明确返回 nothing to commit。
- 底部「提交」（支持 ⌘↵）、「提交并推送」、「推送」；没有可提交变更时禁用前两项，推送按分支 / upstream 状态决定是否可用。detached HEAD 下提交会先创建用户填写的新分支再提交，推送不隐式创建分支。commit hook 失败时保留 Git 状态，不跳过 hook、不自动 reset。
- 推送：已有 upstream 用普通 `git push`；无 upstream 且单 remote 用 `git push -u <remote> <branch>`；多 remote 先弹「选择远程仓库」，不猜目标；无 remote 报 `No Git remote configured`，不自动新增。推送失败展示脱敏后的 Git 错误，不重试、不 force、不 pull、不 rebase。「提交并推送」中提交成功而推送失败时，必须区分「本地提交已完成」和「推送未完成」。
- 操作结果以反馈行呈现在 Environment popover 底部（如「已提交 abc123」「已推送 main」「已创建并切换到 …」）。

### 来源

当前会话里用户提供的上下文摘要，不是完整引用追踪：当前 workspace、用户消息附件中的图片、文件和链接；按稳定标识去重，直接展示 3 项，更多项经「查看全部」展开；名称可截断，完整值放 `title`。不扫描 Agent 读过的所有文件，也不把 Web Search 结果自动记成来源。

## 进程与安全边界

```text
renderer UI → typed preload IPC → main workspace environment service
  → 校验过的 workspace 目录 → execFile("git", argv, { cwd }) / execFile("/usr/bin/open", argv)
```

- renderer 不直接访问文件系统、执行 Git 或打开任意绝对路径；main 每次请求重新解析 workspace，确认它是存在的目录且已登记在 workspace registry / session 中，renderer 不能把任意本机目录提升为 Git 写操作目标。
- Git 与 `open` 只用参数数组，不经 shell，不接受 raw argv；stdout / stderr 有上限和 timeout，错误正文裁剪并去掉绝对路径等不必要细节后才返回；分支名交给 Git 校验，commit message 作为单个 `-m` 参数。
- 本功能不修改 Git 用户身份、remote URL、credential helper、hooks 或 `.git/config`（唯一例外：`push -u` 写当前分支 upstream）。

## 状态、并发与可访问性

- create branch、commit、push 同一时间只允许一个进行中的 Git mutation，进行中禁用重复动作并显示动作级 loading；完成后统一触发 Review Coordinator invalidation，Environment、Composer summary 和已打开的 Review 消费同一新 generation。Agent 运行中不自动禁止 Git 操作。
- 打开 Git 对话框时焦点进入对话框，环境浮层随之关闭，操作完成后重新打开浮层显示结果；嵌套分支菜单随外层因点外部、Esc、焦点移出而一并关闭。
- popover、菜单和模态窗口支持键盘导航、外部点击关闭、Esc 关闭与 focus restore；icon-only 入口同时有 `aria-label` 和 Tooltip；Commit 主按钮用 ink action，不用 operational green。

## 错误与空状态

- Git 不可用：说明当前环境没有可用的 Git；非 Git repository：变更与提交 / 推送不可用，Review 空态只提示「当前目录不是 Git 仓库」，不提供初始化 Git 入口；clean workspace：「无变更」且提交禁用；detached HEAD：可查看变更，提交时通过「新分支」创建分支，独立推送不可用。
- 认证、hook、远端拒绝：显示裁剪后的原始语义，不把 stderr、命令或本机敏感路径整段写入 UI。

## 不做

Pull Request、Compare branch、远端 PR 状态；pull、fetch、rebase、merge、force push；远端分支浏览、分支删除与重命名；自动 stash、force switch 或切换前自动提交；逐文件 stage / unstage、amend、签名选项、跳过 hooks；基于模型或 diff 的智能 commit message；修改 remote、Git identity 或 credential 配置。
