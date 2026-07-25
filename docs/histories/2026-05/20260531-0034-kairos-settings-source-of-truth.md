## [2026-05-31 00:34] | Task: Kairos 模型与思考链统一到 settings.json

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 希望 Kairos 改模型立即生效；默认只保留 DeepSeek Flash，可选 DeepSeek Pro；并进一步希望统一整体设置来源，不要一会 env、一会 preferences.json、一会变量。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/agent-core`、`@actspace/desktop`、docs

**Key Actions:**

- **统一真来源**：`AppSettings.kairos` 新增 `modelId`，Kairos 模型与 thinking 均持久化在 `<userData>/settings.json`；`preferences.json` 不再承载模型字段。
- **收窄模型选择**：Kairos 模型只允许 `null`（默认 `deepseek-v4-flash`）与 `deepseek-v4-pro`；Kimi 或非法历史值统一回落 Flash。
- **立即生效**：`settings:update` 检测 Kairos `modelId` / `thinking` 变化后立即停旧 controller、重建 LLM，再按 `preferences.enabled` 恢复运行意图，不再等待空闲态。
- **移除 env 链路**：删除 agent-core env schema 中的 `KAIROS_MODEL_ID` / `KAIROS_THINKING`，`resolveKairosEnv(modelId, thinking)` 改为纯 settings 输入。
- **UI 收口**：设置页「Kairos 自主智能体」模型下拉只显示 `DeepSeek V4 Flash（默认）` 与 `DeepSeek V4 Pro`；`preferences.json` 解析失败不再影响模型设置。
- **文档同步**：更新 Kairos 设计文档与 `.env.example`，明确模型 / 思考链由 `settings.json` 管理。

### 🧠 Design Intent (Why)

Kairos 原先的模型设置经历过 env、`preferences.json`、设置页状态之间的迁移，导致用户很难判断哪个字段才真正生效。本轮把“用户在设置页能改的非敏感设置”收口到 `settings.json`，让 `preferences.json` 回到 Kairos 运行偏好 / 工作边界文件的角色；运行时需要重建 LLM 的部分由 main 进程统一处理。这样设置页保存成功后，下一次 Kairos 调用使用的模型就是 UI 里看到的模型。

### 📁 Files Modified

- `packages/shared/src/settings.ts`
- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/kairos/env.ts`
- `packages/agent-core/src/kairos/config/schema.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `.env.example`

### 🧪 Verification

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/agent-core test -- env.test.ts schema.test.ts loader.test.ts`
- `pnpm --filter @actspace/desktop test -- settings-service.test.ts kairos-bootstrap.test.ts kairos-config-files.test.tsx kairos-settings.test.tsx`

### 📚 Learning

- `docs/learnings/2026-05/settings-source-of-truth-vs-runtime-adapters.md`
