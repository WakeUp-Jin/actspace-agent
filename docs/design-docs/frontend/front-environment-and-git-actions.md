# Environment 与本地 Git 操作规范

## 定位

Environment 是聊天态工作台顶部的本地工作区控制面。它回答三个连续问题：

1. 当前会话运行在普通本机目录还是 Git worktree？
2. 当前工作区有哪些未提交变更、位于哪个分支？
3. 用户要把工作区交给哪个本机工具，或执行哪一个明确的本地 Git 动作？

本规范参考 Codex 的紧凑信息层级和渐进式操作，但视觉继续使用 ActSpace Editor Design System / Ink & Emerald。它不是远程代码托管中心，也不替代完整 Review Workbench。

## 产品目标

- 用户不离开当前会话即可确认真实 workspace、Git 分支和变更规模。
- 高频动作保持一跳可达：查看变更、创建分支、Commit、Push、在编辑器或终端打开。
- 所有状态来自当前工作区的真实文件系统和 Git 结果，不展示无法执行的假入口。
- 写操作必须由用户显式触发，并在失败时保留可理解、可恢复的本地状态。

## 顶栏信息架构

聊天态顶部按 pane 拆分为两组：

```text
中间栏右侧：[编辑器选择] [Environment]
右侧对象栏：[对象 +] [右侧面板]
```

- 编辑器选择器是分体按钮：主按钮使用上次选择的应用打开当前 workspace，右侧 chevron 展开应用列表。
- Environment 使用单个 icon-only button，展开包含环境、Git 和 Sources 的紧凑 popover。
- 对象菜单和右侧面板沿用现有行为，但只能出现在右侧对象栏，不能跟随 Environment 一起堆到全窗口右端。
- 非聊天页面不显示编辑器选择器和 Environment，避免让全局页面误导为绑定当前会话 workspace。
- `<= 820px` 紧凑窗口中，聊天主区显示时仍保留纯图标入口；右侧对象覆盖层打开后，中间栏的编辑器选择和 Environment 暂时退场，避免挡住对象 Tab。popover 必须进行碰撞避让，不参与主区宽度计算。

## Environment 信息模型

### Changes

- 展示当前 workspace 相对 `HEAD` 的 staged、unstaged 和 untracked 全部变更。
- 行尾展示 `+N -M`；没有变更时展示中性 `Clean`。
- 点击后创建或聚焦当前 workspace 的右侧 Review Tab；不在 popover 内重复渲染 diff。
- Review 返回 partial 或 warning 时仍展示可用统计，并在 Environment 中提供有限错误提示。

### This Mac / Worktree

- 普通本机目录或主工作树显示 `This Mac`。
- `git rev-parse --git-dir` 与 `--git-common-dir` 指向不同目录时显示 `Worktree`。
- 非 Git workspace 仍显示 `This Mac`，并让分支行进入 `Create branch` / 初始化提示边界。
- 行内只展示环境类型；完整 workspace 路径通过 tooltip 或次级可访问文本提供，避免同名目录歧义。

### Branch

- symbolic branch 存在时显示真实短名称，例如 `main` 或 `feature/environment-menu`。
- detached HEAD 时显示 `Create branch`。
- 尚未初始化 Git 时，创建分支动作先明确提示需要初始化仓库，不隐式执行 `git init`。
- 点击当前分支行打开本地分支选择器：
  - 顶部按本地分支名搜索，不触发 fetch，也不混入远端 tracking branch。
  - 当前分支置顶并用 check 标识；点击其他可用分支后执行安全的 `git switch <branch>`。
  - 已被其他 worktree checkout 的分支继续展示，但禁用并标记 `In worktree`；完整路径只通过 tooltip 提供。
  - 列表底部固定提供 `Create and checkout new branch...`。
  - 切换失败时不自动 stash、不 force、不丢弃改动，保留原 checkout 并展示脱敏后的 Git 错误。
- 点击 `Create branch` 或列表底部创建动作打开模态窗口：
  - 标题为 `Create and checkout branch`。
  - 输入框预填 `actspace/<session-title-slug>`。
  - 用户可编辑完整分支名。
  - `Set prefix` 允许保存本机偏好，首版存 renderer localStorage，不进入跨进程 settings。
  - main 使用 `git check-ref-format --branch` 校验后执行 `git switch -c <name>`。
  - 底部提供 `Close` 与 `Create and checkout`，创建成功后刷新 Environment、Composer 和 Review。

### Commit or push

- 仅在 Git repository 中可用；detached HEAD 也可打开，但默认进入 `New branch` 模式。
- 点击后直接打开统一 Git action panel，不再先展开三级菜单再打开第二个 modal。
- panel 顶部展示当前 branch 或 `New branch`、`+N -M` 变更统计；detached HEAD 默认进入新分支模式并预填 `actspace/<session-title-slug>`。
- Commit message 允许留空；留空时 main 使用本地确定性规则生成默认 message，不调用付费模型。
- `Include unstaged changes` 默认勾选，以保持提交整个 workspace 的默认行为：

```text
git add -A
git commit -m <message>
```

- 取消勾选时不执行 `git add`，只提交当前 staged changes；没有 staged changes 时明确返回 nothing to commit。
- panel 底部直接提供 `Commit`、`Commit and push`、`Push`，Commit 支持 `⌘↵`；没有可提交变更时禁用前两项，Push 仍按当前 branch / upstream 状态决定是否可用。
- detached HEAD 中使用 Commit / Commit and push 时，先创建用户填写的新分支，再执行提交；Push 不隐式创建分支。
- commit hook 失败时保留 Git 返回的状态；ActSpace 不跳过 hook、不自动 reset staging area。

### Push 与 remote 选择

- 已配置 upstream：执行普通 `git push`。
- 没有 upstream、只有一个 remote：执行 `git push -u <remote> <branch>`。
- 没有 upstream、存在多个 remote：先弹出 remote 选择，不猜测目标。
- 没有 remote：显示明确错误和当前 branch，不自动新增 remote。
- Push 失败时展示脱敏后的 Git 错误；不自动重试、不 force push、不 pull、不 rebase。
- Commit and push 如果 commit 成功但 push 失败，必须明确区分“本地 commit 已完成”和“push 未完成”，不得把整次操作描述为未发生。

## Sources

- Sources 是当前会话中由用户提供的上下文摘要，不是完整引用追踪系统。
- 首版来源：当前 workspace、用户消息附件中的图片、文件和链接。
- 按稳定标识去重，最多直接展示 3 项；更多项通过 `View all` 展开。
- 文件名和 URL 可以截断，但完整值通过 `title` / tooltip 保留。
- Sources 不扫描 Agent 读取过的所有文件，也不把 Web Search 结果自动记成用户来源，避免列表无限增长和语义混乱。

## 编辑器与本机工具选择

首版支持：

- Visual Studio Code
- Cursor
- Finder
- Terminal
- iTerm2

行为规则：

- main 进程负责检测应用是否可用和执行打开动作。
- main 优先用 Electron `nativeImage.createThumbnailFromPath()` 请 macOS 从 `.app` Bundle 生成真实应用图标；失败时再尝试 Bundle 内已知图标资源，最后回退 `app.getFileIcon()`，renderer 不接收 Bundle path。
- renderer 只传稳定的 tool id 和当前 workspaceRoot，不传任意命令或应用路径。
- macOS 使用系统 `open` / Electron shell 能力，不拼接 shell 字符串。
- 不可用的第三方应用在菜单中禁用并标记 `Not installed`；Finder 与 Terminal 视为系统能力。
- 上次选择存 renderer localStorage。若该应用后来不可用，主按钮回退到 Finder，并提示用户重新选择。
- 打开失败只影响该次动作，不改变当前 session workspace。
- 编辑器分体按钮使用连续圆角胶囊，主按钮与 chevron 之间不绘制竖向分割线；菜单和主按钮都使用原生 App 图标，只有图标读取失败时才回退中性线性图标。

## 进程与安全边界

```text
renderer UI
  -> typed preload IPC
    -> main workspace environment service
      -> validated workspace directory
      -> execFile("git", argv, { cwd }) / execFile("/usr/bin/open", argv)
```

- renderer 不能直接访问文件系统、执行 Git 或打开任意绝对路径。
- main 对每次请求重新解析 workspace，并确认目标既是存在的目录，也是 workspace registry / session 已登记的工作区；renderer 不能把任意本机目录临时提升为 Git 写操作目标。
- Git 和 `open` 使用参数数组，不使用 shell，不接受 renderer 传入的 raw argv。
- Git stdout/stderr 设置上限和 timeout；错误正文裁剪并去除绝对路径等不必要细节后再返回 renderer。
- 分支名交给 Git 自身校验；commit message 作为单个 `-m` 参数传入，不做 shell 转义拼接。
- 本功能不修改 Git 用户身份、remote URL、credential helper、hooks 或 `.git/config`，唯一例外是 `push -u` 由 Git 写入当前分支 upstream。

## 状态与并发

- popover 每次打开时刷新环境状态，workspace 变化时清空旧状态。
- create branch、commit 和 push 同一时间只允许一个进行中的 Git mutation。
- mutation 进行中禁用重复动作，并显示动作级 loading 文案。
- mutation 完成后统一触发 Review Coordinator invalidation，Environment、Composer summary 和已打开 Review Workbench 消费同一新 generation，不再依赖下一次打开 tab 时递增 refresh key。
- Agent 正在运行不自动禁止 Git 操作；Git 是否可执行由真实 repository 状态决定。但 UI 必须避免用户连点产生并发写操作。

## 视觉与交互

- popover 使用 12px 圆角、主题 surface、hairline border 和低透明柔和阴影。
- Environment 每行高度约 32px，section 使用紧凑上下 padding，图标 14–16px，正文 13px；通过分隔线分组，不堆叠大卡片。
- Git action panel 宽约 420px，输入与动作使用受控密度；浮层通过顶层 overlay / portal 呈现，不能被 Environment 的圆角 overflow 裁切。
- 普通行、selected、hover 使用中性灰阶；只有变更 additions/success 使用 operational/success，deletions/error 使用 danger。
- Commit 主确认按钮使用 ink action，不使用 operational green。
- icon-only 入口必须同时提供 `aria-label` 和统一 Tooltip。
- popover、菜单和模态窗口支持键盘导航、外部点击关闭、`Escape` 关闭与 focus restore。
- 浅色、深色和 system 两个实际分支都消费语义 token，禁止新增主题不感知颜色字面量。

## 错误与空状态

- Git 不存在：显示 `Git is not available on this Mac`。
- 非 Git repository：Changes 和 Commit/Push 不可用；允许用户通过现有 Review 空态显式初始化 Git。
- detached HEAD：允许查看 Changes；统一 Git panel 通过 `New branch` 在提交前创建分支，独立 Push 仍不可用。
- clean workspace：Changes 显示 Clean，Commit disabled。
- 无 remote：Push 返回 `No Git remote configured`。
- 多 remote：要求选择 remote。
- 认证、hook、远端拒绝：显示裁剪后的原始语义，不把 stderr、命令或本机敏感路径完整写入 UI。

## 首版不做

- Pull Request、Compare branch、远端 PR 状态。
- Pull、fetch、rebase、merge、force push。
- 远端分支浏览，以及分支删除、重命名。
- 自动 stash、force switch，或切换前自动提交工作区。
- 逐文件 stage / unstage、amend、签名选项、跳过 hooks。
- 基于模型或 diff 的智能 commit message 生成。
- 修改 remote、Git identity 或 credential 配置。

## 验收要求

- 普通仓库显示 This Mac，Git worktree 显示 Worktree。
- main、feature branch 和 detached HEAD 三种状态显示正确。
- 当前分支行能搜索和切换本地分支；其他 worktree 占用分支显示但不可切换。
- 未提交改动阻止切换时保留原分支和文件内容，并提供可恢复错误。
- Create branch 能校验非法名称、创建真实分支并刷新 UI。
- Commit 默认提交全部 tracked/untracked/deleted changes；取消 Include unstaged 后只提交 staged changes；空 message 使用本地默认 message。
- upstream、单 remote、多个 remote、无 remote 四种 Push 路径行为明确。
- Commit succeeded / Push failed 能被分别表达。
- 编辑器菜单能检测并打开可用工具，选择偏好可恢复。
- VS Code、Cursor、Finder、Terminal、iTerm2 在 macOS 上优先展示真实应用图标；主按钮与 chevron 之间没有竖线。
- Sources 从真实会话附件派生并去重。
- `480 / 820 / 1120 / 1440px` 顶栏不重叠，popover 不越出窗口。
- 浅色、深色、system-light、system-dark 的 hover、focus、disabled、loading、success、danger 可读。
- 工程验证覆盖 shared、main、preload、renderer；真实 Electron 验收覆盖应用图标、Environment 密度、分支状态和统一 Git panel，不在用户仓库执行真实 Commit / Push。
