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
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
- `docs/design-docs/frontend-ui/主题与配色规范.md`
- `docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend-ui/HTML渲染与沙箱安全规范.md`
- `docs/design-docs/frontend-ui/Markdown渲染规范.md`
- `docs/design-docs/frontend-ui/Context完整视图规范.md`
- `docs/design-docs/frontend-ui/消息可视化转换规范.md`
- `docs/design-docs/frontend-ui/Kairos监控页规范.md`
- `docs/design-docs/frontend-ui/Kairos右侧紧凑视图规范.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`

> 本计划派生自上述四份专题规范（HTML / Markdown / Context / 消息可视化转换）。规范是"为什么 / 做成什么样 / V1-V2 边界 / 安全约束"的事实来源；本计划只负责"谁改哪些文件、按什么顺序、怎么验证"。两者冲突以规范为准。

补充素材：

- `2026-05-27的使用bug小记.md`

## 范围

包含：

- `#21` 打开终端：本计划明确暂不做，仅保留入口状态或禁用说明。
- `#22` 打开浏览器：V1 只做 sandbox iframe 的简单 HTML 渲染（自包含），不做完整外部浏览器；相对资源 / 独立 origin 属 V2（见 `HTML渲染与沙箱安全规范.md`）。
- `#23` 打开文件并显示预览（Markdown / 文本 / 图片，见 `Markdown渲染规范.md`）。
- `#24` 打开文件改变：明确后置，不在第一版实现。
- `#25` 打开 Context 完整信息：V1 做只读展示，增删改属 V2（见 `Context完整视图规范.md`）。
- `#26` 打开 Kairos 视图：只做部分组件，让用户边聊天边查看 Kairos 状态。

不包含：

- 不实现终端嵌入。
- 不实现真实 Chrome / 外部浏览器控制。
- 不实现文件编辑保存。
- 不实现 Context 增删改。
- 不重做 Kairos 全页面；只做右侧轻量状态视图。
- 不处理 Composer、附件或设置页样式。

> Kairos 右侧轻量状态视图已拆出独立计划 `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md`，该计划负责具体组件拆分、同源数据流和窄宽适配。本计划保留右侧面板总框架与文件/Context/HTML 等对象浏览主线。

## 相关代码路径

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/**`
- `packages/desktop/src/renderer/fixtures/**`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend-ui/HTML渲染与沙箱安全规范.md`
- `docs/design-docs/frontend-ui/Markdown渲染规范.md`
- `docs/design-docs/frontend-ui/Context完整视图规范.md`
- `docs/design-docs/frontend-ui/消息可视化转换规范.md`
- `packages/desktop/src/renderer/components/ConversationView.tsx`（`TurnActions` 操作条，可视化按钮入口）
- `packages/agent-core/src/llm/**`（MD→HTML 转换调用）
- `docs/design-docs/frontend-ui/Kairos监控页规范.md`
- `docs/design-docs/frontend-ui/Kairos右侧紧凑视图规范.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`

## 并行边界

- 本计划 owns right panel shell、tabs、file preview、HTML preview、Context full read-only panel and Kairos side view。
- 不修改 Composer 的 Context popup；如需共享 Context 数据，消费同一份 context state。
- 不修改 Usage 页面。
- 如果需要新增 IPC 读取文件，必须保持 renderer 不直接访问文件系统。

## V1 实施任务（本轮：简单 + 安全）

> 本轮只做 V1。每个 Task 的 V1/V2 精确边界以对应 design-doc 为准（`HTML渲染与沙箱安全规范.md` / `Markdown渲染规范.md` / `Context完整视图规范.md`）。

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

依据 `Markdown渲染规范.md` 的 V1：

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

依据 `HTML渲染与沙箱安全规范.md` 的 V1：

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

依据 `Context完整视图规范.md` 的 V1：

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

- 由 `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md` 承接具体实现。
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

## V2 实施任务（计划先写，**等用户指令再做**）

> ⚠️ 以下 V2 默认**不执行**。除非用户在后续明确发出"做 V2 / 做某项 V2"的指令，否则保持"只写不做"。各项细节见对应 design-doc 的 V2 小节。

### V2-A: HTML 完整版（见 `HTML渲染与沙箱安全规范.md` V2）

- 独立 origin：Electron main 注册限定 workspace 根的自定义协议（`actfile://`）或本地端口；借鉴 VS Code Webview 的 `localResourceRoots` + `asWebviewUri` + CSP nonce。
- 独立 origin 下安全开 `allow-scripts allow-same-origin`，支持相对资源 / 多文件 artifact（URL-load）。
- iframe keep-alive 池、外部浏览器逃生口、双向交互桥（截图 / inspect / 调参）、发布隔离。

### V2-B: Markdown 完整版（见 `Markdown渲染规范.md` V2）

- `rehype-raw` + `rehype-sanitize`；`remark-math` + `rehype-katex`；Mermaid（`securityLevel: "sandbox"`）；高亮升级 Shiki；TOC / 锚点；聊天区统一迁移到该渲染栈。

### V2-C: Context 完整版（见 `Context完整视图规范.md` V2）

- 新增 renderer IPC 读取 entry 全文；增删改 / pin / include 切换；按 `sourceEventIds` / `sourceFiles` 跳转；上下文搜索 / 过滤；MCP / Subagents / Recent files 分区接入。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- 浏览器 mock 验证面板布局、Tab、Markdown、图片和 HTML mock；**浅 / 深双主题都要验**（配色硬约束）。
- HTML 用安全探针验证：iframe 拿不到 `window.actspace` / Node，`fetch` 外联被 CSP 拦截。
- 涉及文件读取、preload、IPC 和本地路径时必须做 Electron 真实验证。

## 进度记录

- [x] 2026-05-30：落三份渲染专题规范（HTML / Markdown / Context）并挂入 `frontend-ui/index.md`。
- [x] 2026-05-30：Tab 栏方案 A（压缩按钮高度 + 字号）。
- [ ] 完成右侧面板 Tab 底座（开关 / 列表 / 当前 / 关闭 / 点击消息打开）。
- [ ] 完成 Markdown / 文本 / 图片预览（V1）。
- [ ] 完成 HTML 渲染视图（V1：srcDoc + CSP 双档 + 最小桥）。
- [ ] 完成 Context 完整只读视图（V1：接 contextState + 配色联动 + 折叠/导出）。
- [ ] 与 `20260528-kairos-right-panel-compact-view.md` 对齐 Kairos tab 接入边界。
- [ ] 完成暂缓入口收口。
- [ ] 跑完验证，更新必要文档和 history。
- [ ] （V2，待用户指令）HTML / Markdown / Context 完整版。

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
- 行视觉：**整行浅色底 + 左侧 2px 同色竖条**，不用分割线。浅底由 `color-mix(in srgb, var(--act-context-*) <pct>%, transparent)` 从既有 token 派生，浅/深主题自动翻转（满足主题与配色硬约束，不新增 token）。
- Conversation：默认折叠，展开也最多显示 N 条（首版 N=20）；提供**导出**按钮（首版用 renderer Blob 下载 `.md`/`.json`，不引 IPC）。
- 折叠标题样式同 Kairos sheet 的「会话历史」，但**箭头放到文字右侧**。
- 数据来源：完整全文类信息（system prompt 正文、tools、rules 等）当前没有面向 renderer 的读取 IPC（`read-file` 仅在 agent-core 工具侧），首版先用 `contextSnapshot` / fixtures 能给的内容渲染，全文类按需补 IPC，分阶段接入。

## 决策记录

- 2026-05-27：右侧工作区第一版只做查看，不做编辑；终端和文件改变明确后置，避免把右侧面板变成过大的并行任务。
- 2026-05-30：与用户共定右侧视图四项决策（Tab 方案A / 渲染栈 rehype-highlight / Context 行用浅底+左色条 / Context 入口用展开图标），详见「设计决策（2026-05-30 锁定）」。
- 2026-05-30：采用"先文档后代码"。先落三份渲染专题规范（`HTML渲染与沙箱安全规范.md` / `Markdown渲染规范.md` / `Context完整视图规范.md`），再由规范派生本计划。
- 2026-05-30：HTML 渲染从"完整 + 安全"角度定 V1/V2 两版——V1 用 sandbox srcDoc iframe 的简单安全版；V2（独立 origin 完整版）计划已写，**默认不动工，等用户显式指令再做**。同口径适用于 Markdown / Context 的 V2。
