# 简化思考过程 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261111-thinking-compact.md`
- **执行过程**：`docs/exec-runs/20261111-thinking-compact/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 手工检查待做）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 设置项 `general.simplifyThinking`，缺省开启 | `packages/util/shared/src/settings.ts`、`apps/desktop/src/main/settings/` | 旧设置文件读出来是开启 |
| 流式思考段带开始 / 结束时间 | `packages/client/client/src/live/` | 只在流式状态里，不写入会话 |
| 对话显示设置共用一个订阅 | `renderer/components/conversation/display-settings.ts` | 替代 `turn-tail/useShowTurnCodeChanges.ts`，行为不变 |
| 思考行简化样式 | `renderer/components/messages/{ThinkingBlock.tsx,thinking-title.ts}` | 一行标题：`Thinking 6s · 开头一句` / `Thought for 9s` / `Thinking` |
| 设置页开关 | `renderer/components/settings/sections/ConversationDisplaySection.tsx` | 「对话显示」第二行 |
| 浏览器 mock 场景 | `renderer/mock/scenarios/thinking.ts` | `?mock=thinking`：思考 → Read → 思考，停在运行态 |

## 人工验证指引

### 必须验证（Electron，真实模型）

1. **运行中只有一行**
   - 验证方式：开关开启（默认），发一个会长时间思考的问题。
   - 预期结果：思考行始终一行，秒数每秒加一；开头一句出现后不变；下面的内容不被推走。
2. **点标题能看全文**
   - 验证方式：思考中点标题，再点一次。
   - 预期结果：正文展开并继续流式追加；再点收起。
3. **多段思考**
   - 验证方式：找一个会「思考 → 工具 → 再思考」的问题。
   - 预期结果：第一段变成 `Thought for Ns`，第二段是新的一行，有自己的开头一句；工具行和以前一样。
4. **回复完成后**
   - 验证方式：等回复结束，展开 Worked。
   - 预期结果：整段收进 Worked；思考行标题是 `Thinking`（用时不保存，这是预期行为），点开能看到全文。
5. **关闭开关**
   - 验证方式：设置 › 通用 › 对话显示，关闭「简化思考过程」，再发一条。
   - 预期结果：和改动前一样，正文边输出边展开，标题 `Thinking...`。

### 建议验证

1. **深色主题、系统「减少动态效果」**：标题无扫光时用时仍然更新，颜色正常。
2. **子 Agent 面板、侧边对话**：里面的思考行同样只有一行。
3. **思考中切开关**：运行中的思考行跟着切到对应样子；已经手动点过的保持原样。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop test`：305 个文件、2950 个用例中 2945 通过、5 个原本就跳过。
- `pnpm --filter @actspace/client test`：93 通过、1 跳过。
- `pnpm test:scripts`（需先 `pnpm build:deps` 和 `pnpm --filter @actspace/agent-cli build`）：通过。
- `pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/web typecheck`、`pnpm lint`：通过。
- `pnpm check:frontend-tokens`、`check:frontend-theme`、`check:hot-path-reads`、`check:scale-tests`、`check:docs`、`check:current-docs`：通过。
- 浏览器 renderer `?mock=thinking`：运行中、结束、展开、深色主题四张截图，与 demo D 一致；设置页开关行对齐。

## 已知风险和遗留事项

- 用时不写入会话：回复完成后重新展开 Worked、重启、历史回读，标题都是 `Thinking`。要保留需改后端消息内容契约，单独立项。
- Web / 手机端（`apps/web` 的 `ThinkingRow`）不受这个开关影响。
- demo `docs/design-docs/frontend/thinking-compact-demo.html` 等 Electron 复验后删除。
