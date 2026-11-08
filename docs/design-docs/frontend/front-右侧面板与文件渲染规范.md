# 右侧面板与文件渲染规范

右侧面板是当前会话的对象浏览工作区：面板外壳、对象启动页、Tab 系统，以及「点一个文件会发生什么」。各对象自己的规则在各自的规范里：

| 对象 | 规范 |
|---|---|
| 上下文 | [Context 面板规范](front-Context面板规范.md) |
| 子 Agent / 后台任务 / 侧边对话 | [子 Agent、后台任务与侧边对话规范](front-子Agent与后台任务规范.md) |
| 文档（工作区 Markdown 的树、预览、编辑、新鲜度） | [文档面板规范](front-文档面板规范.md)、[Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md) |
| 改动（Review） | `docs/design-docs/core-review-change-sources.md` |

右侧开关、宽度边界和中间聊天区保护规则见[工作台布局与面板交互规范](front-工作台布局与面板交互规范.md)。全局的文案、状态表达、token 与组件规则见前端必读规范，这里不重复。

代码：`apps/desktop/src/renderer/components/RightPanel.tsx` 与 `components/right-panel/`。

## 1. 交互模型

- 顶部是横向 Tab 条，在 44px chrome 行内垂直居中：Tab 高 30px、字号 `text-act-sm`，标题左侧留白 10px，相邻 Tab 间距 4px。关闭按钮始终占位，悬停才显现，不改变 Tab 宽度。
- 每个 Tab 对应一个对象实例，不对应固定页面；对象 Tab 用稳定 id 去重（重复打开只聚焦或刷新，不堆叠）。
- 点击消息中的文件、链接、图片或 diff 时，在右侧打开对应对象。
- 面板打开后可调宽度，关闭后把宽度归还给中间聊天区；关闭时不保留右侧 rail。
- 没有对象 Tab 时，Tab 行左侧显示标题「对象」，不让顶部只剩一组悬空图标。
- Tab 行与隐藏标题栏 chrome 同高，Tab 按钮必须高于 `.chrome-center` 拖拽区接收点击；同时给右上角 PanelRight 按钮预留 padding。
- `<= 600px` 且右侧面板作为全宽覆盖层时，Tab 行左侧避开 macOS 窗口控制与左侧 chrome 入口；中间标题与 Workspace 操作同时退场，不覆盖 Tab 命中区。

## 2. 对象启动页

没有打开对象时，右侧显示对象启动页：白底竖排列表，每行「图标 + 名字 + 一句说明」，与右栏其他列表同一套行样式（`RightPanelLauncherList`）；按钮可读名称只是名字，说明挂在 `aria-describedby` 上。入口由当前真实对象决定，顺序固定：

| 入口 | 说明 | 行为 | 条件 |
|---|---|---|---|
| 侧边对话 | 另起一条线问，带上目前为止的上下文 | 新开一条侧边对话 | 仅本地运行目标 |
| 子 Agent | 这次对话派出的子智能体，空闲后还能继续派活 | 打开 / 聚焦 `subagents` | 开发类，需要会话 |
| 后台任务 | 在后台跑的命令 | 打开 / 聚焦 `background-tasks` | 开发类，需要会话 |
| 文档 | 工作区里的 Markdown，可预览和编辑 | 打开 / 聚焦 `docs` | 开发类 |
| 改动 | 这次的改动 | 复用 Composer 的 Review 打开逻辑 | 开发类，需要 Review 能力 |
| 上下文 | 上下文用了多少 | 打开 / 聚焦 `context` | 始终 |

- 列表下方是分组「本会话的侧边对话 · 已收起」（没有就不显示）。
- 关闭最后一个对象 Tab 后回到启动页；折叠面板时若仍有已打开对象，重新展开继续恢复原 Tab。
- 启动页与「+」菜单打开的是同一组对象语义，名称和行为不能漂移。
- 入口是键盘可达的原生按钮，有 hover、pressed、focus-visible 与 disabled 状态；侧边对话打开失败的原因直接写在说明位。

## 3. Tab 条

Chrome-right 有两个浮层控件（「+」新建对象、PanelRight 折叠），Tab 行右侧必须预留**两个控件**宽度，否则 Tab 会滑到「+」下方造成重叠。

Tab 过多时不加可见滚动条，用三层兜底：

- Tab 保持内容宽度（标题最宽 160px，超出截断），不挤成不可读的窄条。
- 行内可横向滚动但隐藏滚动条（`scrollbar-none`）；切换或新增 Tab 时激活 Tab 自动 `scrollIntoView`。
- 溢出时（`ResizeObserver` 检测 `scrollWidth > clientWidth`）右侧出现一个溢出下拉 ⌄（「所有标签页」），列出全部 Tab 供点选与关闭，作为无滚动条时的可达性兜底。

激活的 Tab 用 `surface-subtle` 底和 medium 字重，非激活透明、悬停 `hover-overlay`。

## 4. Tab 类型

| kind | 内容 | id |
|---|---|---|
| `docs` | 「MD 文档」面板，单一实例；Markdown 不生成独立文件 Tab | `docs` |
| `image` | 图片渲染 | `file:<相对路径>`（带 host / workspace 时用带命名空间的形式，`workspaceFileTabId`） |
| `text` | 说明文字：读取失败、远端 Host 文本预览；用 `CodeRenderView` 显示 | 同上 |
| `review` | 「改动」：只查看改动，不含暂存、还原、已查看、复制 apply、创建 PR | `review:<执行根目录>`，同一 workspace 去重 |
| `turnReview` | 轮尾改动卡点开的某一轮改动快照 | `turn-review:<sessionId>:<turnId>` |
| `context` | 上下文面板，标题「上下文」 | `context` |
| `subagents` / `backgroundTasks` / `sideChat` | 见子 Agent 与后台任务规范 | `subagents` / `background-tasks` / `side-chat:<sessionId>` |

## 5. 「+」新建对象菜单

- 放在 chrome-right、PanelRight 折叠按钮左侧；点开是轻量菜单：「侧边对话」（排第一，仅本地运行目标）、「MD 文档」、「改动」、「上下文」。「MD 文档」「改动」属开发类对象。
- 「改动」入口首次默认选当前 workspace 的 Git `Uncommitted`，之后恢复该 workspace 最近一次选择。
- 「+」仅在右侧面板打开时显示：它的语义是「往面板里加对象」，面板关着时没有意义；面板关闭时 chrome-right 只保留 PanelRight 按钮。
- 菜单与折叠按钮同属 chrome-right，`-webkit-app-region: no-drag`。

## 6. 文件渲染与打开

应用内只渲染 **Markdown 和图片**，其余文件交给系统。

| 类型 | 行为 |
|---|---|
| `.md` / `.markdown` | 在「MD 文档」面板里读写 |
| `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` | 应用内图片预览，超过 5MB 提示过大 |
| 其他所有文件（含 HTML、代码、CSV、PDF） | 交给系统默认应用；main 的 `readWorkspaceFile` 只返回 stat（`renderKind: "external"`），不读内容 |

`review` / `diff` 进入完整 Review 工作台，不在单条消息里替代局部 diff。

### 6.1 打开路由

所有「点一个本机工作区文件」的入口（交付卡主体、本轮改动的「打开整个文件」、聊天里的文件链接、读文件工具行）都走 `components/files/open-workspace-path.ts`，组件里经 `useOpenWorkspacePath()` 调用：

| 扩展名（大小写不敏感） | 行为 |
|---|---|
| `.md` / `.markdown` | `statFile` 确认文件还在，再打开「MD 文档」Tab 并选中该文件（带行号时一并定位） |
| `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` | `readFile` 后打开 `image` Tab |
| 其他 | `workspaces.openFile({ action: "open" })`，即系统默认应用 / 默认浏览器 |

远端 Host 会话不经过这个路由，用 `hooks/remoteArtifact.ts` 的文本 / 图片预览。无协议的安全相对链接与完成态 Write / Edit 的 `outputRelativePath` 走同一路径；`..`、工作区外绝对路径和外部 URL 不进入该路由。

### 6.2 打不开时的兜底

macOS 上 `shell.openPath` 对没有关联应用的文件返回 `Failed to open path`，系统不弹框。main 把它映射为 `no_application`，路由返回 `{ ok: false, reason: "no_app" }`，`OpenFileFallbackProvider`（挂在 `WorkbenchLayout` 内）弹出 `OpenFileFallbackDialog`：

- 标题「没有可以打开「文件名」的应用」。
- 「选择应用打开」：`useFileApplications` 列出关联应用，选中后 `openFile({ action: "open", applicationId })`；列表为空时整块不显示。
- 「在 Finder 中显示」：`openFile({ action: "reveal" })`。
- 一行「推荐安装 VS Code 打开代码文件」加下载链接，只在 `listOpenTools` 明确返回 VS Code `available: false` 时出现。

只在用户点了却打不开的那一刻出现，不在启动时检测软件。调用方拿到 `no_app` 不再提示，只处理 `reason: "error"`。

## 7. 文件 Tab 的操作栏与外部打开

文件 Tab（图片、远端 Host 文本）上方有 Workspace 操作栏（`WorkspaceOperationBar`）：左边面包屑 `<workspace 名> › <相对路径>`（根名弱化、文件名主色），右边「在外部应用中打开」菜单（`OpenInAppMenu`），下方按需挂「已变更」提示条。没有刷新按钮、文件树开关和预览 / 源码切换；需要重读的唯一场景是文件已变更，提示条自带「重新加载」。Markdown 不在这里，「MD 文档」面板有自己的操作栏。

外部打开的目标是**当前文件**，不是 workspace 根；`relativePath` 越界按 `escapes_root` 拒绝。不同工具接受的目标形态不同，main 侧分派并有单测锁住实际参数：

| 工具 | 传给 `open` 的目标 | 原因 |
|---|---|---|
| VS Code / Cursor | 文件本身 | 编辑器就是用来打开文件的 |
| Finder | `open -R <文件>` | `-a Finder <文件>` 会用默认应用运行这个文件，不是定位它 |
| Terminal / iTerm2 | 文件的**父目录** | 终端只能接目录 |

交互约定：点图标先出菜单、选中应用才真正打开，不做「点图标直接用上次的应用打开」，这一栏图标很小，误触会直接拉起外部程序。选择记在 localStorage，菜单里用「上次」标出。没有 preload 时整个按钮不渲染。顶部 chrome 不再提供 workspace 外部应用入口。

## 8. 代码视图

`CodeRenderView` 是 `text` Tab 的实现，**没有工具栏**，只负责把内容读清楚；文件级动作都在操作栏。

- **行号**：CSS grid 双列，一个逻辑行一个 grid row，折行的续行仍落在同一 row 内、不与行号错位。gutter `select-none` + `aria-hidden`，复制和读屏不带行号；`sticky left-0` + 不透明底色，遇到不可断的超长 token 顶出横向滚动时钉在左边。
- **折行固定开启，不提供开关**：右栏窄，长行横向滚动比折行更难读。实现约束：折行时 grid 必须是 `w-full`，`w-max` 会让代码列等于最长行宽，`pre-wrap` 永远没有折行机会。
- **不做复制和文件内查找**：两者是编辑器动作，要整份内容用「在外部应用中打开」。
- **分块高亮**：超过 4000 行（或 256KB）时先同步高亮首批让首屏可读，其余在空闲时分批推进，未高亮的行先按转义纯文本落地；行组件必须 `memo`。代价：跨批的多行 token（块注释）会在批边界断开。
- **渲染行数上限 20000**：每个逻辑行是两个 DOM 节点，超出部分不渲染，并在**内容末尾**说明还有多少行未显示，用户滚到底就能看到答案。

## 9. 文件新鲜度

文件 Tab 的内容是打开那一刻的快照，磁盘随后可能被 Agent、外部编辑器或 `git checkout` 改掉。用两级信号，不依赖后台文件监听：

1. **Agent 编辑事件**（主力）：`edit_diff` / `write_diff` 消息块自带 `filePath`，renderer 实时收到，直接标记对应 Tab 过期（`useAgentEditSignals`，按「相等或以 `/<relativePath>` 结尾」匹配绝对与相对路径）。
2. **mtime 重校验**（兜底，O(1)）：只在 Tab 激活、窗口重获焦点（含页面重新可见）、turn 结束三个时机各 `statWorkspaceFile` 一次，**不轮询**（`useFileFreshness`）。

规则：

- 检测到变化只打 stale 标记并显示提示条，内容替换必须由用户点「重新加载」触发；用户可能正在阅读或选中文本，自动抽换比看到旧内容更糟。
- 文件已删除、变为目录或符号链接逃出工作区时，`statFile` 返回的 `not_found`、`not_a_file`、`escapes_root` 也是快照失效信号：显示过期提示并提供重新加载，重读后显示文件不可用说明，不继续把旧正文当作当前文件。
- 检测与重读都使用 Tab 绑定的工作区，不误标另一个工作区的同路径文件。临时 IPC 异常保留快照，等下一次触发重查，不当作文件失效。
- 读盘结果转换只从目标提取 `workspaceRoot` / `hostId`，不展开整个旧 Tab，避免旧正文、渲染类型或截断状态混入新结果。
- mtime 重校验只对本地 Tab 做，带 `hostId` 的远端 Tab 不查。「MD 文档」面板的新鲜度与未保存草稿处理见[文档面板规范](front-文档面板规范.md)。

## 10. IPC 契约与 main 侧规则

类型真源 `packages/util/shared/src/ipc.ts`，bridge 入口 `packages/util/shared/src/desktop-bridge/contract.ts`（`workspaces.*`、`sessions.readArtifact`）。

| 接口 | 要点 |
|---|---|
| `workspaces.readFile` | `{ workspaceRoot?, relativePath }` → `renderKind: "markdown" \| "image" \| "external"`、`content` / `dataUrl`、`size`（磁盘完整字节数，不因截断变小）、`truncated`、`mtimeMs`（错误分支为 0）、`error: not_found \| not_a_file \| too_large \| escapes_root` |
| `workspaces.statFile` | 只取 `size` 与 `mtimeMs`，不读内容，供 §9 重校验；`error: not_found \| not_a_file \| escapes_root` |
| `workspaces.openFile` | `{ action: "open" \| "reveal", applicationId? }`，返回 `ok` 与 `error: invalid_target \| not_registered \| open_failed \| no_application` |
| `workspaces.listOpenTools` / `WorkspaceOpenInput` | 外部应用工具目录与打开目标（`relativePath` 为空表示 workspace 根） |
| `workspaces.listMarkdownFiles` / `writeMarkdownFile` | 「MD 文档」面板的清单与保存，见文档面板规范 |
| `sessions.readArtifact` | 会话生成图片，见下 |

main 侧规则：

- renderer 不直接访问文件系统，读取、清单、保存都走 preload + IPC；浏览强约束在 `workspaceRoot` 内，`..` 逃逸返回 `escapes_root`。
- 顶部 Workspace 选择器允许发送前多次切换；选择动作不迁移 session，只有发送消息时才把最终选择写入 session meta。
- 文本预览上限 `WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES`（2MB，定义在契约层，main 决定读多少、renderer 在提示条里复述同一个数）；Markdown 超限是**部分读**：返回上限内的完整行并置 `truncated`。图片上限 5MB，超限返回 `too_large`，因为部分图片字节无法解码。`external` 类不读内容。
- 图片用 data URL；`readWorkspaceFile` 与 `statWorkspaceFile` 都返回 `mtimeMs`。

**会话生成图片**不属于工作区文件，走独立的 Session Artifact IPC（`SessionArtifactReadInput { sessionId, artifactPath }`）：

- renderer 不能直接加载 `file://`（开发态 HTTP origin 会被 Electron 拒绝，本地绝对路径也不应成为 renderer 的文件读取能力）。
- `artifactPath` 是历史字段名，实际承载 opaque Artifact ID；main 通过 `DesktopArtifactStore.resolveForSession()` 同时校验 ID、SHA-256、大小、owner session 与真实 store 路径，不接受 renderer 传入任意绝对路径。
- 只允许 PNG / JPEG / WebP，按 Session 引用的 MIME 与 Artifact metadata 一致性确认，单图沿用生成工具 25MB 上限。
- data URL 按需返回：Turn Artifacts 在用户点击时读取；历史 UserMessage 只为缺失预览的图片 attachment 执行 hydration。data URL 不写入 Journal，也不成为恢复事实。
- 生成图片作为对象 Tab 打开，不带 workspace `relativePath`，避免被当成工作区文件处理。

## 11. 边界

- 应用内只渲染 `md`（在「MD 文档」面板里）和图片；其余交给系统默认应用。
- 「改动」需要 Git：无 Git 时显示「当前目录不是 Git 仓库」。
- 不做：通用工作区文件树、新建 / 删除 / 重命名、快速打开、多 root、PDF 预览；写入只限「MD 文档」面板里的 Markdown 保存。

## 12. Review / Diff 展示边界

- 聊天区保留单次工具调用或编辑动作的局部 diff；Review 工作台负责跨文件、跨 scope 的完整审阅。
- Composer、Environment 和右侧对象菜单都可以打开 Review，入口去重到同一 workspace Review 实例；完整 Review 直接渲染在右侧对象面板，聊天主区和 Composer 保持可用。
- `Uncommitted`、`Unstaged`、`Staged`、`Committed`、`Branch` 使用真实 Git 数据。
- Review 内部以单列 Diff Canvas 为主；Changed Files 在 Review 容器不小于 `560px` 时停靠右侧，更窄时切换为独占内容区的文件列表，不用遮罩覆盖 Diff；大 diff 继续按单文件与 capped 策略加载。
- 不换行时 Diff Canvas 是唯一的横向滚动所有者，行号、增删标记和代码随 Canvas 同步移动，禁止给每个 `<code>` 行单独设置横向滚动；开启 word wrap 后 Canvas 回到面板宽度并由代码列折行。
- unified / split、上下文折叠、Jump to file、Review Options 的完整规则见 `docs/design-docs/core-review-change-sources.md`。
