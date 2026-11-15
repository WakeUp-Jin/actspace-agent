## [2026-11-15 11:10] | Task: 窄窗状态行合并胶囊 + 空参数工具占位参数 + 失败工具行与标点回复 + 只发批注不出空卡片

### 🤖 Execution Context

- **Agent ID**: `Claude Code 主会话`
- **Base Model**: `claude-opus-5-5`（浏览器验收交给 Sonnet 子智能体）
- **Runtime**: `Claude Code CLI，git worktree fix/composer-narrow-layout`

### 📥 User Query

> 窗口调得很窄时，输入框下面的状态行（本机 / 权限 / 会话统计 / 累计 / 上下文圆环）挤成好几行，很丑，修一下。另外主 Agent 调「查看可选模型」时显示 `查看可选模型: Invalid tool argument at $/_call: Unknown property.`，下面还有一个单独的「.」，前端显示也一起看看。只发批注时还会发出一条空白消息，只显示批注就行。（看过 demo 后选方案 C：窄窗合并成一个胶囊；批注按建议：不画空卡片、固定行写「N 条批注」、不能编辑重发。）

### 🛠 Changes Overview

**Scope:** `apps/desktop`（composer、messages、conversation）、`apps/web`（transcript）、`packages/core/tool-runtime`、`packages/util/shared`

**Key Actions:**

- **状态行一行 + 合并胶囊**：`ComposerStatusRow` 外层改成 `@container`、状态行 `flex-nowrap`；状态行 ≤ 560px 时 `ComposerStatsPills` 把两个胶囊换成合并胶囊「M 步 · 总量 tok」（`summaryPillModel`），面板上下两段（会话统计 + 会话累计消耗）；≤ 360px 只留图标。两种胶囊共用 `StatPill` 的同一个原生按钮，不加原生按钮基线。
- **空参数工具丢弃占位参数**：`materializeToolArguments` 遇到 `properties` 为空且 `additionalProperties: false` 的 schema，把模型传来的键全部丢掉再校验。DeepSeek 会给 `list_subagent_models` 编一个 `_call`，以前直接 `Unknown property` 失败；有参数的工具仍严格校验。
- **通用工具行失败**：`ToolLogLine` 的 generic 分支失败时写「标题 · 失败」，原始报错收进可展开项；`denied` 的中文说明（浏览器审批拒绝）仍在一行里。
- **只有标点的回复段不渲染**：新增 `hasReadableText`（字母 / 数字 / 表情），桌面 `renderMessageList` 和 Web `groupTranscript` 用它过滤 assistant 段；存储的消息不变。
- **只发批注不出空卡片**：`TurnView` / `UserMessage` 在没有文字、附件（及待办）时不画提问卡片，只留「N 条批注」胶囊；批注行顶替 `.turn-prompt-card` 锚点，让顶部固定行照常出现，但没有编辑入口。`turns.ts` 新增 `userMessageHasBody` / `userMessageSummary`，`PinnedTurnPrompt` 与轮次导航写「N 条批注」。Web `UserBubble` 同样写「N 条批注」（次要文字），不出空气泡。
- 规范同步：`front-composer-file-mentions-and-response-annotations.md` §3.5（只发批注）、`front-聊天输入框规范.md`（窄窗规则）、`front-子Agent与后台任务规范.md`（失败行与占位参数）；demo `composer-narrow-status-demo.html` 保留 A/B/C 对比。

### 🧠 Design Intent (Why)

- 状态行原来靠 `flex-wrap` 自然换行，窄窗下两个胶囊和圆环各掉一行。合并成一个入口后，信息量少一半但点开仍能看全，一行内放得下；断点用容器查询量状态行本身，右侧栏开合也能正确切换。
- 空参数工具没有可写错的参数，拒绝占位键只会制造一次失败和一次重试；在 tool-runtime 统一处理，不在每个工具或每个 provider 里打补丁。
- 原始报错是给模型看的英文校验信息，直接拼在标题后面既吵又看不懂；展开可查即可。
- 只发批注时模型侧本来只收到引用和评论（host 不发空文本块），空卡片纯属显示问题；去掉卡片后这一轮看起来就是「发了几条批注」。编辑重发不做：没有卡片可点，胶囊点开已是看批注详情。
- 「.」这类段落没有可读内容，只占一个段落间距。只在显示层过滤，回放和上下文保持原样。

### ✅ Verification

- `pnpm typecheck`、`pnpm check:frontend-tokens`、`pnpm check:hot-path-reads` 通过。
- 单测：desktop 全量（新增 `failed-tool-line.test.tsx`、`turn-annotation-only.test.tsx`、合并胶囊、固定行与轮次导航用例）、web（新增 `UserBubble.test.tsx`）、tool-runtime、shared `visible-text`、client、web 通过。
- 浏览器 renderer（`?mock=long-session`，临时给 mock 快照填统计数，未提交）由 Sonnet 子智能体在 900/600/520/440/380/340 浅色和 900/440 深色验收：状态行恒为一行、无横向溢出，胶囊按状态行宽度切换，合并面板在视口内、Esc 关闭。Electron 窗口未看。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：Electron 窗口里窄窗状态行和只发批注的轮次没看过（浏览器 renderer 已验）。
- **遗留**：无。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/composer/ComposerStatsPills.tsx`
- `apps/desktop/src/renderer/components/composer/ComposerStatusRow.tsx`
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `apps/desktop/src/renderer/components/conversation/render-message.tsx`
- `apps/web/src/sessions/transcript-model.ts`
- `apps/desktop/src/renderer/components/conversation/TurnView.tsx`、`PinnedTurnPrompt.tsx`、`turns.ts`、`components/messages/UserMessage.tsx`
- `apps/web/src/pages/session/blocks/UserBubble.tsx`、`TurnView.tsx`、`styles/session.css`
- `packages/core/tool-runtime/src/argument-validator.ts`
- `packages/util/shared/src/visible-text.ts`
- 测试：`composer-stats-pills.test.tsx`、`failed-tool-line.test.tsx`、`runtime.test.ts`、`visible-text.test.ts`
- 文档：`front-聊天输入框规范.md`、`front-子Agent与后台任务规范.md`、`composer-narrow-status-demo.html`
