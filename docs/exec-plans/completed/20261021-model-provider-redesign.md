# 设置 › 模型：四层数据模型与页面重做

## 目标

把设置 › 模型从「3 种 provider 概念、4 条添加流程、2 种详情页、5 处能力来源、3 层计费、4 处用途设置」收成一套：

- 数据上分四层：**协议**（3 个固定值）→ **服务商模板**（一张数据表）→ **连接**（统一形状）→ **模型**（每个字段的有效值 = 用户修改 > 服务商数据 > 模型目录 > 未知，并带来源）。
- 页面按已确认的 Demo `docs/design-docs/frontend/model-provider-demo/index.html` 实现：用途表 + 连接列表；添加连接三步（选模板 → 填 Key → 勾模型）；连接详情（模型行只有名字 + 开关，点开就地展开三项关键信息，其余收进「更多设置」，添加模型也在列表里就地展开）。

对话框（composer）的界面一处都不改。

## 已确认决策

2026-10-20 讨论确认 1–8 条，2026-10-21 用户在 Demo 上确认页面和剩余三个问题（9–11 条）。

| # | 决策 |
|---|---|
| D1 | 四层模型：协议 / 服务商模板 / 连接 / 模型。DeepSeek、Kimi、OpenRouter 不再是特殊 provider，只是模板表里的三行。 |
| D2 | 模型目录只用一个来源：models.dev + OpenRouter 快照，加上已有的网络刷新（`ModelCatalogService`）。目录没有思考档位数据，所以新增一张按模型 id 规则匹配的思考档位表。 |
| D3 | 官方连接的模型列表 = `/models` ∩ 目录。`/models` 不可用时，退回列出该模板对应的目录模型。中转站的 `/models` 原样列出，不在目录里的标「不在模型目录中」。 |
| D4 | 思考档位统一用 `off / low / medium / high / xhigh / max`（关 / 低 / 中 / 高 / 超高 / 最高）。每个模型声明自己支持哪几档，有的模型一档都没有。每个模型可以设默认档位。未知模型在用户补充之前不显示思考。 |
| D5 | 价格 = 参考价 × 连接倍率。参考价指目录价、服务商 `/models` 价和内置价。单个模型手填的价格不乘倍率。删掉 reference / token / manual 三种计费模式。 |
| D6 | 用途合成一张表：会话默认 / 轻量任务 / 自动审批 / 子 Agent 探索 / 看图。每项存「模型 + 思考档位」，也可以设成「跟随」上一级。 |
| D7 | 不做：OAuth、多 Key 轮换、一个连接同时支持两种协议。 |
| D8 | 对话框（composer）不在范围内，用户很满意现在的样子。`UsableModelView`、`capabilities.*` 的形状保持兼容。 |
| D9 | 中转站 `/models` 自己返回的字段（上下文、最大输出、输入类型、价格、思考）优先级**高于**模型目录（2026-10-21）。 |
| D10 | 去掉连接详情的「测试连接」和添加模型的「测试」按钮（2026-10-21）。添加连接时的「测试并获取模型」保留，因为这一步就是去拿 `/models`。 |
| D11 | 删掉内置 provider 的多 Key（`additionalCredentials` / `credentialId`）（2026-10-21）。 |

## 实现取舍

这些是我在实现层面做的选择，不改变上面的产品决策。

| # | 取舍 | 原因 |
|---|---|---|
| I1 | **ModelKey 格式和 secrets 位置不变。** 旧的 `deepseek:default` / `kimi:default` / `openrouter:default` 连接保持原有存储，只在视图层统一成连接。新建的连接一律按自定义连接存储，`providerId` 占位只留在存储层。 | 会话历史、用量统计、用途绑定都引用 ModelKey；改格式要迁移全部历史数据，收益只是存储层好看一点。 |
| I2 | `MODEL_REGISTRY`、`deepseek-model-facts` 本轮不删，降级为内置模型的「服务商数据」层（优先级高于目录）。 | DeepSeek 分时段价格目录表达不了；`DEFAULT_MODEL_ID` 和 CLI / Web 回退仍在用它们。设置页不再把它们当独立的能力来源。 |
| I3 | 有效值在 main 的 `ModelStoreService.getModelSnapshot()` 里统一算一次，运行时、对话框、设置页都读这一份。renderer 只做展示，不再自己按目录算能力。 | 现在能力判断散在 5 处；集中算才能保证设置页显示的值和请求时用的值一致。 |
| I4 | 用户修改存成按 ModelKey 索引的 `settings.models.overrides`，对所有模型（内置、目录、自定义）都一样；服务商 `/models` 数据存在 `definitions[key].providerFacts`。 | 「恢复目录值」只需删掉 override；刷新 `/models` 只需更新 providerFacts，不会冲掉用户修改。 |
| I5 | 迁移旧的自定义模型时，只有和不带 override 时算出的值**不一样**的字段才写进 override；手动推理配置转成思考档位 override。 | 迁移后不会出现一堆「已修改」，同时保持现有行为不变。 |
| I6 | 计费模式的迁移：reference 保持不变；token 去掉标记，开始按参考价 × 倍率显示价格；manual 下已填单价的模型转成手填 override，没填的走参考价。 | token 和 manual 原本是在没有参考价时的权宜做法；新规则下倍率能表达同样的意图。会在 history 里写明。 |
| I7 | 看图改成从已安装、能看图的模型里选，不再用硬编码的两项白名单加 credentialId。迁移时只有白名单模型已安装才保留，否则改为「跟随会话默认」。 | 统一到用途表；白名单会绕开连接和倍率。 |
| I8 | 子 Agent 探索接上真实路由：注册一个 `explore` LLM 路由，`actspace.explore` preset 改用它。目前这个设置已经存下来，但运行时没有人读。 | 用途表里的每一项都必须真的生效。 |
| I9 | 余额改成按连接查。连接详情的标题副行显示余额，只限 DeepSeek / Kimi / OpenRouter 模板的连接。 | 保留现有能力，不再单独占一块区域。 |

## 范围

**包含**
- `packages/shared`：
  - 分层类型与解析
  - 思考档位表
  - 目录匹配
  - 价格
  - 模板表
  - 新增 IPC 契约
- `apps/desktop/src/main`：
  - settings 存储、迁移、清理
  - 连接与模型服务
  - `/models` 富字段
  - 用途与路由
  - 删除多 Key
  - 新增 IPC
- `apps/desktop/src/renderer/components/settings/models/`：新页面，替换旧组件。
- 测试、mock、fixture，以及文档同步：页面规范、目录与费用设计、history。

**不包含**
- 对话框 / ModelPicker 的界面。
- Web PWA 的界面。
- 用量统计页。
- ModelKey 格式。
- 删除 `MODEL_REGISTRY`。
- OAuth 与多 Key 轮换。
- Electron 实机验收。这一项交给用户，收尾时写清人工验证指引。

## 数据设计（契约以 `packages/shared/src/model-layers.ts` 为准）

```ts
export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh" | "max";
export type ModelThinking = { levels: ThinkingLevel[]; default?: ThinkingLevel }; // levels: [] = 不支持
export type ModelRates = { input: number; output: number; cacheRead: number | null; cacheWrite: number | null }; // USD / 百万 token
export type ModelFacts = {
  label?: string; contextWindow?: number | null; maxOutput?: number | null;
  input?: ("text" | "image")[]; thinking?: ModelThinking; rates?: ModelRates; ratesUnsupported?: boolean;
};
export type ModelOverrides = ModelFacts & { canonical?: string }; // canonical：沿用某个目录模型
export type FactSource = "user" | "provider" | "catalog" | "unknown";
export type EffectiveModel = {
  label: string; contextWindow: number | null; maxOutput: number | null; input: ("text" | "image")[];
  thinking: ModelThinking | null; // null = 未知
  rates: ModelRates | null; ratesScaled: boolean; multiplier: number;
  sources: Record<"label" | "contextWindow" | "maxOutput" | "input" | "thinking" | "rates", FactSource>;
  catalog: { id: string; name: string; exact: boolean } | null; // exact=false 只是建议（日期后缀）
};
```

- `resolveEffectiveModel({ apiModel, protocol, catalogProvider, providerFacts, overrides, catalog, multiplier })` 是纯函数。
- `effectiveToCapabilities(effective)` 把思考档位映射回现有的 `ModelCapabilities`，对话框据此不用改：

| 档位形态 | thinkingToggle | reasoningMandatory | reasoningEfforts | thinkingDefault | reasoningDefaultEffort |
|---|---|---|---|---|---|
| `[]` 不支持 | false | – | undefined | false | – |
| `[off, x]` 开关 | true | false | undefined | default≠off | – |
| `[off, …≥2 档]` | true | false | 去掉 off 后的列表 | default≠off | default 是 off 时取中间档，否则取 default |
| `[x]` 始终思考 | false | true | undefined | true | – |
| `[…≥2 档，无 off]` | false | true | 列表 | true | default |
| `null` 未知 | false | – | undefined | false | – |

存储新增：
- `SettingsV4Models.overrides: Partial<Record<ModelKey, ModelOverrides>>`
- `ModelDefinition.providerFacts?: ModelFacts`
- `TaskModelSettings.visionModel: ModelKey | null`
- `TaskModelSettings.thinking?: Partial<Record<PurposeId, ThinkingLevel>>`

`PurposeId = "chat" | "utility" | "autoReview" | "explore" | "vision"`。连接的 `catalogId` 就当作模板 id 用。

存储删除：
- `billingMode`
- `additionalCredentials`
- `InstalledModelSettings.credentialId`
- `ImageInspectionSettings.credentialId`
- `ImageInspectionSettings.modelKey`，迁移到 `visionModel`

## 背景与路径

- **Demo：** `docs/design-docs/frontend/model-provider-demo/{index.html,shared.js,shared.css}`。
- **必读：**
  - `AGENTS.md`
  - `docs/design-docs/frontend/front-新功能开发清单.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
- **shared：**
  - `packages/shared/src/` 下的 `settings.ts`、`model-config.ts`、`provider-config.ts`、`model-pricing.ts`、`model-catalog*.ts`、`custom-model-input.ts`、`custom-model-reasoning.ts`、`model-resolver.ts`、`image-inspection-config.ts`、`ipc.ts`、`desktop-bridge/contract.ts`、`runtime-v2/fixed-renderer.ts`
- **main：**
  - `apps/desktop/src/main/` 下的 `model-store-service.ts`、`model-runtime-service.ts`、`model-catalog-service.ts`
  - `settings/`：`types.ts`、`sanitize.ts`、`migrations.ts`、`defaults.ts`、`custom-connection.ts`、`facades/providers.ts`、`facades/custom-connections.ts`、`facades/general.ts`
  - `runtime-v2/`：`fixed-renderer-ipc.ts`、`provider-network-service.ts`、`custom-connection-probe.ts`、`legacy-llm-adapter.ts`、`model-port.ts`、`desktop-host-adapter.ts`、`credential-resolver.ts`、`tool-host-services.ts`
- **subagent：** `packages/subagent/src/preset.ts`
- **renderer：**
  - 被替换的旧组件：`components/settings/{ProviderSettings,CustomConnectionWizard,AnthropicKeySetup,ConnectionModelPicker,CustomConnectionDetail,CustomConnectionModels,CustomModelForm,CustomModelReasoningFields,ModelPricingFields,ModelSettings,ModelMultiSelector,OpenRouterModelCatalogDialog,ModelPurposeSelect,custom-connection-shared}.tsx`
  - 用途相关：`sections/TaskModelDefaultsSection.tsx`、`sections/SubagentSection.tsx`、`sections/MediaDefaultsSection.tsx`

## 风险

| 风险 | 缓解 |
|---|---|
| 迁移把用户现有模型或计费改坏 | 迁移是纯函数，用 `test/fixtures/settings/` 的 v2/v3/v4 样本做特征测试；保留现有的 `.backup.json` 机制；每条迁移规则都有单测。 |
| 运行时能力变化导致请求失败（思考档位被拒） | `effectiveToCapabilities` 用表驱动单测覆盖上表每一行；`runtime-v2-thinking-options.test.ts` 跑通；未知模型保持「不发思考参数」。 |
| 价格被二次乘倍率 | 倍率只在 `resolveEffectiveModel` 里乘一次；删掉 `model-runtime-service` 里的 `applyPricingMultiplier` 和 `resolveModelPricing` 里的 factor；加回归测试。 |
| 删除旧 IPC 时漏掉调用方 | 删之前全仓 `grep`；`check:ipc-channels` 与 typecheck 兜底。 |
| 看图迁移让原来能用的看图失效 | 白名单模型已安装就迁移过去；否则跟随会话默认（主流模型都能看图）；history 写明。 |
| renderer 大改导致旧测试大面积失效 | 旧的 `provider-model-settings.test.tsx` 整体换成新页面测试；不为旧结构保留兼容层。 |

## 任务

### A. shared 地基（纯函数，先做，其余阶段依赖它）

- **A1** `packages/shared/src/model-layers.ts`：上面的类型、`resolveEffectiveModel`、`effectiveToCapabilities`、`effectiveRatesToPricing`。测试 `test/model-layers.test.ts`，覆盖：
  - 四层优先级，每个字段的来源
  - 倍率只乘参考价
  - 手填价格不乘
  - CNY 转 USD
  - `ratesUnsupported` 的处理
  - 映射表的每一行
- **A2** `packages/shared/src/model-thinking-profiles.ts`：按 id 规则给出档位和默认档。目录里标了 reasoning 但没有规则命中的，按协议给保守的默认值：Anthropic 用 `[off, low, medium, high]`，OpenAI 用 `[low, medium, high]`，其他协议用 `[off, high]`。测试覆盖 Claude、GPT、DeepSeek、Kimi、GLM、MiniMax、Qwen、Gemini 这几个家族。
- **A3** `packages/shared/src/model-catalog-match.ts`：`matchCatalogModel(catalog, apiModel, catalogProvider?)` 依次尝试：
  1. 精确匹配：优先模板对应的目录 provider，其次非 OpenRouter，最后 OpenRouter。
  2. 去掉 `vendor/` 前缀后匹配。
  3. 日期后缀近似（`-YYYYMMDD`、`-YYYY-MM-DD`、`-latest`），返回 `exact:false`。
  测试覆盖这些情况。
- **A4** `packages/shared/src/provider-templates.ts`：`PROVIDER_TEMPLATES`，字段为 id、名称、分组（官方 / 聚合平台 / 自定义）、logo、协议、默认地址、目录 provider、是否支持余额。现有的 `PROVIDER_CATALOG` 和 3 个内置 provider 合并进来；旧的 `PROVIDER_CATALOG` 改成从它派生，或直接删除。
- **A5** 新增 IPC 契约类型，放在 `ipc.ts` 的 models 部分：
  - 视图：`ModelConnectionsView`、`ConnectionView`、`ConnectionModelView`（ModelKey、apiModel、enabled、`EffectiveModel`、`hasOverrides`）、`PurposesView`
  - 输入：`ConnectionDraftInput`、`ConnectionProbeResult`（每个模型带 `EffectiveModel` 预览）、`ConnectionModelPatch`、`PurposesUpdateInput`
- **A6** `/models` 富字段规范化：`normalizeProviderModelFacts(row)`，处理 `context_length`、`top_provider.max_completion_tokens`、`architecture.input_modalities`、`pricing`、`reasoning` / `supported_parameters`，输出 `ModelFacts`。
- **A7** 改 `model-pricing.ts`：`resolveModelPricing` 只把 definition 上已经算好的价格包成快照，去掉 `billingMode` 和 factor 分支；DeepSeek 分时价保留。同步更新 `model-pricing.test.ts`。

### B. main：存储、迁移、服务

- **B1** settings 类型 / defaults / sanitize：新增 `overrides`、`providerFacts`、`visionModel`、`thinking`；删除 `billingMode`、`additionalCredentials`、`credentialId`、`imageInspection.modelKey/credentialId`。
- **B2** `settings/migrations.ts`：实现 I5、I6、I7、D11 的迁移，规则是幂等的。测试放在 `main/test/settings-model-layers-migration.test.ts`，并更新 `settings-characterization.test.ts` 和对应 fixture 的 expected。
- **B3** `ModelStoreService`：
  - 注入目录快照，在 `getModelSnapshot()` 里对每个已安装模型算有效值，把能力、上下文、价格写回 definition（即 I3）。
  - 新方法：`listConnections()`、`addConnectionModels()`、`updateConnectionModel()`（启用状态 / overrides 补丁 / `null` 恢复）、`removeConnectionModel()`、`previewModel()`。
- **B4** 连接服务（扩展 `settings/facades/custom-connections.ts`）：
  - 统一的 create / update / remove，旧 provider 连接映射到 `providers[...]`。
  - 创建时写入勾选的模型，以及 `/models` 拿到的 providerFacts。
  - 删除时：被用途引用的绑定清空，改为跟随。
- **B5** `provider-network-service.ts` / `custom-connection-probe.ts`：probe 保留富字段，返回 `ConnectionProbeResult`（预览 = `/models` ∩ 目录 + 匹配结果；拿不到 `/models` 时退回目录列表）；新增 `refreshConnectionModels`（新出现的模型以未启用状态加入，已有模型更新 providerFacts）。
- **B6** `model-runtime-service.ts`：删除 `applyPricingMultiplier` 和 billingMode 分支；看图走 `visionModel`，没设时回退到会话默认模型（需能看图）；探索走 `exploreModel`；轻量任务和自动审批读用途档位，替换掉固定的 `{reasoning:false}`。
- **B7** 子 Agent 探索路由：在 `desktop-host-adapter.ts` 注册 `explore` 路由，`legacy-llm-adapter` 按用途解析，`packages/subagent/src/preset.ts` 的 explore preset 改用 `routeId:"explore"`。补测试。
- **B8** 删除多 Key：
  - main 侧：`addProviderCredential` / `update` / `test` / `remove`、`getProviderRuntimeConfigForCredential` 的 credentialId 参数、`ModelStoreService` 的 credential 校验。
  - IPC 与 contract：对应的 4 个 channel。
  - 测试与 fixture 同步。
- **B9** IPC：models 域新增
  - `listConnections`
  - `createConnection`、`updateConnection`、`removeConnection`
  - `probeConnection`、`refreshConnectionModels`
  - `addConnectionModels`、`updateConnectionModel`、`removeConnectionModel`、`previewModel`
  - `updatePurposes`、`getConnectionBalance`

  按清单走完 7 步：channel → contract → main 注册 → guard → mock → 调用方 → 检查。新 UI 不再使用的旧 channel，在确认没有其他调用方后删除，包括：
  - `models.addCustom` / `editCustom` / `setCustomConnectionDefault` / `add` / `listCatalog`
  - `settings.*CustomConnection`
  - `providers.connect` / `update` / `test` / `remove`

### C. renderer：新页面

新组件都放在 `apps/desktop/src/renderer/components/settings/models/`。每个文件 < 400 行；纯函数放 `.ts` 并配单测；有状态的逻辑放 `use-*.ts`。

- **C1** `use-model-connections.ts`：负责读 `listConnections`、调各 mutation、出错时给可见提示。`model-view.ts` 放格式化、家族 logo 映射、档位文案。
- **C2** `ModelsPage.tsx`：路由状态机，包括列表、添加连接、填写 Key、选模型、详情。`SettingsPage` 的 `case "model"` 接到这里。
- **C3** `PurposesSection.tsx` 和 `PurposePicker.tsx`：双栏 Popover。左栏是搜索加按连接分组的模型列表，右栏是模型事实和思考档位单选；顶部有「跟随 X」；看图项只列能看图的模型。
- **C4** `ConnectionListSection.tsx`：每个连接一张卡片，显示 logo、名称、「中转」标、协议、启用数 / 总数、待补充数、状态。
- **C5** `TemplateCatalogPage.tsx`：搜索框加三组模板，已添加的标「已添加」。
- **C6** `ConnectionSetupPage.tsx`：官方连接只填 Key；中转还要填协议（分段控件）和地址；「高级设置」里有地址和代理；按钮「测试并获取模型」。
- **C7** `ModelSelectPage.tsx`：
  - 列表有勾选、家族 logo、名称和未知标签，支持搜索、全选、清空。
  - 底部可以就地添加模型。
  - 中转连接显示倍率行。
  - 底部按钮是「保存连接」。
- **C8** `ConnectionDetailPage.tsx`：
  - 页头：名称、「官方 / 自定义中转」、状态，以及余额（如有）。
  - 「连接」组：名称、协议（仅中转，下拉）、地址、Key（掩码，带「更换」）。
  - 「模型」组：「重新获取」加模型列表。
  - 「计费与删除」组：倍率、两步删除。
- **C9** `ModelList.tsx` 和 `ModelPanel.tsx`：
  - 行内容：家族 logo、名称、已修改点、未知标签、展开箭头和开关。
  - 展开后对已知模型只显示三项（上下文、默认思考下拉、价格 + ×倍率）和「更多设置」。
  - 「更多设置」里有显示名称、上下文、最大输出、思考档位分段、默认思考、看图、价格。
  - 未知模型显示「沿用已知模型」和必填三项。
  - 底部：恢复目录值、取消沿用、移除模型，以及收起。
- **C10** `AddModelPanel.tsx`：
  - 先填 ID，输入时用防抖调 `previewModel`。
  - 命中时显示 ✓ 加三项。
  - 未命中时显示「沿用」和必填三项，其余收进「更多设置」。
  - 按钮只有「取消」和「添加」。
- **C11** 样式：用 Tailwind 语义 token。实在需要全局类的，加进 `styles/model-connection.css`，统一用 `.mc-*` 前缀。浅色、深色、480px 宽三种情况都要看。
- **C12** 清理：删除上面「被替换的旧组件」以及 `model-selector-groups.ts`；从 `TaskModelDefaultsSection`、`SubagentSection`、`MediaDefaultsSection` 里移走模型选择（温度等其他设置保留）；同步 `scripts/native-button-baseline.json`，数量只许减少。

### D. 测试与验收

- **D1** 新测试 `renderer/test/model-settings.test.tsx`，替换 `provider-model-settings.test.tsx`，覆盖：
  - 列表与用途选择（含跟随、看图过滤）
  - 添加官方连接
  - 添加中转（`/models` 失败时退回手动添加）
  - 选模型并保存
  - 详情页改名称 / 协议 / 地址 / Key
  - 模型展开、改默认思考、更多设置、恢复目录值、移除
  - 就地添加：命中 / 日期近似 / 未命中
  - 倍率、删除连接

  同步更新 `settings-page.test.tsx` 中的相关用例。
- **D2** mock：`renderer/mock/handlers.ts` 给新增 IPC 补默认实现；`test/fixtures/model-settings-preview.*` 换成新页面，场景为 `ok`、`nolist`、`badkey`、`relay`。
- **D3** 工程检查，按顺序在仓库根目录执行：
  ```
  pnpm --filter @actspace/shared test
  pnpm --filter @actspace/desktop typecheck
  pnpm --filter @actspace/desktop test
  pnpm check:frontend-tokens
  pnpm check:frontend-theme
  pnpm check:renderer-bridge
  pnpm check:ipc-channels
  pnpm check:current-docs
  ```
- **D4** 浏览器 mock 截图：列表、用途选择器、添加三步、详情展开、更多设置、未知模型、就地添加。每种都截浅色和深色，外加 480px 宽的列表与详情。截图放 `docs/exec-runs/20261021-model-provider-redesign/`。
- **D5** 写人工验证指引（Electron + 真实 Key），放在 execution-summary。

### E. 文档与收尾

- **E1**
  - 重写 `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`：§4 和 §9 按新设计改，并去掉重复的 §10 标题。
  - 更新 `docs/design-docs/model-context/agent-model-catalog-and-usage-cost.md` 的价格规则和能力来源部分。
  - `docs/design-docs/index.md` 加入口。
- **E2** `docs/histories/2026-10/` 记一条，写明迁移带来的行为变化：token 模式开始显示价格、看图迁移、多 Key 删除。
- **E3** 计划移到 `completed/`，同步 `docs/exec-plans/README.md`；把 `active/20260912-custom-model-reasoning.md` 标记为被本计划取代（删不删由用户决定）。

## 执行顺序与并行

A 必须先完成。B1–B2 → B3–B5 → B6–B9 依次进行。C 在 A5 的契约和 B9 的 mock 就绪后开始，C1 / C2 先做，C3–C10 可以分几批推进。D、E 放在最后。只在一个 worktree（`../actspace-agent-model-provider`，分支 `feat/model-provider-redesign`）里串行推进；不开多个 Agent 并行改同一批文件。

## 回退

- 每个阶段一个 commit，可以按阶段回退。
- 迁移写回 settings 之前，现有的备份机制会保留原文件；迁移出问题时，可以从 `settings.v3.backup.json` 或迁移前的备份恢复。

## 进度记录

- [x] 2026-10-21：Demo 定稿；D9–D11 确认；建立 worktree 和分支；写完计划。
- [x] A 阶段：shared 地基（2026-10-21；billingMode 类型与 PROVIDER_CATALOG 的删除挪到 C12）
- [x] B 阶段：main（2026-10-21；新方法统一收进 `ModelConnectionsService`，IPC 新开 `modelConnections` 域；旧 channel 含多 Key 的删除挪到 C12）
- [x] C 阶段：renderer（2026-10-21；新页面在 `components/settings/models/`；C12 后端清理删掉旧 IPC、多 Key、billingMode、PROVIDER_CATALOG 和 `model-connection.css`；7 个整行 / ARIA 角色的原生按钮登记进基线）
- [x] D 阶段：测试与验收（2026-10-21；D2 的 preview fixture 改为有状态 mock `mock/model-connections-fixture.ts`；D4 截图 11 张；D5 人工验证指引在执行摘要。Electron 未验证）
- [x] E 阶段：文档与收尾（2026-10-21）

## 执行模式

交互模式：涉及存储迁移，又是用户直接参与的页面改版。

## 执行文档

`docs/exec-runs/20261021-model-provider-redesign/execution-process.md`（过程）与 `execution-summary.md`（收尾时写人工验证指引）。
