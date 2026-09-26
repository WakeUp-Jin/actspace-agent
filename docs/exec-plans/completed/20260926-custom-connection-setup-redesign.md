# 自定义服务与 Anthropic 连接流程重做

状态：已完成实现（2026-09-26）。阶段 A–C 和 T17 已完成，自动化验证通过；T18（Electron 真机验收、真实中转站测试）由用户进行，清单见执行摘要。

执行模式：交互模式。这次改动涉及设置持久化字段、两套 Desktop IPC、LLM 请求认证头和计费计算，风险较高，每个阶段结束都要人工确认。

## 1. 目标

把「设置 › 模型 › 添加连接」里接入中转站和 Anthropic 的流程，改成 demo 里确认的样子：

- 添加连接列表底部只有一条「自定义服务」。原来三条按协议区分的入口不再显示。
- 自定义服务走两步向导：
  1. 选协议，粘贴地址，填 Key，点「测试并继续」。
  2. 从服务返回的列表里点选模型。默认勾选常用模型，并自动定好默认模型。底部一行「按官方价计费 × 倍率」，然后保存。
- 官方 Anthropic 只需要填 Key：同一页里测试、出模型列表、保存。价格按官方目录。
- 地址不需要记规则。粘贴 `…/v1`、`…/v1/messages`、`…/chat/completions` 都能自动规范化，并实时显示实际请求地址。
- Anthropic 协议支持 `x-api-key` 和 `Authorization: Bearer` 两种认证。默认「自动」：测试时如果 `x-api-key` 返回 401/403，就改用 Bearer，并记住能用的那种。
- 模型能力（上下文、输出上限、图片、推理）和官方价格从内置目录自动匹配，不需要手填。
- 连接详情页：每项单独编辑；状态如实显示（未测试 / 可用 / 连接异常）；删除连接和删除模型都要二次确认。
- 界面文字尽量少，按 demo 里已经删减过的文案实现。

设计参考（本计划的视觉和交互依据）：`docs/design-docs/frontend/anthropic-custom-connection-demo.html`，切到「新方案」查看。

## 2. 用户已确认的决定（2026-09-26）

| 决定 | 结论 |
|---|---|
| 入口 | 合并成一条「自定义服务」，进去后用分段控件切换协议 |
| 创建页形态 | 自定义服务走两步向导；官方 Anthropic 只有一页 |
| 默认计费 | 按官方价折算（倍率）。「只统计 Token」和「逐个填写单价」只能在详情页切换 |
| 官方 Anthropic | 升格为「只填 Key」 |
| 文案密度 | 描述越少越好；添加模型的过程如果还能再简化，留到以后再议 |

## 3. 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`：改任何颜色前必读
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`：第 269 行附近是自定义协议的旧约定，本计划会更新它
- `docs/design-docs/frontend/front-设置中心重构规范.md`
- `docs/SECURITY.md`：Key 的传输、日志和持久化约束
- `docs/exec-plans/completed/20260924-anthropic-custom-model-pricing.md`：现有 Anthropic 自定义连接、手动价格和 Prompt Cache 的来龙去脉
- `docs/exec-plans/active/20260912-custom-model-reasoning.md`：和本计划有文件重叠，见第 6 节
- 设计 demo：`docs/design-docs/frontend/anthropic-custom-connection-demo.html`
- 开始写代码前还要读：`docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`

## 4. 现状基线（2026-09-26 核对过的代码事实）

- 目录：`packages/shared/src/provider-config.ts:134-147` 里有三条 `category: "custom"` 条目：`openai-compatible`、`openai-responses-compatible`、`anthropic-compatible`。官方 `anthropic` 也是一条 compatible 条目，默认地址 `https://api.anthropic.com`，没有默认模型。
- 渲染层：`apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`，共 937 行。
  - 创建和编辑共用 `CustomConnectionSetup`（第 427 行起）。
  - 详情页是 `CustomConnectionDetail`（第 347 行起）。
  - 列表行状态只要不是 `unavailable` 就显示「已连接」（第 302 行）。
  - 删除连接没有确认（第 162 行）。
- 模型表单：`CustomModelForm.tsx`、`CustomConnectionModels.tsx`、`ModelPricingFields.tsx`、`CustomModelReasoningFields.tsx`。删除模型没有确认（`CustomConnectionModels.tsx:50`）。
- 可以复用的设置组件（`SettingsPrimitives.tsx`）：`SettingGroup`、`SettingRow`、`SettingLinkRow`、`SettingEditor`、`useSingleEditor`、`Stepper`、`SettingsSelect`、`SettingsMenuButton`、`Toggle`、`StatusDot`（tone 支持 `ok | off | warn | error | neutral`）、`SettingTag`。按钮用 `apps/desktop/src/renderer/components/ui/Button.tsx`。
- 持久化：`apps/desktop/src/main/settings-service.ts`。
  - 创建连接：`createCustomConnectionQueued`，第 784 行，只接收一个 `initialModel`。
  - 读取和清洗连接字段：第 1810-1830 行。
  - 规范化地址：`normalizeCustomConnectionBaseUrl`，第 2252 行，遇到 `/v1` 直接抛错。
  - 组装运行时配置：`getProviderRuntimeConfigForCredential`，第 721-778 行。
  - 记录测试结果：`markCustomConnectionResult`，第 1081 行。
- 连接测试：`apps/desktop/src/main/runtime-v2/provider-network-service.ts`。
  - `testCustomConnection` 在第 76 行，发 1 Token 的真实请求。
  - Anthropic 请求头固定是 `x-api-key`（第 170-175 行）。
- 两套 IPC 都要同步改：
  - fixed-renderer：`packages/shared/src/runtime-v2/fixed-renderer.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts:356-365`、`apps/desktop/src/preload/index.ts:262-266` 和 `:499-507`、`apps/desktop/src/global.d.ts:244-247`。
  - projection：`packages/shared/src/runtime-v2/desktop-ipc.ts:44/102-106/209-212`、`apps/desktop/src/main/runtime-v2/projection-ipc.ts:181-189`。
- 运行时认证：
  - `apps/desktop/src/main/runtime-v2/credential-resolver.ts` 返回 `apiKey`。
  - `legacy-llm-adapter.ts:94-100` 把 `apiKey` 合并进 credential。
  - `packages/llm/pi-ai/src/pi-ai-stream.ts:53/73` 已经会把 `credential.headers` 传给 pi-ai。pi-ai 的 `assertRequestAuth` 在没有 apiKey、但请求头里有 `authorization` 时会放行。
  - `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts:60` 在没有 apiKey 时会塞 `"placeholder"`。如果走 Bearer，会同时发出 `x-api-key: placeholder`，这是个坑，见 T10。
- 计费：
  - `packages/shared/src/model-pricing.ts` 里的 `resolveModelPricing` 只按地址归属（`catalogProviderForEndpoint`）去查目录。中转站地址的归属是 null，所以永远查不到官方价。
  - 连接已经有 `defaultPricingMultiplier` 字段，会作为 `pricingMultiplier` 传进计费。
  - 坑：`apps/desktop/src/main/model-runtime-service.ts:185` 的 `applyPricingMultiplier` 会把自定义模型手填的单价也乘上连接倍率。
- 能力匹配：推理能力已经由 `resolveCustomModelReasoning` 自动匹配目录。上下文、输出上限、图片输入目前都要手填。`BUILTIN_MODEL_CATALOG` 里有 `claude-*` 的 `contextWindow / maxOutput / input / rates`。

## 5. 范围

### 5.1 包含

- 共享契约：连接认证方式、计费模式、草稿探测、批量创建模型。
- 共享的地址规范化函数，渲染层预览和主进程校验都用它，只维护一份逻辑。
- 主进程：新增探测能力（草稿参数，或已保存的连接），带认证方式回退和模型列表分页；测试连接支持新的认证方式；持久化新字段，旧数据取兼容默认值。
- 运行时：Bearer 认证请求头在 pi-ai 直连和 legacy 代理两条线路上保持一致。
- 计费：按官方价折算（按协议对应厂商查目录，再乘倍率）；只统计 Token 模式；单个模型手填价格不再被倍率误乘。
- 渲染层：
  - 目录入口改版；
  - 自定义服务两步向导；
  - 官方 Anthropic 只填 Key；
  - 连接详情页重做；
  - 模型列表和模型编辑页简化；
  - 删除操作加确认；
  - 列表状态如实显示。
- 浏览器 fixture、自动化测试、设计文档、history、执行记录。

### 5.2 不包含

- 不修改新自定义连接的 `providerId` 回退值（目前是 `"openrouter"`）。它参与 ModelKey（`${providerId}:connection/…`）和凭据查找，改动需要迁移，单独立项。
- 不删除已保存的旧连接，不改写它们的 `catalogId`。三条旧目录条目保留定义，只从添加列表里隐藏。
- 不对 OpenAI 协议的中转站做认证回退，它们仍然只用 Bearer。
- 不重做 `CustomModelReasoningFields` 的内部样式。它归 `20260912-custom-model-reasoning` 计划管。本计划只把它放进模型编辑页「手动修改」展开区域里。
- 不做 demo 里提到但暂缓的简化（第二步折叠成一行摘要）。
- 不改内置服务商（DeepSeek、Moonshot、OpenRouter）的连接流程。
- 不自动 commit、push、发版，不修改真实密钥，不自动消耗服务商额度。

## 6. 与其他计划的边界

- `active/20260912-custom-model-reasoning.md` 也会改 `packages/shared/src/custom-model-input.ts`、`CustomModelForm.tsx`、`CustomModelReasoningFields.tsx`、`legacy-llm-adapter.ts`。
  - 开始前先看工作树 diff：`git status --short` 和 `git diff --stat`。
  - 如果那边有未提交的改动，先和用户确认顺序。不要覆盖、reset 或宽泛暂存。
  - 本计划不修改推理字段的语义，只调整它在页面上的位置。
- 设置中心视觉规范已经在 `completed/20260925-settings-visual-redesign.md` 定稿（内嵌分组、翡翠绿开关）。本计划沿用，不另起样式。
- 所有颜色只能用主题 token。`pnpm check:frontend-theme` 和 `pnpm check:frontend-tokens` 必须通过。

## 7. 共享契约（以 `packages/shared/src/settings.ts` 为准，其他地方不得自行定义）

```ts
export type CustomConnectionAuthMode = "auto" | "x-api-key" | "bearer";
export type CustomConnectionResolvedAuth = "x-api-key" | "bearer";
export type CustomConnectionBillingMode = "reference" | "token" | "manual";

// SettingsV4ConnectionSettings 新增（都是可选字段，兼容旧数据）
authMode?: CustomConnectionAuthMode;          // 旧数据缺省按 "x-api-key"
resolvedAuth?: CustomConnectionResolvedAuth;  // 只有 authMode === "auto" 时才有值
billingMode?: CustomConnectionBillingMode;    // 旧数据缺省按 "manual"（完全保持现在的行为）
// 倍率沿用现有的 defaultPricingMultiplier，不新增字段

// CustomConnectionInput 新增
authMode?: CustomConnectionAuthMode;
resolvedAuth?: CustomConnectionResolvedAuth;
billingMode?: CustomConnectionBillingMode;
pricingMultiplier?: number;
initialModels?: readonly CustomModelDraftInput[]; // 和 initialModel 二选一；两者都有时报错
defaultApiModel?: string;                          // 必须是 initialModels 里的一个

export type CustomConnectionProbeInput =
  | { readonly kind: "draft"; readonly protocol: ModelApi; readonly baseUrl: string; readonly apiKey: string; readonly authMode: CustomConnectionAuthMode; readonly proxy?: ProviderProxySettings }
  | { readonly kind: "saved"; readonly connectionId: string };

export type CustomConnectionProbeResult = {
  readonly ok: boolean;
  readonly message: string;
  readonly checkedAt: string;
  readonly errorKind?: ProviderConnectionErrorKind;
  readonly statusCode?: number;
  readonly resolvedAuth?: CustomConnectionResolvedAuth;
  /** 服务不提供模型列表时为 null（404/405/501） */
  readonly models: readonly { readonly id: string; readonly label?: string }[] | null;
};

// CustomConnectionTestResult 新增
readonly resolvedAuth?: CustomConnectionResolvedAuth;
```

各字段在旧数据上的行为（写进测试）：

| 字段 | 旧数据缺省 | 新向导写入 | 官方 Anthropic 写入 |
|---|---|---|---|
| `authMode` | 按 `x-api-key` | `auto`（用户可以在「更多设置」里改） | `x-api-key` |
| `billingMode` | 按 `manual` | `reference` | `reference` |
| `defaultPricingMultiplier` | 原值 | 用户设的倍率（默认 0.3） | 1 |

地址规范化统一用新文件 `packages/shared/src/custom-connection-address.ts`：

```ts
export function normalizeCustomConnectionAddress(raw: string, protocol: ModelApi):
  | { ok: true; baseUrl: string; requestUrl: string; strippedSuffixes: string[]; inferredProtocol: ModelApi | null }
  | { ok: false; reason: "empty" | "scheme" | "invalid" | "credentials" };
```

规则：

- 按顺序剥掉末尾的 `/chat/completions`（推断为 `openai-completions`）、`/responses`（推断为 `openai-responses`）、`/v1/messages`（推断为 `anthropic-messages`）。
- 如果最终协议是 `anthropic-messages`，再剥掉末尾的 `/v1`。
- 只接受 http 或 https，地址里不能带用户名密码。
- `requestUrl` 的拼法和 `provider-network-service.ts` 里的 `customConnectionUrl` 一致。

## 8. 任务

阶段 A 可以独立合并，当作兜底切片：B/C 就算延期，A 也能单独上线。B 和 C 必须按顺序做。C 里的各个任务在 T11 完成后可以并行，但都会碰到 `ProviderSettings.tsx`，所以同一时间只能有一个会话改这个文件。

### 阶段 A：纯前端修复（不改契约）

**T1 列表状态如实显示**
- 文件：`ProviderSettings.tsx`（自定义连接列表行，约第 296-305 行）。
- 改动：`lastConnection.status` 为 `available` 时显示「可用」（`ok`），`unavailable` 显示「连接异常」（`error`），其他情况显示「未测试」（`off`）。
- 验证：在 `apps/desktop/src/renderer/test/provider-model-settings.test.tsx` 新增用例：状态为 untested 的连接不出现「已连接」文案。

**T2 删除确认**
- 新文件 `apps/desktop/src/renderer/components/settings/ConfirmDialog.tsx`。从 `RemoveProviderDialog` 抽出通用弹窗：焦点陷阱复用 `useDialogFocusTrap`，Esc 关闭，默认焦点在「取消」。
- `RemoveProviderDialog` 改成基于它实现。
- 自定义连接删除和 `CustomConnectionModels` 的删除模型都先弹确认。
- 文案：
  - 连接：「删除 {名称}？」「API Key 和这个连接下的模型会一起删除，历史会话和使用统计会保留。」
  - 模型：「删除 {模型名}？」「历史会话和使用统计会保留。」
- 验证：测试点击「删除」后先出现 `alertdialog`；点「取消」不会调用 `removeCustomConnection` 或 `removeModel`。

**T3 零散文案**
- `RouteBack` 在编辑模式下显示「返回连接详情」。
- 两处按钮「保存供应商」统一改为「保存连接」。
- 验证：现有测试同步更新断言，`pnpm --filter @actspace/desktop test` 通过。

### 阶段 B：契约与主进程

**T4 地址规范化**
- 新增 `packages/shared/src/custom-connection-address.ts`，从 `packages/shared/src/index.ts` 导出。
- `settings-service.ts` 的 `normalizeCustomConnectionBaseUrl` 改成调用它：不再对 `/v1` 抛错，而是保存规范化后的 `baseUrl`；`reason` 映射为现有的 `ProviderSettingsError` 文案。
- 测试新文件 `packages/shared/src/test/custom-connection-address.test.ts`，至少覆盖：
  - `https://a.com/v1` 在 anthropic 协议下变成 `https://a.com`；
  - `https://a.com/v1/messages` 在 openai-completions 协议下，推断为 anthropic，`baseUrl` 为 `https://a.com`；
  - `https://a.com/v1/chat/completions` 推断为 openai-completions，`baseUrl` 为 `https://a.com/v1`；
  - `https://a.com/api/v1` 在 openai 协议下保持不变；
  - `ftp://`、`https://u:p@a.com`、空串分别返回对应的 `reason`；
  - 末尾多个 `/` 能正常处理。
- 再在 `apps/desktop/src/main/test/custom-connection-protocol.test.ts` 补一条：保存带 `/v1` 的 Anthropic 地址时不再报错，落盘的是根地址。

**T5 共享类型与目录**
- `packages/shared/src/settings.ts`：按第 7 节新增类型和字段。
- `packages/shared/src/provider-config.ts`：
  - `ProviderCatalogDefinition` 增加 `hidden?: boolean`；三条旧 custom 条目标记为 `hidden: true`。
  - 新增 `{ id: "custom", label: "自定义服务", description: "中转站、自部署网关 · Anthropic / OpenAI 协议", logoKey: "generic", category: "custom", auth: { kind: "api-key" } }`（不带 `protocol`）。
  - `PROVIDER_CATALOG_ORDER` 把三条旧条目换成 `"custom"`。
  - `ProviderCatalogDefinition.protocol` 现在是必填（`provider-config.ts:42`），改成可选，并检查所有读取处（`rg "\.protocol" packages/shared/src apps/desktop/src/renderer`）。
- `packages/shared/src/custom-model-input.ts` 新增 `customModelDraftFromCatalog(apiModel): CustomModelDraftInput`：
  - 查 `BUILTIN_MODEL_CATALOG`，填入 `contextWindow`、`maxTokens`（取 `maxOutput`）；
  - `input` 里有 `image` 时设为 `["text","image"]`，否则 `["text"]`；
  - `reasoningConfig` 固定为 `{ mode: "auto" }`，`pricing` 为 `null`，`enabled` 为 `true`；
  - 查不到时上述数值字段为 `null`，`input` 为 `["text"]`。
- 验证：`packages/shared/src/test/custom-model-input.test.ts` 补上 `claude-sonnet-5` 和未知 ID 两条用例；`pnpm --filter @actspace/shared typecheck` 通过。

**T6 计费**
- `packages/shared/src/model-pricing.ts` 的 `resolveModelPricing` 输入新增 `billingMode?: CustomConnectionBillingMode` 和 `referenceProviderId?: string`：
  - `token` 模式直接返回 `null`。
  - `reference` 模式：地址归属的目录里查不到时，用 `referenceProviderId` 再查一次；`anthropic-messages` 协议对应 `"anthropic"`，openai 协议对应 `"openai"`。查到的目录价乘倍率。
  - 如果模型有手填价格（`configured`），手填价格优先，而且不乘倍率。
- `apps/desktop/src/main/model-runtime-service.ts`：
  - `billingMode === "reference"` 时，`applyPricingMultiplier` 对自定义模型传 1；`manual` 或缺省时保持现在的行为。
  - `resolvePricing` 透传 `billingMode` 和 `referenceProviderId`。
  - `ProviderRuntimeConfig` 和 `model-port.ts` 里的 `providerRuntime` 增加 `billingMode?`。
- `legacy-llm-adapter.ts:62` 的兜底计费分支同步传参。
- 验证：在 `packages/shared/src/test/model-catalog.test.ts`（或新建 `model-pricing.test.ts`）覆盖以下场景：
  - 中转站地址 + reference + 倍率 0.3 + `claude-sonnet-5`：输入价为 0.6；
  - token 模式返回 `null`；
  - reference 模式下模型有手填价格：用手填价，不乘倍率；
  - 旧连接（billingMode 缺省）+ 中转站：结果和现在一致。

**T7 设置持久化**
- 文件：`apps/desktop/src/main/settings-service.ts`。
- 读取清洗（约第 1810 行）：
  - `authMode` 只接受三个合法值，否则丢弃；
  - `resolvedAuth` 只在 `authMode === "auto"` 时保留；
  - `billingMode` 只接受三个合法值。
- `createCustomConnectionQueued`：
  - 支持 `initialModels` 和 `defaultApiModel`：`connectionModelPatch` 改为循环生成多个 definition 和 installed；默认模型写入 `defaultModel`；
  - 写入 `authMode`、`resolvedAuth`、`billingMode`、`defaultPricingMultiplier`（经过 `normalizePricingMultiplier`）；
  - `displayName` 为空时取地址的域名；如果和已有连接重名，加后缀「 2」「 3」。
- `updateCustomConnectionQueued`：支持更新上述字段。`authMode` 或 `baseUrl` 变化时清空 `resolvedAuth`，并把 `lastConnection` 置为 untested（现在已经这样做）。
- `getProviderRuntimeConfigForCredential`：对 anthropic 协议的自定义连接，算出 `authScheme: "x-api-key" | "bearer"`：
  - `authMode` 为 `bearer` 时用 `bearer`；
  - `authMode` 为 `auto` 时用 `resolvedAuth`，没有就用 `x-api-key`；
  - 其他情况用 `x-api-key`。
- `markCustomConnectionResult`：结果里带 `resolvedAuth`，并且连接是 `auto` 时，写回 `resolvedAuth`。
- 验证：`custom-connection-protocol.test.ts` 和 `runtime-v2-settings-migration.test.ts` 新增用例：
  - 批量创建 3 个模型，默认模型正确，ModelKey 各不相同；
  - 旧 JSON 没有新字段时，读出的 `authScheme` 为 `x-api-key`，计费和现在一致；
  - 非法 `authMode` 被丢弃；
  - 名称为空时取域名，重名时加后缀。

**T8 探测与测试**
- 文件：`apps/desktop/src/main/runtime-v2/provider-network-service.ts`。
- 新增 `probeCustomConnection(runtime)`：
  - Anthropic 请求 `GET {base}/v1/models?limit=1000`，带 `anthropic-version: 2023-06-01`；按 `has_more` / `last_id` 翻页，最多 5 页。
  - OpenAI 协议请求 `GET {base}/models`，用 Bearer。
  - `auto` 模式：先用 `x-api-key`；返回 401 或 403 时改用 Bearer 再试一次；成功的那种作为 `resolvedAuth`。
  - 返回 404、405 或 501 时视为「服务没有提供模型列表」：`ok: true`，`models: null`，不写 `resolvedAuth`。
  - `id` 去重；`label` 取 `display_name`。
- `testCustomConnection` 使用 `authScheme`。如果是 `auto` 且还没有 `resolvedAuth`，同样做 401/403 回退，并在结果里带上 `resolvedAuth`。
- 安全要求：
  - Key 不能出现在任何 message、日志或错误对象里。
  - 草稿探测不落盘任何东西。
  - 代理配置沿用 `#proxyFetch`。
- 验证：`apps/desktop/src/main/test/runtime-v2-provider-network-service.test.ts` 用假 fetch 覆盖：
  - x-api-key 返回 401、Bearer 返回 200 时，`resolvedAuth` 为 `bearer`，第二次请求的头里没有 `x-api-key`；
  - 两种都返回 401 时，结果为 `ok: false`，`errorKind` 为 `auth`；
  - 404 时 `models` 为 null；
  - 翻页能合并两页；
  - 所有返回的 message 都不包含 Key 字符串。

**T9 IPC（两套都改）**
- 新通道 `probeCustomConnection`，需要改这些文件：
  - `packages/shared/src/runtime-v2/fixed-renderer.ts`、`packages/shared/src/runtime-v2/desktop-ipc.ts`：通道名、`RuntimeV2…` 类型别名、接口方法；
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`apps/desktop/src/main/runtime-v2/projection-ipc.ts`：handler；
  - `apps/desktop/src/preload/index.ts`：通道表和 API；
  - `apps/desktop/src/global.d.ts`。
- handler 逻辑：
  - `kind: "draft"` 时用 `normalizeCustomConnectionAddress` 规范化地址和代理，直接探测；
  - `kind: "saved"` 时用 `getCustomConnectionRuntimeConfig` 取已保存的 Key 再探测。已保存连接如果还没有 `defaultModel`，也要允许探测，用于「刷新」模型列表，所以这里要放宽现在的检查；
  - 已保存连接探测成功，并且是 auto 模式时，调用 `markCustomConnectionResult`。
- 验证：`pnpm typecheck:contracts && pnpm typecheck`；`pnpm test:contract-matrix` 通过（它目前没有登记这组通道，不需要改清单）。

**T10 运行时 Bearer 认证**
- `model-port.ts` 的 `providerRuntime` 增加 `authScheme?`；`model-runtime-service.ts` 透传。
- `credential-resolver.ts`：`authScheme === "bearer"` 时返回 `{ headers: { Authorization: "Bearer …" } }`，不返回 `apiKey`。
- `legacy-llm-adapter.ts:94-100`：bearer 时不要再从 `runtime.apiKey` 补回 `apiKey`，改为合并 `headers`。
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts:60`：`anthropic-messages` 线路上，如果没有 apiKey、而 headers 里有 `authorization`，构造 SDK 时传 `apiKey: null, authToken: null`，不再用 `"placeholder"`。
- 验证：
  - `legacy-proxy-wire-engine.test.ts` 新增用例：bearer 请求没有 `x-api-key` 头，有 `authorization`；
  - 新建 `packages/llm/pi-ai/src/test/pi-ai-auth.test.ts`：直连线路用假 fetch 捕获请求头，结论同上；x-api-key 线路的行为不变；
  - `pnpm --filter @actspace/llm-pi-ai test` 通过。

### 阶段 C：渲染层（依赖 B）

**T11 目录入口**
- 文件：`ProviderSettings.tsx` 的 `ProviderCatalogRoute`。
  - 过滤掉 `hidden` 条目；
  - 去掉分类下拉，改为按 `官方直连 / Coding Plan / 第三方兼容` 分组显示（`SettingSubhead`）；
  - 底部单独一个分组「没有找到？」，里面只有「自定义服务」一行。
- 选中 `custom` 时进入向导；选中 `anthropic` 时进入只填 Key 的页面；其他 compatible 预设暂时仍走旧的 `CustomConnectionSetup`。
- 验证：测试列表里不出现三条旧文案，只出现「自定义服务」；搜索时分组能正确隐藏。

**T12 自定义服务两步向导**
- 新文件：
  - `apps/desktop/src/renderer/components/settings/CustomConnectionWizard.tsx`
  - `apps/desktop/src/renderer/components/settings/ConnectionModelPicker.tsx`（官方 Anthropic 也会复用）
- 第 1 步「连接」：
  - 协议用分段控件；地址输入时实时调用 `normalizeCustomConnectionAddress` 显示实际请求地址和「已去掉 /v1」；推断出不同协议时自动切换，并提示「已根据地址切换」；
  - API Key 输入框可以显示/隐藏；
  - 「更多设置」默认折叠，里面是认证方式（仅 Anthropic 协议，选项为 自动 / x-api-key / Bearer）和代理；
  - 底部按钮：「取消」「测试并继续」，另有文字链接「跳过测试」。
  - 测试失败时显示 `title + body`。如果失败原因是认证，并且当前不是 auto，就自动展开「更多设置」。
  - 修改地址、Key、协议或认证方式后，已通过的测试结果作废（显示「连接信息已修改，需要重新测试」）。
- 第 2 步「选择模型」：
  - 服务返回了列表时：整行点击就能勾选或取消（`role="checkbox"`，空格和回车都能切换）；
  - 默认勾选列表里存在的 `claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5`；一个都没有时勾选第一个。默认模型优先 `claude-sonnet-5`，否则取第一个勾选的；
  - 鼠标悬停时显示「设为默认」，默认模型显示 `默认` 标签；
  - 目录里查不到的模型标「能力未知」；超过 8 个模型时显示搜索框；「列表里没有？手动输入模型 ID」默认折叠。
  - 服务没有返回列表时：显示「常用」快捷选项、手动输入框，以及已添加模型的列表。
  - 自定义服务在底部多一行「按官方价计费 × 倍率」（使用 `Stepper`，步进档位和 demo 一致，默认 0.30）。
  - 底部显示「默认：{模型}」，以及「上一步」「保存连接」。跳过了测试时，追加「· 保存后自动测试」。
- 保存逻辑：
  - `createCustomConnection` 传入 `initialModels`（每个都用 `customModelDraftFromCatalog` 生成）、`defaultApiModel`、`authMode`、`resolvedAuth`、`billingMode: "reference"`、`pricingMultiplier`、`catalogId: "custom"`、`displayName`（传空，由主进程取域名）；
  - 保存成功后直接进入这个连接的详情页；如果测试没有通过或被跳过，自动调用一次 `testCustomConnection`。
- 验证：`provider-model-settings.test.tsx` 覆盖：
  - 完整流程：填写 → 测试（mock 返回 bearer 和 9 个模型）→ 第 2 步预选 3 个 → 保存，并断言 `createCustomConnection` 收到的参数；
  - 无列表场景：常用快捷选项和手动输入都能添加；
  - 测试失败时停留在第 1 步；
  - 修改 Key 后测试结果作废；
  - 用键盘能勾选模型行。

**T13 官方 Anthropic 只填 Key**
- 新文件 `apps/desktop/src/renderer/components/settings/AnthropicKeySetup.tsx`：
  - 只有一页：API Key → 测试连接（草稿探测，协议 `anthropic-messages`，地址固定 `https://api.anthropic.com`，`authMode: "x-api-key"`）；
  - 测试通过后在同一页下方显示 `ConnectionModelPicker`（不显示计费那一行），底部「保存连接」。
- 保存参数：`catalogId: "anthropic"`、`displayName: "Anthropic"`、`billingMode: "reference"`、`pricingMultiplier: 1`、`promptCacheMode: "short"`。
- 验证：测试断言页面上没有地址和协议控件；`createCustomConnection` 收到的 `baseUrl` 是官方地址。

**T14 连接详情页**
- 把 `CustomConnectionDetail` 挪到新文件 `CustomConnectionDetail.tsx`，按 demo 重写，使用 `SettingGroup`、`SettingRow`、`useSingleEditor`、`SettingEditor`。
- 页头：名称；副标题为「协议 · 域名 · 状态点」，官方连接显示「Anthropic 官方」。不再显示 uuid。
- 「连接」分组：
  - 名称：行内编辑；
  - 服务地址：副文本显示实际请求地址，行内编辑时实时预览；
  - API Key：显示「已设置」，行内「更换」；
  - 认证方式：下拉，auto 时副文本显示「自动识别为 X」；
  - 代理：开关，开启后行内填写地址；
  - 提示缓存：开关；
  - 连接测试：「测试」按钮，副文本显示「刚刚通过 · 延迟」或错误信息。
  - 修改地址、Key 或认证方式并保存后，自动重新测试。
  - 官方连接隐藏名称、地址、认证方式三行。
- 「模型」分组：`CustomConnectionModels`（T15）；右上角「刷新」（`probeCustomConnection` 传 `kind: "saved"`，新发现的模型默认不启用，标「新」）和「添加」（行内输入模型 ID）。
- 「计费」分组：
  - 自定义连接：计费方式下拉（按官方价折算 / 只统计 Token / 逐个填写单价），折算模式下显示倍率 `Stepper`；
  - 官方连接：只显示「按官方价格」。
- 最后一个分组是「删除连接」（使用 T2 的确认弹窗）。
- Key 不显示后四位（demo 里有）：`docs/SECURITY.md` 第 14 行规定 renderer 只能拿到 `hasApiKey`，不能拿到任何 Key 片段。
- 验证：测试覆盖行内编辑名称并保存会调用 `updateCustomConnection`；修改地址后会自动测试；官方连接不显示地址行。

**T15 模型列表与模型编辑页**
- `CustomConnectionModels.tsx` 按 demo 重写行：
  - 显示名称、标签（默认 / 能力未知 / 新）和 mono 模型 ID；
  - 右侧是「…」菜单（`SettingsMenuButton`：设为默认 / 编辑 / 删除）和启用开关；点击行进入编辑页；
  - 默认模型不能停用、不能删除（菜单项置灰）。
- `CustomModelForm.tsx` 按 demo 简化：
  - 「显示名称」；
  - 「能力」：一行摘要（已从目录匹配），加「手动修改」开关，展开后是上下文、输出、图片、推理（推理直接放入现有的 `CustomModelReasoningFields`）；
  - 「价格」：一行跟随连接的摘要（例如「输入 $0.60 · 输出 $3.00 · 每百万 Token」），加「单独设置」开关，展开后是四项单价。计费模式为 manual 时直接展开。
  - 创建连接时不再用这个表单（向导已经替代），只用于添加或编辑单个模型。
- `ModelPricingFields.tsx` 去掉外层 `fieldset` 和说明文字，改为 `SettingRow` 行。
- 验证：测试断言默认模型的菜单里「删除」被禁用；开启「单独设置」后保存，提交的是 `pricing`；在 reference 模式下，摘要金额等于目录价 × 倍率。

**T16 浏览器 fixture 与视觉验证**
- 扩展 `apps/desktop/src/renderer/test/fixtures/model-settings-preview.tsx`（或 `settings-preview.tsx`）的 `window.actspace` mock：
  - `probeCustomConnection` 支持 `?scenario=ok|bearer|nolist|badkey`，和 demo 的四种场景一一对应；
  - `createCustomConnection` 写入内存并返回快照。
- 用浏览器 renderer（`pnpm dev:log` 或 fixture 页面）按 `docs/FRONTEND_VERIFICATION.md` 截图，浅色和深色主题各截：
  - 添加连接列表；
  - 向导第 1 步（空白、测试失败、测试通过各一张）；
  - 向导第 2 步（有列表、无列表各一张）；
  - 官方 Anthropic；
  - 连接详情；
  - 模型编辑页。
- 截图放到 `docs/exec-runs/20260926-custom-connection-setup-redesign/`，并和 demo 对照，偏差记录在执行摘要里。

### 阶段 D：收尾

**T17 文档**
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`：把第 269 行一段改写为新的入口、向导、认证回退、计费模式和地址规范化规则，并链接 demo。
- `docs/design-docs/model-context/agent-multi-provider-llm.md`：补上 `authMode / resolvedAuth` 和 `billingMode` 的语义（有相关小节就改那一节，没有就新增一小节）。
- 在 `docs/histories/` 新增记录（按 `docs/HISTORY_GUIDE.md` 的规则命名）。
- 按 `docs/learnings/WRITING_GUIDE.md` 判断要不要写学习文档。候选主题：同时支持 Anthropic `x-api-key` 和 Bearer 两种认证，以及 SDK 用 placeholder 顶替 Key 的坑。
- `docs/exec-plans/README.md`：更新状态；完成后把本计划移到 `completed/`。

**T18 人工验收（外部门禁）**
- Electron 真机：按执行摘要里的清单走一遍：新增、测试、保存、刷新、删除，旧连接照常可用，浅色和深色主题。
- 真实中转站：需要用户提供一个要求 Bearer 的中转站，发一次最短请求。会产生少量费用，必须先得到用户同意再做。

## 9. 验证命令

每个阶段结束都要跑：

```sh
pnpm --filter @actspace/shared test
pnpm --filter @actspace/llm-pi-ai test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm check:frontend-theme
pnpm check:frontend-tokens
pnpm test:contract-matrix
```

阶段 C 结束后还要跑 `pnpm --filter @actspace/desktop build`，确认 renderer 和 electron 都能构建。

预期：以上命令全部通过；新增用例数量记录在执行过程文档里。

## 10. 风险与回退

| 风险 | 缓解 | 回退 |
|---|---|---|
| 旧连接行为变化（认证方式、计费） | 新字段都可选；缺省值严格等于现在的行为，T7 和 T6 各有专门的旧数据用例 | 回退 B 阶段代码；已写入的新字段会被旧版本忽略 |
| Anthropic SDK 在 `apiKey: null` 时仍校验认证方式 | T10 用真实 SDK 在测试里构造 client，捕获请求头 | 改为 `authToken: key` 构造（SDK 会自己发 Bearer），不走 headers |
| 部分中转站 `/v1/models` 返回 401，但 messages 接口可用 | 两种认证都 401 时提示「认证失败」，并保留「跳过测试」出口；保存后的 1 Token 测试作为最终判断 | 用户手动固定认证方式 |
| 手填价格被倍率误乘 | T6 的专门用例 | 回退 model-runtime-service 的改动 |
| 和 20260912 推理计划冲突 | 开始前检查 diff；不改推理语义 | 按用户指定的顺序合并 |
| 目录隐藏三条旧条目后，旧连接的 logo 和名称查不到 | `findCatalogEntry` 仍能查到 hidden 条目 | 取消 hidden |

最小回退：阶段 A 可以单独保留；B、C 按阶段整体回退，不做部分回退。

## 11. 已知与 demo 的差异

- 服务没有提供模型列表时，demo 写的是「连接成功 · 服务未提供模型列表」。实际实现改为「已连通 · 服务未提供模型列表」，因为 404 只能证明地址可达，不能证明 Key 有效。保存后的自动测试会补上这一步确认。
- 模型编辑页「推理」一项，demo 用的是简化下拉；实际实现先沿用 `CustomModelReasoningFields`（见 5.2）。
- 详情页 API Key 一行，demo 显示后四位；实际实现只显示「已设置」，原因见 T14 和 `docs/SECURITY.md`。

## 12. 执行文档

开始执行时创建 `docs/exec-runs/20260926-custom-connection-setup-redesign/execution-process.md` 和 `execution-summary.md`（从 `docs/exec-runs/templates/` 复制）。每完成一个任务，更新一次执行过程文档。

## 13. 进度

- [x] 阶段 A：T1–T3（2026-09-26）
- [x] 阶段 B：T4–T10（2026-09-26）
- [x] 阶段 C：T11–T16（2026-09-26，浏览器 fixture 截图见执行目录）
- [x] 阶段 D：T17 文档（2026-09-26）
- [ ] 阶段 D：T18 Electron 真机验收、真实中转站测试（外部门禁，等待用户）

## 14. 决策记录

- 2026-09-26：用户在 demo 上确认了四项决定（见第 2 节），并要求文案从简。
- 2026-09-26：旧连接缺省 `authMode = x-api-key`、`billingMode = manual`，保证升级后行为不变；新连接默认 `auto` 和 `reference`。
- 2026-09-26：倍率沿用已有的 `defaultPricingMultiplier` 字段，不新增字段。
- 2026-09-26：`providerId` 的 `"openrouter"` 回退值不在本计划处理，因为它牵涉 ModelKey 迁移。
- 2026-09-26：用户要求阶段 A 之后不再逐阶段确认，全部完成后统一提交。
- 2026-09-26：只有地址、Key、认证方式、代理变化时，才作废测试结果并清空 `resolvedAuth`；改名、改计费不重测。
- 2026-09-26：manual 计费模式下不强制展开模型单价，避免旧模型改名时必须先填价格。
