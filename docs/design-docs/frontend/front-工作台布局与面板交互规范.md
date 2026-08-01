# 工作台布局与面板交互规范

## 定位

聊天态工作台不是固定三栏截图，而是围绕主聊天区组织的可调面板布局。

当前布局底座由 `actspace` 自己维护，先服务桌面端工作台，再逐步沉淀为后续对象预览、审阅和更多面板交互可复用的能力。

## 当前决策

- 默认首屏仍是两栏：左侧会话栏 + 中间聊天区。
- 右侧对象浏览面板按需打开，打开后进入三栏。
- 左右面板都允许用户调整宽度。
- 左侧会话栏支持 `expanded / hidden` 两态；旧 icon rail 已退役。
- 窗口宽度不超过 `820px` 时进入紧凑布局，左右面板改为覆盖层，不再参与主区分栏。
- 中间聊天区始终是优先保护的主工作区。
- Review 是右侧对象系统中的普通对象 Tab；打开后保持聊天主区、Composer 和左侧会话栏，不建立全屏例外。
- SplitView 自研，不把工作台面板语义直接绑定到通用 splitter 依赖。
- 桌面端窗口隐藏系统标题栏，应用的左、中、右区域直接从窗口顶部开始；左侧栏为 macOS 窗口控制按钮预留安全距离，而不是在三栏外再套一条全局标题栏。

## 设计目标

- 右侧预览打开后，聊天区仍保持可读、可输入、可滚动。
- 面板宽度调整是桌面工作流的一等交互，而不是单个页面上的临时样式补丁。
- 面板底座先支持 resize、collapse、restore，再为未来的拖动和区域编排保留边界。
- 视觉上继续保持轻量桌面应用，不让 resize handle 抢走内容层级。

## 布局区域

### 左侧会话区

- 展开态显示完整会话导航。
- 隐藏态不占布局宽度，由窗口 chrome 左上角按钮重新打开。
- 紧凑布局下，展开入口打开一个最大 `360px`、右侧至少留 `48px` 的覆盖式 sidebar；点击遮罩、再次点击折叠按钮或按 `Escape` 关闭。

### 中间主工作区

- 承担消息流、工具流和 Composer。
- 必须保留最低可用宽度。
- 左右面板争抢空间时，中间区优先于右侧预览区和左侧展开态。
- 顶部栏保持单行，不重复展示工作区状态副标题；标题和操作必须归属于真实 pane，而不是相对整窗居中或全部堆到窗口右端。
- 中间栏顶部左侧展示当前会话标题，右侧放置编辑器选择和 Environment；对象菜单与右侧面板入口只属于右栏。Environment 的本地工作区、Git 与 Sources 规则见 `front-environment-and-git-actions.md`。
- 消息流滚动容器应占满中间主区 viewport，让滚动条贴近主区右边界；消息内容和 Composer 再由内层容器限制阅读宽度并居中。
- 不要用父级 padding 加负 margin 对冲来决定滚动条位置，避免左侧隐藏态、右侧面板和窗口缩放时出现不一致的留白。

#### 顶部 chrome bar 让位（强约束）

桌面端 `WindowChromeBar` 是一条 `position: fixed; top: 0; height: var(--window-chrome-strip-height)` 的浮层，z-index 在所有内容之上。它使用与 `SplitView` 同源的三列 grid：左列宽度等于可见 Sidebar，中列为主工作区，右列宽度等于已打开的对象面板；对应宽度由 `WorkbenchLayout` 注入 CSS 变量。左栏隐藏、右栏关闭或进入紧凑布局时，相应列退回只容纳窗口控制入口的边缘宽度。

`window-chrome-bar` 自身 `pointer-events: none`；左列和中间拖拽区按需恢复命中，右列只有操作按钮组恢复命中，避免整块右栏浮层盖住下方 Tab。中间列标题左对齐，IDE / Environment 在同列尾部；右列只承载对象 `+` 与面板开关。三列共享同一条主题感知底部分隔线。

右栏关闭时，边缘列只保留面板开关的稳定点击区，不额外保留大块水平留白；IDE、Environment 与面板开关在视觉上形成紧凑的顶部工具组。右栏打开后，面板开关仍归属右列右侧，不跨 pane 改变信息归属。

> 这意味着 chrome bar **既是视觉遮罩、也是点击劫持源**——任何作为 `SplitView.main` 的根容器，如果不在顶部留出 chrome bar 的高度，第一屏内容会被 chrome bar 视觉覆盖，且右上角区域的按钮 / 表头 / 操作条点击会被 `chrome-right` 的 panel-toggle 按钮拦截。

所以**所有作为 `SplitView.main` 的页面级根容器必须满足**：

- 根容器要么 `padding-top: var(--window-chrome-strip-height)`，要么内部 grid/flex 的第一行明确给出等高的让位区。
- `Sidebar` 已经按这条规则做了顶部 padding，`.conversation-shell` 和 `.kairos-page` 是参考实现。
- `.placeholder-view` 利用 flex 居中规避了顶部遮挡，但严格意义上仍应补 padding-top；任何新页面别照搬 placeholder 模式。
- 不要试图改 `WindowChromeBar` 的 `z-index` 或 `pointer-events` 来"避让" chrome bar——chrome bar 浮层语义是这条规范的契约前提。
- 紧凑布局打开右侧覆盖面板时，中间标题和主工作区操作必须退场，同时关闭中间拖拽命中，让右侧 Tab 可以接收点击；左右窗口级入口仍保持可用。

新增页面（如 Kairos、Lab、Settings 全屏视图）前，先用这条规则自检：**根容器的 y=0 一带是否会出现可交互元素？** 若会，必须先让位。

### 右侧对象浏览区

- 承担文件预览、图片预览、HTML 预览、会话级 diff 和绑定当前会话 workspace / worktree 的交互式 Terminal。
- 打开后可调宽，关闭后不保留右侧 rail。
- 对象 Tab 与内容渲染规则继续由 `右侧面板与文件渲染规范.md` 约束。
- Terminal 的 PTY、会话归属、背压、进程清理与打包签名见 `front-右侧终端与会话生命周期规范.md`。

### Review 右侧对象模式

- Composer、Environment 或右侧对象菜单打开 Review 时，以稳定 workspace Review 对象去重并激活右侧 Tab。
- Review 不替换 `SplitView.main`，不主动隐藏左侧栏，也不修改聊天 scroll、Composer draft 或长期布局偏好。
- Review 顶部先经过右侧 Tab 行的 chrome 安全高度；内部工具栏属于 `no-drag` 点击区域。
- Changed files 不再使用覆盖 Diff 的遮罩浮层：Review 容器宽度不小于 `560px` 时停靠在右侧，更窄时成为独占内容区的文件列表，选中文件后返回 Diff。
- Review 内部响应式必须测量 Review 容器自身。Files 的 `560px` 阈值和 split diff 的 `640px` 阈值都不能用整个窗口宽度代替。
- Toolbar 可以横向滚动，但 Scope、Options、Jump、Commit 等弹层必须 portal 到顶层并按触发器定位，避免被 toolbar 的 `overflow` 裁切。
- `<= 820px` 时 Review 复用普通 compact right-panel overlay；关闭遮罩或按 `Escape` 返回聊天。
- Review 的 scope、upstream Branch、diff、Options 和 Git action 规则见 `docs/design-docs/core-review-change-sources.md`。

## SplitView 底座

首版 SplitView 应把通用面板交互和 `actspace` 的区域语义分开。

- 底座负责面板宽度、拖拽分隔条、最小宽度、折叠恢复、窗口变化后的尺寸校正和布局偏好恢复。
- 工作台层负责左侧 expanded/hidden、紧凑覆盖层、右侧 open/closed、主聊天区保护优先级和各区域内容渲染。
- 分隔条应具备 hover、active、focus-visible 状态，并提供可识别的 separator 语义。
- 面板边界只由 SplitView 绘制一条 1px 中性线；pane 自身不重复加边框。14px 拖拽热区保持透明，hover / active 只改变细线对比度，不增加宽光晕。
- 尺寸恢复应优先恢复用户上次有效布局，再根据当前窗口空间重新收敛。

## 宽度策略

首版先按以下桌面默认值设计，后续可根据真实内容密度校正：

| 区域 | 默认 | 最小 | 其他边界 |
| --- | --- | --- | --- |
| 左侧展开栏 | `260px` | `200px` | 建议最大约 `360px` |
| 中间聊天区 | 自适应 | `560px` | 空间不足时优先保护 |
| 右侧对象区 | `390px` | `320px` | 最大使用保护左侧栏与中间区后剩余的全部宽度 |
| 桌面窗口 | `1440px` | `480px` | `<= 820px` 使用紧凑覆盖模式 |

Review 同样遵守上述右侧对象区宽度；宽屏可以扩展为主要工作区，窄宽度优先 unified diff，并把 Changed files 降级为独占 Review 内容区，而不是覆盖一半 Diff。

当窗口空间不足时：

1. 常规桌面布局先隐藏左侧展开栏，保护中间区的 `560px` 最低可用宽度。
2. 右侧对象区收敛到最小可用宽度，仍不足时关闭。
3. 进入 `<= 820px` 的紧凑布局后，中间区独占窗口；左右面板通过覆盖层临时打开。
4. 覆盖层互斥：打开左侧会关闭右侧，打开右侧会关闭左侧。

宽屏下右侧最大宽度按 `工作台宽度 - 当前左侧栏宽度 - 560px` 动态计算，不再叠加固定像素或 `50vw` 上限。左侧栏隐藏后，右侧对象区可以继续扩展，但不能侵占中间聊天区的最低可用宽度。

## 折叠与恢复

- 左侧支持 expanded 和 hidden 两态。
- 左侧可通过显式入口折叠和展开；resize handle 可按实现计划补双击或阈值吸附。
- 右侧沿用对象浏览入口打开和关闭。
- 右侧重新打开时恢复上次有效宽度，若窗口已变窄则按当前边界校正。
- 紧凑布局不覆盖用户持久化的桌面面板宽度和 expanded/hidden 偏好；退出紧凑布局后恢复桌面布局偏好。
- 紧凑布局中的左右覆盖层支持遮罩关闭与 `Escape` 关闭；右侧覆盖层宽度最大 `640px`，在 480px 窗口下占满主区。
- 用户布局偏好先落在 renderer 本地，不在首版引入跨进程设置契约。
- 例外：`Kairos` 全屏监控页不需要窗口 chrome 右上角的右侧对象面板折叠按钮，因为 Kairos 自身已占用完整主工作区，且页面内没有依赖该按钮的对象预览工作流。

## 未来拖动边界

未来可能出现接近 IDE 的面板拖动与区域重排，但这不是当前 resize 任务的首版范围。

为了不把未来堵死，当前实现应保留这些边界：

- SplitView 不直接认定左侧内容一定是 session sidebar，或右侧内容一定是 preview。
- 面板内容、面板所在区域和面板展示状态要分层表达，避免拖动时只能重写现有布局组件。
- 当前 resize 偏好不要伪装成未来 dock layout tree；以后若支持 tab 拖动、区域换位或底部面板，应单独设计 workspace layout model。
- 紧凑覆盖层是 viewport 降级策略，不等同于通用 panel docking 规则。

## 首版不做

- 不做 tab 拖动换区。
- 不做底部 terminal / panel region；用户 Terminal 作为右侧对象 Tab 存在。
- 不做多编辑区 grid。
- 不做右侧 rail。
- 不做移动端独立导航模型。
- 不把设置页塞进聊天态三栏布局。

## 验收重点

- 右侧面板打开后不会复现中间聊天区过窄、标题折行失控或 Composer 被挤坏的问题。
- 左侧展开态、左侧隐藏态、紧凑覆盖态、右侧打开态和右侧关闭态都能保持消息流完整可用。
- 拖动左右分隔条时宽度变化稳定，窗口 resize 后布局仍落在边界内。
- `480 / 820 / 1120 / 1440px` 下布局都不出现不可达入口或主区横向破版。
- 工作台文档能清楚说明当前 resize 能力和未来拖动边界。
