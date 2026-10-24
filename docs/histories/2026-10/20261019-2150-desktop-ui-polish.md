## [2026-10-19 21:50] | Task: Desktop 界面问题批量修复（设置模型下拉、浮层关闭、子 Agent 渲染、Markdown 列表、侧栏子会话）

### Execution Context

- Agent ID: `main`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code CLI

### 用户诉求

在新分支修复几处界面问题。
- 设置里的模型下拉和会话模型列表不一致。
- 上下文用量、Token 统计浮层只能再点入口才能关。
- 子 Agent 面板的 Thinking 下面多出空白。
- 子 Agent 完成后，父会话还在输出时，面板显示成一大段未渲染的原文。
- Markdown 列表没有圆点和序号。
- 子 Agent 的会话出现在左侧会话列表里。

### 变更与动机

- **设置模型下拉**：`ModelPicker.tsx` 导出 `ModelPickerMenu`，新增 `side` / `align` / `ariaLabel` / `pinned`。`ModelPurposeSelect` 的触发器沿用 `SELECT_TRIGGER_CLASS`，菜单复用会话的模型菜单（搜索、按供应商分组、勾选在右），「未配置 / 跟随会话模型」作为固定项。原生按钮基线 ModelPicker +1、ModelPurposeSelect +1：菜单行要和模型行同款，触发器要和 Select 触发器同款，`Button` 给不了。
- **浮层点外面关闭**：`ContextPopup` 原来把整个输入框 footer 都当成「不算外部」，所以点输入框、状态行都关不掉。现在只放过圆环按钮本身（`data-context-usage-toggle`），由它的 onClick 切换。统计胶囊和回复尾部用量浮层本来就支持点外面关闭，补了一条测试锁住。
- **子 Agent 空白**：`SubagentsPanel` 原来逐条 `renderMessage` 加 `space-y-4`，空的 assistant 文本也会占一段间距。改为和主会话一样，用 `renderMessageList` 放进 `message-flow`。
- **子 Agent 原文兜底**：执行记录在子 Agent 完成后只拉一次，失败或拉到空结果之后不再重试。列表轮询又每秒清掉共享的 error，最后落到把 `summary` 当纯文本显示。修法：
  - 执行记录的错误单独存；
  - 只在换子 Agent 时清空记录；
  - 完成后拿到非空结果前每秒重试，最多 20 次；
  - 仍拿不到时，把 summary 按 Markdown 渲染。
  - 主进程侧「为何那次会失败」只有推测（父会话流式输出时，主进程每秒对大 journal 做 O(n²) 的 `projectSubagentList`），没有实证，这一层没改。
- **Markdown 列表**：Tailwind Preflight 把 `ul/ol` 设成 `list-style: none`，`markdown.css` 没有恢复。现在补回 disc / decimal / circle，`::marker` 用弱化色。原始 markdown 确实是 `- ` 列表（会话 d4b06389 的 journal 已核对）。
- **侧栏子会话**：`listPage` 的 SQLite 查询只过滤 `archived=0`。现在三处查询都加了 `is_child_session=0`，快捷打开那条走 `sessions.list` 的路径也在渲染层过滤了 `isChildSession`。

### 关键文件

- `apps/desktop/src/renderer/components/composer/ModelPicker.tsx`、`components/settings/ModelPurposeSelect.tsx`
- `apps/desktop/src/renderer/components/ContextPopup.tsx`、`components/composer/ComposerStatusRow.tsx`
- `apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`
- `apps/desktop/src/renderer/styles/markdown.css`
- `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`、`apps/desktop/src/renderer/App.tsx`
- 测试：`provider-model-settings`、`settings-page`、`composer`、`composer-stats-pills`、`subagents-panel`
- `scripts/native-button-baseline.json`

### 验证与边界

- Desktop 全量 vitest 1965 项通过；`tsconfig.json` 和 `tsconfig.electron.json` 类型检查通过；`check:frontend-tokens` / `check:frontend-theme` 通过。
- 浏览器 mock 验证了以下几项：
  - 设置模型菜单，浅深两套主题截图；
  - 上下文浮层点输入框 / 会话区 / 侧栏 / 状态行都会关闭；
  - Markdown 有序列表在浅深主题下都显示序号。
- 状态行统计胶囊只有单测覆盖，mock 里没有统计数据。
- `is_child_session` 的 SQL 过滤没有单测，worker 没有可单测的导出。
- 子 Agent 原文问题没有在真实环境复现。
- 以上都需要 Electron 实机复验。
