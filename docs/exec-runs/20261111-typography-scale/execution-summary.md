# 字号规范落地 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261111-typography-scale.md`
- **执行过程**：`docs/exec-runs/20261111-typography-scale/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 实机检查未做）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 新增 15px / 18px 两档 | `apps/desktop/src/renderer/styles/tailwind.css`、`apps/web/src/styles/tailwind.css` | 正文与 H2 的档位，`text-act-lg` 16px 保持不变 |
| 聊天正文 15px 界面字体 | `styles/markdown.css`、`styles/tokens.css`、`styles/markdown-editor.css` | 去掉西文衬线 + 中文黑体混排；字面量字号全部换 token |
| 过程区 13px | `styles/tool-result.css`、`diff.css`、`web-tool.css`、`components/messages/*`、`toolLogStyles.ts` | 工具行、Thinking、`Worked for` 与侧栏同一层 |
| 用户消息、输入框 15px | `UserMessage.tsx`、`ComposerInput.tsx`、`TurnPromptEditor.tsx`、`PinnedTurnPrompt.tsx` | 与正文同字号；用户消息原来没设字号 |
| 行高收到刻度 | desktop / web 共 46 处 | 只用 `leading-none/4/4.5/5/5.5/snug/normal/relaxed` |
| 检查脚本 | `scripts/check-frontend-design-tokens.mjs` 及测试 | 拦任意行高、非档位字重、样式文件字号字面量 |

## 人工验证指引

### 必须验证

1. **截图里那类会话在 Electron 里不再「大的很大、小的很小」**
   - 验证方式：`pnpm dev:log` 打开一个含标题、表格、段落的历史会话，浅色、深色各看一遍。
   - 预期结果：侧栏 13px、正文 15px、H2 18px，同一行里数字和汉字是同一种字体；表头 12px 浅色。
2. **用户消息、AI 正文、输入框三者字号一致**
   - 验证方式：发一条消息，对比卡片里的字、回复正文、输入框里新打的字。
   - 预期结果：同为 15px；输入框单行高度不变，换行时光标与文字对齐。
3. **展开 `Worked for`**
   - 验证方式：找一轮有工具调用、Thinking、Bash 的回复，点开。
   - 预期结果：工具行、Thinking 标题、Bash 行都是 13px，行距不挤，和正文差一档。
4. **外观设置 → 界面字号调到 12 和 18**
   - 预期结果：整窗等比缩放，没有哪块文字不跟着变；代码字号设置仍单独生效。

### 建议验证

1. **子 Agent 面板、侧边对话里的回复**：与主对话正文同样是 15px 界面字体。
2. **右侧文档面板 H3**：仍是 18px（改用 `--text-act-head`，观感应不变）。
3. **Review 面板 diff**：行高 22px 未改，与以前一致。

## Agent 已完成的验证

- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme`：通过。
- `pnpm test:frontend-tokens`：29 通过 / 0 失败。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- desktop vitest：304 文件、2922 用例通过；web vitest：141 用例通过。
- `pnpm check:docs`：通过。
- 浏览器 mock（headless Chromium，浅色）：`markdown`、`turn-deliverables`、`script-execution` 三个场景目检，见执行过程步骤 3。

## 已知风险和遗留事项

- `apps/web` 样式文件里的字号字面量不在本轮范围，检查脚本对 web 不查 CSS 字号。
- `trajectory.css` 整个文件豁免 CSS 字号检查（数据密集页）。
- 工具行行高 22 → 20px 后，消息流间距 `--flow-*` 没调；如果 Electron 里看着过程区偏挤或偏松，再调并同步中间消息区规范的间距表。

## 后续建议

- Electron 验收通过后合入 main。
