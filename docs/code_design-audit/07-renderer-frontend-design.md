# Renderer 与前端设计规范审查计划

## 目标

检查桌面端 renderer 的工作台布局、消息区、输入区、侧栏、右侧面板、设置页、Lab 页面、Kairos 页面和主题样式是否符合前端设计规范。重点关注设计偏移、组件可读性、状态管理重复、主题颜色硬约束和开发期 mock/兼容残留。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/front-前端设计文档.md`
- `docs/design-docs/front-全局视觉语言规范.md`
- `docs/design-docs/front-主题与配色规范.md`
- `docs/design-docs/front-tailwind-style-architecture.md`
- `docs/design-docs/front-基础组件封装规范.md`
- `docs/design-docs/front-工作台布局与面板交互规范.md`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/design-docs/front-聊天输入框规范.md`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/front-Kairos监控页规范.md`
- `docs/design-docs/lab-index.md`

## 重点代码与文件范围

- `packages/desktop/src/renderer/`
- `packages/desktop/src/renderer/components/`
- `packages/desktop/src/renderer/components/right-panel/`
- `packages/desktop/src/renderer/components/settings/`
- `packages/desktop/src/renderer/pages/`
- `packages/desktop/src/renderer/state/`
- `packages/desktop/src/renderer/styles/`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/*`

## 审查问题

- 工作台布局是否符合三栏、SplitView、面板 collapse/restore 的设计边界。
- Composer 是否符合输入区规范，模型、附件、Context、发送和 `/compact` 分流是否清晰。
- ConversationView 和 MessageBlock 是否消费 shared selector 派生结果，避免直接解析底层 raw event。
- 工具执行中态、完成态、SubAgent block、diff block 是否符合工具预览规范。
- 右侧面板是否按 Markdown/HTML/Context/Review/Kairos 等 view model 分层，不混入 IPC 或文件读取细节。
- 主题颜色是否遵守三态主题机制，避免 `text-black`、`bg-white`、硬编码 `#hex` 等非主题感知字面量。
- 组件是否过大、状态是否重复，是否存在 mock 数据、旧 UI 分支或开发期兼容残留。
- Lab 当前是否仍是 V0 renderer mock，代码和文档是否明确标注未接后端。

## 输出格式

### 偏移点

- 记录代码和文档设计不一致的地方。

### 不合理设计

- 记录实现选择、职责边界、数据流问题。

### 可读性问题

- 记录难读函数、命名、重复逻辑。

### 耦合问题

- 记录过高耦合、边界混乱，或者过度拆分导致理解成本高的问题。

### 死代码/兼容残留

- 记录开发期不需要保留的旧入口、无用分支、废弃类型。

### 建议动作

- 只给建议，不改代码。建议类型包括：删除、收敛、重构、补文档、补测试。

## 产出要求

- 本轮只审查和记录，不修改代码。
- 结论需要引用具体文件路径，尽量给出行号。
- 对不确定的问题标注为“待确认”，不要当作确定缺陷。

## 审查结果

### 发现 1：左侧折叠态从规范要求的 icon rail 退化为完全隐藏

- 偏移点：`docs/design-docs/front-工作台布局与面板交互规范.md` 要求左侧会话栏“首版支持折叠为 icon rail，不先做完全隐藏”；但 `packages/desktop/src/renderer/components/Sidebar.tsx:23` 只定义 `SidebarMode = "expanded" | "hidden"`，`packages/desktop/src/renderer/components/WorkbenchLayout.tsx:56-58` 还把旧 `rail` 存储值统一映射成 `hidden`，`packages/desktop/src/renderer/components/WorkbenchLayout.tsx:159-160` / `441-443` 在 hidden 时把左槽宽度置 0 并传给 `SplitView` 完全隐藏。
- 不合理设计：折叠态不再保留品牌、新建会话、搜索、设置等高频入口，用户在窄窗口或主动折叠后失去左侧导航 affordance，也和设计文档里的桌面工作台心智不一致。
- 可读性问题：代码注释同时出现“rail 模式已退役”“hidden 态”等说法（`packages/desktop/src/renderer/components/WorkbenchLayout.tsx:27`、`56`、`58`），但设计文档仍把 rail 当作当前首版能力，读者无法判断真实产品事实。
- 耦合问题：`WorkbenchLayout` 同时承担存储兼容、宽度 snap、左侧交互语义和 `SplitView` hidden 控制，导致“折叠为 rail”与“完全隐藏 pane”被同一状态吞掉。
- 死代码/兼容残留：`StoredWorkbenchLayout.leftMode?: SidebarMode | "rail"` 和 `stored.leftMode === "rail"` 的迁移兼容（`packages/desktop/src/renderer/components/WorkbenchLayout.tsx:17-19`、`56-58`）仍保留，但当前类型已无 rail 实现。
- 建议动作：收敛。要么恢复 `rail` 为 60px icon rail 并同步 `Sidebar` 渲染；要么明确改设计文档，把首版行为改为完全隐藏，并删除 `rail` 兼容分支避免继续误导。

### 发现 2：多处组件级颜色字面量绕过三态主题语义 token

- 偏移点：主题规范要求组件承载文字、背景、边框时只用语义 token；但 `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx:50-52` 为审批按钮写死 `bg-[#eeeff1]`、`bg-[#2f83c9]` 等浅/深两套 hex，`packages/desktop/src/renderer/components/Composer.tsx:70` 的图片附件占位写死 `#ffffff` / `#dce7f5`，`packages/desktop/src/renderer/components/UsageStatisticsPage.tsx:34` 用 `TOOL_COLORS = ["#2f6fff", ...]` 而不是 `--act-chart-series-*`。
- 不合理设计：这些颜色分散在业务组件中，主题切换的事实源不再只是 `styles/tokens.css`，后续浅/深/系统主题调色需要逐组件追踪。
- 可读性问题：合法例外和违规字面量混在一起，例如 `Composer.tsx:97` 的 `bg-brand text-white` 属于品牌底白字例外，而 `Composer.tsx:70` 是附件占位背景；单靠搜索结果难以判断哪些需要迁移。
- 耦合问题：Usage 图表色与 token 中的 `--act-chart-series-*` 重复维护，Bash 审批按钮又在组件内自带 dark variant，削弱了 token 层对主题的统一控制。
- 死代码/兼容残留：无确定死代码；但这类组件内硬编码是 Tailwind 迁移后的主题兼容残留。
- 建议动作：重构。把 Bash 审批按钮抽到语义状态类或 token；附件占位改用主题感知 CSS 变量 / surface 混合；Usage 图表统一从 `--act-chart-series-*` 读取，并补一次浅/深主题快照或组件测试。

### 发现 3：右侧 Workspace 文件树把 IPC 读取、错误降级和 Tab view model 组装混在视图组件里

- 偏移点：右侧面板规范要求 Markdown/HTML/Context/Review/Kairos 等按 view model 分层，renderer 不直接访问文件系统；当前 `WorkspaceFileTree` 虽然经 IPC 而非 FS，但把 `window.actspace.listWorkspaceDir`、`readWorkspaceFile` 调用、`WorkspaceReadFileResult -> RightPanelTab` 转换和 UI 渲染都放在一个组件内（`packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx:34-58`、`64-89`、`147-164`）。
- 不合理设计：视图组件直接知道 IPC 返回错误码、文件 renderKind、Tab 去重 id 和右侧面板对象模型；后续补 PDF/CSV、quick open、多 root 或 V3 Kairos 配置编辑时，会继续扩大这个组件的职责。
- 可读性问题：`DirView` / `EntryRow` 同时处理懒加载、展开状态、读取状态、错误文案和 tab 打开，文件树本身的交互结构被数据适配细节淹没。
- 耦合问题：`WorkspaceFileTree` 直接依赖 `useRightPanel().openTab` 与 `RightPanelTab` union（`packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx:4`、`122`），文件树无法作为纯浏览组件复用，也让右侧 Tab view model 与 IPC 契约强耦合。
- 死代码/兼容残留：无确定死代码。
- 建议动作：重构。抽出 `useWorkspaceFileBrowser` 或 `workspaceFileViewModel.ts`，集中做 IPC 调用、错误文案和 `RightPanelTab` 派生；组件只消费目录节点、loading/error 状态和 `onOpenFile`。

### 发现 4：SubAgent transcript 面板仍在 renderer 里直接解析 raw SessionEvent

- 偏移点：消息区规范要求 SubAgent 组件只消费 `MessageBlock.kind === "agent"` 字段，不解析 raw args、raw output 或 transcript 文件路径；但 `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx:73-247` 定义了 `eventPayload`、`toolCallMessage`、`toolResultFallbackMessage`、`usageText` 等 raw `SessionEvent` 解析逻辑，`buildTranscriptSections` 在 `288-367` 直接遍历 `event.type`。
- 不合理设计：SubAgent transcript 的工具语法派生散落在 renderer，而主消息流主要消费 `@actspace/shared` 的 `MessageBlock`；两套派生逻辑容易在工具 preview、错误摘要、usage 文案和最终回复规则上漂移。
- 可读性问题：单文件同时承担 transcript 加载、事件归并、raw event 解析、MessageBlock 构造、面板布局和折叠状态，`SubAgentTranscriptModal.tsx` 的阅读跨度过大。
- 耦合问题：组件依赖 `SessionEvent` payload 内部字段（如 `payload.arguments`、`payload.rawOutput`、`payload.modelOutput`，见 `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx:102-112`、`151-224`），绕过 shared selector / view model 边界。
- 死代码/兼容残留：`export const SubAgentTranscriptModal = SubAgentTranscriptPanel`（`packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx:511`）保留旧 Modal 命名；当前规范已经要求“Composer 上方 panel，不使用全局遮罩弹窗”，命名残留会误导后续使用者。
- 建议动作：重构。把 transcript sidecar 事件到 `TranscriptSections` / `MessageBlock` 的派生移到 shared selector 或 renderer state selector，并把文件名从 `SubAgentTranscriptModal.tsx` 收敛为 `SubAgentTranscriptPanel.tsx`。

### 发现 5：Lab 页面确认为 V0 renderer mock，但代码内没有运行时边界提示

- 偏移点：`docs/design-docs/lab-index.md` 明确“V0 renderer mock 已落地；后端 Lab Runtime、IPC 和持久化尚未实现”；实现上 `packages/desktop/src/renderer/components/LabPage.tsx:242-253` 完全用本地 `useState` 管理 cards、completedExperiments、dialog、newTitle 等状态，`281-291` 创建实验也只写本地状态，没有 IPC 或持久化。
- 不合理设计：页面已作为真实 `SidebarView` 进入主工作台（`packages/desktop/src/renderer/components/WorkbenchLayout.tsx:350-352`），但 UI 中未看到“未接后端 / mock”状态提示，用户可能把本地临时矩阵误认为可追溯实验事实。
- 可读性问题：Lab 组件内部类型名如 `LabCardView`、`LabCompletedExperimentView` 看起来像稳定 view model，但数据全是 renderer 临时状态，和长期设计里的实验事实落盘要求不匹配。
- 耦合问题：当前未接后端，耦合风险主要是未来 Runtime 接入时需要替换大量本地状态流；状态、弹窗和阶段推进都在单个组件内。
- 死代码/兼容残留：属于开发期 mock 残留，且文档有标注、代码 UI 未标注。
- 建议动作：补文档/补 UI 标识。保留 V0 mock 可接受，但应在页面 header 或空态加明确“实验数据暂不持久化 / V0 mock”提示，并在接入 Runtime 前抽出 Lab view model 与持久化边界。

### 发现 6：HTML 预览 iframe 基线主题只在首次渲染解析，系统主题变化后不会同步

- 偏移点：HTML 渲染规范要求注入最小 `color-scheme: light dark` 基线且主题感知；`HtmlRenderView` 用 `resolveTheme()` 读取 `data-theme` / `matchMedia`（`packages/desktop/src/renderer/components/right-panel/HtmlRenderView.tsx:31-43`），但 `const theme = useMemo(resolveTheme, [])` 只在挂载时执行一次（`packages/desktop/src/renderer/components/right-panel/HtmlRenderView.tsx:122`），`srcDoc` 只随 `html/csp/theme` 变化（`124`）。
- 不合理设计：用户在设置页切换浅/深/跟随系统后，已打开 HTML Tab 的 iframe baseline 仍停留在旧主题，除非重新挂载或重新打开 Tab；这和三态主题“整体翻转”的验收口径不一致。
- 可读性问题：`resolveTheme` 看起来支持 system，但缺少 `data-theme` / `prefers-color-scheme` 订阅，容易让读者误以为运行时切换已覆盖。
- 耦合问题：HTML iframe 的主题状态独立于 `appearance/apply.ts` 的主题应用链路，未通过统一 appearance state 或事件同步。
- 死代码/兼容残留：无确定死代码。
- 建议动作：补测试/重构。把 resolved theme 变成 state，监听 `data-theme` 变化和 `matchMedia("(prefers-color-scheme: dark)")`；或在 appearance 改变时让右侧 HTML view 重新生成 `srcDoc`。补一个已打开 HTML 预览在主题切换后的验证用例。
