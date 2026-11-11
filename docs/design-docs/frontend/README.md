# 前端设计文档

桌面端 renderer（`apps/desktop`）与 web 客户端（`apps/web`）的设计规范。品牌总纲见根目录 [DESIGN.md](../../../DESIGN.md)。规则只写现行做法；决策过程与历史在 `docs/exec-plans/completed/` 和 `docs/histories/`。

## 做什么事，读哪几份

每次都先读「必读 4 份」，再按任务读区域规范。

| 要做什么 | 先读 | 再读 |
|---|---|---|
| 任何前端改动 | [新功能开发清单](front-新功能开发清单.md)（含 UI 自检）、[视觉 token](front-视觉token规范.md)、[文案与状态表达](front-文案与状态表达规范.md)、[组件与交互模式](front-组件与交互模式规范.md) | 下面对应区域 |
| 改颜色、字号、圆角、主题、强调色 | 视觉 token | 外观设置见设置页规范 |
| 改任何界面上的文字、状态、空态、错误 | 文案与状态表达 | 对应区域 |
| 新增或改按钮、弹层、菜单、Tooltip、表格、设置行 | 组件与交互模式 | 对应区域 |
| 消息流、工具行、Thinking、审批 | 中间消息区 | 聊天区 Markdown 渲染；轮尾与导航 |
| 回复尾部操作、用量胶囊、轮次导航、压缩显示、交付卡片 | 轮尾与导航 | 中间消息区 |
| 轨迹页 | 轨迹视图 | 中间消息区 |
| 输入框、`@` 引用、`/` 菜单、批注 | 聊天输入框 | 文件引用与回复批注；工作区、Git 与运行目标 |
| 侧栏会话列表、置顶、工作区分组 | 左侧会话栏 | 工作台布局 |
| 窗口布局、分栏、折叠、右侧面板外壳与文件打开 | 工作台布局与面板交互；右侧面板与文件渲染 | 文档面板 |
| Context 面板 | Context 面板 | 会话状态与数据流 |
| 子 Agent、后台任务、侧边对话 | 子 Agent 与后台任务 | 右侧面板与文件渲染 |
| 设置页、模型连接 | 设置页 | 组件与交互模式 §6 |
| 资源占用、悬浮监控窗口 | 资源监控 | 设置页 |
| 使用统计、Harness 统计 | 统计页 | 设置页 |
| 会话数据、store、live 事件 | 会话状态与数据流 | Preload bridge 与 Mock |
| 新增 IPC、写 mock、写测试 | Preload bridge 与 Mock | 前端验证约定 |
| web / 手机端 | Web / PWA 客户端 | 视觉 token |
| 验收 | [前端验证约定](../../FRONTEND_VERIFICATION.md) | 新功能开发清单 §9 |

## 必读 4 份

- [新功能开发清单](front-新功能开发清单.md)：工程规则（文件放哪、状态放哪、IPC、安全、测试）加 11 条 UI 自检。
- [视觉 token 规范](front-视觉token规范.md)：颜色职责与唯一色板、字体与字号（三层字号、档位、行高、字重，含 8–10px 白名单）、间距、圆角、阴影、层级、动效、强调色、主题硬约束、样式归属。
- [文案与状态表达规范](front-文案与状态表达规范.md)：中文取舍、说明文字默认不写、同一信息只出现一次、状态表达、空 / 零 / 未知 / 错误 / 加载的固定写法。
- [组件与交互模式规范](front-组件与交互模式规范.md)：Button / IconButton 变体、Tooltip、弹层怎么选、确认与撤销、设置行与对齐、表格与长值、对标与 demo。

## 区域规范

- [工作台布局与面板交互](front-工作台布局与面板交互规范.md)：SplitView、resize、折叠与恢复。
- [左侧会话栏](front-左侧会话栏规范.md)：会话、已置顶、工作区分区与视图选项。
- [中间消息区](front-中间消息区规范.md)：消息语法、工具流、执行状态。
- [轮尾与导航](front-轮尾与导航规范.md)：轮尾操作、用量胶囊、轮次导航、压缩显示、交付卡片。
- [聊天区 Markdown 渲染](front-聊天区Markdown渲染规范.md)：`MarkdownProse` 排版、公式、Mermaid、流式稳定性。
- [流式 Markdown 解析降频](front-流式Markdown解析降频规范.md)：尾部最多每 100ms 解析一次、原样尾巴、处理器常驻。
- [聊天输入框](front-聊天输入框规范.md)：Composer、模式、模型、附件、`/` 菜单、发送。
- [文件引用与回复批注](front-composer-file-mentions-and-response-annotations.md)：`@` 工作区文件、选区批注、引用托盘。
- [工作区、Git 与运行目标](front-workspace-git-worktree-context.md)：初始 Composer 的工作区、分支、本机 / 远端、工作树。
- [Environment 与 Git 操作](front-environment-and-git-actions.md)：顶部 Environment、编辑器选择、分支、Commit、Push。
- [右侧面板与文件渲染](front-右侧面板与文件渲染规范.md)：面板外壳、标签、文件打开、diff。
- [文档面板](front-文档面板规范.md)、[Markdown 编辑与渲染](front-Markdown编辑与渲染规范.md)：只含 Markdown 的目录树与 CodeMirror 6 编辑器。
- [Context 面板](front-Context面板规范.md)：当前上下文、会话统计、Bash 统计、路径卡片、契约字段。
- [子 Agent 与后台任务](front-子Agent与后台任务规范.md)：子 Agent 列表与详情顶栏、后台任务、侧边对话。
- [轨迹视图](front-轨迹视图规范.md)：轨迹页的结构、小字号白名单与交互。
- [设置页](front-设置页规范.md)：设置信息架构、模型连接、外观。
- [资源监控](front-资源监控规范.md)：资源占用页与悬浮窗、CPU / 内存口径、采集开销。
- [统计页](front-统计页规范.md)：使用统计与 Harness 统计的共同骨架、指标口径、卡片、明细表与存储改动。
- [会话状态与数据流](front-会话状态与数据流规范.md)：cell / live run / 本地状态、合并规则、evict。
- [Preload bridge 与 Mock](front-preload-bridge与mock规范.md)：`window.actspace` 契约、`api/<域>`、新增 IPC 步骤、mock 与测试打桩。
- [Web / PWA 客户端](front-web-pwa客户端规范.md)：`apps/web` 响应式客户端与视觉。
- 相关：[Review 变更来源](../core-review-change-sources.md)（右侧 Review 标签与六种 scope）、[Space 工作台](../多智能体协作/front-space-工作台设计.md)。

## 资产与 demo

- 规范和 token 为准；demo 只用于选方向，选定后结论写进区域规范、demo 删除。目前保留的 demo 只有四份，都是等 Electron 复验视觉后就删：`context-panel-polish-demo.html`（上下文面板）、`stats-redesign-demo.html`（统计页）、`subagent-compact-demo.html`（子智能体卡片）、`thinking-compact-demo.html`（简化思考过程，选定 D）。
