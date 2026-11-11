# 字号规范落地 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261111-typography-scale.md`
- **执行模式**：交互
- **开始时间**：2026-11-11 21:20
- **结束时间**：2026-11-11 22:10

## 执行时间线

### 步骤 0：规范与计划

- **操作**：现状盘点 → 对比 demo（现状 / A 14 / B 15 / C 衬线 16）→ 用户选 B → 改写视觉 token §5、聊天 Markdown §4、中间消息区排版表，写执行计划。
- **影响文件**：`docs/design-docs/frontend/*.md`、`docs/exec-plans/`。
- **验证**：`pnpm check:docs` 通过。commit b8c91a92。

### 步骤 1：T1、T2 token 与聊天正文

- **操作**：`tailwind.css`（desktop、web）加 `--text-act-base` 15、`--text-act-head` 18；`markdown.css` 正文改 `--act-font-ui` 15px / 1.7，标题 20/18/16/15，表头 12px 500 faint，行内 code 0.87em，所有字面量字号换 token；删 `--act-font-reading`、`--md-chat-size`、`--md-h3-size`（文档面板 H3 改用 `--text-act-head`）。代码高亮的 `.hljs-strong` 700 → 600。
- **验证**：`check:frontend-tokens` 通过。commit ca1e2062。

### 步骤 2：T3、T4 过程区与组件

- **操作**：`tool-result.css`、`diff.css`、`web-tool.css` 工具行 14px → `--text-act-sm`、行高 20px；`electron.css` 标题栏用 token。组件里 `Worked for`、Thinking、Bash / Agent 行、模型名、附件胶囊、运行位置等 14 → 13px；用户消息与编辑重发输入区补 `text-act-base leading-relaxed`；Composer 输入 `text-act-lg leading-5 py-[7px]` → `text-act-base leading-5.5 py-1.5`（单行仍 34px）；底部状态行 13 → 12px；两处 `font-bold` → `font-semibold`。
- **验证**：desktop typecheck 通过；desktop vitest 304 文件 / 2922 用例通过（`run-target-row.test.tsx` 断言跟着改）。commit 8e126174。

### 步骤 3：浏览器 mock 目检

- **操作**：`VITE_DEV_PORT=5188 pnpm dev:renderer`，用 headless Chromium 截 `markdown`（历史回复，逐屏滚动）、`turn-deliverables`、`script-execution`（展开 Worked）。
- **结果**：正文、用户消息、输入框同为 15px 界面字体，数字与汉字同一字体；表头比内容小一档且浅色；`Worked`、工具行 13px；标题 18 / 16px 与正文差距合适；代码块、提示框、引用、任务列表、Mermaid 正常。

### 步骤 4：T5 行高

- **操作**：脚本按映射替换 desktop / web 的 `leading-[…]` 共 45 处，另补 `toolLogStyles.ts`（工具日志行 14px / 22px → 13px / 20px，计划漏列）。
- **验证**：`grep leading-\[` 无结果；desktop 2922、web 141 用例通过。commit afd72b8f。

### 步骤 5：T6 检查脚本

- **操作**：新增 `line-height-literal`、`font-weight-off-scale`（组件），`checkCssFontSizes`（desktop 样式文件，`trajectory.css` 豁免，`var(..., 13px)` 回退值不算）；各加命中 / 不误伤用例；更新过时的「web 有 base、desktop 没有」用例；web 测试夹具补 `--text-act-head`。新规则拦下 web `ListHeader.tsx` 的 `font-extrabold`，改 `font-semibold`。
- **验证**：`test:frontend-tokens` 29 / 0；`check:frontend-tokens`、`check:frontend-theme` 通过。commit 2c93c1d0。

### 步骤 6：T7 收尾

- **操作**：删 demo 与 README 里的条目，删规范 §5 的「落地前」提示段，计划移 `completed/` 并更新两份索引，写本文件、执行摘要与 history。

## 遇到的问题

- **问题**：新 worktree 里 desktop typecheck / vitest 全部失败（找不到 `@actspace/shared/runtime-v2`）。
  - **原因**：worktree 新装依赖后，workspace 包还没 build。
  - **应对**：先跑 `pnpm build:deps`。
- **问题**：`diff.css` 的 `line-height: 22px` 计划写要改成 20px。
  - **原因**：那三处是 Review 面板的 diff 代码行，不是过程区工具行。
  - **应对**：保留不动，计划决策记录里更正。

## 跳过或推迟的事项

- Electron 实机检查（计划「手工检查」8 项，尤其深色主题、界面字号 12 / 18、子 Agent 面板与侧边对话）：需要人在 Electron 里看。
