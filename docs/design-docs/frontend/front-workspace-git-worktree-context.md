# Workspace、Git Branch 与 Worktree 执行上下文规范

新会话顶部的 `工作区 → 分支 → 运行位置` 是一组连续的执行上下文选择器，要在用户发送首条消息前回答三件事：Agent 服务哪个长期项目；Git 以哪个分支为基线；Agent 在原目录、隔离 worktree 还是远端机器里运行。本规范定义它们的产品语义、结构、状态模型、持久化边界和失败恢复。远端 Host 的接入（WSS / SSH、配对）见 [Host 指南](../agent-plugin-runtime/agent-host-guide.md)；Composer 整体见 [front-聊天输入框规范.md](front-聊天输入框规范.md)。

## 原则与非目标

- 初始 Composer 保持轻量，不一次铺满代码托管、远端运行和 worktree 管理。
- 用户开始任务前清楚知道 Agent 在哪个目录、哪个分支上工作；会话开始后仍能确认。
- Git 或 worktree 操作必须可观察、可恢复，不静默切分支、stash、覆盖或删除用户内容。
- 不做：完整 Git 客户端（commit / merge / rebase / push / pull / 冲突解决）；worktree 删除、批量清理、重命名和管理页；自动复制原目录未跟踪文件、`.env`、依赖目录或未提交改动到 worktree；自动 stash / discard / force switch / 删除分支；Cloud Runner 与云端占位（远端就是已配置的 Host）。

## 核心概念

- **Workspace**：用户长期识别的项目入口，由 workspace registry 持久化（稳定 `workspaceId`、显示名、原始目录）。Recents 只展示用户显式使用过的长期目录；ActSpace 创建的 worktree 不注册为顶层 Workspace，也不进 Recents。目录选择器返回 `{ canceled: false, workspaceRoot }` 或 `{ canceled: true }`（`SelectWorkspaceDirectoryResult`），侧栏添加工作区、使用已有目录、新建文件夹的父目录、扩展选源码目录共用这一契约；非 Git 目录也可添加。
- **Execution Root**：Agent 文件工具和 Git 操作真正使用的目录——本机是原目录，worktree 是会话专属目录。Session 的 `workspaceRoot` 是真实执行目录，`workspaceId` 指向原长期 Workspace，二者在 worktree 会话里可以不同。
- **Branch**：本机下是目标检出分支（首次发送时才安全切换）；新建工作树下是创建 worktree 的 base branch（从其当前提交创建新任务分支）。靠当前运行位置和辅助文案区分语义，不新增第四个选择器。分支标签：有已知分支显示分支名；仅 `ready` 且有 `detachedCommit` 才显示「分离的 HEAD」（`composer-run-context.ts`）；非 Git、读取失败、Git 不可用或未加载时不把缺失当作 detached；已知 worktree 分支在 Git context 缺省时仍可显示。
- **Worktree Context**：Session 的可选执行元数据 `SessionWorktreeContext { kind: "worktree"; sourceWorkspaceRoot; workspaceRoot; baseBranch; branch; baseCommit; createdAt }`，写在 Journal header 的可选 `worktree` 字段，旧 header 没有该字段按普通目录读取。路径属于本地敏感信息，不进公开 release、遥测或远端服务。

## 新会话运行目标行

三个无边框文字按钮（高 28px、`text-act-md text-text-muted`，hover / 打开时 `text-text-main bg-hover-overlay`，`rounded-act-sm`，12px chevron），顺序固定，可换行：

```text
📁 actspace-agent ⌄     ⑂ main ⌄     💻 本机 ⌄
📁 actspace-agent ⌄     ⑂ main ⌄     ⑂ 新建工作树 ⌄
📁 api-server ⌄                      🖥 dev-box ⌄  ● 连接中
```

- 远端时没有分支按钮；工作区列这台 Host 的工作区；运行位置显示 Server 图标和 Host 名，Host 未就绪时右侧显示状态点和短文案（见「运行目标」）。Chat 不用工作区和分支：本机 Chat 不显示这一行，远端 Chat 只显示运行位置。
- 三个菜单是 `ui/Menu`（Radix DropdownMenu），互斥，portal 到 body；键盘 ↑↓ 移动、→ 进子菜单、← 返回、首字母跳转、Esc 只关当前一层并把焦点还给按钮。普通选中态只用中性灰阶 + 勾选，不用 operational green。
- 会话产生首条用户消息后不再显示可编辑选择器，follow-up 状态行改为只读事实。选择只更新待执行上下文，不立即改磁盘，也不立即建会话。

### Workspace 菜单

- 「最近使用」最多 5 个长期 Workspace（`RECENT_WORKSPACE_LIMIT`），每行名称 + faint 小字路径，当前项打勾（`menuitemradio` + `aria-checked`）；之后是「使用已有文件夹…」「新建文件夹」。无搜索、重命名、移除、排序。
- 使用已有文件夹：打开系统目录选择器，确认后注册或复用为 Workspace 并设为当前选择；取消不改变选择。
- 新建文件夹：不关菜单，原地换成名称输入框和「创建」（输入框内按键不触发首字母跳转）；名称不能为空、不允许路径分隔符，同名目录存在时就近报错不覆盖；成功后注册并选择；不自动 `git init`。
- 远端时菜单标题是「{Host} 上的工作区」，列 Host 描述里的工作区（名称 + 路径）；没读到写「等待 Host 工作区」，读到为空写「这台机器上还没有工作区」；没有「使用已有 / 新建文件夹」。

### Branch 菜单

- Workspace 是带有效 `HEAD` 的 Git 仓库时显示；非 Git 隐藏；Git 缺失或检查失败不伪装成非 Git，显示可恢复错误与重试。
- 菜单（宽 300px、最高 320px）标题「分支」，只列本地分支，当前项勾选；不含 remote-tracking 分支，没有搜索，没有「In use」标注（被其他 worktree 占用的分支由创建 / 切换时的 Git 校验拒绝）。
- 本机：首次发送时 main 再校验仓库、当前分支和 working tree，执行安全 `git switch`；目标即当前分支不执行命令；Git 拒绝时保留输入并给出恢复路径（继续用当前分支或改用新建工作树），不自动 stash / force。
- 新建工作树：选择的是要从哪个本地分支当前提交创建 worktree；创建时重新解析 commit，避免陈旧基线；新 worktree 用独立任务分支，不直接检出 base branch。

### 运行位置菜单

```text
💻 本机                         ✓
🖥 远端机器           dev-box   ›   ┐
-------------------------          │  ● dev-box               ✓
⑂ 新建工作树                        │  ○ home-nas         离线
   从 main 创建隔离分支              │  ● old-mac   需要重新配对
                                    │  ──────────────
                                    └  ＋ 连接新机器…
```

- 主菜单 240px：本机（默认）／ 远端机器 ›（右侧写当前 Host 名）／ 分隔 ／ 新建工作树（第二行说明）。选「本机」同时离开远端 Host。
- 远端机器子菜单（宽 `min(260px, 可用宽度)`，hover 或 → 打开）：行依次是状态点（connected 绿、连接中黄闪烁、离线空心圈、需重新配对 / 版本不兼容红）、名称、非 connected 时的状态文字、当前 ✓；底部「＋ 连接新机器…」打开 设置 › Agent 服务器。Host 达到 5 台时顶部有「搜索机器」：打开即聚焦，字母和 ← 只给搜索框，↓ 进列表，无结果写「没有匹配的机器」。没有 Host 时第二项是「连接远端机器…」，打开同一设置页。
- 不可用的 Host 也能选中：草稿照常编辑，发送按 readiness 禁用并在 tooltip 说明原因。
- 新建工作树读 `capabilities.newWorktree`：Git 仓库有有效 `HEAD` 时可用，第二行「从 {branch} 创建隔离分支」；尚无首次提交禁用并写「需要先创建提交」（Branch 仍显示 symbolic 名称，本机可直接运行）；非 Git 禁用并写「当前工作区不是可用的 Git 仓库」；远端禁用并写「远端机器暂不支持」。禁用项保留在菜单里。ActSpace 不为启用 worktree 自动创建首次提交，也不用 `git worktree add --orphan`（它得到独立空 Index，不代表当前 staged workspace）。
- `menuitemradio` + `aria-checked`、`aria-disabled`、`aria-haspopup` 都要被屏幕阅读器正确宣布。

## 新建工作树

- 延迟创建：选择只改变待执行上下文；用户首次发送后、Agent turn 启动前才创建，避免浏览菜单留下未使用 worktree。renderer 把新建页的 `runLocation` / `branch` 经 `sessions.create` 交给主进程：先准备真实 Git 目录，再以该 cwd 建立 Session，最后提交 Task；已有 worktree 会话禁止变更执行根。
- 命名：任务标识 8 位数字（如 `92803054`）；分支 `actspace/92803054`；目录 `<userData>/worktrees/92803054/<repository-name>`；分支或目录冲突时重新生成标识，不覆盖现有路径或分支；不要求用户填写分支名。`actspace/` 明示来源，不照搬其它产品命名空间。
- 原目录的未提交修改、untracked 文件、`.env` 与依赖目录不会进入新 worktree，选择新建工作树后菜单或发送前提示应简短说明；不提供勾选式迁移。
- 失败：用户输入保留，Composer 不进入已发送状态；错误显示在执行上下文行或 Composer 附近，`role="alert"`，含原因和恢复动作（重试、换 base branch、切回本机）。首轮准备失败且 user event 尚未持久化时恢复原输入和附件；同 Turn 的 user event 已持久化时从 Session 恢复真实记录，避免重复回填。创建一半校验失败时只清理本次明确创建且尚未承载用户内容的目标，不得删除既有目录、分支或其它 worktree；失败不能启动 Agent，也不能把不完整 worktree 写成 execution root。
- 生命周期：worktree 不自动删除，也不因归档或删除 Session 自动 `git worktree remove`；后续管理能力必须先设计脏 worktree、未推送 commit、分支占用的处理。
- 尚未实现：创建成功后的「Created worktree」可展开过程块与 `WorkspacePreparationPayload` 事件（设计在归档文件里）；当前只有目录创建、持久绑定和状态行恢复。

## Follow-up 状态行

```text
⑂ main · 💻 本机                               [权限]   ◔ 42%
⑂ actspace/92803054 · ⑂ 工作树                 [权限]   ◔ 42%
🖥 dev-box · 📁 api-server                      [权限]   ◔ 42%
🖥 dev-box · ● 连接中                           [权限]       —
```

- 分支、运行位置、Host、工作区都是只读事实：没有 `⌄`，不是按钮；可点的只有权限控件和 context 用量。
- `工作树` hover / focus 显示原 Workspace 和 base branch。远端的 Host 名可聚焦，tooltip 显示连接状态和工作区路径；Host 未就绪且有短文案时第二段换成状态点 + 文案，context 用量显示 `—`（不可点）。Chat 会话状态行只有 context 用量。
- 状态不只靠图标或颜色；已有 turn 的会话里不能切 Workspace、分支、运行位置或 Host，需要换就新建会话。

## 运行目标（本机与远端）

上文的 Workspace、Branch、Worktree 是本机运行目标的属性，远端 Host 是另一种运行目标。组件不判断 `hostId` 或 `host:` 前缀，只读下面几个值；代码在 `apps/desktop/src/renderer/target/`。

### 会话定位（locator）

- 远端会话的 key 是 `host:` + `base64url(JSON.stringify([hostId, sessionId]))`。编码解码只有一份：`packages/util/shared/src/session-locator.ts`（`encodeSessionLocator` / `decodeSessionLocator`），main 和 renderer 共用。
- 解码严格：不以 `host:` 开头返回 null（本机会话）；以 `host:` 开头但形状、类型、长度（≤128）或 round-trip 不符就抛 `InvalidSessionLocatorError`。
- renderer 用 `locateSession(key)`，返回 `local`、`remote { hostId, sessionId }` 或 `invalid { key }`，它不抛错以免渲染白屏；损坏的 key 不按本机处理，本机专属能力都不能用在它身上（`isLocalSession` 为 false）。

### RunTarget 与 capabilities

```ts
type RunTarget =
  | { kind: "local"; workspaceRoot?: string; branch?: string; worktree?: SessionWorktreeContext }
  | { kind: "remote"; hostId: string; hostName: string; workspaceId?: string; workspaceName?: string }
  | { kind: "invalid"; key: string };
```

- `useRunTarget({ sessionId, sessionWorkspacePath, locked, local })` 得出 `target`、`capabilities`、`readiness`、`choices`，App 经 `RunTargetContext` 交给 WorkbenchLayout、ConversationView、Composer。已有会话的目标由会话决定（`locked`）；新建页的 Host 和远端工作区是 hook 内的本地选择，换 Host 时远端工作区回到该 Host 第一个。
- `capabilitiesOf(target, { gitStatus })`（`run-target.ts`）是唯一能力表，每项 `{ enabled, reason? }`，禁用时 `reason` 说明原因：

| 能力 | 本机 | 远端 | 损坏的 key |
| --- | --- | --- | --- |
| `newWorktree` | Git ready 可用；`no_head`「需要先创建提交」；否则「当前工作区不是可用的 Git 仓库」 | 「远端机器暂不支持」 | 「会话标识损坏」 |
| `branchSwitch` | Git 有分支（ready / no_head）可用，否则「当前工作区不是 Git 仓库」 | 同上 | 同上 |
| `localFileOpen` | 可用 | 同上（打开文件改为经 Host 下载） | 同上 |
| `workspacePanels`（文档、改动、子 Agent、后台任务等工作区面板） | 可用 | 同上 | 同上 |
| `review`（Review 面板、改动摘要条、工作区标题栏控件） | 可用 | 同上 | 同上 |
| `attachments` | 只收图片（Chat 形态另放开文件） | 图片和文件都收（经 Host 上传） | 都不收 |

- 远端将来支持某项能力时，只改这张表。

### readiness

`ready` 当且仅当可以发送，其余状态都带原因，界面不只显示「未就绪」。判断顺序与文案见 `readiness.ts` 的 `resolveReadiness` / `describeReadiness`：

| 状态 | 含义 |
| --- | --- |
| `workspace-required` | 本机目标没有工作区 |
| `connecting` | Host 列表还没读到，或 Host 正在连接 |
| `offline` / `revoked` / `incompatible` | 直接对应 Host 连接状态（标签「离线」「需要重新配对」等） |
| `removed` | 会话属于已删除的 Host，或会话 key 损坏 |
| `describing` / `describe-failed` | 已连接，正在读取或未能读取 `host.describe` |
| `host-unavailable` | Host 报告 `draining` 或 `blocked`，暂不接受新任务 |
| `workspace-missing` / `model-missing` | 会话记下的工作区或模型在 Host 上已不存在 |

未就绪时草稿照常编辑，发送按钮 disabled，tooltip 和状态行显示原因。

### HostDirectory

- `target/host-directory.ts` 的 `hostDirectory` 是整个窗口唯一的 Host 列表和 Host 事件订阅：第一个使用者出现时订阅，最后一个离开时释放。快照含 `hosts`、`descriptions`、`describeErrors`、`describing`、`loaded`、`listError`；Host 变为已连接时自动 describe，失败原因进 `describeErrors`。
- `onHostsChanged` / `onHostRemoved` 供侧栏刷新、重连补齐、Host 移除时清理。Host 移除后其会话仍留在侧栏，显示「远端 · 未连接」，本地状态释放。

### 远端会话的本地记录

Host 协议不返回会话的 `workspaceId`，renderer 在本地记录（`remote-session-prefs.ts`、`use-model-catalog.ts`）：

- `localStorage["actspace:remote-session-prefs"]`：`{ [sessionKey]: { workspaceId?, modelId?, recordedAt } }`。建远端会话时写入所选工作区和模型；无记录的旧会话按会话 meta 路径反查一次并写回；会话被 evict 时删除条目。
- `localStorage["actspace:new-session-model:<hostId>"]`：新建页在这台 Host 上上次选的模型；记录的模型在 Host 上已不存在时回落为 Host 默认模型。
- 旧的 `actspace:remote-models` 启动时迁移一次（会话条目进 prefs，`new:<hostId>` 进新建页记录，不覆盖已有记录），然后删除旧 key。

### 发送与审批

- renderer 的 `session/session-gateway.ts` 负责建会话（按 `target.kind` 带 `hostId` 和工作区）、pending 记录、configure 和 submit；远端目标未 ready 时拒绝发送。
- main 的 `session-gateway.ts` 是 fixed IPC 中间件，负责远端分流：带 `hostId` 的建会话和审批决定交远端；能解出远端 key 的请求交远端；其余先走本地，再合并远端列表结果。
- 审批事件和 pending 列表带 `hostId`（desktop-adapter 拼出）；renderer 提交审批决定时从当前会话的 RunTarget 取 `hostId`，不解析审批 id。

## Session 与存储边界

- 普通会话：`workspaceRoot` 等于 registry path，`worktree` 缺省。Worktree 会话：`workspaceId` 仍指原 Workspace，`workspaceRoot` 是 worktree path，`worktree.sourceWorkspaceRoot` 是 registry path。旧 Session 缺 `worktree` 按普通目录兼容，不做破坏性迁移。
- Registry 不记录临时 worktree；Recents 的最近时间来自长期 Workspace 使用。删除或失效的原 Workspace 不自动删除历史 Session，恢复时显示路径失效状态。
- Workspace registry 的读取修复与路径注册按事务串行，每次原子写使用唯一临时文件，避免并发 rename 竞争和丢失更新。

## 安全与可靠性

- 所有 Git 命令只在 main process 的专用 service 中用 `execFile` 参数数组执行，不经 shell 拼接 branch 或 path；renderer 不直接运行命令或访问文件系统。
- Workspace 和 worktree 路径解析为绝对路径并验证目录边界与 repository identity；自动分支校验合法 ref name；禁止覆盖现有 path、branch 或已注册 worktree。
- 日志和 UI 错误不含无关 Git stderr、环境变量或凭据，只返回脱敏且可恢复的信息。worktree 创建是显式用户选择触发的本机文件系统写操作，发送前 UI 必须清楚显示「新建工作树」状态。

## 可访问性与视觉

- 选择器是 button + menu 语义，带 `aria-expanded`、`aria-haspopup`；打开后焦点进入菜单（Host 搜索框出现时进搜索框）；disabled 项被跳过且说明原因；完整路径键盘聚焦时也能通过 tooltip 读取；异步 Git 检查和 worktree 创建用 `aria-live="polite"`，失败 `role="alert"`；动效尊重 `prefers-reduced-motion`。
- 菜单用 `surface-raised`、`border`、`shadow-act-popover` 与文本 token，不硬编码颜色；completed 用 muted / faint，running 才用 operational，失败用 danger 并配文字（全局规则见 [front-文案与状态表达规范.md](front-文案与状态表达规范.md)、[front-视觉token规范.md](front-视觉token规范.md)）。
- 宽度：Workspace 260px（远端 280px）、Branch 300px、运行位置 240px、远端机器子菜单 260px；高度受视口限制，Recents 和分支超出后菜单内滚动；默认从触发按钮下方展开，碰撞时由 Radix 翻转或平移；480px 窄窗菜单不超出视口；hover / focus / pressed 不改变控件尺寸。
