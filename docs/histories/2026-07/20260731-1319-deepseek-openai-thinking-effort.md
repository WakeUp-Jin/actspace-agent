## [2026-07-31 13:19] | Task: DeepSeek 切换 OpenAI 协议并增加思考强度

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> DeepSeek 不再使用 Anthropic，改为 OpenAI-compatible；Thinking 只显示 High 和 Max，默认 Max。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、配置与设计文档

**Key Actions:**

- **协议收口**: 内置 DeepSeek 模型与 provider 固定使用 `openai-completions` 和 `https://api.deepseek.com`，移除 DeepSeek 协议切换 env。
- **思考参数**: 将 Thinking 映射为 `thinking.type=enabled|disabled`，开启时发送 `reasoning_effort=high|max`，默认 Max。
- **Composer 交互**: DeepSeek 只显示 High / Max；OpenRouter 和 DuckCoding 保持原有策略。
- **设置迁移**: 仅把精确的官方 `https://api.deepseek.com/anthropic` 迁移为默认根地址，保留自定义网关。
- **回归覆盖**: 覆盖模型元数据、env/runtime、最终请求体、设置迁移和 Composer 默认发送参数。

### 🧠 Design Intent (Why)

协议选择属于模型/provider 注册表，供应商私有请求参数属于 provider adapter，Composer 只消费能力元数据。三层同时收口，才能避免 UI 显示正确但 CLI、Kairos 或历史设置仍走旧协议。通用 Anthropic service 不删除，避免把一次 provider 路由迁移扩大成无关的协议基础设施重构。

### 📁 Files Modified

- `packages/shared/src/model-config.ts`
- `packages/shared/src/provider-config.ts`
- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/llm/provider-adapter.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/SECURITY.md`
