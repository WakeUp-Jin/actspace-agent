# 字号规范落地：三层字号（界面 13 / 阅读 15）

## 目标

桌面端整个窗口的文字收到三层：辅助 11–12px、界面 13px、阅读 15px。聊天正文从「16.5px 衬线 + 黑体混排」改成 15px 界面字体，用户消息、输入框与正文同字号，工具行和 Thinking 回到界面层；样式文件和组件里不在档位里的字号、行高、字重全部收掉，并由 `pnpm check:frontend-tokens` 守住。

完成后，同一屏的字号从 7 种（11 / 12 / 13 / 14 / 16 / 16.5 / 21.5）加两种字体，变成 6 种（11 / 12 / 13 / 14 / 15 / 18）一种字体。

## 范围

- 包含：
  - `apps/desktop/src/renderer` 的字号 token、聊天正文样式、消息区和 Composer 组件的字号与行高、检查脚本及其测试。
  - 规范文档里与实现对应的收尾（删掉「落地前」提示段、删 demo）。
- 不包含：
  - `apps/web`（手机端正文已经是 15px，本轮不动它的样式；它的 `leading-[…]` 两处按新规则一起收）。
  - `apps/site` 官网。
  - 轨迹视图 `trajectory.css` 和 Harness 统计页的字号（数据密集页，有自己的小字号白名单）。
  - 右侧「文档」面板的排版（只把 `--md-h3-size` 换成新 token，观感不变）。
  - 颜色、间距刻度、圆角；外观设置里的字体、字号选项。
  - 设置页、对话框、右侧面板里已经符合档位的 `text-act-*` 用法。

## 背景

- 相关文档（开工前必读）：
  - `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`
  - `docs/design-docs/frontend/front-视觉token规范.md` §5（本计划的唯一取值来源）
  - `docs/design-docs/frontend/front-聊天区Markdown渲染规范.md` §4
  - `docs/design-docs/frontend/front-中间消息区规范.md`「排版与间距」
  - `docs/design-docs/frontend/front-新功能开发清单.md`、`docs/FRONTEND_VERIFICATION.md`
  - 对比稿：`docs/design-docs/frontend/typography-scale-demo.html`（选定方向 B）
- 相关代码路径：
  - `apps/desktop/src/renderer/styles/tailwind.css`（`--text-act-*` 定义）、`tokens.css`（`--act-font-*`）
  - `apps/desktop/src/renderer/styles/markdown.css`、`tool-result.css`、`diff.css`、`web-tool.css`、`electron.css`、`markdown-editor.css`
  - `apps/desktop/src/renderer/components/messages/`、`components/composer/`、`components/conversation/`、`components/ConversationView.tsx`、`components/ContextPopup.tsx`
  - `scripts/check-frontend-design-tokens.mjs`、`scripts/test/frontend-design-tokens.test.mjs`
- 已知约束：
  - 外观设置的「界面字号」是整窗缩放（`appearance/apply.ts`，基准 `UI_FONT_SIZE_BASE = 14`），不读任何字号 token，本计划不改它。
  - `--act-font-mono-size` 由外观设置写入，代码、diff、Bash 输出继续用它。
  - 消息之间的间距只由 `tool-result.css` 的 `--flow-*` 决定，组件不加外部 margin。
  - Tailwind v4：`leading-4.5`、`leading-5.5` 是内置刻度（`--spacing` 的倍数），不需要新增 token。

## 风险

- 风险：工具行行高从 22px 变 20px、正文从 16.5px 变 15px，过程区和正文的疏密关系会变，`--flow-*` 的间距可能显得偏松或偏紧。
  - 缓解方式：T3 做完后在浏览器 mock 里对照 demo 看一遍长会话；`--flow-*` 只在确实失衡时调，调了就同步改 `front-中间消息区规范.md` 的间距表。
- 风险：组件测试断言了具体类名（已知 `test/run-target-row.test.tsx` 含 `text-act-md`）。
  - 缓解方式：T4 改完跑 desktop 全量测试，断言跟着新类名改，不改测试意图。
- 风险：新增的 CSS 字号字面量检查一次拦下太多存量。
  - 缓解方式：T2、T3 先把存量改完，T6 再开检查；`trajectory.css` 整个文件豁免，其余不设豁免。
- 风险：正文行内 code 用 em，正文变小后可能低于 13px。
  - 缓解方式：0.82em → 0.87em（15px 下约 13px），T2 里一起改。
- 最小回退：每个任务一个 commit；视觉不满意时回退 T2–T4 的 commit，T1 新增的 token 和 T6 的检查可以保留。

## 里程碑

按顺序执行，每个任务一个 commit。T2、T3、T4 依赖 T1；T6 依赖 T2–T5；T7 最后。

### T1 新增字号 token

- `apps/desktop/src/renderer/styles/tailwind.css`：在 `--text-act-md` 后加 `--text-act-base: 15px;`，在 `--text-act-lg` 后加 `--text-act-head: 18px;`；把上方注释里的档位范围改成「text-act-xxs … text-act-title，见规范 §5.3」。
- `apps/web/src/styles/tailwind.css`：加 `--text-act-head: 18px;`（`--text-act-base` 已有），保持两端档位一致。
- 验证：`pnpm check:frontend-tokens` 通过。

### T2 聊天正文 `markdown.css`

`.markdown-prose` 块，取值全部按 `front-聊天区Markdown渲染规范.md` §4：

| 位置 | 现在 | 改成 |
|---|---|---|
| 字体 | `var(--act-font-reading)` | `var(--act-font-ui)` |
| 字号 / 行高 | `--md-chat-size: 16.5px` / 1.78 | `var(--text-act-base)` / 1.7，删掉 `--md-chat-size` |
| 块间距 `gap` | 14px | 12px |
| 标题 | `1.55em / 1.3em / 1.12em / 1em`，字距 -0.005em，`font-family: inherit` | `var(--text-act-xl) / --text-act-head / --text-act-lg / --text-act-base`，删字距；H1、H2 `margin-top: 14px`，H3、H4 `margin-top: 8px` |
| `strong` | 650 | 600 |
| 列表项间距 | 7px | 6px |
| 行内 code、路径 | 0.82em | 0.87em |
| 提示框标签 | 12.5px | `var(--text-act-xs)` |
| 表格 | 14px；`th` 600 正文色；单元格上下 10px | `var(--text-act-md)`；`th` 加 `font-size: var(--text-act-xs); font-weight: 500; color: var(--act-color-text-faint)`；单元格上下 8px |
| 代码块头、折叠按钮 | 12px | `var(--text-act-xs)` |
| 图片说明 `.md-img-note` | 0.9em | `var(--text-act-sm)` |
| `details` | 15px | `var(--text-act-md)` |
| `.markdown-code-block` 回退值 | `0.86rem` | `13px` |
| `.markdown-code-toolbar` | 0.72rem | `var(--text-act-xxs)` |

- 表格、提示框标签、代码块头、`details` 里的 `font-family: var(--act-font-ui)` 已经和正文相同，删掉这些重复声明。
- 文件头注释里的「A 书页」改成「排版见规范 §4」。
- `apps/desktop/src/renderer/styles/tokens.css`：删除 `--act-font-reading` 及其注释（全仓只有 `markdown.css` 用）。
- `apps/desktop/src/renderer/styles/markdown-editor.css`：`--md-h3-size: 18px` 的定义和文件头说明删掉，`.md-h3` 改用 `var(--text-act-head)`。
- 验证：`grep -rn "act-font-reading\|md-chat-size\|md-h3-size" apps/desktop/src` 无结果；浏览器 mock 打开 Markdown fixture 会话，标题、表格、列表、代码块、提示框、公式各看一眼。

### T3 过程区样式（工具行、diff、Web 工具、标题栏）

- `styles/tool-result.css`：第 4、19、166 行 `font-size: 14px` → `var(--text-act-sm)`；同文件 `line-height: 22px`（5 处）→ `20px`。
- `styles/diff.css`：第 21、96 行 `14px` → `var(--text-act-sm)`，对应 `line-height: 1.42` → `20px`；第 147、203 行 `13px` → `var(--text-act-sm)`；`line-height: 22px`（3 处）→ `20px`。
- `styles/web-tool.css`：第 17 行 `14px` → `var(--text-act-sm)`，`line-height: 1.42` → `20px`。
- `styles/electron.css`：`.chrome-title` 的 `13px` → `var(--text-act-sm)`。
- 验证：`grep -nE "font-size: *[0-9.]+(px|rem)" apps/desktop/src/renderer/styles/*.css` 只剩 `trajectory.css`。

### T4 组件字号

14px → 13px（`text-act-md` → `text-act-sm`，同一行的 `leading-[22px]` / `leading-[1.42]` → `leading-5`）：

- `components/messages/ToolActivityGroup.tsx`（`Worked for` 行）
- `components/messages/ThinkingBlock.tsx`（标题和展开内容两处；内容行高 `leading-[1.65]` → `leading-relaxed`）
- `components/messages/BashRunBlock.tsx`、`components/messages/AgentRunBlock.tsx`
- `components/messages/UserMessage.tsx` 第 27 行（附件胶囊）
- `components/composer/ModelPicker.tsx`（4 处）、`RunTargetRow.tsx`（2 处）、`ComposerAttachments.tsx`（2 处）、`ComposerNotices.tsx`（发送错误）
- `components/ContextPopup.tsx`（2 处）、`components/ConversationView.tsx`（3 处加载 / 错误提示）、`components/conversation/render-message.tsx` 第 200 行

改成阅读层 15px：

- `components/messages/UserMessage.tsx`：`USER_CARD_CLASS`、`USER_EXECUTION_CARD_CLASS` 加 `text-act-base`，`leading-[1.55]` → `leading-relaxed`（现在没设字号，吃的是浏览器默认 16px）。
- `components/composer/ComposerInput.tsx`：两处 `text-act-lg leading-5` → `text-act-base leading-5.5`；`min-h` 和上下内边距保持，确认单行高度不变（22 + 上下 6 = 34px，原来是 20 + 7×2）。
- `components/conversation/TurnPromptEditor.tsx`、`PinnedTurnPrompt.tsx`：编辑重发的输入区和置顶提问与用户消息同字号、同行高。

底部状态行：

- `components/composer/ComposerStatusRow.tsx`：`ROW_CLASS` 的 `text-act-sm leading-5` → `text-act-xs leading-4`，与右侧统计胶囊同字号。

保持 14px（对话内卡片和分组标题，规范 §5.3）：`TodoListBlock`、`ApprovalParts`、`SubagentMessageCard`、`PluginsSection`、`ExtensionsPage`、`ContextStats`、`space/*`。

字重：`components/settings/dialogs/ProviderKeyModal.tsx`、`LocalUpdateProgressDialog.tsx` 的 `font-bold` → `font-semibold`。

- 验证：`pnpm --filter @actspace/desktop test` 通过（`test/run-target-row.test.tsx` 等断言类名的用例跟着改）；`pnpm --filter @actspace/desktop typecheck` 通过。

### T5 行高字面量清零

`apps/desktop/src/renderer` 36 个文件 52 处、`apps/web/src` 2 处的 `leading-[…]`，按下表替换（T4 已经改掉的不重复）：

| 现在 | 改成 |
|---|---|
| `leading-[1.35]`、`leading-[1.4]`、`leading-[1.42]` | `leading-snug` |
| `leading-[1.45]`、`leading-[1.5]` | `leading-normal` |
| `leading-[1.55]`、`leading-[1.6]`、`leading-[1.65]` | `leading-relaxed` |
| `leading-[14px]`、`leading-[15px]` | `leading-4` |
| `leading-[17px]`、`leading-[18px]` | `leading-4.5` |
| `leading-[22px]` | 13 / 14px 文字用 `leading-5`，15px 文字用 `leading-5.5` |

- 逐文件改，单行控件（有固定 `h-*` 或 `min-h-*`）改完确认文字仍垂直居中。
- 验证：`grep -rnE "leading-\[" apps/desktop/src/renderer apps/web/src --include='*.tsx'` 无结果。

### T6 检查脚本

`scripts/check-frontend-design-tokens.mjs`：

1. 新增规则 `line-height-literal`：拦 `leading-[…]`，提示「行高用 leading-none / 4 / 4.5 / 5 / 5.5 / snug / normal / relaxed（规范 §5.4）」。
2. 新增规则 `font-weight-bold`：拦 `font-bold`、`font-extrabold`、`font-black`、`font-light`、`font-thin`，提示「字重只用 normal / medium / semibold」。
3. 新增样式文件检查 `css-font-size-literal`：desktop 的 `styles/*.css` 里，`font-size:` 的值只能是 `var(--…)`、`inherit`、`0` 或 `em`；`px`、`rem` 字面量报错。豁免：`styles/trajectory.css` 整个文件，`tailwind.css` 里 `--text-act-*` 的定义行。web 的样式文件不检查（不在本轮范围）。
4. `font-size-literal` 规则的提示语里把档位列表补上 `base`、`head`。

`scripts/test/frontend-design-tokens.test.mjs`：为上面三条规则各加「命中」和「不误伤」用例（`leading-5.5`、`leading-relaxed`、`font-semibold`、`font-size: 0.87em`、`font-size: var(--text-act-sm)` 不报；`leading-[1.55]`、`font-bold`、`font-size: 12.5px`、`font-size: 0.72rem` 报；`trajectory.css` 里的 `font-size: 10px` 不报）。

- 验证：`pnpm test:frontend-tokens`、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 全部通过。

### T7 文档收尾与验收

- `front-视觉token规范.md` §5 开头的「落地前」提示段删除。
- `docs/design-docs/frontend/typography-scale-demo.html` 删除，`docs/design-docs/frontend/README.md`「资产与 demo」里对应的一条去掉。
- 写 history（`docs/histories/2026-11/`），按 `docs/HISTORY_GUIDE.md`。
- 本计划移到 `completed/`，更新 `docs/exec-plans/README.md` 和 `completed/README.md`，未做的实机验收项写在计划正文里。
- 验证：`pnpm check:docs` 通过。

## 验证方式

- 命令（全部通过才算完成）：
  - `pnpm check:frontend-tokens`
  - `pnpm check:frontend-theme`
  - `pnpm test:frontend-tokens`
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm lint`
  - `pnpm check:docs`
- 手工检查（浏览器 mock + Electron，浅色、深色各一遍）：
  1. 和截图里同一类会话（用户消息 + `Worked for` + 两个标题 + 两张表 + 段落）：侧栏、正文、标题之间没有突兀的大小落差；一行里数字和汉字是同一种字体。
  2. 用户消息、AI 正文、输入框里打的字，三者字号相同。
  3. 表头比表格内容小一档、颜色更浅，不加粗也能分清。
  4. 展开 `Worked for`：工具行、Thinking、Bash 行都是 13px，行与行之间不挤。
  5. 长代码块、行内 code、路径胶囊、提示框、任务列表、公式、Mermaid 各出现一次，没有哪个比正文还大。
  6. 输入框单行高度没变，多行输入时光标和文字垂直对齐。
  7. 外观设置把界面字号调到 12 和 18 各看一次，整窗等比缩放，没有哪块文字不跟着变。
  8. 子 Agent 面板、侧边对话里的回复（同样走 `.markdown-prose`）与主对话一致。
- 观测检查：无（纯样式改动，不涉及数据和性能路径）。

## 进度记录

- [x] 2026-11-11：现状盘点、对比 demo、方向 B 选定；规范 §5、聊天 Markdown §4、中间消息区排版表已按新取值改写。
- [ ] T1 新增字号 token
- [ ] T2 聊天正文 `markdown.css`
- [ ] T3 过程区样式
- [ ] T4 组件字号
- [ ] T5 行高字面量清零
- [ ] T6 检查脚本
- [ ] T7 文档收尾与验收

## 决策记录

- 2026-11-11：选方向 B（界面 13 / 正文 15 / 标题 18，全部界面字体）。A（正文 14）长篇中文偏累；C（衬线 16）需要中文宋体，屏幕上偏细且 Windows 没有合适字体。
- 2026-11-11：取消 `--act-font-reading`，不保留开关。同一行里西文衬线、中文黑体混排是这次「看着怪」的主要来源之一，留着开关就得继续维护两套排版。
- 2026-11-11：新增 `text-act-base`（15px）和 `text-act-head`（18px）两个档位，而不是把 `text-act-lg` 从 16 改成 15。`lg` 在对话框标题和数值上有 20 多处用法，改值会连带动到不相关的界面。
- 2026-11-11：工具行、Thinking 从 14px 降到 13px。它们是过程不是内容，和侧栏同一层；这样 14px 只剩「对话内卡片 / 表格」一个用途。
- 2026-11-11：行高不新增 token，直接用 Tailwind 内置刻度并限定 8 个可用值，由检查脚本拦 `leading-[…]`。
- 2026-11-11：规范先于代码更新，§5 开头留一段「落地前」提示，T7 删除。

## 执行模式

- **交互模式**：纯视觉改动，T2–T4 每步都要人看一眼效果再往下走。

## 执行文档

执行开始时，在 `docs/exec-runs/20261111-typography-scale/` 创建以下两份文档（从 `docs/exec-runs/templates/` 复制模板）：

- `execution-process.md`：执行过程中持续更新，记录关键步骤、决定和问题。
- `execution-summary.md`：执行结束后填写，重点写人工验证指引（上面「手工检查」8 项的结果）。
