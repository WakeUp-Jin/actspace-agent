# 本地模型目录与使用费用设计

> 状态：2026-09-07 实现完成；自动化与浏览器验证已执行，真实 Electron / Provider 验收边界见执行摘要。
> 执行入口：[使用统计更新计划](../../exec-plans/completed/20260906-actspace-usage-statistics/README.md)。页面设计：[使用统计页面更新](../frontend/front-usage-statistics-refresh.md)。

## 目标与已有证据

费用能够解释来源；没有价格或完整用量时显示未知；模型目录在断网时仍可使用；目录更新不阻塞启动、请求发送或统计页面。

2026-09-06 历史问题快照（下列旧路径与缺陷用于解释修复动机，现行实现已迁至 pi-ai-adapter 与对应价格投影，不应据此恢复旧 wire engine）：

- `packages/llm/pi-ai/src/pi-ai-wire-engine.ts` 的 `createModel` 将四类 token 单价固定为零；`mapUsage` 又将 SDK 计算出的 `cost.total` 标记成 `provider-reported`。这不是供应商实际返回的账单金额。
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts` 缺少价格计算，费用保持空值。两条请求路径需要共用计价规则。
- `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts` 未将已解析模型的价格传入请求；现有 `model-runtime-service.ts` 已处理价格倍率，接入时必须避免乘两次。
- `packages/runtime/src/projection/durable-session.ts` 维护 durable provider usage，`packages/client/src/sessions/usage-aggregates.ts` 负责展示聚合；工具活动不混入 provider usage，缺失价格仍显示未知。
- 本地脱敏样本中，144 条 assistant 记录为零费用且标记为供应商来源，另有 3 条没有费用。这是所检查样本的结果，不代表全部使用历史。

## 参考 pi，明确移植边界

核验日期为 2026-09-06，参考上游 main；本仓库安装的 pi-ai 为 0.82.1，不能假定它自动包含上游 coding-agent 的目录刷新能力。

- [pi 生成脚本](https://github.com/earendil-works/pi/blob/main/packages/ai/scripts/generate-models.ts)：提取 models.dev、OpenRouter 等来源，生成随包交付的模型数据。
- [pi 远端目录实现](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/remote-catalog-provider.ts)：恢复本地数据，检查 4 小时 TTL，使用条件请求，刷新失败保留旧数据。
- [pi Model Runtime](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/model-runtime.ts) 与 [交互刷新协调](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/model-catalog-refresh.ts)：网络由宿主允许，并合并并发刷新。

ActSpace 采用“随包目录 + 本地缓存 + 按需后台刷新”。pi 运行时连接的是其托管的 provider 目录；ActSpace 首版直接读取两个公共数据源，不依赖 pi.dev，也不建设新服务器。上游经验用于机制设计，不复制 coding-agent 或升级整个 SDK。

## 数据流与所有权

```text
models.dev / OpenRouter public API
       |                         |
生成脚本（维护时）          Desktop 后台 worker（按需）
       |                         |
随包生成目录              校验 -> 原子替换本地缓存
       +------------+------------+
                    v
           Host 解析实际模型与价格
                    |
             请求开始时冻结快照
                    v
            LLM 引擎规范化用量
                    |
              统一费用计算器
                    v
            Journal 原始请求事实
                    |
              Usage 投影 / IPC
                    v
             使用统计页面
```

- `packages/shared`：JSON-safe 目录、价格和 IPC 契约，以及生成的静态模型数据；不放网络、文件系统或 Electron 代码。
- `packages/llm/service`：规范化计费用量和纯费用计算；不读取用户目录，不负责刷新。
- Desktop Host：目录缓存、后台 worker、更新状态、连接身份匹配、请求价格解析与生命周期。扩展现有 OpenRouter 目录接入，避免形成两个独立价格事实源。
- CLI Host：按现有连接端点及最终模型使用随包目录离线计价；首版未新增 CLI 自定义费率配置入口。首版不启动刷新服务，也不依赖桌面进程或读取其内存缓存。
- Journal：保存当次请求实际使用的价格依据；目录变化只能影响后续请求。
- Renderer：使用统计仅消费投影和请求价格快照，不加载价目目录；只格式化单价与金额，不重算历史总费用。

## 目录契约

新增 `packages/shared/src/model-catalog.ts` 定义契约，生成数据放在 `packages/shared/src/generated/model-catalog.generated.ts`，通过独立的 `@actspace/shared/model-catalog-data` 公开入口消费，避免 renderer 因导入 shared 根入口而打包整份目录。生成脚本为 `scripts/generate-model-catalog.mjs`，不引入新运行时或第三方服务。

| 字段 | 约束 |
| --- | --- |
| schemaVersion | 首版固定为 1；未知版本拒绝加载并回退 |
| source / sourceProviderId / apiModel | 保留原始来源和精确模型身份；不能只按显示名称匹配 |
| 请求 providerId / connectionId / modelKey | 请求快照补充配置身份；区域通过 HTTPS 端点的显式映射识别 |
| fetchedAt / generatedAt / contentHash | 获取、生成时间与内容摘要；获取时间不声称是价格生效时间 |
| currency / rates | 币种、每百万 token 的输入、输出、缓存读写单价；缺失为 null，推理已包含于输出 |
| unsupportedBilling | 检测到阶梯或非 token 收费时标记 true，首版不保存或计算阶梯详情 |
| contextWindow / maxOutput / input / reasoning | 来源能力元数据；不覆盖现有用户模型配置 |

来源归一化规则：

1. [models.dev API](https://models.dev/api.json) 的 token 价格单位为 USD/百万；[OpenRouter API](https://openrouter.ai/api/v1/models) 的 token 单价转换为 USD/百万。保留来源字段，验证有限非负数。
2. 缺失、负数、动态路由哨兵价格为 null；来源明确给出的零价格保留零，不能把 null 补成零。
3. 仅生成当前 ActSpace 支持的服务商及 OpenRouter 模型；外部目录出现新服务商不自动启用新适配器。过滤表覆盖现有连接预设支持的官方端点，不受旧 ProviderId 命名空间数量限制。
4. 直连使用 models.dev 对应 provider 的价格；OpenRouter 请求使用 OpenRouter 价格。同名模型经过不同服务商时不可互相替代价格。
5. Kimi 与 Moonshot 区域名称建立显式映射，结合实际连接端点识别区域；自定义代理和不认识的区域默认未知，除非有显式连接价格配置。模型 key 不等于实际 API model。
6. 价格与能力的优先级见下一节「模型有效值（2026-10-21）」。DeepSeek 官方端点的固定高峰规则保留；源码中标注“示意”的内置价格不作为可靠依据。
7. 能力数据不覆盖用户修改和协议兼容选项；对话框的模型选择器不随本规则改动。

## 模型有效值（2026-10-21）

> 2026-10-21 改：删掉连接级 `billingMode`（reference / token / manual）和「已乘倍率」开关，价格与能力统一按四层数据模型算。计划见 `docs/exec-plans/completed/20261021-model-provider-redesign.md`，页面见 `front-模型设置页面-Maka重做规范.md`。

每个模型字段（显示名称、上下文、最大输出、输入类型、思考档位、价格）的有效值按下面的顺序取第一个有值的，并记录来源（`EffectiveModel.sources`）：

1. **用户修改**：`settings.models.overrides[modelKey]`，对所有模型都一样。「恢复目录值」就是删掉这一项。
2. **服务商数据**：连接 `/models` 返回的富字段，存在 `definitions[key].providerFacts`；内置模型的 `MODEL_REGISTRY` / `deepseek-model-facts` 也算这一层。中转站自带的字段优先于目录（D9）。
3. **模型目录**：按连接模板的 `catalogProvider` 精确匹配；去掉日期后缀能匹配上的只作为建议（「像是 … 的日期版本」），用户点「沿用」后写入 `overrides.canonical`。
4. **未知**：上下文、价格为空，思考为 `null`（不发思考参数）。

- 纯函数 `resolveEffectiveModel`（`packages/shared/src/model-layers.ts`），main 的 `ModelStoreService.getModelSnapshot()` 统一调用一次并写回 `definition.pricing` 与 capabilities，运行时、对话框、设置页读同一份。
- 目录没有思考档位数据，思考档位由 `model-thinking-profiles.ts` 按模型 id 规则匹配；`effectiveToCapabilities` 把档位映射回 `ModelCapabilities`，对话框不用改。
- **价格 = 参考价 × 连接倍率**。参考价是服务商数据或目录价；倍率只在这里乘一次（`ratesScaled: true`）。用户在模型上手填的价格（USD / 百万 token）就是最终价，不乘倍率。
- 价格为空时费用显示未知；不再有「只统计 Token」模式。

## DeepSeek 固定高峰估算

按用户确认的产品策略，官方 `api.deepseek.com` 端点使用固定高峰 USD 估算，不按每日峰谷时段切换。官方模型档案集中在 `packages/shared/src/deepseek-model-facts.ts`，由设置页、模型定义与请求价格解析共同消费。

| 官方模型 / 请求时间（北京时间） | 输入未命中 | 输出 | 缓存读取（USD/百万 token） |
|---|---:|---:|---:|
| V4 Flash / Flash Vision，2026-09-10 12:00 前 | 0.44 | 1.32 | 0.014 |
| `deepseek-flash` 与旧 Flash 别名，2026-09-10 12:00 起 | 0.30 | 1.20 | 0.006 |

依据 [DeepSeek 官方价格](https://api-docs.deepseek.com/quick_start/pricing/) 和 [V4.1 公告](https://api-docs.deepseek.com/zh-cn/news/news260910)，核验于 2026-09-10。缓存写入单价保持 null；图片按返回的输入 token 计价，不另收一次图片费用。官方实际空闲时段价格为高峰一半，估算不是实际账单。

`model-pricing.ts` 保存 source=deepseek-official、strategy=fixed-peak；连接倍率只应用一次。Pro 已从可选模型和目录中移除，旧配置引用归一到 Flash，不保留 9 月 14 日定时切换；仅 Flash 价目生效日期影响费率，目录刷新不会覆盖官方档案。只匹配明确官方端点；同名 OpenRouter 或自定义端点不套用直连价格。每次请求冻结价格快照，已保存的历史费用不重算。

## 费用与来源契约

保持 `LlmUsage.source` 的 token 来源含义，追加可选 `costProvenance`；不再用一个字段同时表示 token 来源与费用来源。旧 Journal 可继续读取。

`costProvenance` 包含：`version: 1`、`basis`（provider-reported / estimated / unknown）、`reason`、`pricingSnapshot`（可空）。快照包含 `providerId`、`connectionId`（可空）、`apiModel`、`modelKey`、`currency`、归一化单价、倍率、unsupportedBilling、source、contentHash、fetchedAt、capturedAt。只保存所用模型，不保存整份目录、凭据或请求正文。

- 只有响应协议中可验证的实际费用字段才允许标记 provider-reported。官方 OpenRouter 端点的 Chat Completions / Responses 经公共 OpenAI SDK 读取原始 usage.cost，保留有限非负 USD 金额（包括 0），优先于估算。当前由 `PiAiAdapter` 在请求前选择对应 wire backend；官方 OpenRouter 请求在兼容 backend 读取实际费用，代理仍使用 request-scoped fetch。其他端点不能仅凭 providerId 或 SDK cost 冒充实际扣款。没有可验证实际金额时继续估算。
- 本地估算统一由纯计算器负责，不读取 SDK 默认零费用。SDK 如需数值型 cost 配置可保留兼容占位，但不能作为账单事实。
- 输入先统一为未缓存输入、缓存读取、缓存写入等互斥计费桶；不同协议的 input 是否包含 cache 必须在引擎映射层处理。缓存命中率分母使用总输入，不叠加已经包含的缓存。
- 推理 token 若已包含于输出，不重复收费。只有协议明确提供独立计费桶及对应价格时才单独计算。
- 任意实际发生的计费桶缺少单价，或计费桶无法可靠拆分，整次估算为未知；零 token 的缺价桶不阻止其他桶计价。
- 缺 usage、取消或失败请求也保留记录；有可靠已消耗用量即可估算，没有则未知，不能根据请求失败推断费用为零。
- 显式免费模型的有效零价与未知费用严格区分。自定义代理没有实际费用和配置价格时保持未知。
- 模型上手填的价格不经过官方域名匹配或名称推断，按 USD / 百万 token 填写，快照来源为 `configured`。清空手填价后回到参考价 × 倍率；没有参考价时费用未知。既有快照不变。
- 每个请求使用最终模型身份，覆盖按 reasoning effort 改写的模型、子 Agent、重试；请求开始后不受目录更新影响。

### 协议字段存在性与 SDK 适配

Token 的已知性按字段保存：没有 usage、空对象、缺失字段和无效的负数/非数值均为 `null`；供应商明确返回的有限非负数（包括 `0`）才是用量事实。部分响应只能推进已经报告的字段，后续部分帧不清空早先事实。成功、失败和取消使用同一规则，缺输入或输出时不生成整次费用估算。SDK 预填的零计数和零费用均不能充当响应事实。

固定依赖 `@earendil-works/pi-ai@0.82.1` 通过版本化 pnpm patch，在 Chat Completions、Responses 和 Anthropic 原始 usage 边界附带 `actspaceWireUsage.version = 1` 的字段存在性元数据；普通 SDK 消费者的数值契约不变。适配层只读取这份元数据，再归一化互斥缓存桶。缺少兼容元数据时保守返回未知。补丁升级须重新通过真实 SDK/SSE 的缺失、部分、显式零、非零、缓存、非法值、失败和取消测试，以及离线 frozen-lockfile 全新安装验证；不能直接改 node_modules 或只测试模拟的 SDK 对象。

这项修复仅影响新请求。历史 Journal 没有保留原始字段存在性，不能猜测旧零计数的真实性或自动重写历史事实；请求次数仍按实际请求生命周期累计，不以 token 是否为零或未知决定是否计数。

## 历史费用与币种

不修改历史 Journal，也不按今天的价目自动重算旧请求。旧记录没有价格证据的零值不能展示为“确认免费”。投影优先使用新增 provenance；对无 provenance 的历史零值作保守降级，以旧 adapterVersion 等元数据解释已知缺陷，有可靠免费证据的除外。非零旧记录保留金额并标注“历史记录，来源未验证”。

系统内部费用统一保存和展示为 USD。外部接口若返回 CNY，在进入模型价格、请求投影和统计聚合的边界按 `7.2 CNY = 1 USD` 转换；未提供币种时按 USD 处理。统计默认覆盖现有 Session Journal 中的请求和工具活动，不能以首次打开统计页的时间隐式截断历史。旧 `global-usage-reset.json` 已退役，保留文件但不读取、不新建；历史费用继续按上述来源证据规则解释，不能因价格未知而丢弃请求或 Token。精度只在展示时舍入，保留小额费用最多六位小数。

没有任何已知金额且存在请求时显示“费用未知”；有部分金额时显示“已知费用”及未知请求数。没有请求时显示空状态。工具本身没有计费事实，不计入未知模型费用请求数。

辅助模型的真实 dispatch 必须独立计入请求、Token 与费用，覆盖图像识别、标题生成、上下文压缩和自动审核。图像识别与自动审核绑定实际父工具的 Run/Turn/Step/call；标题仅归属 Session，压缩归属 Session 并可关联实际 Turn，不能为后台任务虚构 Run。主 Step 与辅助请求各自消费自己的终结用量，禁止将辅助 Token 叠加到主 Step 后重复聚合。每次 attempt 使用 Prepared request 的实际唯一 requestId、路由与模型，logicalRequestId 仅关联同一逻辑请求。

辅助请求开始事实持久化后才派发，结束事实持久化后才返回；业务解析在计量结束之后，格式不合法也可能已经产生费用。失败、取消和未终结均保留真实的部分或未知用量，显式零保留。自动审核的并发检查仅忽略本次审核自身、完整身份一致的计量事实，其他并发事件仍使快照失效。辅助事实不得生成对话气泡或进入 Context。

Session 与全局统计保留全部辅助请求的请求数、Token 与费用；标题和压缩不增加 Run 数，轮尾仅聚合属于实际 Run 的用量。SQL 明细、小时/日/总量汇总、批量写入与降级投影必须保持相同规则。派生 SQLite schema14 升级时同时废弃旧行、触发器和游标，从 Journal 重放；旧 Journal 没有辅助事实时不按工具或标题次数猜算。图像调用的完整生命周期见[图片分析工具](../tool-system/agent-image-inspection-tool.md)。

## 本地更新与性能

| 时机 | 行为 |
| --- | --- |
| 应用启动、发送消息 | 只读取已准备的本地目录；没有缓存立即使用随包目录 |
| 打开使用统计、刷新统计 | 只读取 Journal 投影；零价格网络请求 |
| 打开模型设置 | 先呈现本地数据；目录距上次成功校验超过 4 小时才后台刷新 |
| 应用退出 | 中止网络和 worker；未验证临时文件不可替换有效缓存 |

没有固定轮询计时器。4 小时是按需检查的过期阈值，不是每 4 小时必然下载。

- 缓存位于 `<dataRoot>/model-catalog/`，按来源存储，包含 schema、来源、hash、ETag、Last-Modified、checkedAt、有效模型正文；失败冷却时间仅保存在当前进程内存。
- checkedAt 仅在成功或有正文支持的 304 时推进；失败保留有效缓存，并设置 5 分钟自动重试冷却。强制刷新可越过 TTL 和冷却，但合并同一来源正在执行的请求。
- 支持的源使用 If-None-Match / If-Modified-Since；不支持条件请求则正常下载。没有缓存正文时不能携带 validator。
- 每源一次刷新单飞；单次网络尝试超时 4 秒，最多重试一次，仅重试网络失败与 5xx，单轮刷新总等待上限 15 秒。超时保留旧目录并显示“更新失败，仍使用本地价目”。
- worker 承担远端 JSON 解析、归一化、筛选与 hash，主进程只接收已筛选结果并序列化小型本地缓存；每源响应上限 16 MiB，超限取消并保留旧缓存。缓存加载验证 schema/hash；每源单飞避免同源新旧响应竞争，取消后不发布结果。
- 新版随包目录优于获取时间更早的缓存；异常未来时间戳不进入覆盖选择。来源没有价格生效时间时只承诺这是最近成功获取的价目，不能承诺实时账单一致。
- 公共目录请求不带用户 API key、聊天正文、自定义连接地址或模型使用记录；使用 Electron net.fetch 的默认网络会话与系统代理；公共价目不继承用户私有连接的认证代理配置。provider 私有模型发现与公共价格目录职责分开。
- 复用现有 OpenRouter 目录对外接口；旧缓存只有可验证身份、单位和 schema 时迁入，否则保留旧文件并使用新随包目录，不删除用户数据。

本方案假设公共目录能覆盖部分实际模型。若精确模型、区域或计费规则不匹配，费用显示未知，其他统计与消息能力继续工作。没有第三方服务可用时仍可完整离线运行。

## 取舍与范围

推荐按四阶段交付。最小可交付是随包目录与费用修复，后台更新可独立后续交付。采用新目录宿主服务和多个跨包契约，预计超过 8 个代码文件；这不是单个页面 CSS 调整。

不采用启动时下载全量目录：增加网络依赖与首屏延迟。不仅依赖当前 SDK 内置价格：存在目录版本、实际连接、价格来源与历史快照要求。不新增账单同步、余额、预算、图表库、货币转换服务或全局语言设置。

外部依赖仅为已核验的两个公共 HTTPS API，无新账号/API key/MCP/CLI 要求。费用真实性的最终验收需要现有可用 Provider；离线自动化只能证明计价逻辑，不能证明供应商实际扣款。

## 实现入口与验证边界

目录归一化、端点匹配位于 `packages/shared/src/model-catalog-normalize.ts`、`model-pricing.ts`；费用计算器位于 `packages/llm/service/src/usage-cost.ts`。目录宿主在 `apps/desktop/src/main/model-catalog-service.ts`，worker 随 Electron main 产物构建。

桌面统计通过 `UsageReadModelService` 和 SQLite Worker 分批投影 Journal，收到宿主 durable 通知后失效；未变更时筛选和分页不会重读 Journal。活动行保存完整历史，时间窗只在查询时过滤。SQLite schema 10 通过现有派生库重建机制淘汰旧的截断索引及其游标，回放 Journal 补回历史；此过程会重建同库的目录与 Context 派生数据，不修改 Session 原始事实。旧 JSON `UsageSourceCache` 同步升级到版本 2，拒绝复用版本 1 的截断结果。首次升级需承担重建成本，之后沿用增量读取，不承诺即时完成。

自动化、浏览器截图观察、构建 worker 压测与真实宿主缺口见[执行摘要](../../exec-runs/20260906-actspace-usage-statistics/execution-summary.md)。
