# 2026-05-27 右侧工作区视图计划

## 目标

把右侧区域从静态设计推进为可用的对象浏览工作区。第一版优先支持文件预览、HTML 渲染、完整 Context 只读视图和 Kairos 状态视图，让用户可以一边聊天一边查看当前对象和运行状态。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/front-工作台布局与面板交互规范.md`
- `docs/design-docs/front-主题与配色规范.md`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/front-Kairos监控页规范.md`
- `docs/design-docs/agent-kairos-autonomous-mode.md`

> 本计划派生自右侧面板母规范与 Kairos 监控页母规范。规范是"为什么 / 做成什么样 / V1-V2 边界 / 安全约束"的事实来源；本计划只负责"谁改哪些文件、按什么顺序、怎么验证"。两者冲突以规范为准。

补充素材：

- `2026-05-27的使用bug小记.md`

## 范围

包含：

- `#21` 打开终端：本计划明确暂不做，仅保留入口状态或禁用说明。
- `#22` 打开浏览器：V1 只做 sandbox iframe 的简单 HTML 渲染（自包含），不做完整外部浏览器；相对资源 / 独立 origin 属 V2（见 `front-右侧面板与文件渲染规范.md`）。
- `#23` 打开文件并显示预览（Markdown / 文本 / 图片，见 `front-右侧面板与文件渲染规范.md`）。
- `#24` 打开文件改变：明确后置，不在第一版实现。
- `#25` 打开 Context 完整信息：V1 做只读展示，增删改属 V2（见 `front-右侧面板与文件渲染规范.md`）。
- `#26` 打开 Kairos 视图：只做部分组件，让用户边聊天边查看 Kairos 状态。

不包含：

- 不实现终端嵌入。
- 不实现真实 Chrome / 外部浏览器控制。
- 不实现文件编辑保存。
- 不实现 Context 增删改。
- 不重做 Kairos 全页面；只做右侧轻量状态视图。
- 不处理 Composer、附件或设置页样式。

> Kairos 右侧轻量状态视图已拆出独立计划 `docs/exec-plans/completed/20260528-kairos-right-panel-compact-view.md`，该计划负责具体组件拆分、同源数据流和窄宽适配。本计划保留右侧面板总框架与文件/Context/HTML 等对象浏览主线。

## 相关代码路径

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/**`
- `packages/desktop/src/renderer/fixtures/**`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `packages/desktop/src/renderer/components/ConversationView.tsx`（`TurnActions` 操作条，可视化按钮入口）
- `packages/agent-core/src/llm/**`（MD→HTML 转换调用）
- `docs/design-docs/front-Kairos监控页规范.md`
- `docs/design-docs/agent-kairos-autonomous-mode.md`

## 并行边界

- 本计划 owns right panel shell、tabs、file preview、HTML preview、Context full read-only panel and Kairos side view。
- 不修改 Composer 的 Context popup；如需共享 Context 数据，消费同一份 context state。
- 不修改 Usage 页面。
- 如果需要新增 IPC 读取文件，必须保持 renderer 不直接访问文件系统。

## V1 实施任务（本轮：简单 + 安全）

> 本轮只做 V1。每个 Task 的 V1/V2 精确边界以 `front-右侧面板与文件渲染规范.md` 和 `front-Kairos监控页规范.md` 为准。

### Task 1: 右侧面板 Tab 底座

修改目标：

- 建立右侧面板打开/关闭状态、Tab 列表、当前 Tab、关闭 Tab。
- 点击消息中的文件、链接、图片或 diff 时可打开对应 Tab。
- 面板关闭后把空间还给聊天区。
- Tab 栏方案 A（压缩按钮高度 + 字号）。

验收：

- 点击文件类消息后右侧面板打开。
- 多个 Tab 可切换和关闭。
- 空态和关闭态都稳定。

进展：

- ✅ 2026-05-30：Tab 栏方案 A 已落地（`RightPanel.tsx`：`px-2 py-1` + `text-[12px]` + `rounded-act-sm`，保留 44px chrome 对齐）。
- ⏳ Tab 底座（开关 / 列表 / 当前 / 关闭 / 点击消息打开）仍待做。

### Task 2: Markdown / 文本 / 图片预览（V1）

依据 `front-右侧面板与文件渲染规范.md` 的 V1：

- 引入 `react-markdown` + `remark-gfm` + `rehype-highlight` 渲染 `md`；补一套随主题翻转的 hljs 配色（浅/深各一套）。
- Preview / 源码 切换（与 HTML 共用同一分段控件模式）。
- 复用 `.markdown-prose` / `markdown.css`；链接 sanitize；不引 `rehype-raw`。
- 文本/代码可滚动查看；图片直接预览。
- renderer 通过 preload / IPC 请求文件内容，不直接读文件系统；路径显示相对 workspace 路径。

验收：

- 打开 Markdown 文件显示渲染文档（表格 / 任务列表 / 代码高亮），可切源码。
- 浅 / 深主题下正文与代码高亮配色都正确。
- 打开图片直接预览；打开普通文本/代码显示可滚动内容。

### Task 3: HTML 渲染视图（V1）

依据 `front-右侧面板与文件渲染规范.md` 的 V1：

- `<iframe srcDoc={html} sandbox="allow-scripts">`，**绝不加 `allow-same-origin`**。
- CSP 双档注入 srcDoc：`strict`（本地文件默认，禁外联）/ `relaxed`（聊天 HTML 或用户主动信任，允 https 静态资源但 `connect-src 'none'`）。
- 最小 postMessage 桥：iframe → 父回传 运行时错误 + 内容高度。
- 主题注入（`color-scheme` + 基线样式）。
- 聊天行内 HTML 片段走 DOMPurify 净化后内联；整页 HTML 一律走 iframe。

验收：

- 自包含 HTML（含内联脚本）可在右侧渲染。
- 安全探针：iframe **拿不到** `window.actspace` / Node；`fetch` 外部被 CSP 拦截。
- 资源加载失败显示可读错误；`srcDoc` 路径不出现 `allow-same-origin`。

### Task 4: Context 完整只读视图（V1）

依据 `front-右侧面板与文件渲染规范.md` 的 V1：

- 把 `contextState`（含 `entries`）接到右侧面板（App.tsx 当前只透传了 `contextSnapshot`）。
- 按 `kind` 分区渲染：分区头竖色条（配色联动 `--act-context-*`）+ 整行浅底（`color-mix` 派生）+ 左 2px 同色条，无分割线。
- 每个 entry 展示 `title / estimatedTokens / preview` + 源文件 chip。
- Conversation 默认折叠、最多 20 条、下拉箭头放文字右侧、导出按钮（Blob 下载 `.md`/`.json`）。
- 只读（不增删改）。
- `ContextPopup` ✕ 旁新增展开/详情图标按钮（`PanelRight` / `Maximize2`）→ 打开右侧 Context Tab。

验收：

- 从 Context 弹窗展开按钮可打开右侧 Context Tab。
- 有 `contextState` 时展示真实分组与 preview；没有时空态/兜底。
- 分区色与弹窗一致；行用浅底 + 左色条、无分割线。
- Conversation 默认折叠 / 最多 20 条 / 箭头右置 / 导出可下载；浅深双主题验过。

### Task 5: Kairos 轻量状态视图

- 由 `docs/exec-plans/completed/20260528-kairos-right-panel-compact-view.md` 承接具体实现。
- 本计划只要求右侧面板 tab 底座能够容纳 Kairos tab，不在这里重复定义 compact 布局。

验收：

- Kairos compact plan 完成后，可以通过右侧面板打开 Kairos tab。
- 右侧面板总框架不阻断 Kairos compact 视图接入。

### Task 6: 暂缓入口收口

- 对 `打开终端` 和 `打开文件改变` 做明确暂缓状态。
- UI 不应该出现点击无响应的入口。

验收：

- 暂不支持的入口禁用或显示简短说明。
- 文档记录后续计划，不让用户误以为是坏了。

### Task 7: 消息可视化转换（MD→HTML，依赖 Task 1 + Task 3）✅ 已完成（2026-05-30）

落地实现：

- agent-core `src/visualize/md-to-html.ts`：`convertReplyToHtml()` 复用 `buildAgentConfig` + `createLLMService`，单次 `llm.complete` 转换，`extractHtmlDocument()` 剥围栏/噪声取单文档。
- main `src/main/visualize-service.ts`：`visualizeReply()` 以 `messageId:sourceHash`（sha256 前 16 位）为键，缓存落 session 目录 `visualizations.json` sidecar；命中（`cached:true`）**零模型调用**；仅 `regenerate` 或 hash 变化才重算。
- IPC `visualize:convert-reply`（`shared/ipc.ts` 定契约 + preload + `global.d.ts`）。
- renderer `ConversationView.TurnActions`：⋯ 左侧加可视化按钮，状态机 idle→generating(`Loader2` spin)→ready(`Eye`)/error；ready 且本地有结果直接聚焦 Tab（零 IPC），⋯ 菜单提供"重新生成可视化"。
- 产物以 `trust:"chat"` 走 Task 3 的沙箱 HTML Tab 渲染。
- 单测：`agent-core .../visualize/test/md-to-html.test.ts`（extract 5 例）+ `desktop .../main/test/visualize-service.test.ts`（缓存命中零模型调用）。

依据 `front-右侧面板与文件渲染规范.md` 的 V1（**依赖**右侧 Tab 底座 Task 1 与 HTML 渲染 V1 Task 3）：

- `ConversationView` 的 `TurnActions` ⋯ 按钮**左侧**加可视化按钮（`Sparkles`/`Eye`）+ 状态机（idle/generating/ready/error）。
- 新增 IPC：用主模型把回复 Markdown 转 HTML（renderer 不直接调模型、不读写 FS）。
- 缓存持久化进 session 记录，键 = `turnId + sourceHash`；命中即读、**不重算**；提供"重新生成"。
- 产物在右侧 HTML Tab 渲染（沿用 Task 3 的沙箱），usage 计入统计。

验收：

- 首次点击触发一次主模型调用并渲染；usage 有记录。
- 再次点击同一回复**不触发模型调用**（dev 日志 / usage 可证）；重载后仍读缓存。
- 内容变化（hash 不命中）才重算；产物渲染走沙箱。

## V2 实施任务（计划先写，**等用户指令再做**）

> ⚠️ 以下 V2 默认**不执行**。除非用户在后续明确发出"做 V2 / 做某项 V2"的指令，否则保持"只写不做"。各项细节见对应 design-doc 的 V2 小节。

### V2-A: HTML 完整版（见 `front-右侧面板与文件渲染规范.md` V2）

- 独立 origin：Electron main 注册限定 workspace 根的自定义协议（`actfile://`）或本地端口；借鉴 VS Code Webview 的 `localResourceRoots` + `asWebviewUri` + CSP nonce。
- 独立 origin 下安全开 `allow-scripts allow-same-origin`，支持相对资源 / 多文件 artifact（URL-load）。
- iframe keep-alive 池、外部浏览器逃生口、双向交互桥（截图 / inspect / 调参）、发布隔离。

### V2-B: Markdown 完整版（见 `front-右侧面板与文件渲染规范.md` V2）

- `rehype-raw` + `rehype-sanitize`；`remark-math` + `rehype-katex`；Mermaid（`securityLevel: "sandbox"`）；高亮升级 Shiki；TOC / 锚点；聊天区统一迁移到该渲染栈。

### V2-C: Context 完整版（见 `front-右侧面板与文件渲染规范.md` V2）

- 新增 renderer IPC 读取 entry 全文；增删改 / pin / include 切换；按 `sourceEventIds` / `sourceFiles` 跳转；上下文搜索 / 过滤；MCP / Subagents / Recent files 分区接入。

### V2-D: 消息可视化转换 完整版（见 `front-右侧面板与文件渲染规范.md` V2）

- 转换流式渲染；风格预设 / 多版本对比 / 保留历史版本；可视化结果导出（依赖 HTML V2 导出）；消息流内联"可视化"折叠入口；超长回复分段转换拼接。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- 浏览器 mock 验证面板布局、Tab、Markdown、图片和 HTML mock；**浅 / 深双主题都要验**（配色硬约束）。
- HTML 用安全探针验证：iframe 拿不到 `window.actspace` / Node，`fetch` 外联被 CSP 拦截。
- 涉及文件读取、preload、IPC 和本地路径时必须做 Electron 真实验证。

## 进度记录

- [x] 2026-05-30：落右侧渲染规范（HTML / Markdown / Context）并挂入 `front-index.md`；后续已合并进 `front-右侧面板与文件渲染规范.md`。
- [x] 2026-05-30：补 `front-右侧面板与文件渲染规范.md`（MD→HTML 主模型转换 + 缓存 + 沙箱渲染），挂入 index。
- [x] 2026-05-30：Tab 栏方案 A（压缩按钮高度 + 字号）。
- [x] 2026-05-30：完成右侧面板 Tab 底座（`RightPanelContext` 驱动开关 / 动态列表 / 当前 / 关闭）。
- [x] 2026-05-30：完成 Markdown / 文本 / 图片预览（V1：`react-markdown` + `remark-gfm` + `rehype-highlight`，Preview/源码）。
- [x] 2026-05-30：完成 HTML 渲染视图（V1：srcDoc + CSP 双档 + 最小桥 + 主题注入）。
- [x] 2026-05-30：完成 Context 完整只读视图（V1：接 contextState + bucket 配色联动 + Conversation 折叠/导出）。
- [x] 2026-05-30：完成消息可视化转换（V1：⋯左侧 `Sparkles`/`Eye` 按钮 + 状态机 + 主模型 IPC + session sidecar 缓存 + 右侧沙箱渲染）。
- [ ] 与 `20260528-kairos-right-panel-compact-view.md` 对齐 Kairos tab 接入边界。
- [ ] 完成暂缓入口收口（Task 6）。
- [ ] Task 2 后端：`read-file` IPC（renderer 不直接读 FS）+ 点击消息文件打开 Tab。
- [x] 2026-05-30：跑完验证（`pnpm typecheck` + `pnpm test` 654 全绿 + `pnpm build`）。
- [ ] （V2，待用户指令）HTML / Markdown / Context / 可视化转换 完整版。

## 设计决策（2026-05-30 锁定）

这轮和用户一起确认的右侧视图方向，后续实现以此为准：

### Tab 栏（对应 Task 1）

- 方案 A：**只压缩 Tab 按钮本身**，行容器继续 `min-h-[var(--window-chrome-strip-height)]`（44px）以对齐左侧窗口控制与中间标题，不动全局 chrome strip 高度。
- 按钮：`px-2.5 py-2` → `px-2 py-1`，`font-[inherit]` → `text-[12px]`，圆角与行内边距同步收紧；目标是按钮可视高度较现状降约 1/3，文字回到紧凑标签尺寸。

### Markdown / HTML 渲染（对应 Task 2 / Task 3）

- 渲染栈：`react-markdown` + `remark-gfm`，代码高亮用 **`rehype-highlight`（highlight.js，轻量同步）**；Shiki 作为后续可选升级，不在首版。
- HTML：沙箱 `<iframe sandbox srcdoc>`，不加 `allow-same-origin`；CSP 用 srcdoc 内 `<meta http-equiv>` 同梱。首版只支持自包含 HTML（内联样式 / 绝对 URL），相对资源后置。
- Preview / 源码 切换：轻量分段控件（Radix ToggleGroup 或自写两按钮），源码侧复用同一套 highlight 给原始文本上色。

### Context 完整只读视图（对应 Task 4）

- 入口：Context 弹窗 ✕ 旁加一个**展开/详情图标**（`PanelRight` / `Maximize2`，不用铅笔，避免暗示可编辑），点击打开右侧 Context Tab。
- 配色联动：每个分区用 bucket 色 `--act-context-*`（单一来源 `@actspace/shared` 的 `CONTEXT_BUCKET_REGISTRY`），让弹窗色与完整视图色一致。
- 行视觉（2026-05-30 修订）：**分区标题左侧一条同色竖线**保留；展开后内容用 **白底（`bg-surface`）卡片**呈现具体上下文内容，不再给整行染色（用户反馈整行底色不够简约）。`bg-surface` 主题感知，浅色=白、深色=深，满足配色硬约束。
- 内容来源（2026-05-30 修订）：后端 `createContextState` 为每个 bucket 填充 `preview`（systemPrompt 正文 / tools 名单 / 摘要正文 / 最近若干条会话），前端展开即显示真实内容；空 bucket 给兜底文案。
- Conversation：默认折叠，展开也最多显示 N 条（首版 N=20）；提供**导出**按钮（首版用 renderer Blob 下载 `.md`/`.json`，不引 IPC）。
- 折叠标题样式同 Kairos sheet 的「会话历史」，但**箭头放到文字右侧**。
- 数据来源：完整全文类信息（system prompt 正文、tools、rules 等）当前没有面向 renderer 的读取 IPC（`read-file` 仅在 agent-core 工具侧），首版先用 `contextSnapshot` / fixtures 能给的内容渲染，全文类按需补 IPC，分阶段接入。

## 决策记录

- 2026-05-27：右侧工作区第一版只做查看，不做编辑；终端和文件改变明确后置，避免把右侧面板变成过大的并行任务。
- 2026-05-30：与用户共定右侧视图四项决策（Tab 方案A / 渲染栈 rehype-highlight / Context 行用浅底+左色条 / Context 入口用展开图标），详见「设计决策（2026-05-30 锁定）」。
- 2026-05-30：采用"先文档后代码"。先落右侧渲染专题规范，再由规范派生本计划；这些专题后续已收敛到 `front-右侧面板与文件渲染规范.md`。
- 2026-05-30：HTML 渲染从"完整 + 安全"角度定 V1/V2 两版——V1 用 sandbox srcDoc iframe 的简单安全版；V2（独立 origin 完整版）计划已写，**默认不动工，等用户显式指令再做**。同口径适用于 Markdown / Context 的 V2。
- 2026-05-30：新增"消息可视化转换"（回复 MD→HTML）功能。核心约束是**生成一次、持久化缓存、后续读缓存不重算**（成本敏感）；转换走主模型 IPC，产物按半可信走 HTML 沙箱渲染。列为 Task 7，依赖 Tab 底座(Task 1) 与 HTML 渲染 V1(Task 3)。
