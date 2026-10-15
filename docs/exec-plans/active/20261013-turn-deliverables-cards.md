# 轮尾改动卡与交付文件卡

## 目标

一轮对话结束、最终回复下方，按「改了什么」「交给你什么」分成两张卡：

1. 改动卡：「已编辑 N 个文件」或「已编辑 {文件名}」，显示 +/− 行数和文件列表。悬停 500ms 弹出该文件的 diff，点击在右侧打开「第 N 轮改动」Review 标签。
2. 交付卡：Agent 调用新的 `present` 工具声明的文件，以文件卡网格显示。点击卡片在侧边栏预览；右侧的按钮用默认应用打开，下拉菜单列出关联应用，最后一项是「在 Finder 中显示」。

视觉、布局和交互照搬 DeepSeek Harness（`tmp/deepseek-harness`，2026-10-09 版），并按 ActSpace 的 token、ui 原语和 IPC 规范落地。

## 范围

- 包含：
  - 后端 `present` 工具：放在 filesystem-read 插件里，只在 Agent 模式可用；附带提示词里的「输出方式选择」引导。
  - session 投影：新增 `present` 预览类型、MessageBlock 和工具行。
  - main 进程：新增文件关联应用列表（macOS JXA + 图标）、「用应用打开」「在 Finder 中显示」两个 IPC。
  - renderer：
    - `FileTypeIcon` 与代码文件图标移植；
    - 改动卡、交付卡；
    - 悬停 diff 浮层；
    - 每轮 Review 标签（左右/单栏、换行、文件菜单、打开整个文件）；
    - 设置开关「显示本轮代码改动」，默认开；
    - mock 场景 `turn-deliverables` 和测试。
  - 生成的图片沿用 ActSpace 现有的轮尾图片列表。
- 不包含：
  - DSH 的可点击文件提及（行内 code 自动变链接）。
  - 基于 git 快照的改动统计：改动来自 write/edit/delete 工具事件。
  - 远端会话的原生应用按钮：远端只能预览或下载。
  - Windows 和 Linux 的关联应用列表：只提供默认打开和在文件夹中显示。
  - diff 语法高亮：第一版不做，后续可接 highlight.js。

## 背景

- 设计 demo：`docs/design-docs/frontend/turn-deliverables-demo.html`，用户已认可。
- 参考源码：`tmp/deepseek-harness/packages/client/ui-deliverables`、`ui-open-in-app`、`ui-primitives/FileTypeIcon`、`deliverables/tool-present`、`util/native-command/file-applications.ts`。
- 参考笔记：`~/Downloads/dsh-context-notes/05-消息末尾交付卡片与改动摘要卡片的数据流与前端设计.md`。
- 相关代码：
  - `R/components/conversation/TurnView.tsx`
  - `R/components/messages/TurnOutputArtifacts.tsx`
  - `packages/tools/filesystem-read`
  - `packages/client/src/sessions/tool-card.ts`
  - `packages/shared/src/session-selectors.ts`
  - `M/runtime-v2/fixed-renderer-ipc.ts`
  - `M/artifact-context-menu-service.ts`
- 约束：遵守 `docs/design-docs/frontend/front-新功能开发清单.md`（token、Button/IconButton、ui 原语、IPC 7 步、remote 差异走 `capabilitiesOf`）。路径全部经过 `workspace-access` 校验。DSH 代码为 MIT 许可，需在第三方声明中保留版权。

## 风险

- 风险：`present` 加入 filesystem-read 后，Agent 形态的工具集合与摘要会变化，可能影响组合测试和快照。
  - 缓解：同步更新 agent-form 与 tool-composition 测试。
- 风险：同一文件多次编辑时，多段 diff 拼在一起，行号以各次编辑时的文件为准，可能互相交错。
  - 缓解：每段单独作为一个 hunk 显示，不尝试合并。
- 风险：macOS JXA 查询较慢（带图标约几百毫秒）。
  - 缓解：只在交付卡挂载时按文件查询一次，并按路径缓存；下拉菜单打开时刷新。
- 风险：mock 目前只能生成 user/assistant 两类事件。
  - 缓解：给 mock-db 增加按轮附带的工具事件。

## 里程碑

1. T1 后端 `present` 工具、装配、提示词与测试。
2. T2 投影：shared 类型、tool-card、session-selectors、工具行渲染。
3. T3 main IPC：关联应用列表、打开/显示，加 guard、mock 与测试。
4. T4 `FileTypeIcon` 与代码图标移植，加第三方声明。
5. T5 轮尾数据推导（改动与交付），加单测。
6. T6 改动卡与悬停 diff，以及 `FileDiff` 移植。
7. T7 每轮 Review 标签。
8. T8 交付卡与原生打开按钮。
9. T9 设置开关「显示本轮代码改动」。
10. T10 替换 TurnView 尾栏（图片沿用旧列表）。
11. T11 mock 场景、浏览器截图（亮色、暗色、480px），更新文档与历史记录。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`
  - filesystem-read、core/agent、prompt、shared、client 各包的 `test`
  - `pnpm check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:ipc-channels`、`check:current-docs`
- 手工检查：打开 `?mock=turn-deliverables`，在亮色、暗色和 480px 宽度下截图核对：
  - 改动卡的单文件和多文件形态，以及超过 4 个时的折叠；
  - 悬停 diff 浮层；
  - Review 标签；
  - 交付卡网格与折叠；
  - 应用下拉菜单；
  - 设置开关。
- Electron 实机（留给用户）：
  - 真实模型调用 `present`；
  - 用 Word 或 Excel 打开文件，以及「在 Finder 中显示」；
  - 关联应用图标。

## 进度记录

- [x] T1 后端 present 工具
- [x] T2 投影
- [x] T3 main IPC
- [x] T4 FileTypeIcon
- [x] T5 轮尾数据推导
- [x] T6 改动卡与悬停 diff
- [x] T7 Review 标签
- [x] T8 交付卡与原生打开
- [x] T9 设置开关
- [x] T10 TurnView 接线
- [x] T11 mock、截图、文档

## 决策记录

- 2026-10-13：用户确认用两张卡替换 `TurnOutputArtifacts`。交付数据来自新的 `present` 工具（方案 A），改动统计来自工具事件；交互、样式和原生按钮照搬 DSH。
- 2026-10-13：用户确认生成图片沿用 ActSpace 现有表现；开关「显示本轮代码改动」默认开，只隐藏改动卡；移植 DSH 的文件图标。
- 2026-10-13：`present` 放进 filesystem-read 插件，不新建包。理由：
  - 它只读取文件元数据，与 `read_file` 的权限域一致；
  - 这样可以省掉新包的 8 处装配。

  路径限定在工作区内（DSH 允许任意路径）。理由：ActSpace 的打开和预览链路只接受工作区内的相对路径，安全文档也要求所有访问走 `workspace-access`。
- 2026-10-13：Review 标签的数据随标签一起传入（本轮改动的快照），不复用基于 git 的 `ReviewWorkspace`。理由：
  - 非 git 工作区也要能看；
  - 内容应与卡片一致。

## 执行模式

- **交互模式**。

## 执行文档

- `docs/exec-runs/20261013-turn-deliverables-cards/execution-process.md`
- `docs/exec-runs/20261013-turn-deliverables-cards/execution-summary.md`
