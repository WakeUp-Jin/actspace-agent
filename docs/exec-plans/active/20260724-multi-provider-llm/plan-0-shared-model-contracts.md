# Plan 0：共享 Provider、ModelKey 与 purpose resolver 契约

状态：已完成（2026-07-24）

依赖：无

产物消费方：Plan 1-6

## 目标

在 `@actspace/shared` 建立多供应商模型体系的唯一类型来源，完成 provider-qualified ModelKey、模型定义、installed 状态、task model 设置、purpose-aware 可用模型解析和旧 ModelId 兼容边界。后续计划不得自行定义 provider/model 联合类型或复制模型过滤规则。

## 附加必读

- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/settings.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`

## 允许修改的文件

- `packages/shared/src/model-config.ts`
- `packages/shared/src/provider-config.ts`（新增）
- `packages/shared/src/model-resolver.ts`（新增）
- `packages/shared/src/settings.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/test/model-config.test.ts`
- `packages/shared/src/test/model-resolver.test.ts`（新增）
- `packages/shared/src/test/settings.test.ts`（新增或现有同职责测试）
- 对应设计文档和 history

不得修改 agent-core、desktop main、preload 或 renderer。

## 锁定的类型

### Provider

```ts
type ProviderId = "deepseek" | "kimi" | "openrouter" | "duckcoding";
type ModelApi = "openai-completions" | "openai-responses" | "anthropic-messages";
type ModelPurpose = "chat" | "utility" | "explore" | "kairos" | "vision";
```

> 2026-07-28：Plan 7 接入 DuckCoding Codex 时增量加入 `duckcoding` ProviderId 与 `openai-responses` 协议；上面的联合类型已同步当前事实。

`ProviderSpec` 固定包含：

- `id`、`label`、`defaultBaseUrl`。
- `supportedApis`。
- `supportsRemoteModelCatalog`。
- `supportsProxy`。

Provider Registry 只保存静态元数据，不保存用户 key、代理 URL 或连接状态。

### Model identity

```ts
type LegacyModelId =
  | "deepseek-v4-flash"
  | "deepseek-v4-pro"
  | "kimi-k2.6"
  | "kimi-k2.7-code";

type ModelKey = `${ProviderId}:${string}`;
type ModelSelectionId = ModelKey | LegacyModelId;
```

- 新配置、新 IPC 和新事件使用 `ModelKey`。
- `LegacyModelId` 只用于读取旧 settings/session 和兼容测试。
- `normalizeModelKey(value)` 把已知旧 ID 单向映射为新 key；未知字符串返回明确失败结果，不回落默认模型。
- 不批量重写历史 JSONL。

### Model definition

`ModelDefinition` 固定包含：

- `key`、`provider`、`api`、`apiModel`、`label`。
- `source: "builtin" | "curated" | "provider-catalog" | "custom"`。
- `contextWindow`、`maxTokens`。
- `capabilities.input`、`toolUse`、`reasoning`、`thinkingToggle`。
- 可选 pricing 和 `catalogUpdatedAt`。

内置 DeepSeek / Kimi 模型改为 provider-qualified key。旧 `MODEL_REGISTRY` 若保留，必须标记 deprecated，并只作为旧消费者迁移桥，不允许加入动态模型。

### Settings view

Plan 0 定义 `AppSettingsV2` 和对应 update/result 类型，但保留当前 `AppSettingsV1` 及旧 IPC alias，保证尚未迁移的 desktop 可以继续 typecheck。Plan 2 完成持久化迁移后再把生产 `AppSettings` alias 切换到 v2。

v2 契约包含：

- `providers: Record<ProviderId, ProviderSettingsView>`。
- `installedModels: Record<ModelKey, InstalledModelSettings>`。
- `customModels: Record<ModelKey, ModelDefinition>`。
- `taskModels.defaultChatModel / utilityModel / exploreModel`。
- `kairos.modelId: ModelKey | null`，仍由 Kairos 分区持有单一事实源。
- search provider 类型和设置保持独立。

`ProviderSettingsView` 只包含非敏感信息：

- `hasApiKey`、`enabled`、`baseUrl`。
- `proxy.enabled`、脱敏 proxy URL。
- `lastConnection`。
- installed/enabled model 数量。

## 任务清单

### 0.1 Provider Registry 与内置模型迁移

- 新建 `provider-config.ts`，注册 DeepSeek、Kimi、OpenRouter。
- 把当前四个内置模型转换为 `ModelDefinition`。
- 添加 `LEGACY_MODEL_KEY_MAP` 和反向显示 helper。
- 保留 `resolveModelSpecByApiModel()` 的历史读取能力，但 provider 参与匹配。
- `DEFAULT_MODEL_KEY` 映射当前 DeepSeek Pro。

验证：shared 测试锁定三家 provider、四个 legacy 映射和 provider-qualified identity。

### 0.2 纯函数可用模型解析器

在 `model-resolver.ts` 定义：

```ts
listUsableModels(snapshot, purpose): UsableModel[]
resolveConfiguredModel(snapshot, modelKey, purpose): ModelResolution
```

基础过滤固定为：

```text
provider enabled
&& hasApiKey
&& lastConnection available
&& model installed
&& model enabled
&& capability matches purpose
```

能力规则：

- chat/explore/kairos：text + toolUse verified/declared。
- utility：text，不要求 tool use。
- vision：image，并保留调用方追加约束的入口。

结果必须包含不可用原因枚举，至少区分 provider disconnected、connection unavailable、model disabled、capability mismatch、model missing。

### 0.3 IPC 与持久化身份调整

- `RunAgentInput`、`CompactContextInput`、visualize/eval 输入在迁移期保留旧 `model?: ModelId`，并增加并行 `modelKey?: ModelKey`；main 优先读取 modelKey，否则 normalize 旧字段。Plan 5 的新 renderer 只发送 ModelKey 字段，旧客户端/fixture 无需同步升级。
- 旧 session/usage 中 `modelId?: string` 保持宽松读取；新写入同时保存 `modelKey` 或把 provider-qualified 值写入现有 string 字段，二选一后在本计划内统一。
- Session Preview、Usage row 的类型允许新 key，不把动态模型收窄回有限联合。
- Settings provider/model/catalog/task model IPC 类型在 shared 一次定义，Plan 2/3/5 直接消费。

### 0.4 兼容导出与消费者清单

- 从 `packages/shared/src/index.ts` 导出新契约。
- 建立测试断言，确保旧 `ModelId` 不再被新 API 使用。
- 在本计划进度记录中列出仍依赖 deprecated `MODEL_LIST` / `MODEL_REGISTRY` 的文件，交给 Plan 4/5 清理。

## 测试要求

- legacy ID 到 ModelKey 映射完整、单向、未知值不默认回落。
- provider 相同 apiModel 与不同 provider 的 ModelKey 不冲突。
- chat/utility/explore/kairos/vision 五种 purpose 过滤正确。
- provider 断开、连接失败、模型停用和能力不匹配返回稳定原因。
- 动态 OpenRouter 模型可以进入 utility；toolUse unknown 不进入 chat/explore/kairos。
- AppSettings/IPC 序列化结果不包含 apiKey、Authorization 或 transport 实例。

## 验证命令

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop typecheck
```

后两条允许因为消费者尚未迁移而先出现预期类型错误，但本计划合入前必须通过兼容导出把 workspace 恢复为可 typecheck 状态，不把红色主干交给 Plan 1。

## 完成标准

- Provider、ModelKey、ModelDefinition、purpose resolver 在 shared 只有一个事实来源。
- 新契约可以表达 DeepSeek、Kimi、OpenRouter 和动态目录模型。
- 旧 ModelId 只存在于明确标记的兼容层。
- AppSettings v1 与 v2 在共享层有明确过渡边界，Plan 0 合入后 workspace 仍保持全量 typecheck。
- 所有后续计划可以仅依赖 shared 类型启动，不需要重新发明字段。

## 决策记录

- 2026-07-24：不把 `ModelId` 直接放宽为任意 string；使用 `ModelKey` + `LegacyModelId` 明确新旧边界。
- 2026-07-24：resolver 返回不可用原因，不只返回过滤后的数组，供 UI 和后台任务解释失败。
- 2026-07-24：Kairos 设置仍在 Kairos 分区，但模型类型统一为 ModelKey。
- 2026-07-24：迁移期不直接放宽现有 IPC 字段，新增并行 `modelKey` / `exploreModelKey` 字段；Plan 4 消费方优先读取新字段，再兼容旧 `ModelId`。
- 2026-07-24：共享层先定义 `AppSettingsV2`，生产 `AppSettings` 暂时保留 v1 alias；Plan 2 完成持久化迁移后再切换。

## 完成记录

- 已增加三家供应商静态注册表、provider-qualified `ModelKey`、内置模型定义、旧 ID 单向映射和反向展示 helper。
- 已增加 purpose-aware resolver，并用稳定原因区分供应商断开、连接不可用、模型未安装/停用和能力不匹配。
- 已增加 settings v2 与供应商、模型目录、installed model、任务模型的共享 IPC 契约；序列化测试确认不携带密钥或 transport。
- workspace 的 shared、agent-core、desktop 类型检查均保持通过。

仍依赖 deprecated `MODEL_LIST` / `MODEL_REGISTRY` / `ModelId` 的生产消费方，交由 Plan 4/5 清理：

- Agent Core：`engine/create-agent-deps.ts`、`kairos/env.ts`、`visualize/md-to-html.ts`。
- Desktop main：`agent-run.ts`、`context-describe-service.ts`、`index.ts`、`kairos-bootstrap.ts`、`session-preview-service.ts`、`settings-service.ts`。
- Renderer：`App.tsx`、`Composer.tsx`、`ConversationView.tsx`、`SessionHoverPreview.tsx`、`UsageStatisticsPage.tsx`、`WorkbenchLayout.tsx`、`settings/KairosSettings.tsx`、`settings/SettingsPage.tsx`。
