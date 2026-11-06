## [2026-11-06 16:37] | Task: 新增 OpenCode Go 服务商连接

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `deepseek-v4.1-flash`
- **Runtime**: `DSH`（分支 `feat/opencode-go`）

### 📥 User Query

> 添加连接里没有 OpenCode Go 的官方入口，需要参考 DeepSeek Harness 与本项目的实现补上；OpenCode 官方要求带 `x-session` 请求头。图标用 OpenCode 的，风格和其它服务商保持一致；描述换成官网，不要写订阅说明。OpenCode Go 属于聚合平台还是官方？模型列表不对。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`（服务商模板、目录、端点归属）、`packages/llm/llm-pi-ai`（请求头）、`apps/desktop`（图标、设置页）

**Key Actions:**

- **服务商模板**：新增 `opencode-go`，归**聚合平台**——它一个 Key 接多厂模型（Grok / GPT / Claude / Kimi / GLM / Qwen 等），卖的是网关与计费，与 OpenRouter 同类，不是模型厂商自己的接口。Base URL 用官方文档的 `https://opencode.ai/inference/go/openai/v1`。
- **会话头**：OpenCode 用 `x-opencode-session` 把同一会话的请求路由到同一上游实例并复用前缀缓存；缺它不会报错，但每个请求都被当成新会话，缓存命中率归零、成本翻倍。`pi-ai-stream` 与 `legacy-proxy-wire-engine` 两条路径都补上，值用 Session id。
- **模型目录**：`CATALOG_PROVIDERS` 加入 `opencode-go` 并重新生成目录。该服务没有 `/models` 接口（返回 404），只能靠目录回退，否则用户得手填模型 ID。
- **端点归属**：`catalogProviderForEndpoint` 识别 `opencode.ai`，价格与事实归属才对得上。
- **图标**：`opencode.svg`（Simple Icons，CC0），沿用单色 mask，与其它服务商一致。
- **描述**：模板不带 `description`，列表回落到站点主机名，与 DeepSeek / OpenRouter 写法一致。

### 🧠 Design Intent (Why)

- **分组按“一个 Key 接多厂模型”判，不按“是不是自家端点”判**：OpenCode Go 是自己端点，但模型全是别家的；「官方」栏里的 DeepSeek、Moonshot、Anthropic、OpenAI 都是模型厂商自己的接口。OpenRouter 同样第一方却已在聚合平台，保持一致。
- **会话头收敛在一个小函数里**：两个传输路径都要加，且只能对 OpenCode 端点加（避免把 Session id 交给其它服务商）。判断复用已有的 `catalogProviderForEndpoint`，不再写第二套 host 匹配。
- **没有把错误地址写进版本迁移**：早先的实现把 Base URL 写成 `/zen/go`，并为修正它加了 `layersVersion 3→4`。那会让所有用户的设置文件为一处域名变更重写一遍，方向也不对——`layersVersion` 是给数据结构变更用的，不是给上游改域名用的。最终只保留模板里的正确地址。

### 📁 Files Modified

- `packages/util/shared/src/provider-templates.ts`
- `packages/util/shared/src/model-catalog-normalize.ts`
- `packages/util/shared/src/model-pricing.ts`
- `packages/util/shared/src/generated/model-catalog.generated.ts`
- `packages/llm/llm-pi-ai/src/opencode-session.ts`
- `packages/llm/llm-pi-ai/src/pi-ai-stream.ts`
- `packages/llm/llm-pi-ai/src/legacy-proxy-wire-engine.ts`
- `packages/llm/llm-pi-ai/src/test/opencode-session.test.ts`
- `apps/desktop/src/renderer/assets/provider-marks/opencode.svg`
- `apps/desktop/src/renderer/assets/provider-marks/README.md`
- `apps/desktop/src/renderer/components/settings/ProviderLogo.tsx`
- `apps/desktop/src/renderer/test/model-settings.test.tsx`
- `docs/releases/feature-release-notes.md`

### ✅ Verification

- `pnpm --filter @actspace/llm-pi-ai test`：opencode-session 3 例、transport-failure 15 例通过。
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/model-settings.test.tsx`：17 例通过（含新增的分组与描述断言）。
- `pnpm typecheck`（shared / llm-pi-ai / desktop）：通过。
- 真实请求验证：连接后请求确实带上了 `x-opencode-session`（值等于 Session id），端点 `/inference/go/openai/v1/chat/completions`、协议 `openai-chat`、`Product: go` 均正确，鉴权通过。

### ⚠️ 未覆盖 / 已知情况

- 上游限流（`429 prefill_cap_refused`）属于 OpenCode 侧容量问题，不在本次范围；客户端目前只重试 timeout / network，不重试限流。
- 该服务没有 `/models`，模型事实全部来自本地目录快照，刷新需要 `pnpm models:generate`。
