# Workspace、Git Branch 与 Worktree 执行上下文规范

> 2026-10-06：09 输入框优化实施后改写「Initial Composer 信息架构」「运行位置菜单」「Follow-up 状态行」，删除 Cloud / Remote SSH 占位。设计稿 `docs/desktop-frontend-refactor/demo/composer-run-target-demo.html`。
>
> 2026-09-09 文案更新：日常界面展示名称以[中文文案规范](front-desktop-chinese-ui.md)为准；保留 Chat、Plan、Thinking、Effort 和工具执行展示。本文英文名称仍可用于指代内部概念，协议与行为不变。

## 定位

初始 Composer 顶部的 `工作区 → 分支 → 运行位置`（Workspace → Branch → Run on） 不是三个互不相关的装饰性下拉框，而是一组连续的执行上下文选择器。它需要在用户发送首条消息前回答三个问题：

1. Agent 服务哪个长期项目。
2. Git 操作以哪个分支为当前或起始基线。
3. Agent 在原目录还是隔离 worktree 中运行。

本规范定义 Workspace、Git branch、本机（`This Mac`）、新建工作树（`New Worktree`）和远端机器的产品语义、视觉结构、状态模型、持久化边界与失败恢复。远端 Host 的接入（WSS / SSH、配对）见[Host 指南](../agent-plugin-runtime/agent-host-guide.md)，运行位置菜单里的远端机器子菜单列出已配置的 Host。

## 设计目标

- 保持初始 Composer 轻量，不把代码托管、远端运行和 worktree 管理一次性铺满。
- 让用户在开始任务前清楚知道 Agent 将在哪个目录和分支上工作。
- 使用 worktree 提供可解释的任务隔离，同时不污染 Workspace Recents。
- Git 或 worktree 操作必须可观察、可恢复，不能静默切分支、stash、覆盖或删除用户内容。
- 会话开始后仍能持续确认 branch、运行位置和 worktree 路径。

## 非目标

- 本机 worktree 模块不承担 Cloud Runner、远端克隆或工作区上传；远端连接归 Host 客户端模块。
- 不实现完整 Git 客户端，不提供 commit、merge、rebase、push、pull 或冲突解决 UI。
- 不实现 worktree 删除、批量清理、重命名和长期管理页。
- 不自动复制原目录的未跟踪文件、`.env`、依赖目录或未提交改动到 worktree。
- 不自动 stash、discard、force switch 或删除已有分支。

## 核心概念

### Workspace

Workspace 是用户长期识别的项目入口，由 workspace registry 持久化。它包含稳定 `workspaceId`、显示名称和原始目录路径。

Workspace Recents 只展示用户显式使用过的长期目录。ActSpace 创建的 worktree 不注册为新的顶层 Workspace，也不进入 Recents。

目录选择器成功返回 `{ canceled: false, workspaceRoot }`，取消或空选择返回 `{ canceled: true }`；Main handler 的返回值须显式符合 `SelectWorkspaceDirectoryResult`。普通非 Git 目录也可添加为 Workspace。侧栏添加工作区、使用已有目录、新建文件夹的父目录选择，以及扩展中选择源码目录共用这一契约。

### Execution Root

Execution Root 是当前会话中 Agent 文件工具和 Git 操作真正使用的目录：

- `This Mac`：原始 Workspace 目录。
- `Worktree`：为当前会话创建的隔离 worktree 目录。

Session 的 `workspaceRoot` 继续承担真实执行目录语义；`workspaceId` 继续指向原始长期 Workspace。两者在 worktree 会话中允许不同。

### Branch

Branch 在两种运行位置下含义不同：

- `This Mac`：目标检出分支。用户首次发送时才执行安全切换。
- `New Worktree`：创建 worktree 的 base branch。ActSpace 会从该分支当前提交创建新的任务分支。

界面必须通过当前运行位置和辅助文案区分这两种语义，不新增第四个常驻选择器。

Composer 初始选择器与后续状态行共用分支标签：有已知分支时显示分支名；仅 `ready` 且有 `detachedCommit` 时显示“分离的 HEAD”。非 Git、读取失败、Git 不可用或尚未加载时，不把分支缺失当作 detached HEAD。会话锁定本身不是分支证据；已知 worktree 分支在 Git context 缺省时仍可展示。

### Worktree Context

Worktree Context 是 Session 的可选执行元数据，至少包含：

```ts
type SessionWorktreeContext = {
  kind: "worktree";
  sourceWorkspaceRoot: string;
  workspaceRoot: string;
  baseBranch: string;
  branch: string;
  baseCommit: string;
  createdAt: string;
};
```

`sourceWorkspaceRoot` 表示原始 Workspace 路径，`workspaceRoot` 表示 Agent 实际运行路径。路径属于本地敏感信息，不进入公开 release、遥测或远端服务。

## Initial Composer 信息架构

运行目标行固定按以下顺序排列，三个都是无边框文字按钮（高 28px、`text-act-md text-text-muted`，hover / 打开时 `text-text-main bg-hover-overlay`，`rounded-act-sm`，12px chevron）：

```text
📁 actspace-agent ⌄     ⑂ main ⌄     💻 本机 ⌄
📁 actspace-agent ⌄     ⑂ main ⌄     ⑂ 新建工作树 ⌄
📁 api-server ⌄                      🖥 dev-box ⌄  ● 连接中
```

- 远端时没有分支按钮；工作区按钮列这台 Host 上的工作区；运行位置按钮显示 Server 图标和 Host 名，Host 没就绪时在右侧显示状态点和 readiness 短文案（见「运行目标 · readiness」）。
- Chat 不用工作区和分支：本机 Chat 不显示这一行，远端 Chat 只显示运行位置。
- 使用 Lucide 线性图标和现有语义颜色 token。
- Workspace chrome 的 Environment 入口使用 `Bookmark`，与 Workspace 文件夹入口和层级树入口保持语义区分。
- 普通选中态只使用中性灰阶和勾选，不使用 operational green。
- 三个菜单是 `ui/Menu`（Radix DropdownMenu），互斥；打开一个时关闭其它 Composer 浮层。键盘 ↑↓ 移动、→ 进子菜单、← 返回、首字母跳转、Esc 只关当前一层并把焦点还给按钮。
- 行可换行；菜单 portal 到 body，不会被行裁剪。
- 会话已经产生首条用户消息后，不再显示这组可编辑选择器；follow-up 状态行改为只读事实展示。

## Workspace 菜单

### 结构

```text
最近使用
  📁 actspace-agent            ✓
     ~/code/actspace-agent
  📁 wiki
     ~/notes/wiki
-------------------------
使用已有文件夹…
新建文件夹
```

- 「最近使用」最多展示 5 个长期 Workspace，每行是名称加 faint 小字的路径（第二行）；当前项打勾并是 `menuitemradio` 的 checked 状态，不只依赖颜色。
- 「新建文件夹」不关菜单，原地换成名称输入框和「创建」；输入框里的按键不触发菜单的首字母跳转。
- 远端时菜单标题是「{Host} 上的工作区」，列 Host 描述里的工作区（名称 + 路径）；描述没读到时写「等待 Host 工作区」，读到但为空时写「这台机器上还没有工作区」。没有「使用已有文件夹 / 新建文件夹」。
- 当前不提供 Workspace 搜索、重命名、移除、排序和 Cloud Repo。

### Use Existing

- 打开系统目录选择器。
- 用户确认后，把该目录注册或复用为 Workspace，并设为当前选择。
- 选择目录不立即创建会话，也不立即写当前 Session；首次发送时再落最终会话归属。
- 取消系统目录选择器不改变当前选择。

### New Folder

- 先打开父目录选择器，再显示文件夹名称输入框；或使用平台能力支持的新建目录流程。
- 名称不能为空，不允许路径分隔符；同名目录存在时显示就近错误，不覆盖已有目录。
- 创建成功后注册并选择该 Workspace。
- 不自动执行 `git init`。

## Branch 选择器

### 可见性

- Workspace 是有效 Git repository 且存在 `HEAD` 时显示。
- 非 Git Workspace 隐藏 Branch 入口，Workspace 与运行位置仍保留。
- Git 可执行文件缺失、目录不可访问或 Git 检查失败时，不伪装成非 Git；显示可恢复错误状态和重试入口。

### 菜单内容

- 只列出本地 branches，不在首版混入 remote-tracking branches。
- 顶部提供本地搜索，按 branch name 过滤，不发起网络请求。
- 当前检出分支显示勾选。
- detached HEAD 显示短 commit，例如 `Detached at a1b2c3d`，并允许用户选择已有本地 branch。
- 被其他 worktree 占用的 branch 可以显示，但必须标注 `In use`；在 `This Mac` 切换或作为新 worktree 的任务分支时不得错误复用。

### This Mac 下的切换时机

- 菜单选择只更新 renderer 中的待执行上下文，不立即修改磁盘。
- 用户首次发送时，main process 再校验 repository、当前 branch 和 working tree，然后执行安全的 `git switch <branch>`。
- 如果目标就是当前 branch，不执行多余命令。
- 如果 working tree 状态导致 Git 拒绝切换，保留用户输入并显示原因；不得自动 stash、force switch 或丢弃改动。
- 错误提示需要给出恢复路径，例如继续使用当前 branch 或改用 `New Worktree`。

### Worktree 下的 base branch

- 选择器显示要从哪个本地 branch 的当前提交创建 worktree。
- 创建时再次解析 commit，避免用户打开菜单后 repository 状态变化造成陈旧基线。
- 新 worktree 使用独立任务分支，不直接检出 base branch。

## 运行位置菜单

```text
💻 本机                         ✓
🖥 远端机器           dev-box   ›   ┐
-------------------------          │  ● dev-box               ✓
⑂ 新建工作树                        │  ○ home-nas         离线
   从 main 创建隔离分支              │  ● old-mac   需要重新配对
                                    │  ──────────────
                                    └  ＋ 连接新机器…
```

- 主菜单 240px：本机 ／ 远端机器 ›（右侧写当前 Host 名）／ 分隔 ／ 新建工作树（第二行说明）。本机为默认值。
- **远端机器子菜单** 260px（窄窗下按可用宽度收窄），hover 或 → 打开。Host 行依次是状态点（connected 绿点、连接中黄点闪烁、离线空心圈、需要重新配对 / 版本不兼容红点）、名称、右侧状态文字（只在非 connected 时显示）、当前 ✓；底部「＋ 连接新机器…」打开 设置 › Agent 服务器。Host 达到 5 台时顶部有「搜索机器」：打开即聚焦，字母和 ← 只给搜索框，↓ 进入列表，没有结果时写「没有匹配的机器」。
- **没有 Host** 时第二项是「连接远端机器…」，点击打开 设置 › Agent 服务器。
- 不可用的 Host 也能选中：草稿照常编辑，发送按 readiness 禁用并在 tooltip 说明原因。选「本机」会同时离开远端 Host。
- **新建工作树** 读 `capabilities.newWorktree`：Workspace 是带有效 `HEAD` 的 Git repository 时可用，第二行写「从 {branch} 创建隔离分支」；Git repository 尚无首次提交时禁用并写「需要先创建提交」（Branch 仍只显示 symbolic branch 名称，本机可以直接运行）；非 Git Workspace 禁用并写「当前工作区不是可用的 Git 仓库」；远端禁用并写「远端机器暂不支持」。禁用项保留在菜单里，帮助用户理解能力边界。
- ActSpace 不为启用 Worktree 自动创建首次提交，也不使用 `git worktree add --orphan` 复制当前 Index；后者会得到独立的空 Index，不代表当前 staged workspace。
- 没有「云端 / 远程 SSH · 即将推出」占位：远端机器就是已配置的 Host（WSS 或 SSH 接入）。
- 选中状态、disabled 及其原因、子菜单都必须被屏幕阅读器正确宣布（`menuitemradio` + `aria-checked`、`aria-disabled`、`aria-haspopup`）。

## New Worktree 创建流程

### 延迟创建

选择 `New Worktree` 只改变待执行上下文，不立即创建目录。真正创建发生在用户首次发送消息后、Agent turn 启动前。

这样可以避免用户浏览菜单或改变主意时遗留未使用 worktree。

### 默认命名

- 任务标识：8 位数字，例如 `92803054`。
- 自动分支：`actspace/92803054`。
- worktree 目录：`<userData>/worktrees/92803054/<repository-name>`。
- 分支或目录冲突时重新生成标识，不覆盖现有路径或分支。
- V1 不要求用户填写分支名；未来可以在高级入口支持可编辑 slug。

`actspace/` 明确表示分支来源，避免照搬其它产品的 `cursor/` 或 `codex/` 命名空间。

### 当前接线边界

当前 renderer 在 Task 接纳前经 `setSessionWorkspace` 设置空闲会话的工作区，再通过 `submitTask` 提交内容；模式和模型配置分别经会话模式接口与 Task configuration 管理。

2026-10-07 B12修复将新建页的 `runLocation` / `branch` 经 `sessions.create` 传给主进程：先准备真实Git目录，再以该cwd建立Session，最后提交Task。新建按钮在首次发送前只保留选择，不提前绑定本机会话。工作树事实写入Journal header的可选 `worktree` 字段，经Runtime快照、全局列表与client投影恢复；旧header无该字段仍按普通目录读取。创建失败保留输入，回滚本次准备资源，不提交Task；已有工作树会话禁止变更执行根。真实桌面结果见[修复执行摘要](../../exec-runs/20261007-desktop-acceptance-b03-b08-b12/execution-summary.md)。

### 原目录未提交内容

Worktree 基于 commit 创建，原目录中的以下内容不会自动进入新 worktree：

- unstaged 或 staged 但未提交的修改。
- untracked 文件。
- 未提交的 `.env`、本地配置和依赖目录。

选择 `New Worktree` 后，菜单或发送前提示应简短说明这一点。V1 不复制这些内容，也不提供勾选式迁移。

### 创建失败

- 用户输入必须保留，Composer 不进入已发送状态。
- 错误显示在执行上下文行或 Composer 附近，并通过 `role="alert"` 宣布。
- 错误必须包含原因和恢复动作，例如重试、选择其它 base branch 或切回 `This Mac`。
- 首轮准备失败且 user event 尚未持久化时，Renderer 必须恢复原输入和附件并显示错误；若同 Turn 的 user event 已持久化，则从 Session 恢复真实记录，避免把同一输入重复放回 Composer。
- 创建了一半但校验失败时，只允许清理本次调用明确创建且尚未承载用户内容的目标；不得删除既有目录、既有 branch 或其它 worktree。
- 失败不能启动 Agent，也不能把不完整 worktree 写成 Session execution root。

## Created Worktree 消息展示

以下过程块仍是展示目标。本轮B12完成目录创建、持久绑定与状态行恢复，未新增独立的准备事件或过程块。

Worktree 创建成功后，在当前 turn 的用户消息之后、Thinking 或工具过程之前显示一条可展开系统过程块：

```text
Created worktree
```

展开内容示例：

```text
Preparing worktree from main at a1b2c3d
Created branch actspace/92803054
Worktree created at .../worktrees/92803054/actspace-agent
Environment setup: none
```

- 默认折叠，只占一行；使用中性 completed 样式，不整块染绿。
- 支持复制完整路径；路径默认在视觉上缩略。
- 创建超过 `300ms` 时显示 `Creating worktree...` 运行状态。
- 运行状态可以使用克制的 operational indicator；完成后回到中性灰阶。
- 事件必须持久化，切换会话或重启后仍能恢复相同展示。
- `Environment setup: none` 明确表示 V1 不自动安装依赖或复制环境。

建议事件契约：

```ts
type WorkspacePreparationPayload = {
  kind: "worktree";
  status: "completed";
  sourceWorkspaceRoot: string;
  workspaceRoot: string;
  baseBranch: string;
  branch: string;
  baseCommit: string;
  durationMs: number;
  environmentSetup: "none";
};
```

运行中的短暂状态通过 runtime stream event 表达；只有完成事实进入 `sessions-v2/<sessionId>/journal.jsonl`。失败发生在消息正式提交前，走 Composer 就近错误，不写伪完成事件。

## Follow-up 状态行

```text
⑂ main · 💻 本机                               [权限]   ◔ 42%
⑂ actspace/92803054 · ⑂ 工作树                 [权限]   ◔ 42%
🖥 dev-box · 📁 api-server                      [权限]   ◔ 42%
🖥 dev-box · ● 连接中                           [权限]       —
```

- 分支、运行位置、Host 和工作区都是只读会话事实：没有 `⌄`，不是按钮。可点的只有权限控件和 context 用量。
- `工作树` hover / focus 显示原 Workspace 和 base branch。
- 远端：Host 名可聚焦，hover / focus 用 tooltip 显示连接状态和工作区路径。Host 没就绪且有 readiness 短文案时，第二段换成状态点 + 文案，context 用量显示 `—`（不可点）。
- Chat 会话的状态行只有 context 用量。
- 状态不能只靠图标或颜色表达。
- 不允许在已有 turn 的会话中切换 Workspace、branch、运行位置或 Host；用户需要创建新会话。

## 运行目标（本机与远端）

> 2026-10-06 按[计划 15](../../exec-plans/completed/20261005-desktop-frontend-refactor/15-运行目标执行计划.md)实施，设计来源是 [03 运行目标抽象](../../desktop-frontend-refactor/03-运行目标抽象-本机与远端.md)。代码在 `apps/desktop/src/renderer/target/`。

上文的 Workspace、Branch、Worktree 都是本机运行目标的属性。远端 Host 是另一种运行目标。组件不再判断 `hostId` 或 `host:` 前缀，只读下面几个值。

### 会话定位（locator）

- 远端会话的 key 是 `host:` 加 `base64url(JSON.stringify([hostId, sessionId]))`。编码和解码只有一份，在 `packages/shared/src/session-locator.ts`（`encodeSessionLocator` / `decodeSessionLocator`），main 和 renderer 共用。
- 解码是严格的：不以 `host:` 开头时返回 null（本机会话）。以 `host:` 开头但形状、类型、长度（不超过 128）或 round-trip 任何一项不符，就抛 `InvalidSessionLocatorError`。
- renderer 用 `locateSession(key)`，返回 `local`、`remote { hostId, sessionId }` 或 `invalid { key }`。它不抛错，以免渲染时白屏。损坏的 key 不按本机处理，本机专属能力都不能用在它身上（`isLocalSession` 对它返回 false）。

### RunTarget 与 capabilities

```ts
type RunTarget =
  | { kind: "local"; workspaceRoot?: string; branch?: string; worktree?: SessionWorktreeContext }
  | { kind: "remote"; hostId: string; hostName: string; workspaceId?: string; workspaceName?: string }
  | { kind: "invalid"; key: string };
```

- `useRunTarget({ sessionId, sessionWorkspacePath, locked, local })` 得出当前会话或新建页的 `target`、`capabilities`、`readiness` 和 `choices`。App 经 `RunTargetContext` 交给 WorkbenchLayout、ConversationView 和 Composer，不再逐层传。
- 已有会话的目标由会话决定，不能再改（`locked`）。新建页的 Host 和远端工作区是 `useRunTarget` 内的本地选择，换 Host 时远端工作区回到该 Host 的第一个。
- `capabilitiesOf(target, { gitStatus })` 是唯一的能力表。每项都是 `{ enabled, reason? }`，禁用时 `reason` 说明原因：

| 能力 | 本机 | 远端 | 损坏的 key |
| --- | --- | --- | --- |
| `newWorktree` | Git 状态为 ready 时可用，否则「当前工作区不是可用的 Git 仓库」 | 「远端机器暂不支持」 | 「会话标识损坏」 |
| `branchSwitch` | Git 状态为 ready 或 no_head 时可用 | 同上 | 同上 |
| `localFileOpen` | 可用 | 同上（打开文件改为经 Host 下载） | 同上 |
| `terminal` | 可用 | 同上 | 同上 |
| `review` | 可用 | 同上 | 同上 |
| `attachments` | 只收图片 | 图片和文件都收（经 Host 上传） | 都不收 |

- 远端支持某项能力时，只改这张表。

### readiness

`ready` 当且仅当可以发送。其余状态都附带原因，界面不再只显示「未就绪」：

| 状态 | 含义 |
| --- | --- |
| `connecting` | Host 列表还没读到，或 Host 正在连接 |
| `offline` / `revoked` / `incompatible` | 直接对应 Host 的连接状态 |
| `removed` | 会话属于已删除的 Host，或会话 key 损坏 |
| `describing` / `describe-failed` | 已连接，正在读取或未能读取 `host.describe` |
| `host-unavailable` | Host 报告 `draining`（正在停止）或 `blocked`（恢复上次的任务时出错），暂不接受新任务 |
| `workspace-missing` / `model-missing` | 会话记下的工作区或模型在 Host 上已不存在 |

- 判断顺序和文案见 `readiness.ts` 的 `resolveReadiness` / `describeReadiness`，文案以 [06 §4.5](../../desktop-frontend-refactor/06-Composer与运行目标交互重设计.md) 为准。
- 未就绪时草稿照常编辑，发送按钮 disabled，tooltip 和状态行显示原因。

### HostDirectory

- `target/host-directory.ts` 的 `hostDirectory` 是整个窗口唯一的 Host 列表和 Host 事件订阅。第一个使用者出现时开始订阅，最后一个离开时释放。
- 快照包含 `hosts`、`descriptions`、`describeErrors`、`describing`、`loaded`、`listError`。Host 变为已连接时自动 describe，失败原因记在 `describeErrors`，readiness 据此显示 `describe-failed`。
- `onHostsChanged` 和 `onHostRemoved` 供侧栏刷新、重连补齐和 Host 移除时的清理使用。Host 移除后，它的会话仍留在侧栏，显示为「远端 · 未连接」；本地状态被释放。

### 远端会话的本地记录

Host 协议不返回会话的 `workspaceId`，本轮也不改协议。renderer 在本地记录：

- `localStorage["actspace:remote-session-prefs"]`：`{ [sessionKey]: { workspaceId?, modelId?, recordedAt } }`。
  - 建远端会话时，写入所选的工作区和模型。
  - 没有记录的旧会话，按会话 meta 里的路径反查一次并写回，之后不再反查。
  - 会话被 evict 时删除对应条目。
- `localStorage["actspace:new-session-model:<hostId>"]`：新建页在这台 Host 上上次选的模型。
- 记录的模型在 Host 上已没有时，回落为 Host 的默认模型。
- 旧的 `actspace:remote-models` 在启动时迁移一次：会话条目进 prefs，`new:<hostId>` 进新建页记录，不覆盖已有记录，然后删除旧 key。

### 发送与审批

- renderer 的 `R/session/session-gateway.ts` 负责建会话（按 `target.kind` 带 `hostId` 和工作区）、pending 记录、configure 和 submit。远端目标没有 ready 时，它拒绝发送。
- main 的 `M/session-gateway.ts` 是 fixed IPC 的中间件，负责远端分流：
  - 带 `hostId` 的建会话和审批决定交给远端；
  - 能解出远端 key 的请求交给远端；
  - 其余请求先走本地，再合并远端的列表结果。
- 审批事件和 pending 列表带 `hostId`，由 main 的 desktop-adapter 拼出。renderer 提交审批决定时，从当前会话的 RunTarget 取 `hostId`，不解析审批 id。

## Session 与存储边界

### Session Meta

Session 需要保留原 Workspace 身份和真实执行根：

```ts
type SessionMeta = {
  workspaceId?: string;
  workspaceRoot?: string;
  worktree?: SessionWorktreeContext;
};
```

- 普通会话：`workspaceRoot` 等于 Workspace registry path，`worktree` 缺省。
- Worktree 会话：`workspaceId` 仍指向原 Workspace，`workspaceRoot` 是 worktree path，`worktree.sourceWorkspaceRoot` 是 registry path。
- 旧 Session 缺少 `worktree` 时按普通目录兼容，不进行破坏性迁移。

### Workspace Registry

- Registry 不记录 ActSpace 临时 worktree item。
- Recents 的最近时间来自长期 Workspace 使用，不因每个 worktree Session 创建重复项目。
- 删除或失效的原 Workspace 不自动删除历史 Session；恢复时显示路径失效状态。

### 生命周期

- V1 worktree 不自动删除，避免在会话仍需回看或继续工作时丢失文件。
- V1 不因归档或删除 Session 自动运行 `git worktree remove`。
- 后续管理能力必须先设计“脏 worktree、未推送 commit、branch 占用和恢复”策略，再提供清理入口。

## 安全与可靠性

- 所有 Git 命令只在 main process 的专用 service 中执行，renderer 不直接运行命令或访问文件系统。
- Git 参数使用 `execFile` 参数数组，不通过 shell 拼接 branch 或 path。
- Workspace 和 worktree 路径必须解析为绝对路径，并验证目标目录边界和 repository identity。
- 自动分支必须校验合法 ref name。
- 禁止覆盖现有 path、branch 或已注册 worktree。
- 日志和 UI 错误不得包含无关 Git stderr、环境变量或凭据；只返回脱敏且可恢复的信息。
- worktree 创建是显式用户选择触发的本机文件系统写操作；UI 在发送前应清楚显示 `New Worktree` 状态。

## 可访问性与键盘交互

- 选择器使用 button + menu 语义（`ui/Menu`），包含 `aria-expanded`、`aria-haspopup` 和 `menuitemradio` 的 checked 状态。
- 打开菜单后焦点进入菜单（Host 搜索框出现时进入搜索框）；Escape 只关当前一层并回到触发按钮。
- 上下方向键移动选项，Enter 选择；disabled 项跳过且说明原因。
- 异步 Git 检查和 worktree 创建使用 `aria-live="polite"`；失败使用 `role="alert"`。
- 完整路径不能只依赖 hover，键盘 focus 时也能通过 tooltip 或说明读取。
- 动效使用现有 motion token，并尊重 `prefers-reduced-motion`。

## 响应式与视觉规则

- 菜单使用现有 `surface-raised`、`border`、`shadow-act-popover` 和文本 token，不新增硬编码颜色。
- 普通 completed 状态使用 muted / faint；running 才使用 operational green；失败使用 danger 语义且配合文字。
- 菜单宽度：Workspace `260px`（远端 `280px`），Branch `300px`，运行位置 `240px`，远端机器子菜单 `260px`。
- 菜单高度受 viewport 限制；Recents 和 branches 超出后在菜单内部滚动。
- 初始 Composer 的三个菜单默认从触发按钮下方展开，碰撞时由 Radix 翻转或平移。
- 480px 窄窗下菜单不得超出 viewport；远端机器子菜单两侧都放不下时按可用宽度收窄。
- hover、focus、pressed 不改变控件尺寸，不造成上下文行抖动。

## 验收矩阵

| 场景 | 预期结果 |
| --- | --- |
| 普通 Git Workspace | 显示 Workspace、当前 branch、本机 |
| Git Workspace 尚无首次提交 | Branch 只显示 symbolic branch 名称；本机可运行；新建工作树禁用并显示「需要先创建提交」 |
| 非 Git Workspace | 隐藏 Branch；新建工作树禁用并说明「当前工作区不是可用的 Git 仓库」 |
| Git 缺失或检查失败 | 显示可恢复错误，不伪装成非 Git |
| 选择其它 branch 后取消 | 磁盘不发生变化 |
| This Mac 首次发送并成功切换 | Session 和状态行显示真实 branch |
| 脏目录阻止 branch switch | 保留输入，显示原因，可改用 New Worktree |
| New Worktree 首次发送成功 | 创建独立 branch/path，展示 Created worktree，再启动 Agent |
| Worktree 创建冲突 | 不覆盖已有内容，保留输入并给出重试路径 |
| 重启恢复 Worktree Session | 状态行与 Created worktree 事件保持一致 |
| 480px 窄窗 | 选择行按需换行，三个入口、菜单和远端机器子菜单都在窗口内 |
| 选远端 Host | 分支按钮消失；工作区列 Host 工作区；Host 未就绪时运行位置按钮带状态点和文案，发送禁用并说明原因 |
| 没有 Host | 运行位置菜单第二项为「连接远端机器…」，打开 设置 › Agent 服务器 |
| 对话中 | 状态行没有下拉；无法从任何入口切换机器 |
| 浅色 / 深色 | 边框、选中、disabled、running、error 均可辨认 |

## 已确认决策

- 2026-07-29：Workspace 菜单首版只保留 Recents、Use Existing 和 New Folder。
- 2026-07-29：非 Git 项目不显示 Branch 选择器。
- 2026-07-29：`Local` 统一改为 `This Mac`（界面文案「本机」）；Cloud 和 Remote SSH 只做禁用占位（2026-10-06 由 09 删除，换成「远端机器 ›」）。
- 2026-07-29：Worktree 在首次发送时延迟创建，不在选择菜单时立即落盘。
- 2026-07-29：自动分支使用 `actspace/<8位数字>`，不复用其它产品命名空间。
- 2026-07-29：ActSpace worktree 不进入 Workspace Recents；Session 保留原 Workspace 身份和独立 execution root。
- 2026-07-29：Worktree V1 不自动清理，不自动复制原目录未提交内容或环境。
- 2026-07-29：初始执行上下文菜单使用独立的向下展开定位，选择器行保持 overflow visible；Workspace Recents 首版限制为 5 项。（2026-10-06：菜单换成 `ui/Menu`，portal 到 body，不再依赖 overflow visible。）
- 2026-07-29：Workspace registry 的读取修复与路径注册按事务串行执行，每次原子写使用唯一临时文件，避免并发 rename 竞争和丢失更新。
- 2026-10-06：运行目标统一为 `RunTarget` + `capabilities` + `readiness`（计划 15）；远端会话的 `workspaceId` 和模型由 renderer 本地记录，不改 Host 协议；远端会话禁用新建工作树并说明原因。
- 2026-10-06：09 输入框优化：运行目标行改为三个无边框文字按钮和 `ui/Menu`；运行位置菜单为「本机 / 远端机器 › / 新建工作树」，Host ≥ 5 台时子菜单带搜索，无 Host 时为「连接远端机器…」；不可用的 Host 可选、发送按 readiness 禁用；对话中状态行只读。
