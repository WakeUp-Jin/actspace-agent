# Anthropic 自定义连接、手动模型与价格执行计划

状态：2026-09-25 实现与自动化已完成；真实 Electron 点击和真实中转站调用保留为外部人工门禁。

执行模式：交互模式。实施 worktree：`/private/tmp/actspace-anthropic-custom-model-pricing`，分支：`codex/anthropic-custom-model-pricing`。

## 1. 目标

把现有 `anthropic-messages` 自定义连接补成一条可靠的 Claude Code 兼容路径，并在每条自定义连接内部提供手动添加模型、手动维护显示名称和手动设置价格的完整交互。

最终状态：

- 用户使用服务根地址、API Key 和首个模型 ID 创建 Anthropic Messages 连接；
- Anthropic 请求固定落到 `<baseUrl>/v1/messages`，不会产生 `/v1/v1/messages`；
- 每条连接可以维护多个互相隔离的手动模型；
- 模型 API ID、显示名称、推理能力、上下文限制和价格分别保存；
- 手动价格按输入、输出、缓存读取、缓存写入四类 Token 计算；
- 每次请求冻结当时的价格快照，修改价格不重算历史费用；
- Anthropic 直连与本地 HTTP 代理路径发送一致的 5 分钟 Prompt Cache 标记；
- 中转站不支持 Prompt Cache 时，用户可以在连接高级设置中关闭缓存；
- 自动化测试证明协议路径、模型隔离、价格计算、缓存 usage 和设置持久化；
- 真实中转站验收作为显式、可能产生少量费用的人工门禁。

## 2. 基线与执行约束

- 仓库已存在三种协议：`openai-completions`、`openai-responses`、`anthropic-messages`。
- `packages/shared/src/provider-config.ts` 已注册 `anthropic-compatible`；本计划不新增第四种协议或新的 Provider 品牌类型。
- `SettingsService.createCustomConnection()` 已为首个模型生成连接隔离的 ModelKey；本计划扩展这条路径，不另建模型数据库。
- `ModelDefinition.pricing`、`resolveModelPricing()`、`calculateUsageCost()` 和 Usage `pricingSnapshot` 已经存在；本计划复用它们，不创建第二套价格引擎。
- `CustomModelReasoning` 已提供自定义模型推理配置；本计划消费该契约，不复制 reasoning schema。
- 本计划明显超过 8 个文件，跨 Shared、Settings、ModelStore、LLM adapter、Desktop IPC、preload、renderer、Usage、测试和文档。
- 计划创建时工作树非空，正在进行的 `20260924-main-chat-form` 会修改 `packages/shared/src/ipc.ts`、`packages/shared/src/runtime-v2/desktop-ipc.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts` 等重叠文件。
- 实施开始前必须重新读取这些文件的当前 diff，保留已有改动，不允许 reset、checkout、宽泛暂存或覆盖另一份 active plan。
- 两个计划不得在同一个工作树里并行修改重叠 IPC 文件。若主 Chat 计划仍在实施，先完成其当前可合并切片，或为本计划使用独立 worktree。
- 不自动 commit、push、发布安装包、修改真实密钥或自动消耗 Provider 额度。
- 修改 UI 前重新读取主题规范；不新增颜色字面量，不重做设置中心视觉系统。
- 实施开始时创建 `docs/exec-runs/20260924-anthropic-custom-model-pricing/{execution-process.md,execution-summary.md}`，按里程碑持续更新。
- 完成业务代码前读取 `docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`，并按仓库规则判断是否新增学习文档。

## 3. 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/PLANS_GUIDE.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md`
- `docs/learnings/2026-06/static-prefix-dynamic-suffix-for-prompt-cache.md`
- `docs/exec-plans/active/20260912-custom-model-reasoning.md`
- 主工作区中的 `docs/exec-plans/active/20260924-main-chat-form.md`（只用于并行边界核对；本 worktree 不修改该计划）
- Anthropic Messages API：`https://platform.claude.com/docs/en/api/messages/create`
- Anthropic Prompt Caching：`https://platform.claude.com/docs/en/build-with-claude/prompt-caching`

## 4. 范围

### 4.1 包含

- Anthropic Messages 自定义连接的 Claude Code 兼容说明和 Base URL 规则；
- 协议感知的自定义连接显式测试；
- Anthropic 连接级 Prompt Cache 模式：`short` 或 `off`；
- 直连 pi-ai 和本地代理 legacy wire 的缓存标记一致性；
- 每条自定义连接内手动新增多个模型；
- 手动模型、显示名称和价格管理覆盖 OpenAI Chat、OpenAI Responses、Anthropic Messages 三种自定义连接；
- 首个模型和后续模型共用相同的模型输入、校验和持久化规则；
- API 模型 ID 与本地显示名称分离；
- 手动模型的 context window、max output、图片输入和 reasoning 配置；
- USD / CNY 手动价格；
- 标准输入、输出、缓存读取、缓存写入四类每百万 Token 单价；
- 连接默认模型的设置、切换和删除保护；
- 自定义模型停用、删除、任务引用保护；
- 请求级价格快照、缓存 Token 费用计算和 Usage 来源展示；
- main、preload、renderer 两套 Desktop IPC 表面的契约一致性；
- 自动化、Electron 人工验收、设计文档、history 和执行记录。

### 4.2 不包含

- 自动调用 `/models`；
- 自动模型发现、目录缓存、TTL、ETag 或 last-good 模型目录；
- 自动匹配官方模型、模糊匹配别名或自动改写 API Model ID；
- 自动获取、同步或覆盖价格；
- 中转站价格倍率、账单 API 或余额 API 集成；
- 批量导入模型；
- 任意 npm Provider 插件；
- 自定义请求 Header UI；
- OAuth、Claude 订阅登录或 Claude Code OAuth；
- PDF / document block、音频、视频输入；
- 1 小时 Prompt Cache；
- 自动重复请求来验证缓存命中；
- 静默重试一个已发送的生成请求来降级缓存；
- 设置中心全局视觉重做。

## 5. 产品与数据决策

### 5.1 连接和模型身份

- 连接保存 `protocol`、`baseUrl`、密钥引用、默认模型和 Prompt Cache 模式。
- 模型保存 API ID、显示名称、能力、推理配置和价格。
- 模型稳定键继续使用现有格式：

```text
<providerId>:connection/<encoded connectionId>/<encoded apiModel>
```

- 同一连接内 `apiModel` 唯一；重复添加返回 `model_already_exists`。
- 不同连接允许相同 `apiModel`，模型和价格互不覆盖。
- `apiModel` 创建后不可编辑。填错时新增正确模型，再删除旧模型。
- 显示名称为空时使用 `apiModel`，不再强制拼接连接名称。
- 旧连接和旧模型不批量改名；用户编辑后才采用新的显示名称。

### 5.2 Base URL

- `anthropic-messages` 使用服务根地址语义。
- `https://cheaprouter.cc` 对应请求地址 `https://cheaprouter.cc/v1/messages`。
- 自定义路径前缀允许存在，例如 `https://host.example/anthropic` 对应 `/anthropic/v1/messages`。
- Anthropic Base URL pathname 精确以 `/v1` 结尾时，renderer 显示字段级错误和“移除 /v1”动作；main 进程再次拒绝保存，不能只依赖前端校验。
- 不静默修正用户输入，不把 OpenAI 的 `/v1` 习惯套到 Anthropic。
- OpenAI Chat / Responses 的现有 Base URL 语义保持不变。

### 5.3 Prompt Cache

新增连接级可选字段：

```text
promptCacheMode: "short" | "off"
```

- 新建 `anthropic-messages` 连接默认 `short`，对应 5 分钟缓存。
- 读取旧 Anthropic 自定义连接时，缺少字段按 `short` 解释。
- 非 Anthropic 协议不显示该设置，也不由本计划改变其缓存行为。
- `short` 时直连与本地代理都标记稳定 system、最后一个即时 tool、最后一个可缓存 user 内容块。
- `off` 时两条路径都不发送 `cache_control`。
- Provider 返回 `cache_read_input_tokens`、`cache_creation_input_tokens` 时继续分别映射到 `cacheReadTokens`、`cacheWriteTokens`。
- UI 不根据协议声称“已经命中缓存”；只显示策略和实际 Usage 观测值。
- 中转站拒绝缓存字段时提示用户关闭 Prompt Cache，不自动重发同一生成请求。

### 5.4 手动价格

复用 `ModelPricing`：

| UI 字段 | 存储字段 |
|---|---|
| 币种 | `currency` |
| 标准输入 | `inputCacheMissPerMillion` |
| 输出 | `outputPerMillion` |
| 缓存读取 | `inputCacheHitPerMillion` |
| 缓存写入 | `inputCacheWritePerMillion` |

规则：

- 价格设置默认关闭；关闭时删除 `ModelDefinition.pricing`。
- 开启时币种和四个单价全部必填。
- 仅允许 `USD`、`CNY`。
- 单位固定为每 100 万 Token。
- 单价允许 `0`，必须是有限数字，范围 `0..1_000_000`，保存时最多保留 8 位小数。
- 本计划不暴露 `reasoningPerMillion`；该字段保持未设置。
- 不预填官方价格，不根据模型名称给建议价格。
- 不知道缓存价格时应关闭价格设置，Usage 只统计 Token 并显示费用未知。
- 每次请求使用现有 `ModelPricingSnapshot` 冻结当时单价；价格修改只影响后续请求。
- Usage 定价来源 `source: "configured"` 显示为“手动配置”。

### 5.5 默认模型

- 创建连接时首个模型必填、自动启用，并成为该连接的默认模型。
- 后续添加模型时可以勾选“设为连接默认模型”。
- 连接默认模型只服务于连接详情和显式测试，不自动改写全局 `taskBindings.defaultChat`。
- 删除当前连接默认模型且仍有其他模型时，返回 `default_model_requires_replacement`，要求用户先选择新的默认模型。
- 删除连接中的最后一个模型时允许连接保留，并把 `connection.defaultModel` 设为 `null`。
- 无模型连接不能执行模型测试，但仍可编辑或删除。

## 6. 共享契约

实施期间使用以下命名，不允许在不同 IPC 表面创建同义类型：

```text
CustomConnectionPromptCacheMode = "short" | "off"
CustomModelPricingInput
CustomModelCreateInput
CustomModelEditableFields
CustomModelSetDefaultInput
CustomConnectionTestInput
```

`CustomModelCreateInput` 包含：

- `connectionId`
- `apiModel`
- `label?: string`
- `enabled: boolean`
- `setAsConnectionDefault: boolean`
- `contextWindow: number | null`
- `maxTokens: number | null`
- `input: ["text"] | ["text", "image"]`
- `reasoningConfig: CustomModelReasoning`
- `pricing: ModelPricing | null`

`CustomModelEditableFields` 包含：

- `label`
- `enabled`
- `contextWindow`
- `maxTokens`
- `input`
- `reasoningConfig`
- `pricing`

它不包含 `apiModel`、`connectionId`、`provider` 或 `api`。

`ModelMutationResult.error.code` 增加：

- `connection_missing`
- `model_already_exists`
- `default_model_requires_replacement`
- `invalid_pricing`

保留现有 `model_in_use`、`credential_missing`、`invalid_model` 等错误。

## 7. 数据流

```text
连接创建 / 编辑页
        |
        v
typed preload IPC
        |
        +----------------------+
        |                      |
        v                      v
SettingsService          ModelStoreService
连接/密钥/默认模型        模型定义/能力/价格
        |                      |
        +----------+-----------+
                   v
          Settings v4 models namespace
                   |
                   v
            ModelRuntimeService
          resolve model + pricing snapshot
                   |
                   v
       DesktopLegacyLlmAdapter / PiAiAdapter
          direct or local proxy wire
                   |
                   v
        Journal usage + cost provenance
                   |
                   v
        Usage 页面 / Composer 候选模型
```

约束：

- renderer 不读取或保存 API Key；
- `ModelStoreService` 负责模型业务校验和 ModelDefinition 构造；
- `SettingsService` 负责连接、密钥和 settings v4 原子持久化；
- ModelStore 通过 SettingsService 的聚焦持久化方法一次提交 definitions、installed 和可选 connection.defaultModel，避免三次写入产生半状态；
- 领域 package 不反向依赖 `apps/desktop`；
- Usage 只消费已经冻结在事件中的价格快照，不读取当前模型价格重算历史。

## 8. UI 方向

### 8.1 视觉和交互原则

- 视觉命题：延续现有设置中心平面路由、分组详情行和语义 token，强调状态、字段解释和明确动作。
- 内容顺序：连接身份 -> Base URL / Key -> Prompt Cache -> 连接默认模型 -> 模型列表 -> 危险操作。
- 交互命题：普通导航无页面动画；按钮保留现有按压反馈；添加和编辑模型使用独立子路由，不用普通模态框承载长表单。
- 现有 `RouteBack`、`DetailSection`、`DetailRow`、Field、Toggle 和按钮样式作为视觉事实源。
- 1280px 下价格字段两列；375px 下单列；交互目标至少 40px。
- 浅色、深色、system-light、system-dark 都要验证。

### 8.2 创建连接

普通区域：

1. API Key；
2. 显示名称；
3. 服务地址；
4. 首个模型的 API 模型 ID；
5. 首个模型显示名称；
6. 推理能力配置；
7. 可选手动价格。

高级连接设置：

- Prompt Cache 开关，仅 Anthropic 显示；
- 连接标识，创建后不可修改；
- context window、max output、图片输入放到模型高级能力中，不占据首屏。

编辑已有连接时：

- 只编辑 Key、连接显示名称、Base URL、代理和 Prompt Cache；
- 不再把默认模型作为任意文本字段编辑；
- 默认模型在连接详情的模型列表中切换。

### 8.3 连接详情

连接分组显示：

- 协议格式；
- 服务地址；
- 实际 Messages 地址预览；
- Prompt Cache 策略；
- 默认模型；
- 最近一次显式测试状态。

模型分组：

- 标题行右侧提供“添加模型”；
- 每行显示显示名称、monospace API ID、默认/启用状态；
- 已配置价格时以紧凑文字显示输入、输出、缓存读、缓存写单价和币种；
- 未配置时显示“未设置价格，只统计 Token”；
- 行操作为“设为默认”“编辑”“删除”；
- 启用/停用继续使用现有 Toggle。

连接测试：

- 按钮文案为“测试模型”，不伪装成免费连接探测；
- 相邻说明明确“会发送极小生成请求，可能产生少量费用”；
- 不在保存连接时自动触发；
- 无默认模型时禁用并解释原因。

### 8.4 添加 / 编辑模型子路由

基本信息：

- API 模型 ID，创建必填，编辑只读；
- 显示名称，可空；
- 添加后启用，默认开启；
- 设为连接默认模型。

模型能力：

- 复用 `CustomModelReasoningFields`；
- context window 和 max output 接受正整数或未知；
- 文本固定支持；
- 图片输入为显式开关；
- toolUse 固定保存为 `declared`，不在本次新增一个未经验证的工具能力选择器；
- 不提供 PDF 选项。

价格：

- “设置模型价格”开关默认关闭；
- 开启后显示币种和四类单价；
- 错误紧邻字段；
- 保存失败保留草稿；
- 编辑关闭价格后明确删除未来请求的价格估算，但不改变历史 Usage。

## 9. M1：Anthropic 连接与 Prompt Cache 加固

M1 可独立合并。完成后现有单模型 Anthropic 自定义连接可以正确配置 Base URL、显式测试、关闭不兼容缓存，并在直连或本地代理下得到相同缓存语义。M1 不依赖 M2。

### 9.1 Shared 与 Settings 契约

主要修改：

- `packages/shared/src/settings.ts`
- `packages/shared/src/provider-config.ts`
- `packages/shared/src/runtime-v2/desktop-ipc.ts`
- `packages/shared/src/runtime-v2/fixed-renderer.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/test/**`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/test/custom-connection-protocol.test.ts`

任务：

1. 增加 `CustomConnectionPromptCacheMode` 和连接可选字段 `promptCacheMode`。
2. 自定义连接创建、更新、v4 parse/sanitize、v4 -> v3 compatibility view 和重启读取都保留该字段。
3. Anthropic 旧连接缺字段按 `short` 解析；其他协议缺字段保持 `off`。
4. 增加协议感知的 Base URL 校验，main 进程拒绝 Anthropic pathname 以 `/v1` 结尾。
5. renderer-facing snapshot 只包含非敏感连接状态；密钥继续只存在 main-only secrets。
6. 更新连接时协议、连接 ID 和已存在模型 API ID保持不可变。

### 9.2 协议感知的自定义连接测试

主要修改：

- `apps/desktop/src/main/runtime-v2/provider-network-service.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/main/runtime-v2/projection-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- `apps/desktop/src/main/test/runtime-v2-provider-network-service.test.ts`
- `apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts`

任务：

1. 新增 `testCustomConnection(connectionId)` typed IPC，由 main 读取凭据和默认模型，renderer 不提交密钥。
2. 测试经现有 direct/proxy fetch transport 发送显式微型请求：
   - Chat Completions：`POST <baseUrl>/chat/completions`；
   - Responses：`POST <baseUrl>/responses`；
   - Anthropic：`POST <baseUrl>/v1/messages`。
3. OpenAI 两种协议使用 Bearer；Anthropic 使用 `x-api-key`、`anthropic-version: 2023-06-01` 和 JSON content type。
4. 请求只含简单 user 文本，输出上限为 1，不携带工具、附件或 cache marker。
5. 测试不会在连接保存后自动运行；只有用户点击才发送。
6. 更新该连接自己的 `lastConnection`，不写入 provider 默认连接状态。
7. 统一分类 auth、insufficient balance、rate limit、server、timeout、proxy、network、invalid request。
8. 测试捕获并断言实际 URL，证明 Anthropic 根地址只生成一个 `/v1/messages`。

### 9.3 直连 / 代理缓存一致性

主要修改：

- `packages/llm/pi-ai/src/pi-ai-stream.ts`
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts`
- 新增 `packages/llm/pi-ai/src/anthropic-cache.ts`
- `packages/llm/pi-ai/src/test/legacy-proxy-wire-engine.test.ts`
- `packages/llm/pi-ai/src/test/pi-ai-reasoning.test.ts`
- `apps/desktop/src/main/model-runtime-service.ts`
- `apps/desktop/src/main/runtime-v2/model-port.ts`
- `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts`
- `apps/desktop/src/main/test/runtime-v2-thinking-options.test.ts`

任务：

1. 将连接 `promptCacheMode` 解析为 pi-ai 的 `cacheRetention: "short" | "none"`。
2. 直连 `streamSimple` 显式传入 `cacheRetention` 和稳定 `sessionId`，不继续依赖依赖包隐式默认值。
3. legacy proxy Anthropic payload 使用纯函数添加缓存标记：system、最后一个即时 tool、最后一个 user 可缓存内容块。
4. `off` 时 pure builder 和 direct options 都无缓存标记。
5. 不改变 OpenAI Chat、Responses、DeepSeek Files 或 OpenRouter 的 transport 选择。
6. 继续映射 Anthropic cache read/write usage，并验证手动价格存在时由现有 cost engine分别计费。
7. 不在失败后执行无缓存自动重发。

### 9.4 M1 UI

主要修改：

- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`

任务：

1. Anthropic 自定义入口副标题写明“Claude Code 兼容 / Messages API”。
2. Base URL placeholder 改为协议感知；Anthropic 示例不带 `/v1`。
3. Anthropic `/v1` 错误提供“移除 /v1”动作，保存按钮在错误消除前禁用。
4. 高级设置增加 Prompt Cache Toggle，默认开启，说明为“自动添加 5 分钟缓存标记”。
5. 详情页修正“自定义 OpenAI 兼容连接”的错误 fallback 文案。
6. 详情页展示实际 Messages 地址、缓存策略和“测试模型”按钮。
7. 测试中、成功、失败状态靠近按钮，不用全局 toast 代替字段或连接状态。

### 9.5 M1 验收

自动化必须证明：

- Anthropic root URL 构造为单一 `/v1/messages`；
- `/v1` 输入前后端都被拒绝；
- 旧 Anthropic 连接默认 short cache；
- cache off 重启后保持；
- 直连传 short/none；
- legacy proxy short payload含 system/tool/user cache marker；
- legacy proxy off payload不含 marker；
- cache read/write usage 映射不回归；
- 自定义连接测试不泄露 API Key 到 renderer 或错误文案；
- 两条相同协议连接的测试状态互相隔离。

## 10. M2：手动模型与价格管理

M2 可独立合并到已经可用的 M1，也可在 M1 合并后稍后实施。完成后一条连接可以维护多个手动模型及独立价格。即使 M2 不实施，M1 的首个手动模型连接仍然可用。

M2 的共享契约和 UI 覆盖三种自定义协议，不为 Anthropic 单独复制一套模型或价格表单。协议差异继续由连接的 `protocol` 和现有 adapter 处理。

### 10.1 Shared 模型输入与价格校验

主要修改：

- `packages/shared/src/model-config.ts`
- 新增 `packages/shared/src/custom-model-input.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/runtime-v2/desktop-ipc.ts`
- `packages/shared/src/runtime-v2/fixed-renderer.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/test/custom-model-input.test.ts`
- `packages/shared/src/test/model-catalog.test.ts`

任务：

1. 定义共享的 create/edit/pricing 输入和纯校验函数。
2. 校验 API Model ID 非空、最多 200 字符，显示名称最多 120 字符。
3. context window 与 max output 为 `null` 或正整数，最大值使用 `10_000_000`，避免无界数字进入模型事实。
4. input 只允许 `text` 或 `text + image`；text 不可关闭。
5. 自定义手动价格开启时校验四个有限非负单价、币种和 8 位精度。
6. reason config 调用既有 `validateCustomModelReasoning()`；Anthropic effort 继续只允许 low、medium、high、xhigh、max。
7. typed IPC 增加 add custom model、edit custom model、set connection default model。

### 10.2 ModelStore 与 Settings 原子持久化

主要修改：

- `apps/desktop/src/main/model-store-service.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/test/model-store-service.test.ts`
- `apps/desktop/src/main/test/runtime-v2-settings-migration.test.ts`
- `apps/desktop/src/main/test/custom-connection-protocol.test.ts`

任务：

1. `ModelStoreService.addCustomModel()` 验证连接存在、协议、重复 ID、capabilities、reasoning 和 pricing。
2. 使用现有 connection-specific ModelKey 规则生成定义，`source = "custom"`，`toolUse = "declared"`。
3. `SettingsService` 增加聚焦的 models namespace 原子写入方法，一次更新 definition、installed 和可选 connection.defaultModel。
4. 创建连接的首个模型和后续添加模型共用同一个纯 ModelDefinition builder；移除 `connectionModelPatch()` 的重复拼装责任。
5. 编辑允许更新显示名称、enabled、context/max、image、reasoning 和 pricing，不允许改变模型身份。
6. `setCustomConnectionDefaultModel()` 只接受该连接已安装的模型。
7. 删除当前默认且存在其他模型时返回 replacement 错误；删除最后一个模型时把默认模型清空。
8. 任务模型引用继续阻止删除，并返回现有引用名。
9. 删除连接仍然遵循当前产品边界，不删除历史 Session 或 Usage；是否级联删除连接模型保持现有行为，不在本计划扩大。
10. 重启后 definition、installed、connectionId、defaultModel 和 pricing 完整恢复。

### 10.3 IPC 与 preload

主要修改：

- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/main/runtime-v2/projection-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- 对应 main/preload 契约测试。

任务：

1. fixed renderer 和 desktop bridge 使用同一 shared 输入类型及错误码。
2. main 侧重新校验所有字段，不信任 renderer 提交的 ModelKey、provider、protocol 或 pricing。
3. 所有成功 mutation 返回最新模型视图；renderer 随后刷新 installed/usable models。
4. 模型添加、编辑、默认切换和删除后触发既有 Settings v4 changed 通知。
5. App 根层重新拉取 usable models，Composer 不需要重启即可看到变化。

### 10.4 Renderer 交互

主要修改：

- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- 新增 `apps/desktop/src/renderer/components/settings/CustomConnectionModels.tsx`
- 新增 `apps/desktop/src/renderer/components/settings/CustomModelForm.tsx`
- 新增 `apps/desktop/src/renderer/components/settings/ModelPricingFields.tsx`
- `apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`
- 新增 `apps/desktop/src/renderer/test/custom-model-form.test.tsx`

任务：

1. 连接详情用 connection-scoped 模型列表替换当前嵌入式 reasoning 文本入口。
2. 添加/编辑采用设置页内部子路由和真实返回路径；普通表单不用 modal。
3. 首个模型创建和后续添加复用 `CustomModelForm`，只在创建连接时同时显示 API Key / Base URL。
4. 编辑页把 API Model ID 作为只读 monospace 值。
5. 价格 Toggle、币种、四个单价和字段级错误由 `ModelPricingFields` 统一实现。
6. 模型行显示默认、启用、API ID、价格摘要及操作。
7. 删除默认模型时，UI 先要求选择替代默认；不在 renderer 静默选择第一项。
8. 保存中禁用重复提交，失败保留草稿，成功返回连接详情并刷新模型候选。
9. 全局 ModelSettings 继续提供启用/停用和连接信息，但连接详情是新增、价格和默认模型管理的权威入口。
10. 375px 验证字段不横向溢出，中文长模型名和长 API ID 不产生按钮挤压。

### 10.5 运行时价格与 Usage

主要修改：

- `apps/desktop/src/main/model-runtime-service.ts`
- `apps/desktop/src/main/test/runtime-v2-thinking-options.test.ts`
- `packages/shared/src/model-pricing.ts`
- `packages/shared/src/test/model-catalog.test.ts`
- `packages/llm/service/src/test/usage-cost.test.ts`
- `apps/desktop/src/renderer/components/usage/UsageHoverCard.tsx`
- `apps/desktop/src/renderer/test/usage-hover-card.test.tsx`

任务：

1. 确认 custom model 的 configured pricing 优先于公共价格目录和 endpoint owner 推断。
2. 连接隔离的相同 API ID分别生成包含不同 `connectionId` 和 rates 的价格快照。
3. 请求开始后 pricing snapshot 固定，重试 attempt 使用同一快照。
4. cache read/write 只有存在对应 Token 时才要求对应价格；本计划 UI仍要求完整四价，防止未来请求突然变为未知。
5. 修改模型价格不改变已写入 Journal 的历史 cost provenance。
6. Usage 模型价格 Hover Card 为 `source: configured` 显示“手动配置”，继续显示四类价格。
7. 未设置价格时保持“暂无单价”和费用未知，不回退到中转域名猜测。

### 10.6 M2 验收

自动化必须证明：

- 创建连接的首个模型和后续模型使用同一 builder；
- 同连接重复 ID 被拒绝，不同连接相同 ID 被允许；
- 显示名称不影响实际 request model；
- API Model ID 和 connectionId 无法通过 edit IPC 修改；
- 手动四价保存、清除、重启恢复；
- 负数、Infinity、NaN、超范围和不完整价格被 main 拒绝；
- 两连接同 ID价格隔离；
- 默认模型切换和删除保护；
- 最后一个模型删除后连接仍存在；
- task binding 引用阻止删除；
- model mutation 后 Composer 候选即时刷新；
- 历史 pricing snapshot 不受后续编辑影响；
- 浅色、深色和窄屏表单状态均有 renderer 证据。

## 11. 验证命令

### 11.1 M1 聚焦验证

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/llm-service test
pnpm --filter @actspace/llm-pi-ai test
pnpm --filter @actspace/desktop exec vitest run \
  src/main/test/custom-connection-protocol.test.ts \
  src/main/test/runtime-v2-provider-network-service.test.ts \
  src/main/test/runtime-v2-thinking-options.test.ts \
  src/renderer/test/provider-model-settings.test.tsx
```

### 11.2 M2 聚焦验证

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/llm-service test
pnpm --filter @actspace/desktop exec vitest run \
  src/main/test/model-store-service.test.ts \
  src/main/test/runtime-v2-settings-migration.test.ts \
  src/main/test/custom-connection-protocol.test.ts \
  src/renderer/test/provider-model-settings.test.tsx \
  src/renderer/test/custom-model-form.test.tsx \
  src/renderer/test/usage-hover-card.test.tsx
```

### 11.3 最终工程门禁

```bash
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop build
pnpm typecheck
pnpm build
pnpm check:frontend-theme
pnpm check:docs
git diff --check
```

如果仓库完整 `pnpm test` 在实施基线可运行，最终执行并记录；如果被当前并行 active plan 的既有失败阻塞，必须在执行摘要列出失败命令、首个错误和与本计划的关系，不能用聚焦测试掩盖。

## 12. 人工验收

### 12.1 无真实凭据的离线验收

- 在浏览器 renderer fixture 检查创建、详情、添加模型、编辑价格、错误和空态；
- 1280px 和 375px；
- light、dark、system-light、system-dark；
- keyboard focus、Escape 返回、保存中、错误保留草稿；
- 捕获请求 fixture，确认 Anthropic URL、headers、reasoning 和 cache marker；
- 确认 preload bridge 不暴露 API Key。

### 12.2 Electron 真实验收

使用 `pnpm dev:log`，从 `logs/latest-dev.log` 的 `[dev-runtime]` 读取当前 appName/appId：

1. 创建自定义 Anthropic 连接；
2. Base URL 输入 `https://cheaprouter.cc/v1` 时出现可修正错误；
3. 改为 `https://cheaprouter.cc` 后保存；
4. 首个模型使用中转站提供的真实 API Model ID；
5. 添加第二模型并分别设置价格；
6. 切换默认模型，Composer 候选即时刷新；
7. 重启应用确认连接、模型、价格和默认状态恢复；
8. 修改价格后确认旧 Usage 行的价格快照不变；
9. 删除、停用和引用保护符合设计；
10. 检查真实 Settings 页面浅深主题和窄窗口布局。

### 12.3 真实中转站门禁

该门禁需要用户自己的中转 API Key，只在用户明确允许后执行：

1. 点击“测试模型”，确认 UI 已提示可能产生少量费用；
2. 验证简单文本流；
3. 验证工具调用至少一次；
4. 验证 adaptive thinking 和配置的 effort；
5. 在不开本地代理时验证直连；
6. 用户有本地 HTTP 代理时再验证代理路径；
7. 使用稳定、达到中转站最低缓存长度的重复前缀观察 Usage；
8. 如果中转站返回 cache usage，确认 cache read/write token 和费用；
9. 如果不返回 cache usage，记录为“中转站未提供可观测证据”，不伪造命中；
10. 如果 cache marker 被拒绝，关闭 Prompt Cache 后重新发起一条由用户明确点击的新请求。

自动化通过不能替代真实 Provider、真实 Electron 和真实缓存命中的人工门禁。

## 13. 风险与缓解

### 13.1 active plan 文件冲突

- 风险：主 Chat 计划正在修改 shared IPC 和 fixed renderer IPC。
- 缓解：实施前 diff 审计；重叠计划不在同一工作树并行；使用小提交或独立 worktree；不覆盖未提交内容。

### 13.2 中转站并非完整 Anthropic 兼容

- 风险：只支持基本 Messages，不支持 cache_control、tool use 或 adaptive effort。
- 缓解：基础文本调用、Prompt Cache、工具、reasoning 分开验收；缓存可关闭；能力由用户手动配置，不把 HTTP 200 当成全部能力已验证。

### 13.3 手动价格填写错误

- 风险：Usage 估算与中转账单不一致。
- 缓解：明确标记“手动配置”；不预填、不自动猜测；历史保存价格快照；允许关闭价格估算。

### 13.4 数据半状态

- 风险：添加模型成功但默认模型或 installed 状态未写入。
- 缓解：一次 settings v4 models namespace 原子写入；写失败恢复 previous settings；测试注入写入失败。

### 13.5 模型数量增长

- 风险：一条连接手动添加大量模型后详情页变长。
- 缓解：首版使用可滚动平面列表和客户端搜索仅在模型数达到 20 时显示；不引入虚拟列表或远端分页。

### 13.6 回滚

- 新连接字段可选，旧代码可以忽略 `promptCacheMode`。
- 新模型仍使用现有 `ModelDefinition`、`InstalledModelSettings` 和 `pricing`，回退 UI 不会使数据不可读。
- 不执行批量迁移，不重写 Session Journal，不改历史 Usage。
- 如 M2 回退，已添加模型仍可由现有 ModelStore 读取、停用或删除；连接和密钥不受影响。
- 如 M1 缓存实现回退，关闭 Prompt Cache 或恢复直连路径即可停止发送 cache marker。

## 14. 文档与收尾

实施时同步：

- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md`
- `docs/histories/2026-09/` 对应 history
- `docs/exec-runs/20260924-anthropic-custom-model-pricing/execution-process.md`
- `docs/exec-runs/20260924-anthropic-custom-model-pricing/execution-summary.md`

本任务命中新概念、可迁移、陷阱和模式：协议 Base URL 语义、连接隔离模型身份、Prompt Cache transport parity、请求级价格快照。完成代码前读取 `docs/learnings/WRITING_GUIDE.md`，若复核后仍满足至少两项，新增一份聚焦这些模式的学习文档。

完成后：

1. 将本计划状态更新为已完成；
2. 移动到 `docs/exec-plans/completed/`；
3. 更新 `docs/exec-plans/README.md`；
4. 在执行摘要明确自动化、Electron、真实 Provider 和缓存命中的各自验收边界；
5. 不自动 commit、push 或发布。

## 15. 进度记录

- [x] 2026-09-24：确认已有 Anthropic Messages、自定义连接隔离、reasoning、价格快照和 cache usage 基线。
- [x] 2026-09-24：用户决定取消自动模型拉取和自动价格匹配，采用手动模型与手动价格。
- [x] 2026-09-24：创建执行计划，等待用户审阅。
- [x] 2026-09-24：用户批准 M1、M2 范围和交互。
- [x] 2026-09-24：创建 exec-run 记录并完成实施前重叠 diff 审计。
- [x] 2026-09-25：完成 M1、M2、聚焦验证、工程门禁、文档、history 和学习沉淀。
- [x] 2026-09-25：完成浏览器 fixture 的浅色、深色与 375px 验收。
- [ ] 完成真实 Electron 点击验收；本轮应用已启动，但系统锁屏阻止 Computer Use。
- [ ] 真实中转站门禁由用户提供凭据并明确允许产生少量费用后执行。

## 16. 决策记录

- 2026-09-24：不新增协议；复用现有 `anthropic-messages` 和 pi-ai adapter。
- 2026-09-24：OpenCode 配置只作为能力参考，ActSpace 采用 Claude Code / Anthropic Messages 的服务根地址语义。
- 2026-09-24：取消自动模型发现、自动价格匹配和对应目录缓存，降低中转站差异带来的复杂度。
- 2026-09-24：模型和价格以 connection-specific ModelKey 隔离，同一 API ID 可在不同连接配置不同价格。
- 2026-09-24：价格直接保存到 `ModelDefinition.pricing`，每次请求使用现有 pricing snapshot，不创建新价格存储。
- 2026-09-24：Prompt Cache 首版只提供 5 分钟或关闭，不提供 1 小时策略。
- 2026-09-24：连接测试是用户显式触发的极小生成请求，不在保存时自动执行，也不声称免费。
- 2026-09-24：添加和编辑模型使用设置页子路由，不用普通 modal 承载长表单。

## 17. 完成状态

- Anthropic Messages 根地址、显式最小测试和 Prompt Cache 开关已实现。
- 自定义连接的首个模型、后续模型、默认模型和四类手动价格已实现。
- direct pi-ai 与 request-scoped proxy 的短缓存策略已对齐。
- renderer fixture、聚焦测试、typecheck、build、主题和文档门禁已通过。
- 完整 `pnpm test` 仅出现 1 个与本计划无关且单独运行通过的 Settings 测试隔离失败，详见执行摘要。
- 未推送、未调用真实中转站；提交与合并由后续仓库交付步骤完成。
