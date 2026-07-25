## [2026-05-30 16:55] | Task: 右侧面板修复 + Reply HTML 视图 + Context 内容修复

### 🤖 Execution Context

- **Agent ID**: `本地会话`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> 1. 消息末尾的可视化按钮 logo 不好看要换、悬浮要有文本提示；HTML 渲染了但预览/源码都无法向下滚动。
> 2. 右侧折叠按钮左侧加一个 `+`（像 Cursor），里面是 Reply HTML / Kairos / Context；Reply HTML 点开是「顶部操作栏（收起文件栏 + 文件路径）+ 文件列表栏 + 渲染栏」，文件列表是当前会话生成过的 HTML，没有则空。
> 3. Context 页面的展开按钮 logo 太丑换成眼睛；有 bug 不展示内容，应该按类型展示具体上下文内容；整行背景色不简约，保留只有一条竖线的 header，展开内容用白底、不要颜色。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/agent-core`、`@actspace/desktop`（main + preload + renderer）+ `docs/`

**Key Actions:**

- **滚动 bug 修复**: 根因是右侧 `<aside>`（`RIGHT_PANEL_CLASS`）没有 `h-full`，而主区 `ConversationView` 有，导致 `flex-1 min-h-0` 在 auto 高度上不裁剪、内容溢出到 `overflow-hidden` 外无法滚动。给 aside 加 `h-full min-h-0`、tabs 行加 `shrink-0`，HTML 预览/源码、Context、Reply HTML 全部恢复滚动。
- **可视化按钮换 logo + 提示**: `idle`→`Wand2`、`generating`→`Loader2`、`ready`→`Eye`，保留原生 `title` 悬浮提示。
- **Context 展开按钮换 Eye**: `ContextPopup` 展开图标由 `PanelRight` 改 `Eye`，文案「查看完整上下文」。
- **Context 不展示内容修复**: 后端 `createContextState` 新增 `buildBucketPreviews(ctx)`，为每个 bucket 填充 `preview`（systemPrompt 正文 / tools 名单 / 摘要正文 / 最近 8 条会话摘录，截断保护）；前端展开即显示真实内容，空 bucket 给兜底文案。
- **Context 行视觉重做**: 去掉整行 `color-mix` 浅底（`tintStyle`），分区头保留一条同色竖线；展开内容改 `bg-surface` 白底卡片 + `border-line` 细边（主题感知，浅=白/深=深）；汇总型 bucket 隐藏与分区同名的标题。
- **`+ 新建对象菜单`**: 新增 `RightPanelObjectMenu`（Reply HTML / Kairos / Context，稳定 id 去重），放在 chrome-right 右侧折叠按钮左侧；`WindowChromeBar` 加 `rightLeading` 插槽，Kairos 全屏页隐藏。
- **Reply HTML 视图**: 新增 Tab 种类 `replyHtml` + `ReplyHtmlRenderView`（操作栏：文件名/计数 + 刷新 + 收起文件栏；两栏：文件列表 + 复用沙箱 `HtmlRenderView` 渲染区；空态降级）。数据走新 IPC `visualize:list`（service `listVisualizations` 读 `visualizations.json`，倒序 + 派生 `title`，sidecar 现存 `title` 字段）；shared 契约 + preload + `global.d.ts` 全链路补齐。

### 🧠 Design Intent (Why)

- 滚动链路的正确做法是「定高祖先 + 每层 `min-h-0` + 末层 `overflow-auto`」，aside 漏了 `h-full` 这一环；统一与主区对齐而非给每个子视图打补丁。
- Context「展示内容」属真实需求而非纯样式：renderer 侧 `ContextStateEntry` 只有 token，内容只能由后端在构建快照时一并喂 `preview`；全文仍按 V2 用 IPC，当前用导出兜底。
- 「白底」按主题硬约束落到 `bg-surface`（主题感知）而非字面量 white，浅/深双主题都验过。
- Reply HTML 复用既有可视化缓存 sidecar，不引入新存储；renderer 不直接读 FS，统一走 IPC。

### ✅ Verification

- `pnpm typecheck`、`pnpm --filter @actspace/agent-core test`（492）、`pnpm --filter @actspace/desktop test`（164）、`pnpm build` 全绿。
- 浏览器 mock（127.0.0.1:5173）验：`+` 菜单三项、Context 视图（白底卡片 + 竖线 header + 真实内容预览）、Reply HTML 空态布局；浅/深主题各截图确认配色翻转正确。
- 未验：Electron 真链路下 `visualize:list` 真实读盘与可视化生成后列表刷新（无 Computer Use 直连桌面窗口，建议用户在 `pnpm dev` 窗口点一次「可视化」后开 Reply HTML 复核）。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/desktop/src/main/index.ts`、`packages/desktop/src/main/visualize-service.ts`、`packages/desktop/src/main/test/visualize-service.test.ts`
- `packages/desktop/src/preload/index.ts`、`packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/RightPanel.tsx`、`WindowChromeBar.tsx`、`WorkbenchLayout.tsx`、`ContextPopup.tsx`、`ConversationView.tsx`
- `packages/desktop/src/renderer/components/right-panel/ReplyHtmlRenderView.tsx`（新）、`RightPanelObjectMenu.tsx`（新）、`RightPanelContext.tsx`、`ContextRenderView.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`、`test/context-popup.test.tsx`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`、`front-右侧面板与文件渲染规范.md`、`front-右侧面板与文件渲染规范.md`
- `docs/exec-plans/active/20260527-right-panel-views.md`

---

### 🔧 Follow-up（17:20）：Reply HTML 改下拉选择器 + 验证补强

用户复看后的二轮反馈与处理：

- **`+` 按钮可见性**：浏览器 mock 验证「面板关闭时 `+` 始终在 chrome-right 显示」，代码本就如此；顺手把渲染门槛从 `view !== "kairos"` 收紧到 `view === "chat"`（lab/usage 下面板不渲染，`+` 无意义）。若 Electron 窗口看不到，多半是 HMR 残留，Cmd+R 重载即可。
- **Reply HTML 重做为下拉选择器**：弃用常驻侧栏（会挡住渲染图），改为操作栏左起「文件选择器（下拉浮层 + 滚动列表，仅文件名）+ 刷新」，渲染区占满；文件项去掉文件图标与时间戳，只留文件名。与「每条回复下的可视化按钮」互补（按需看单条 vs 集中浏览全部）。
- **Context 仍空的根因确认**：内容预览逻辑正确（bucket key 与 `buildBucketPreviews` 完全匹配，新增 `context-state-preview.test.ts` 3 例验证 systemPrompt/tools→toolDefinitions/conversation/summarized 映射）。当前为空是因为：①运行中的 dev main 进程仍是改动前的 agent-core（tsc watch 重编译但 node 进程不重载）；②展示的是改动前持久化的 contextState。**重启 `pnpm dev` + 发一条新消息**后，System prompt/Tools/Conversation 即会显示内容预览；Rules/Skills 是 system prompt 的内嵌子段、token 恒为 0，按设计保持空（可按需改为「空桶折叠/隐藏」）。
- **验证**：`pnpm typecheck`、agent-core 495、desktop 164、`pnpm build` 全绿；浏览器 mock 复验 `+`（关闭态可见）、Reply HTML 下拉空态布局。

补充改动文件：`packages/agent-core/src/engine/bridge.ts`（导出 `buildBucketPreviews`/`createContextState`）、`packages/agent-core/src/engine/test/context-state-preview.test.ts`（新）、`packages/desktop/src/renderer/components/right-panel/ReplyHtmlRenderView.tsx`（重写）、`WorkbenchLayout.tsx`。

---

### 🔧 Follow-up（20:10）：Context 按需重建 + Tab 溢出（Cursor 式）+ `+` 仅开面板时显示

三轮反馈与处理：

- **`+` 按钮语义反转**：上一轮误以为「关闭时不显示是 bug」；用户本意是 **`+` 只在右侧面板打开时显示**（`+` 是往面板加对象，面板关着时无意义）。改 `WorkbenchLayout` 的 `rightLeading` 门槛为 `view === "chat" && isRightPanelOpen`。
- **Context 仍为空 = 持久化数据陈旧 + 主进程未重载**：确认加载链路（`context-state.json` 全量 round-trip `preview`）无 bug，但**持久化快照写于 preview 逻辑之前**，且 dev main 不热重载 agent-core/main。根治方案：新增 **按需重建 IPC `context:describe`**——main 侧 `describeSessionContext` 复用 `buildAgentConfig + createAgentForSession`（一次性吃完 `session.jsonl`）+ `setTools(getToolDefinitions())` + `buildBucketPreviews` + `createContextState`，**不调用 LLM**，对任意老会话即时算出各 bucket 内容预览。前端 `ContextRenderView` 打开时拉取，`mergeContextPreviews` 仅为缺预览的 entry 补内容、保留快照 token/结构（与 Context 弹窗一致）；无持久化快照时整体回退到 describe。
- **关键根因（纠正上一轮结论）**：本模板 `MAIN_AGENT_SYSTEM_PROMPT = ""`（空串），故 **System prompt / Rules / Skills bucket 合法地 0 token、永远无内容**——这不是 bug，截图里「System prompt ~0 tokens 无内容」是正确表现。真正有内容的是 **Tools（工具清单）与 Conversation（会话摘录）**；修复后 Tools 即显示工具清单预览。空态文案据此区分：`tokens>0` 无预览→「内容较多，请导出查看」；`tokens===0`→「本会话暂未使用该类上下文」。
- **Tab 过多（Cursor 式，无水平滚动条）**：根因是 chrome-right 现有两个浮层控件（`+` 与折叠），而 tab 条只预留了一个控件宽度 → tab 滑到 `+` 下方重叠。重做 `RightPanelTabs`：右侧预留 `2*control + 28px`；tab 横向滚动但**隐藏滚动条**（`.scrollbar-none`），激活 tab 自动滚入可见区；额外给一个 **溢出下拉 ⌄**（`ResizeObserver` 检测 `scrollWidth>clientWidth` 才出现），列出全部 tab 供点选/关闭——这是无滚动条时的可达性兜底，正是 Cursor 编辑器标签的做法。

**验证**：`pnpm -r typecheck`、agent-core 495、desktop 168（新增 `context-describe-service.test.ts` 2 例 [node 环境，Anthropic SDK 拒绝 jsdom] + `context-render-view.test.tsx` describe 合并/回退 2 例）全绿。

补充改动文件：`packages/shared/src/ipc.ts`（`DescribeContextInput`）、`packages/agent-core/src/engine/index.ts`（导出）、`packages/desktop/src/main/context-describe-service.ts`（新）、`packages/desktop/src/main/index.ts`、`packages/desktop/src/preload/index.ts`、`packages/desktop/src/global.d.ts`、`packages/desktop/src/renderer/components/RightPanel.tsx`（`RightPanelTabs` 溢出处理）、`WorkbenchLayout.tsx`、`right-panel/ContextRenderView.tsx`、`styles/electron.css`（`.scrollbar-none`）、`test/context-render-view.test.tsx`、`test/app-streaming-user-message.test.tsx`、`main/test/context-describe-service.test.ts`（新）。
