## [2026-06-04 19:35] | Task: Kimi CN base URL default

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户确认 Kimi 连接问题发生在打包安装版；开发态 `pnpm dev:log` 正常，因为开发态会读取 `.env` 中的 `.cn` endpoint。希望直接把默认 Kimi URL 改为 `.cn`。

### Changes Overview

**Scope:** agent-core, shared model config, env example, docs

**Key Actions:**

- **[Runtime defaults]**: 将 Kimi 默认 base URL 从 `https://api.moonshot.ai/v1` 统一改为 `https://api.moonshot.cn/v1`，覆盖 agent env、OpenAI-compatible service fallback 和共享模型注册表。
- **[Config sample]**: 同步 `.env.example`，避免新环境复制示例后继续落到 `.ai`。
- **[Regression guards]**: 更新 Kimi assistant fixture，并在 env/model-config 单测中锁定 `.cn` 默认值。

### Design Intent (Why)

开发态会读取根目录 `.env`，所以用户显式写入的 `KIMI_BASE_URL=https://api.moonshot.cn/v1` 能覆盖代码默认值；打包安装版没有该 `.env` 兜底，会直接使用内置默认 URL。国内平台生成的 Kimi key 与 `.ai` endpoint 不匹配时会表现为鉴权失败，因此需要让打包态默认值与目标平台一致。

### Files Modified

- `.env.example`
- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/llm/services/openai-completions.ts`
- `packages/agent-core/src/llm/test/kimi-assistants.test.ts`
- `packages/agent-core/src/test/env.test.ts`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/test/model-config.test.ts`
- `docs/learnings/2026-06/20260604-packaged-env-defaults.md`
