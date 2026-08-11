## [2026-08-09] | Task: 移除 DuckCoding 文字模型供应商

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

移除设置页中的 DuckCoding 供应商，但保留图片生成使用的 DuckCoding 接口。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、文档

**Key Actions:**

- 从 Provider Registry、模型目录、LLM runtime、IPC 和设置页移除 DuckCoding 文字模型供应商。
- 启动时迁移并清理旧 DuckCoding 文字模型、任务模型引用和文字模型密钥。
- 保留独立的 `image-generation` 密钥、模型和 DuckCoding Images API 默认端点。
- 更新当前架构文档，并将原 DuckCoding 方案标记为历史设计。

### 🧠 Design Intent (Why)

文字模型供应商和图片生成连接属于两条独立能力链路，不能因为移除一个 Provider Registry 条目而共享删除逻辑。迁移采用“识别旧字段、清理文字配置、保留图片配置、原子重写”的边界，避免旧版本数据让已退役供应商重新出现在 UI，同时保证图片生成继续可用。

### 📁 Files Modified

- `packages/shared/src/provider-config.ts`
- `packages/shared/src/model-config.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/model-store-service.ts`
- `packages/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/agent-core/src/llm/provider-adapter.ts`
- `packages/agent-core/src/llm/services/openai-completions.ts`
- `packages/agent-core/src/llm/services/openai-responses.ts`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
