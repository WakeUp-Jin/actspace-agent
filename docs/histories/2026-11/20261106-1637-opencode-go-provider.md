## [2026-11-06 16:37] | Task: 新增 OpenCode Go 服务商连接

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `deepseek-v4.1-flash`
- **Runtime**: `DSH`（分支 `feat/opencode-go`）

### 📥 User Query

> 添加连接里没有 OpenCode Go 的官方入口，需要参考 DeepSeek Harness 与本项目的实现补上；OpenCode 官方要求带 `x-session` 请求头。图标用 OpenCode 的，风格和其它服务商保持一致；描述换成官网，不要写订阅说明。OpenCode Go 属于聚合平台还是官方？模型列表不对。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`（服务商模板、目录）、`apps/desktop`（图标、设置页）

**Key Actions:**

- **服务商模板**：新增 `opencode-go`，归**聚合平台**——它一个 Key 接多厂模型（Grok / GPT / Claude / Kimi / GLM / Qwen 等），卖的是网关与计费，与 OpenRouter 同类，不是模型厂商自己的接口。Base URL 用官方文档的 `https://opencode.ai/inference/go/openai/v1`，协议 `openai-completions`。
- **模型目录**：`CATALOG_PROVIDERS` 加入 `opencode-go` 后运行 `pnpm models:generate`。该服务没有 `/models` 接口（返回 404），只能靠目录回退，否则用户得手填模型 ID。
- **图标**：`opencode.svg`（Simple Icons，CC0），沿用单色 mask，与其它服务商一致。
- **描述**：模板不带 `description`，列表回落到站点主机名，与 DeepSeek / OpenRouter 写法一致。

### 🧠 Design Intent (Why)

- **分组按「一个 Key 接多厂模型」判，不按「是不是自家端点」判**：OpenCode Go 是自己端点，但模型全是别家的；「官方」栏里的 DeepSeek、Moonshot、Anthropic、OpenAI 都是模型厂商自己的接口。OpenRouter 同样第一方却已在聚合平台，保持一致。
- **协议与请求头不自己实现**：pi-ai 1.5.0 起，连接的 Base URL 与内置服务商地址完全一致时直接用内置实现——每个模型走哪种协议、发到哪个地址、思考参数和 `x-opencode-session` 请求头都由 pi-ai 决定，代理也走它的请求级 `fetch`。所以本仓库只补模板与目录，不再维护第二套协议判断。
- **不按域名判断端点归属**：`opencode.ai` 同时服务 Zen 与 Go（`/inference/openai/v1` 对 `/inference/go/openai/v1`），按 host 判断会把 Zen 认成 Go；归属交给 Base URL 精确匹配。

### 📁 Files Modified

- `packages/util/shared/src/provider-templates.ts`
- `packages/util/shared/src/model-catalog-normalize.ts`
- `packages/util/shared/src/generated/model-catalog.generated.ts`
- `apps/desktop/src/renderer/assets/provider-marks/opencode.svg`
- `apps/desktop/src/renderer/assets/provider-marks/README.md`
- `apps/desktop/src/renderer/components/settings/ProviderLogo.tsx`
- `apps/desktop/src/renderer/test/model-settings.test.tsx`
- `docs/releases/feature-release-notes.md`

### ✅ Verification

- `pnpm --filter @actspace/llm-pi-ai test`：通过。
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/model-settings.test.tsx`：通过（含分组与描述断言）。
- `pnpm typecheck`（shared / llm-pi-ai / desktop）：通过。
- `pnpm models:generate` 生成的目录里 `opencode-go` 条目来自 models.dev，未手改生成文件。
- 真实 Key 在桌面端逐条验证，三条请求分别覆盖三种协议：

  | 模型 | pi-ai 内协议 | 结果 |
  |---|---|---|
  | `deepseek-v4.1-flash` | `openai-completions` | 通过 |
  | `gpt-6-luna` | `openai-responses` | 通过 |
  | `claude-haiku-5-5` | `anthropic-messages` | 通过 |

  另验证了带思考档位、带工具调用，以及 `gemini-4-argon`（Google 协议，经 Console 转译）。

### ⚠️ 未覆盖 / 已知情况

- OpenCode Go 里有一个 Google 协议（`google-generative-ai`）的模型 `gemini-4-argon`：pi-ai 只认 OpenAI Completions / Responses 与 Anthropic Messages 三种协议，遇到它会退回连接协议（OpenAI Chat）发送，由 OpenCode Console 转译。实测可用，但它不在 pi-ai 的已知模型表里，思考参数按 ActSpace 的通用规则发送。
- 该服务没有 `/models`，模型事实全部来自本地目录快照，刷新需要 `pnpm models:generate`。
- 上游限流（`429 prefill_cap_refused`）属于 OpenCode 侧容量问题，不在本次范围。
