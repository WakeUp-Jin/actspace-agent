# 工作台布局与面板交互规范

管聊天态工作台的分栏、面板宽度、顶部 chrome 让位和折叠恢复。窗口控制按钮与整体视觉见 [front-视觉token规范.md](front-视觉token规范.md)。

## 结构

- 默认首屏两栏：左侧会话栏 + 中间聊天区；右侧对象面板按需打开，打开后三栏。
- 中间聊天区是优先保护的主工作区。左右面板都可拖宽，空间不足时先让位给中间区。
- 左侧会话栏只有 `expanded / hidden` 两态，没有 icon rail。隐藏态不占宽度，由窗口 chrome 左上角按钮重开。
- 窗口隐藏系统标题栏，左、中、右区域直接从窗口顶部开始；左栏为 macOS 窗口控制按钮预留安全距离，不在三栏外再套全局标题栏。
- SplitView 自研（`components/SplitView.tsx`），工作台面板语义不直接绑定通用 splitter 依赖。底座负责宽度、拖拽、最小宽度、折叠恢复、窗口变化后的校正；工作台层（`WorkbenchLayout.tsx`、`workbench/use-panel-layout.ts`）负责左 expanded/hidden、紧凑覆盖层、右 open/closed 和各区内容。
- 面板边界只由 SplitView 画一条 1px 中性线，pane 自身不重复加边框；14px 拖拽热区透明，hover / active 只改细线对比度，分隔条要有 hover、active、focus-visible 和 separator 语义。

## 宽度

| 区域 | 默认 | 最小 | 其他边界 |
| --- | --- | --- | --- |
| 左侧展开栏 | 260px | 200px | 最大 360px；拖到约 148px 以下吸附为隐藏 |
| 中间聊天区 | 自适应 | 560px | 空间不足时优先保护 |
| 右侧对象区 | 390px | 320px | 最大 = 工作台宽度 - 当前左栏宽度 - 560px |
| 桌面窗口 | 1440px | 480px | `< 880px` 进入紧凑布局 |

- 「文档」标签有自己的默认右栏宽度 720px（受 `rightMaxWidth` 截断），拖宽只记在文档标签上，不改其他标签宽度。
- 文档标签的「展开面板」通过 `SplitView.rightExpanded` 让右栏撑满主区；主区折成 0 宽但保持挂载，聊天状态与 Composer 草稿不丢，再点一次还原。紧凑布局已是覆盖层，不使用该展开。
- 空间不足时的收敛顺序：先隐藏左侧展开栏保护 560px 主区 → 右栏收敛到 320px，仍不足则关闭 → `< 880px` 进入紧凑布局。
- 阈值 880 = 主区最小 560 + 右栏最小 320，与并排容量同源，不存在两种布局都打不开右栏的宽度。

## 紧凑布局（< 880px）

- 中间区独占窗口，左右面板改为覆盖层，不参与分栏。
- 左覆盖层最大 360px、右侧至少留 48px；右覆盖层最大 640px，480px 窗口下占满主区。
- 覆盖层互斥：打开左侧关闭右侧，反之亦然。遮罩点击、再次点击折叠按钮、`Escape` 都能关闭。
- 紧凑布局不覆盖用户持久化的桌面宽度与 expanded/hidden 偏好，退出后恢复。
- 右侧覆盖面板打开时，中间标题和主区操作退场并关闭中间拖拽命中，让右侧 Tab 可点；左右窗口级入口保持可用。
- 系统级「快速打开」复用同一个主窗口：宽度收敛到约 640px、在鼠标所在屏幕居中并直接进入紧凑布局，不做第二套迷你页面。它只改原生窗口 bounds，不写 renderer 的 SplitView 偏好；唤起后 renderer 从 Settings 或 Trajectory 返回 Chat、关闭紧凑覆盖层并聚焦 Composer，保留草稿、不自动发送。

## 折叠与恢复

- 左侧通过显式入口折叠/展开；右侧沿用对象浏览入口开关，不保留右侧 rail。
- 右栏重开时恢复上次有效宽度，窗口已变窄则按当前边界校正；尺寸恢复先取用户上次有效布局，再按当前空间收敛。
- 布局偏好只落 renderer 本地，不走跨进程设置契约。

## 中间主工作区

- 承担消息流、工具流和 Composer；顶部栏单行，不放工作区状态副标题。标题和操作归属真实 pane，不相对整窗居中，也不全部堆到窗口右端。
- 顶部左侧是会话标题；标题前一个 icon-only 按钮在 Chat 与 Trajectory 主视图间切换（只切换当前会话中心内容，不持久化 tab；动态 tooltip / aria label）。右侧是编辑器选择和 Environment（规则见 [front-environment-and-git-actions.md](front-environment-and-git-actions.md)）；对象菜单与右栏开关只属于右栏。左列承载 Sidebar 折叠与会话历史 Back / Forward，顶部不重复渲染 Search。
- Trajectory 是只读派生视图，不是右侧对象 Tab，不出现在 Sidebar 或右侧启动页。切换时保持 `ConversationView` 外壳挂载，Composer、草稿和右栏面板不重置。规则见 [front-轨迹视图规范.md](front-轨迹视图规范.md)。
- 消息流滚动容器占满主区 viewport，滚动条贴主区右边界；阅读宽度由内层容器限制并居中。不要用父级 padding + 负 margin 对冲来摆滚动条。

### 顶部 chrome bar 让位（强约束）

`WindowChromeBar` 是 `position: fixed; top: 0; height: var(--window-chrome-strip-height)`（44px）的浮层，z-index 在所有内容之上。它用与 `SplitView` 同源的三列 grid：左列宽 = 可见 Sidebar，中列 = 主区，右列 = 已打开的对象面板，宽度由 `WorkbenchLayout` 以 CSS 变量注入；左栏隐藏、右栏关闭或紧凑布局时，对应列退回只容纳窗口控制入口的边缘宽度。

- `window-chrome-bar` 自身 `pointer-events: none`；左列与中间拖拽区按需恢复命中，右列只有操作按钮组恢复命中，避免整块浮层盖住下方 Tab。
- 底部分隔线只画在右侧对象面板列。
- 右栏关闭时，边缘列只保留面板开关的稳定点击区；右栏打开后开关仍归右列，不跨 pane。

chrome bar 既是视觉遮罩也是点击劫持源，所以所有作为 `SplitView.main` 的页面级根容器必须：

- `padding-top: var(--window-chrome-strip-height)`，或内部 grid/flex 第一行给出等高让位区。参考实现：`Sidebar`、`.conversation-shell`、`WorkbenchLayout` 的扩展页容器。
- 不通过改 `WindowChromeBar` 的 `z-index` / `pointer-events` 来避让。

新页面自检：根容器 y=0 一带是否会出现可交互元素？会就必须先让位。

## 右侧对象区

- 承担 Markdown 预览、图片预览、会话级 diff；HTML 和其他文件交给系统默认应用。Tab 与内容渲染见 [front-右侧面板与文件渲染规范.md](front-右侧面板与文件渲染规范.md)。

### 「改动」（Review）

- Composer、Environment 或右侧对象菜单打开 Review 时，以稳定的 workspace Review 对象去重并激活右侧 Tab。它是普通对象 Tab，不替换 `SplitView.main`，不隐藏左栏，不改聊天滚动、Composer 草稿和长期布局偏好。
- 顶部先经过右侧 Tab 行的 chrome 安全高度；内部工具栏是 `no-drag` 点击区。
- Changed files：Review 容器 ≥ 560px 时停靠右侧，更窄时成为独占内容区的文件列表，选中文件后回到 Diff；不用覆盖 Diff 的遮罩。
- 响应式必须测量 Review 容器自身：Files 的 560px 阈值与 split diff 的 640px 阈值不能用窗口宽度代替；窄宽度优先 unified diff。
- 工具栏可横向滚动，但 Scope、Options、Jump、Commit 等弹层必须 portal 到顶层并按触发器定位，避免被 `overflow` 裁切。
- 数据源、Branch、diff、Options、Git action 规则见 `docs/design-docs/core-review-change-sources.md`。

## 扩展页

`extensions` 是独立主区视图，入口在会话侧栏 New Agent 下方。复用 WindowChromeBar 与 SplitView，主区预留 `--window-chrome-strip-height`，保持会话侧栏可用，隐藏右侧对象区、右栏开关和会话历史前后按钮；返回聊天后恢复已有右栏状态；窄窗选择扩展入口自动关闭侧栏覆盖层。设置页继续整页接管，不塞进三栏。

## 不做

- 不做 tab 拖动换区、底部 terminal / panel region（应用不内置终端）、多编辑区 grid、右侧 rail、移动端独立导航模型（移动端见 [front-web-pwa客户端规范.md](front-web-pwa客户端规范.md)）。
- 不把 Trajectory 当右侧对象 Tab。
- SplitView 不假定左侧一定是 session sidebar、右侧一定是 preview；将来若做 dock 拖动，另设计 workspace layout model，不要把当前 resize 偏好伪装成 dock tree。紧凑覆盖层是 viewport 降级策略，不是 docking 规则。

## 验收点

- 右栏打开后中间区不过窄、标题不折行失控、Composer 不被挤坏。
- 左展开 / 左隐藏 / 紧凑覆盖 / 右开 / 右关 五种状态消息流都完整可用。
- 拖分隔条宽度稳定，窗口 resize 后落在边界内；`480 / 820 / 1120 / 1440px` 下无不可达入口或横向破版。
