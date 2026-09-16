# 工具结果交互与后台通知修复

## 目标

修复桌面端 Agent 会话中后台任务通知泄露、文件工具结果不可展开、read 文件无法打开右侧视图、Explore 子 Agent 展示不一致、图片生成错误只能悬浮查看以及图片 provider 返回 HTML 时错误信息不友好等问题。最终让实时运行、Journal 回放、主消息流、子 Agent 右侧面板、工作区文件 Tab 和图片产物遵循同一套 typed preview 与交互规则。

## 范围

- 包含：
  - 后台 Bash 的 `task_notification` 继续注入模型，但不再作为普通用户消息渲染。
  - Read/List/Grep/Glob/Directory List 的结果预览在实时态和历史回放态保持一致，并使用通用展开控件。
  - Read workspace 文件点击打开右侧文件 Tab，路径由 main IPC 再次校验。
  - Explore 与通用 Agent 统一为右侧 SubAgent 详情视图，不再在主消息流内联展开 Explore transcript。
  - 图片生成失败/partial 状态使用可点击的错误或 warning 展开，而不是 hover-only tooltip；成功图片继续通过 Turn Artifacts 打开右侧 image Tab。
  - 图片 provider 返回 HTML、畸形 JSON 或缺少可用图片时，main 侧返回稳定且可解释的错误分类。
  - 相关 shared 类型、projection、renderer、focused tests、设计文档、执行记录和 history。
- 不包含：
  - 删除或改变后台通知给模型的 XML 语义。
  - 把所有工具都改成大卡片或改变 Web Search/Web Fetch 已有的 URL/正文展开行为。
  - Renderer 直接访问文件系统或信任 renderer 传入的绝对路径。
  - 将完整 SubAgent Journal 复制进主会话。
  - 更换图片 provider、修改 provider 凭据配置或强制所有 provider 使用同一图片协议。
  - Git stage、commit、push、分支清理、删除用户已有文件。
  - 覆盖当前工作树中与本计划无关的未提交改动。

## 背景

### 相关文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/frontend/front-agent-tool-stream-rendering.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/collaboration/agent-explore-subagent.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`

### 已确认根因

1. `bash` 的通知由 `notifyAgent()` 送入 MainAgentInbox，claim 时作为无来源的 user Surface 投影；selector 虽有 `source === "task_notification"` 的过滤，但 source 在 projection 边界丢失。
2. 当前工作树已经增加 `resultPreview` 的部分实时链路，但 `messageBlockFromToolPreview()` 的历史回放映射没有复制该字段，因此 reload 后 list/glob 等没有展开箭头。
3. `ToolLogLine` 没有 read 文件打开回调；现有 `readWorkspaceFile`、`tabFromFile` 和 `openTab` 能力没有接到工具行。
4. `actspace.explore` 当前被强制投影为 `display: "inline"`，`ExploreRunBlock` 的 Chevron 只展开内联 transcript；通用 Agent 才有右侧面板回调。
5. `image_generation` 当前总是走 `OverflowToolLine`，黑色悬浮框是长文本 tooltip，不是结构化错误详情。成功产物的 Turn Artifacts 右侧打开路径已经存在。
6. 图片服务在 `response.ok` 后直接 `JSON.parse` body；截图中的 `Unexpected token '<'` 说明服务返回了 HTML body，而不是 JSON。

### 相关代码路径

- Inbox / provenance：
  - `packages/tools/core-tools/src/bash/node-bash-ports.ts`
  - `packages/core/agent-loop/src/loop.ts`
  - `packages/core/agent/src/inbox.ts`
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
  - `packages/shared/src/session.ts`
  - `packages/shared/src/session-selectors.ts`
- Tool preview / renderer：
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-tool-preview.ts`
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts`
  - `apps/desktop/src/renderer/App.tsx`
  - `apps/desktop/src/renderer/components/ConversationView.tsx`
  - `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`
  - `apps/desktop/src/renderer/components/messages/ExploreRunBlock.tsx`
  - `apps/desktop/src/renderer/components/messages/AgentRunBlock.tsx`
  - `apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`
  - `apps/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
  - `apps/desktop/src/renderer/styles/web-tool.css`
- Workspace / artifacts：
  - `apps/desktop/src/main/workspace-fs-service.ts`
  - `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`
  - `apps/desktop/src/preload/index.ts`
  - `apps/desktop/src/renderer/components/right-panel/workspaceFileTab.ts`
  - `apps/desktop/src/renderer/components/messages/TurnOutputArtifacts.tsx`
- Image provider：
  - `packages/tools/core-tools/src/image/node-image-ports.ts`

### 当前工作树约束

仓库已有与本次问题相关及无关的未提交改动，尤其是 `fixed-renderer-tool-preview.ts`、`App.tsx`、`ToolLogLine.tsx`、`session.ts` 和若干测试。实施前必须保留这些改动并逐文件增量合并，不使用 broad staging，不执行破坏性 git 操作。

## 架构与数据流

```text
Bash notification ──> Inbox enqueue(source) ──> claim Surface(source)
                                                  │
                                                  └─> projection ──> selector hides model-only notice

Tool result ──> Main typed ToolUiPreview ──> live adapter ──> MessageBlock ──> ToolResultDisclosure
                              │                  ▲              │
                              └─ historical replay ─────────────┘
                                                               ├─ preview dropdown
                                                               ├─ read workspace file ──> right panel
                                                               ├─ Explore/Agent ──> SubagentsPanel
                                                               └─ image artifact/error ──> right image tab or details
```

## 方案与阶段

### 阶段 A：修复 task notification provenance（独立可交付）

1. 为 inbox 注入消息增加明确的 typed source，至少区分普通用户输入与 `task_notification`；source 进入 `agent/inbox/spliced` 的 enqueue/claim 数据或 Surface 元数据。
2. 让 `fixed-renderer-projection.ts` 在 user Surface 投影时保留 source，继续由 `UserMessagePayload.source` 表达，而不是在 renderer 对 XML 文本做正则判断。
3. 保留 `session-selectors.ts` 对 `task_notification` 的用户侧过滤；模型上下文和 Journal 不删除该消息。
4. 为自然完成、kill、output subscription、reload 和普通用户输入相同 XML 增加回归测试。

验证：`@actspace/shared` selector tests、core agent/inbox tests、desktop projection tests；确认用户消息列表不出现通知 XML，普通同文用户消息仍显示。

### 阶段 B：补齐结果预览回放并抽通用展开行（独立可交付）

1. 在 `messageBlockFromToolPreview()` 中完整复制 read/search/grep/glob/directory_list 的 `resultPreview`。
2. 保持实时 `App.toolEntryToBlock()` 与历史 `createMessageBlocks()` 使用相同字段和状态规则。
3. 将当前 `ResultPreviewBlock` 提取为工具无关的 `ToolResultDisclosure`（或等价内部组件），使用独立的 `tool-result-*` theme-aware class，不再复用 `web-tool-*` URL 样式。
4. 展开内容最多显示 8 条，空结果不显示空箭头，失败/拒绝/中止不显示伪造结果。
5. 保留当前 `outputPreview` 作为兼容输入，但在 preview 结构中固定 bounded 行数；如果工具 detail 已提供结构化 entries，优先使用 detail。

验证：shared selector、fixed renderer preview、renderer ToolLogLine tests；覆盖 fresh live、finished、rehydrated、empty、failed、long line 和 dark/light theme。

### 阶段 C：Read 文件安全打开右侧面板（独立可交付）

1. 为 read preview 增加可判断的打开目标，第一版只对确认属于当前 workspace 的相对路径开放右侧打开；绝对路径和无法确认来源的 artifact 保留摘要展示，不猜测读取方式。
2. 在 `ConversationView` 创建 read 打开回调，传给 `ToolLogLine`；摘要动作负责打开文件，Chevron 只负责展开读取行摘要。
3. 通过既有 `window.actspace.readWorkspaceFile()` → `tabFromFile()` → `openTab()` 打开 markdown/text/html/image/csv。
4. renderer 只传相对路径和当前会话 workspace 上下文；main `readWorkspaceFile()` 继续做 workspace boundary、文件类型、大小和二进制校验。
5. 失败时打开或更新明确的错误 Tab/状态，不使用 hover-only tooltip。

验证：renderer callback tests、workspace IPC/service tests、Tab mapping tests；覆盖文件不存在、越界、目录、二进制、大文件、会话切换和已有 Tab 聚焦。

### 阶段 D：Explore 统一为右侧 SubAgent 详情（独立可交付）

1. `actspace.explore` 的 preview display 改为 `panel`，不再走 `ExploreRunBlock` 主消息内联 transcript。
2. `ConversationView` 中所有 agent preview 统一走 `AgentRunBlock` + `onOpenAgentTranscript`。
3. `SubagentsPanel` 作为 Explore 和通用 Agent 的唯一详情入口；运行中按现有轮询节奏更新，完成后展示持久 transcript。
4. 主消息区只显示 `Exploring…`、`Explored N files` 或失败摘要；整行点击打开右侧并选中对应 child Session。
5. 删除或停止主路径对 `ExploreRunBlock` 的依赖，并同步更新其测试/文档，避免保留两套用户可见 transcript 行为。

验证：agent/explore renderer tests、SubagentsPanel tests、fixed preview tests、ConversationView tests；覆盖运行中、完成、失败、无 transcript、右侧面板关闭、会话切换和 child refresh。

### 阶段 E：图片错误交互与 provider 响应归一化（独立可交付）

1. 将 `image_generation` 工具行从 `OverflowToolLine` 改为专用 typed result disclosure：running 单行、completed/partial 保持低噪声、failed/warning 可点击展开 bounded details。
2. 成功/partial 图片继续由 `TurnOutputArtifacts` 聚合并通过 `readSessionArtifact()` 打开右侧 image Tab；不在工具行渲染大图。
3. `node-image-ports.ts` 在 JSON parse 前检查 content-type/body prefix；HTML、malformed JSON、缺少 `data` 和无可下载图片分别转为稳定错误码与用户可读摘要。
4. 错误详情保留必要的 status、content-type 和 provider host 诊断，但继续脱敏，不把 API key、完整 HTML body 或原始请求体写入 Journal。
5. 为 HTML 200、malformed JSON、empty data、401、429、500、下载失败和 partial artifact 增加测试。

验证：core-tools image tests、renderer image presentation tests、TurnOutputArtifacts tests；手动确认 hover 不再是查看错误的唯一方式，成功产物仍可右侧打开。

### 阶段 F：文档、全链路回归与人工验收（独立收尾）

1. 更新工具流式渲染、Tool preview、Explore 子 Agent、图片工具文档，明确主消息区与右侧面板责任边界。
2. 更新 `docs/exec-runs/20260913-tool-result-interaction-fixes/` 的执行过程和摘要；实现完成后补 `docs/histories/2026-09/` history。
3. 如果本轮形成可迁移的“typed preview + provenance + right-panel target”模式，读取 `docs/learnings/WRITING_GUIDE.md` 后新增一份学习文档；若没有满足沉淀标准，只在 history 中记录。
4. 按 shared → core packages → desktop typecheck → focused tests → repository checks 的依赖顺序验证。
5. 按 `docs/FRONTEND_VERIFICATION.md` 做浏览器 mock 和真实 Electron 人工验收，明确记录自动化不能覆盖的真实 Provider、安装态和截图门禁。

## 关键决策

- Explore 采用右侧唯一详情视图；不保留主消息内联展开。原因是它是独立 child Session，且这样能消除两套 transcript 加载逻辑。
- `task_notification` 对模型仍可见、对用户不可见；使用 typed provenance，不使用 XML 文本正则。
- Read 的右侧打开第一版只覆盖可确认的 workspace 相对路径；artifact 读取必须等到有明确 target 类型后再开放。
- 成功图片继续走 Turn Artifacts；工具行只承载执行状态和错误/warning 展开。
- 结果预览优先沿用现有兼容字段，先补 live/replay parity，再逐步把工具结果改成结构化 bounded entries。

## 风险与缓解

- 风险：dirty worktree 与本计划重叠，覆盖会丢用户改动。
  - 缓解：实施前记录目标文件 diff，每阶段只改声明范围，保留无关修改。
- 风险：source 只在 selector 侧修复仍会再次回归。
  - 缓解：把 provenance 测试放在 inbox → projection → selector 全链路，而不是只测 selector。
- 风险：read 打开错误 workspace 或 artifact。
  - 缓解：只传相对路径，main 侧重新解析并校验；不接受 renderer 绝对路径。
- 风险：结果预览来自模型输出格式而非结构化结果。
  - 缓解：限制数量和长度，优先读取 detail，增加空/截断回归。
- 风险：Explore 右侧 panel 在小窗口或已关闭时没有反馈。
  - 缓解：点击整行统一调用 `openTab`，面板负责聚焦/展开；主区保留简短状态行。
- 风险：provider 以 HTTP 200 返回 HTML，错误被误报为 JSON parser failure。
  - 缓解：在 parse 前分类响应格式，并保存脱敏诊断。

## 回滚策略

- 阶段 A：source 字段可选；旧事件仍按普通 user 处理，新增投影过滤可单独回退。
- 阶段 B：通用 disclosure 可退回单行 ToolLogLine，shared 的可选 `resultPreview` 不影响旧事件。
- 阶段 C：移除 read 打开回调即可回到只展示摘要，不删除或移动用户文件。
- 阶段 D：保留 `AgentRunBlock` 的 panel 路径；回退 display 映射即可恢复旧 Explore 内联组件，不影响 child Session。
- 阶段 E：图片 provider parse 归一化只改变错误分类；本地 artifact 与成功产物路径不受影响。

## 验证方式

### 命令

- `pnpm --filter @actspace/shared test -- src/test/session-selectors.test.ts`
- `pnpm --filter @actspace/core-agent test`
- `pnpm --filter @actspace/core-agent-loop test`
- `pnpm --filter @actspace/tools-core-tools test`
- `pnpm --filter @actspace/desktop test -- src/renderer/test/app-streaming-user-message.test.tsx src/renderer/test/agent-run-block.test.tsx src/renderer/test/subagents-panel.test.tsx src/renderer/test/turn-output-artifacts.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/runtime... build`
- `pnpm run check:frontend-theme`
- `pnpm run check:docs`
- 完成后按仓库实际变更范围运行 `pnpm test` 或对应的 focused package tests；不把单测结果表述为 Electron/真实 Provider 验收。

### 手工检查

- 后台 Bash 完成/kill 后，主消息区没有 XML 通知；普通用户粘贴同样 XML 仍可见。
- List/Glob/Grep/Read 有结果时显示 Chevron，点击展开 bounded preview，reload 后保持一致。
- Read workspace 文件点击后右侧打开正确文件类型；越界和不存在文件显示明确错误。
- Explore 运行和完成后，点击整行打开右侧 SubAgent 详情，不在主区展开 transcript。
- 图片失败点击后可展开错误，不需要 hover；成功图片在 Artifacts 中点击打开右侧 image Tab。
- 浅色/深色主题下结果行、错误行和右侧 Tab 均可读。

### 观测检查

- Journal 保留模型所需的 task notification，但不新增重复的用户可见消息。
- 不出现 API key、完整 HTML 错误页、图片 base64 或原始 provider 请求体。
- Session 切换、reload、迟到 stream event 不会把旧工具结果写进当前会话。

## 进度记录

- [x] 已完成截图、源码和设计文档只读审计。
- [x] 已确认 Explore 统一右侧详情视图。
- [x] 已确认完整修复范围并生成执行计划。
- [x] 阶段 A：task notification provenance。
- [x] 阶段 B：结果预览回放与通用展开行。
- [x] 阶段 C：Read 右侧文件打开。
- [x] 阶段 D：Explore 右侧 SubAgent 详情。
- [x] 阶段 E：图片错误交互与 provider 响应归一化。
- [x] 阶段 F：文档、history、测试和人工验收摘要。

## 执行模式

- **交互模式**：用户在线，按阶段实施与验证；每个阶段完成后记录结果。当前用户已确认该执行方向，实施从阶段 A 开始。

## 执行文档

- `docs/exec-runs/20260913-tool-result-interaction-fixes/execution-process.md`
- `docs/exec-runs/20260913-tool-result-interaction-fixes/execution-summary.md`
