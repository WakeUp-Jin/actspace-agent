## [2026-07-25 20:10] | Task: 优化模型选择与推理强度

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 缩小并优化模型选择菜单，增加模型搜索和 OpenRouter 推理强度控制，并给弹出层增加自然的出现动画；不增加上下文长度选择器，模型直接使用自身最大上下文。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/agent-core`、`@actspace/desktop`、前端与模型设计文档

**Key Actions:**

- **能力建模**: 在模型能力与 OpenRouter catalog 中记录可用推理强度、默认强度和强制推理语义。
- **运行时贯通**: 将显式推理强度从 Composer、IPC、Agent runtime、loop 传到 OpenRouter provider adapter，并在 runtime 再次过滤不支持的值。
- **Composer 交互**: 增加自动聚焦的本地模型搜索、按模型隔离的 Thinking / Effort 状态、能力驱动的 Options，以及尊重 reduced motion 的轻量打开过渡。
- **目录同步修复**: OpenRouter 目录重新加载成功后刷新已安装模型的能力快照；添加或刷新完成后立即通知 App 重拉 Composer 与任务模型候选。
- **边界收口**: 不提供上下文长度选择器；`Auto` 不发送强度覆盖，让供应商使用模型默认策略。

### 🧠 Design Intent (Why)

模型控制项必须来自真实 provider 能力，而不是给所有模型展示一套看似可用的静态表单。这样可以避免 UI 与请求参数脱节，也能在 OpenRouter 模型目录扩大后保持搜索效率和运行时安全。

### 📁 Files Modified

- `packages/shared/src/model-config.ts`
- `packages/shared/src/openrouter-catalog.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/llm/provider-adapter.ts`
- `packages/desktop/src/main/openrouter-catalog-service.ts`
- `packages/desktop/src/main/model-store-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `packages/desktop/src/renderer/components/settings/OpenRouterModelCatalogDialog.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`

### ✅ Verification

- Workspace `pnpm typecheck` 与 `pnpm build` 通过。
- Agent Core 目标测试：3 files / 50 tests 通过。
- Desktop main 与 Composer 目标测试：3 files / 37 tests 通过。
- 目录能力刷新与添加后即时同步目标测试：ModelStore 5 tests、Provider/Model Settings 9 tests 通过。
- `pnpm check:docs`、`pnpm check:repo`、`pnpm check:frontend-theme` 与 `git diff --check` 通过。
- UI 视觉和 Electron / OpenRouter 真实交互由用户手动验收。
