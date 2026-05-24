## [2026-05-24 15:50] | Task: Composer model options

### Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex desktop

### User Query

> 将 Composer 的模型菜单收敛为 deepseek/kimi，hover 模型行显示 Edit，点击 Edit 打开第二层参数配置弹窗，目前只放 Thinking toggle。

### Changes Overview

**Scope:** `packages/desktop`、`packages/shared`、`packages/agent-core`

**Key Actions:**

- **Composer 交互**: 模型菜单只保留 `deepseek` 与 `kimi`；模型行 hover/focus 时显示 `Edit`；点击 `Edit` 打开第二层 options popover。
- **Thinking 配置**: 第二层配置只显示 `Thinking` toggle，不展示 Context/Effort/Fast 等未实现参数。
- **Turn 参数通路**: `RunTurnInput` 新增 `provider` 与 `thinkingEnabled`，renderer 发送 turn 时携带当前选择。
- **后端映射**: main 进程按本轮 provider 创建 LLM 与 ToolManager；DeepSeek 开启 Thinking 时使用 `deepseek-reasoner`，Kimi 关闭 Thinking 时传 `thinking: disabled`。

### Design Intent (Why)

让 UI 菜单不再展示不可用模型，并使 Thinking 开关有真实后端含义。交互上参考 Cursor 的二层配置，但先只实现一个参数，避免提前引入完整模型参数系统。

### Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/llm/services/openai-compatible.ts`
