# DuckCoding 多 Key、本地模型档案与名称变体设计

- 状态：首版实现完成；缓存归因探针已确认 Codex 应走 Responses API，待使用用户自有 DuckCoding Key 做真实 Agent 工具循环与调用验收。
- 更新时间：2026-07-28。
- 对应执行计划：`docs/exec-plans/completed/20260724-multi-provider-llm/plan-7-duckcoding-multi-key.md`。

## 目标

DuckCoding 提供 OpenAI-compatible 接口，但它更接近 coding 工具的统一转发层，而不是 OpenRouter 式的公共模型市场：

```ts
const client = new OpenAI({
  baseURL: "https://api.duckcoding.ai/v1",
  apiKey,
});

await client.responses.create({
  model: "gpt-5.6-sol-high",
  input,
  stream: true,
});
```

这条接入需要同时满足：

1. 单 Key 用户继续沿用现有供应商级默认 Key，模型页不增加额外控件。
2. 多 Key 只在供应商页创建和管理；模型页只能选择已经存在的 Key。
3. 倍率与 Key 绑定，缺省为 `1x`，调用时再应用到模型基础价格快照。
4. DuckCoding 模型使用它实际接受的裸模型名，不自动添加 OpenAI、Azure、xAI 等前缀。
5. Codex 的推理强度通过不同的 `model` 字符串表达，不向请求体增加 OpenRouter 风格的 `reasoning` 属性。
6. 用户可以覆盖最大上下文和最大输出；上下文值进入真实预算与压缩逻辑。

## 首版边界

### 包含

- 内部 ProviderId：`duckcoding`。
- UI 显示名称：`DuckCoding`。
- 默认 Base URL：`https://api.duckcoding.ai/v1`。
- Codex 本地档案使用 OpenAI-compatible `responses` runtime；Grok 与未知手动模型默认使用 `chat.completions` runtime。
- 默认 Key 与可选额外 Key、独立连接状态和价格倍率。
- 模型级可选 `credentialId`。
- 仓库内维护的 DuckCoding 本地模型档案。
- Codex 与 Grok 两个 family。
- 精确请求模型名、推理强度名称变体、上下文覆盖和手动模型兜底。

### 不包含

- DuckCoding 远端模型目录、余额或 Management API。
- Key 轮询、随机路由、失败自动切换或限流调度。
- 从 models.dev 或 OpenRouter 自动导入 DuckCoding 模型能力与价格。
- 把上游厂商或聚合目录价格声明为 DuckCoding 官方价格。
- 在模型页输入、创建或修改 API Key。
- 为未知自定义模型猜测图片、推理或工具能力。

models.dev 可以作为人工维护目录数据时的参考来源，但不是运行时依赖，也不要求用户配置 OpenRouter。首版 DuckCoding 添加弹窗始终读取打包在应用内的本地档案。Codex 三个标准模型的基础价格由维护者在 2026-07-28 参考 [models.dev API](https://models.dev/api.json) 中对应 OpenAI 模型条目写入本地档案；它们只用于 Usage 估算，不代表 DuckCoding 官方结算价。

## 数据模型

### Provider

```ts
type ProviderId = "deepseek" | "kimi" | "openrouter" | "duckcoding";

const duckCodingProvider = {
  id: "duckcoding",
  label: "DuckCoding",
  defaultBaseUrl: "https://api.duckcoding.ai/v1",
  supportedApis: ["openai-completions", "openai-responses"],
  supportsRemoteModelCatalog: false,
};
```

`duckcoding` 是持久化和路由使用的稳定 id，`DuckCoding` 只用于展示。本功能尚未发布，因此纠正早期的 `duckding` 拼写时不保留兼容别名，避免长期维护两个内部标识。

### 模型定义扩展

```ts
interface ModelDefinition {
  provider: "duckcoding";
  api: "openai-completions" | "openai-responses";
  apiModel: string;
  family?: string;
  contextWindow: number | null;
  maxTokens: number | null;
  requestModelByReasoningEffort?: Partial<
    Record<ModelReasoningEffort, string>
  >;
}
```

字段职责：

- `provider`：模型属于哪个服务商，本功能固定为 `duckcoding`。
- `api`：该模型实际使用的协议；已确认的 Codex 档案使用 `openai-responses`，Grok 和未知手动模型默认使用 `openai-completions`。
- `family`：本地档案的产品分组，首版为 `codex` 或 `grok`。
- `apiModel`：默认实际发送的精确模型名。
- `requestModelByReasoningEffort`：供应商把强度编码在模型名中时，统一推理强度到请求模型名的映射。
- `contextWindow`：Agent 上下文预算和压缩阈值，允许用户在添加时覆盖。
- `maxTokens`：可选输出上限，允许用户在添加时覆盖或留空。

`requestModelByReasoningEffort` 是 provider-neutral 的薄扩展：没有该字段的 OpenRouter、DeepSeek、Kimi 模型保持原行为；未来其他转发服务也可复用，而无需在 agent loop 中硬编码供应商名称。

### 本地模型档案

首版目录位于 `packages/shared/src/duckcoding-model-catalog.ts`，由 renderer 和 main 共用同一份受版本控制的数据。

当前收录：

| family | 显示模型 | 默认请求名 | 协议 | 强度变体 | 默认上下文 |
| --- | --- | --- | --- | --- | --- |
| Codex | 5.6 Sol | `gpt-5.6-sol` | Responses | Light / Medium / High / Extra High / Ultra | 255,000 |
| Codex | 5.6 Terra | `gpt-5.6-terra` | Responses | Light / Medium / High / Extra High / Ultra | 255,000 |
| Codex | 5.6 Luna | `gpt-5.6-luna` | Responses | Light / Medium / High / Extra High / Ultra | 255,000 |
| Grok | Grok 4.5 | `grok-4.5` | Chat Completions | 无 | 255,000 |

三个 Codex 系列共享已确认的强度规则：

| UI 强度 | 内部 effort | 请求模型名 |
| --- | --- | --- |
| Light | `low` | `<base>-low` |
| Medium | `medium` | `<base>` |
| High | `high` | `<base>-high` |
| Extra High | `xhigh` | `<base>-xhigh` |
| Ultra | `ultra` | `<base>-ultra` |

其中 `<base>` 分别为 `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`。这些名称已由用户确认，因此在本地档案中显式生成；其他未来系列仍不得根据命名规律自行猜测。

Codex 标准基础价格按 USD / 1M tokens 保存：

| 模型 | 输入 | 输出 | 缓存读取 | 缓存写入 |
| --- | ---: | ---: | ---: | ---: |
| 5.6 Sol | $5 | $30 | $0.5 | $6.25 |
| 5.6 Terra | $2.5 | $15 | $0.25 | $3.125 |
| 5.6 Luna | $1 | $6 | $0.1 | $1.25 |

同一 Codex 系列的五档名称变体共享该系列基础价格。由于本地 `ModelPricing` 暂不表达长上下文分段计价，这里只保存标准基础价；DuckCoding 实际账单始终是最终事实来源。Grok 4.5 和未知自定义模型在没有可靠单一基础价时继续显示“价格未知”。

对已经安装、但持久化定义里尚无价格或仍声明旧 Chat Completions 协议的 Codex 模型，模型存储在生成读取快照时按精确 `apiModel` 从当前本地档案补齐价格并切换到 `openai-responses`。该兼容逻辑不会改写用户的持久化模型定义，因此上下文覆盖、显示名和其他自定义字段保持原样。

### 手动模型

本地档案不是白名单。用户仍可选择“自定义模型”，填写 DuckCoding 接口接受的精确模型名和可选显示名。

未知模型的安全默认值为：

- 输入模态：文本。
- 工具调用：供应商声明兼容，但尚未由本地验证。
- 推理：关闭。
- 推理强度变体：无。
- 上下文：由用户明确填写。
- 价格：未知。

这样可以保留转发服务的开放性，同时避免把同名上游模型的能力错误套到 DuckCoding 路由上。

## 多 Key 与倍率

### 持久化边界

- 默认 Key 明文保存于 main-only `secrets.json` v2 的现有 provider 字段。
- 额外 Key 明文保存于 `<provider>:<credentialId>` 对应字段；凭据文件权限固定为 `0600`。
- 普通 settings 只保存 id、label、倍率和连接状态。
- 模型只保存可选 `credentialId`；缺省表示动态继承供应商默认 Key。
- renderer 永不接收 Key 明文或密文。

### 交互规则

- 供应商只有默认 Key：模型添加和已安装模型均不显示 Key 选择器。
- 供应商存在额外 Key：模型页显示“默认 Key + 已有额外 Key”下拉。
- 模型页只能选择，不能创建或输入 Key。
- 默认 Key 缺失但额外 Key 存在时，供应商卡片和额外 Key 管理入口继续可用。
- 被模型引用的额外 Key禁止删除；引用损坏时不得静默回退默认 Key。

### 倍率计算

每把 Key 保存自己的 `pricingMultiplier`，缺省为 `1`。运行时先解析模型和目标 Key，再生成仅属于本次调用的价格快照：

```text
有效单价 = 模型基础单价 × 目标 Key 倍率
```

倍率只影响运行时解析出的模型定义和本次 Usage；不修改本地模型档案，也不重算历史 Usage。Codex 三个标准模型使用本地档案基础价；Grok 或自定义模型没有基础价格时仍允许调用，费用保持未知。例如 Sol 绑定 `0.2x` Key 后，估算输入为 `$1 / 1M`、输出为 `$6 / 1M`。

## 推理强度与请求模型名

统一层仍使用 `ModelReasoningEffort` 表达 Composer 选择，但 DuckCoding adapter 不向请求体写入 `reasoning`：

```text
Composer effort=ultra
  -> resolve ModelDefinition
  -> requestModelByReasoningEffort.ultra
  -> effective apiModel=gpt-5.6-sol-ultra
  -> responses.create { model: "gpt-5.6-sol-ultra", ... }
```

模型设置中的稳定 key 仍为 `duckcoding:gpt-5.6-sol`，不会因为一次请求选择 high 而变成另一个已安装模型。请求期间生成有效 definition，使日志、Usage 和实际请求都记录本次使用的精确 `apiModel`。

OpenRouter 保持它自己的请求语义：支持时仍可以发送 `reasoning: { effort }`。两者共享统一 UI 类型，但由 provider adapter 和模型定义决定落地方式。

## 上下文覆盖

添加 DuckCoding 模型时必须允许修改最大上下文，范围为 1,024 到 10,000,000 tokens 的整数。最大输出为可选字段，使用同一范围。

覆盖值写入自定义 `ModelDefinition`，并直接参与：

- Context Manager 的窗口预算。
- 历史压缩阈值。
- Composer / 设置页的模型信息展示。
- runtime 的 `maxTokens` 覆盖（提供时）。

本地档案默认 255,000，不假设上游模型原生的 1M 上下文在 DuckCoding 路由上完整可用。

## 运行时解析

每次调用按以下顺序解析：

1. 获取已安装 `ModelDefinition` 和模型设置。
2. 根据 `credentialId` 解析默认 Key 或同 provider 的额外 Key。
3. 校验目标 Key 存在且可用，不做默认 Key fallback。
4. 将目标 Key 倍率应用到价格快照。
5. 解析 `thinkingEnabled` 与合法的 `reasoningEffort`。
6. 通过 `requestModelByReasoningEffort` 生成本次请求的有效 `apiModel`。
7. 根据模型的 `api` 创建 `OpenAIResponsesService` 或 `OpenAICompletionsService`。
8. Codex Responses 请求使用 session 派生的稳定 `prompt_cache_key`，保持 `store: false`，并随完整上下文重放消息、工具调用结果和供应商要求的加密 reasoning item。
9. adapter 保持请求体不含 DuckCoding 专用 reasoning effort 属性并发起调用。

### Responses 会话与缓存边界

Codex Responses 路线不依赖服务端会话存储，也不使用 `previous_response_id`：

- `prompt_cache_key` 由 session id 做 SHA-256 后截断生成，原始 session id 不发送给供应商。
- 每轮请求使用 `store: false`，由 ActSpace 自己管理完整上下文和持久化。
- 请求包含 `reasoning.encrypted_content`，响应中的 opaque reasoning item 作为带 provider signature 的 thinking 内容进入 session 事件；thinking/tool-call 事件同时保存 `api`、`provider`、`model` 身份，落盘恢复后只有同一目标才会在对应 assistant 消息前原样回放。
- 加密 reasoning item 只作为协议状态，不展示成用户可读的思考文本，也不参与模型身份或缓存键计算。
- Responses `input_tokens_details.cached_tokens` 归一为 `cacheReadTokens`；DuckCoding 若返回扩展字段 `cache_write_tokens`，归一为 `cacheWriteTokens`。

缓存键只负责提高稳定前缀的复用概率，不承担会话连续性；对话事实仍以本地完整上下文为准。

### 失败语义

| 场景 | 结果 | fallback |
| --- | --- | --- |
| 默认 Key 模型但默认 Key 缺失 | `provider_disconnected` | 无 |
| 额外 Key 引用不存在或无法解密 | `credential_missing` | 否 |
| 额外 Key 明确不可用 | `credential_unavailable` | 否 |
| 本地档案 id 不存在 | `model_not_found` | 否 |
| 上下文或输出限制非法 | `invalid_model` | 否 |
| 未知手动模型 | 按安全默认能力保存 | 不涉及 |

## 设置页规范

### 供应商页

- 使用现有 provider 卡片和编辑弹窗。
- 默认 Key 可设置倍率，缺省 `1x`。
- 额外 API Key 区域管理 label、倍率、连接状态、测试、编辑和删除。
- 不展示或回显 Key 内容。

### 模型页

- “添加 DuckCoding 模型”默认展示本地 Codex、Grok 档案和“自定义模型”。
- 档案卡片显示 family、默认精确模型名和名称变体摘要。
- 三个 Codex 档案明确说明强度通过请求模型名切换；Composer 默认 Medium，只显示 Light、Medium、High、Extra High、Ultra，不显示语义重复的 Auto。
- 最大上下文始终可编辑，最大输出可选。
- 只有存在额外 Key 时显示调用 Key 下拉。
- 保存后模型列表显示 `family`，不伪装成 OpenRouter/models.dev 来源。

所有样式继续使用现有主题语义 token；浅色、深色和跟随系统三态均不得引入固定黑白色或裸 hex。

## 安全与兼容

- API Key 明文只在 renderer 提交到 main 和 main 发起请求前短暂存在。
- IPC 不返回密钥、Authorization header 或外部原始错误正文。
- 日志只记录 provider、credentialId、modelKey 和裁剪后的错误分类。
- 旧模型没有 `credentialId` 时继续使用默认 Key。
- 旧 Key 没有倍率时归一为 `1x`。
- `duckcoding` 是未发布功能的拼写纠正，不迁移实验期 `duckding` 数据。
- 删除公共 DuckCoding 元数据目录服务不影响 OpenRouter 自己的远端模型目录。

## 验收标准

### 自动化

- Provider Registry 仅使用 `duckcoding` / `DuckCoding`。
- 本地目录只暴露确认过的裸请求模型名。
- main 拒绝模型名与本地档案 id 不一致的 IPC 输入。
- Sol、Terra、Luna 均提供五档强度；例如 Sol `ultra` 生成 `gpt-5.6-sol-ultra`，稳定 model key 不变。
- DuckCoding 请求不增加 `reasoning` 属性；OpenRouter 原行为不变。
- Codex 使用 `openai-responses`，Grok 使用 `openai-completions`；旧 Codex 安装快照会升级协议但不改写用户持久化配置。
- Codex Responses 请求带 session 级哈希 `prompt_cache_key`、`store: false` 和 `reasoning.encrypted_content`，不发送 `previous_response_id`。
- Responses 工具调用使用 `call_id` 对账，加密 reasoning item 能经过 session 事件持久化并在下一轮回放。
- Responses usage 能归一输入、输出、缓存读取、缓存写入与 reasoning tokens。
- 最大上下文覆盖写入并参与已安装模型定义。
- 单 Key 隐藏模型 Key 下拉，多 Key 只显示供应商已有 Key。
- 倍率按目标 Key 应用，删除引用保护和缺失引用失败语义保持成立。
- Sol、Terra、Luna 的输入、输出、缓存读取和缓存写入基础价与本地价格表一致。
- 已安装但未持久化价格的 Codex 模型会在读取快照时补齐价格，且不会反向改写持久化定义。
- Sol 绑定 `0.2x` Key 时，模型列表和 runtime 均使用输入 `$1`、输出 `$6` 的有效价格。
- settings、IPC 和日志中不出现 API Key 明文。

### 真实验收

- 使用用户自己的 DuckCoding Key 完成连接测试。
- 分别从 Sol、Terra、Luna 中选择模型，并至少验证一种非默认强度名称；另验证 `grok-4.5`。
- 验证请求不带厂商前缀，Codex high 确实通过 Responses 的模型名路由，Grok 保持 Chat Completions。
- 用 Codex 完成至少一次真实工具调用并继续下一轮，确认加密 reasoning item 回放没有触发协议错误。
- 在同一 session 重复稳定长前缀，确认 Responses usage 出现非零 `cached_tokens`；新 session 使用不同缓存键。
- 两把不同倍率 Key 分别绑定模型，确认请求 Key 与 Usage 估算对应。
- 对照 DuckCoding 实际账单确认本地标准基础价和 Key 倍率是否匹配；如果 DuckCoding 有独立加价或分段规则，以账单为准并更新本地档案。
- 在浅色、深色、跟随系统三态检查供应商、多 Key 和添加模型弹窗。

真实探针必须使用固定无敏感文本，不携带仓库内容、session 内容或个人文件。

### 缓存归因探针

`scripts/diagnose-duckcoding-cache.ts` 用合成静态前缀重复请求同一模型，区分缓存不命中究竟来自请求参数、工具定义、协议还是网关域名。脚本不读取仓库、会话或用户文件，也不把 API Key、Authorization header 或完整请求体写入输出。

先检查计划，不发送请求：

```bash
node --experimental-strip-types scripts/diagnose-duckcoding-cache.ts --dry-run
```

用户确认调用成本后，从环境传入 Key 执行：

```bash
DUCKCODING_API_KEY='...' \
  node --experimental-strip-types scripts/diagnose-duckcoding-cache.ts
```

脚本默认每组重复两次，共十二次真实请求，并检查以下对照：

| 场景 | 主要变量 | 可回答的问题 |
| --- | --- | --- |
| `chat-auto-api` | Chat Completions，无 cache key、无工具 | DuckCoding 是否能仅凭相同前缀自动命中 |
| `chat-key-api` | 增加稳定 `prompt_cache_key` | ActSpace 是否缺少 session 级 cache key |
| `chat-key-tools-api` | 增加稳定工具定义 | Agent 工具前缀是否导致缓存失效 |
| `chat-explicit-api` | 增加显式 breakpoint 与 cache options | 网关是否要求显式缓存放置 |
| `responses-key-api` | 改用 Responses API | DuckCoding 的 Codex 路由是否依赖 `wire_api = responses` |
| `chat-key-www` | 改用 `www.duckcoding.ai` | `api` 与 `www` 域名是否进入不同网关或缓存节点 |

输出同时保留原始 `usage` 字段，并归一读取 `cached_tokens`、`cache_write_tokens` 等常见形态。HTTP 400/404 也属于有效诊断信息：它表示相应协议或参数未被当前 DuckCoding 路由接受，而不是脚本应立即中止的错误。

2026-07-28 的用户实测结果中，只有 `responses-key-api` 明确返回缓存命中：第二次请求 `cached_tokens=2560`，总输入 `3610`，缓存读取占比约 `70.9%`。全部 Chat Completions 对照均未返回可确认的缓存字段。因此首版将已确认的 Codex 档案切换到 Responses，并保留 Grok 与未知手动模型的 Chat Completions 默认值；这是一条由对照实验支持的协议选择，不代表 DuckCoding 所有模型都只能使用 Responses。

### Thinking 传输探针

`scripts/diagnose-duckcoding-thinking.ts` 用四个最小流式请求区分“模型执行了推理”和“接口返回了可展示的推理内容”：

| 场景 | 请求差异 | 观察目标 |
| --- | --- | --- |
| `responses-no-summary` | Codex Responses 只包含 `reasoning.encrypted_content` | reasoning token 与 opaque reasoning item 是否存在，但没有可读 summary |
| `responses-summary-auto` | 额外传入 `reasoning: { summary: "auto" }` | 是否出现 `response.reasoning_summary_text.delta` 或最终 reasoning summary |
| `responses-generate-summary-auto` | 改用旧参数 `reasoning: { generate_summary: "auto" }` | DuckCoding 是否只兼容已弃用的 summary 参数 |
| `chat-grok` | Grok Chat Completions 流 | delta 是否通过 `reasoning_content`、`reasoning` 或 `analysis` 暴露可读推理 |

2026-07-28 的真实探针已确认：Codex baseline 和 `reasoning.summary=auto` 都返回非零 reasoning token 与一条加密 reasoning item，但没有 summary delta 或最终 summary；旧 `generate_summary=auto` 虽返回 HTTP 200，却没有 reasoning token、加密 reasoning item 或 summary；Grok 返回 `reasoning_tokens=505`，34 个 Chat chunk 的 delta 只有 `role` / `content`。因此 DuckCoding 当前没有通过这些 Responses/Chat 通道暴露可读 Thinking。

正式运行时仍保留 Codex signature-only thinking session 事件，因为其中的加密 reasoning item 是后续工具循环的协议状态。共享 session selector 对 `content` 为空的 thinking 事件不生成可见 `MessageBlock`；恢复层仍可读取签名并向同一 provider/model/API 回放。只有真实非空 thinking content 才进入 UI。

先检查请求数量和模型，不发送真实请求：

```bash
node --experimental-strip-types scripts/diagnose-duckcoding-thinking.ts --dry-run
```

用户确认四次调用成本后，从环境传入 Key：

```bash
DUCKCODING_CODEX_API_KEY='Codex Key' \
DUCKCODING_GROK_API_KEY='Grok Key' \
  node --experimental-strip-types scripts/diagnose-duckcoding-thinking.ts
```

两个模型系列的凭据独立解析，不互相 fallback。只执行任意 Responses 场景时仅要求 `DUCKCODING_CODEX_API_KEY`；只执行 `--only chat-grok` 时仅要求 `DUCKCODING_GROK_API_KEY`。默认输出只记录 SSE event 类型、Chat delta 字段名、字符数、reasoning token 和加密 reasoning item 数量，不打印推理或回复正文。只有显式增加 `--show-content` 才会展示每类字段最多 240 个字符的诊断预览。脚本使用固定合成问题，不读取仓库、session 或个人文件。

该探针是手动的付费集成验收工具，自动化检查只执行 `--help`、`--list` 和 `--dry-run`，不得在 CI 中注入真实 Key 或发起外部调用。

## 已确认决策

- 服务商正确名称为 DuckCoding；内部 id 使用 `duckcoding`。
- 默认 Key 保持 provider 级，不迁移成 credential profile。
- 只有额外 Key 存在时，模型页才显示 Key 选择器。
- Key 只能在供应商页添加，模型页只能选择。
- 倍率与 Key 绑定，默认 `1x`，只在运行时写入价格快照。
- DuckCoding 首版使用仓库内本地目录，不依赖 models.dev 或 OpenRouter。
- models.dev 仅作为维护时的人工参考；Codex 三个标准基础价固化进本地档案，不在应用运行时联网拉取，也不声明为 DuckCoding 官方价。
- 首版建立 Codex、Grok family；Codex 收录 Sol、Terra、Luna 三个模型及五档已确认的精确名称。
- DuckCoding 的推理强度通过模型名变体传递，不发送 reasoning effort 属性。
- 已确认的 Codex 档案使用 Responses API；Grok 与未知手动模型默认使用 Chat Completions。
- Codex Responses 使用 session 哈希缓存键和本地完整上下文，不使用服务端 `previous_response_id`；工具循环所需的加密 reasoning item 作为 opaque 协议状态持久化并回放。
- 用户可以覆盖上下文和最大输出，未知模型继续允许手动添加。
