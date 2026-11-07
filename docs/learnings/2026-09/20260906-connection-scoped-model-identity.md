# 模型身份与 Provider 分层：ModelKey、连接 ID、品牌与协议

合并自六篇：动态模型迁移的身份命名空间、同一模型 ID 需要不同本地标识、品牌身份不能由传输适配器推断、模型连接配置要整体解析、api/provider/visibility 分层、退役供应商时保留独立能力。共同主题：**“这是哪个模型/哪个连接/哪个品牌/哪种协议”是四个不同的问题，各自要有稳定标识，不能互相推断**。相关实现：`packages/util/shared/src/model-resolver.ts`（`ModelKey`）、`provider-templates.ts`（`catalogId`）、`model-layers.ts`。

## 1. 模型身份必须包含供应商（`ModelKey`）

上游模型 ID 不是全局唯一键：同一 `apiModel` 可由不同供应商提供，凭据、Base URL、代理、价格、能力验证状态都不同。稳定身份：``type ModelKey = `${ProviderId}:${string}` ``（`"deepseek:deepseek-v4-pro"`、`"openrouter:anthropic/claude-sonnet-4"`）。`ModelKey` 是配置与运行时引用；`apiModel` 只是发给具体供应商的请求参数。

两个中转站都提供 `vendor/model` 但 Key、地址、协议、限额不同——本地目录只以该字符串为键，第二条连接会覆盖第一条，请求可能用错账号。进一步：上游请求仍发 `vendor/model`，本地标识包含连接 ID，如 `provider:connection/relay-a/vendor%2Fmodel`；显示名可随意改，连接 ID 与已安装模型的绑定保持稳定。请求依次解析“本地模型 → 绑定连接 → 协议、地址、凭据”；绑定连接不存在必须明确失败，自动借用默认连接会把请求发给另一个账号、隐藏配置错误。

## 2. 迁移：不要把有限联合类型直接改成 string

模型从“代码里固定四个 ID”升级为“多供应商可动态添加”时，最危险的捷径是把 `ModelId` 改 `string`/`ModelId | ModelKey`——编译器失去约束，旧代码“任何模型都在静态注册表里”的假设悄悄保留，所有 `MODEL_REGISTRY[id]` 变成潜在运行时空值。

- 用**并行字段**：`RunTurnInput { model?: LegacyModelId; modelKey?: ModelKey }`。解析顺序固定：优先 `modelKey`，否则把已知 legacy ID 单向映射成 `ModelKey`；未知值明确失败，不偷偷回落默认模型。持久化同理：先并存 `AppSettingsV1`/`V2`，迁移与消费者全部完成后再切生产 alias，每个阶段保持主干 typecheck。
- 动态 key 的集合无限、内置注册表只有少数条目：类型用 `Partial<Record<ModelKey, ModelDefinition>>` 而不是 `Record<…>`，迫使调用方处理缺失。
- 可用性不是布尔值，是可解释的解析结果：`{ ok: true; model } | { ok: false; reason: ModelUnavailabilityReason }`（供应商未启用/未配密钥/最近连接失败/模型未安装/停用/能力不匹配）。Composer 提示重选，utility 回退当前主模型，后台任务暂停，而不是各自复制不一致的判断。

## 3. 品牌、连接、运行时协议是三个字段

OpenAI-compatible 传输被多家共用，不代表品牌相同；用运行时路由选 Logo，OpenAI、Mistral 连接会全显示成 OpenRouter。

| 字段 | 回答 |
|---|---|
| `catalogId` / `logoKey` | 这项预设向用户展示哪个品牌 |
| `connectionId` | 用户保存的是哪一份地址、凭据、模型配置 |
| runtime provider（协议适配器） | 发请求时复用哪个协议适配器 |

显示时从 `catalogId` 查显式品牌注册表；执行时从 `connectionId` 解析真实配置再进入对应传输。未知品牌显示中性图标，不借传输适配器的品牌。Logo 存真实 SVG 与来源，单色图形用 CSS mask 随主题变色。回归测试覆盖“保存后的连接行”而不只是“添加目录”（保存后丢失 `catalogId` 映射视觉仍会退回错误品牌），夹具故意让 `catalogId ≠` runtime provider（OpenAI 预设复用兼容适配器）。

## 4. 连接配置整体解析（原子性）

模型 ID、协议、地址、密钥、代理、定价倍率共同描述一次调用。分别做“有值优先”的 fallback，会把 A 服务的模型名与 B 服务的地址/密钥拼成从未配置过的连接。先确定稳定连接身份，再从**同一次解析结果**生成完整请求；未知/已删除连接明确失败，不退回默认供应商；显示名只是标签，重命名不改变身份。

- 重启边界最易漏：写入器允许新凭据槽位，读取器仍按旧格式过滤；模型清洗函数只保留旧字段丢掉 `connectionId`。只测“保存返回成功”不够——在临时目录创建连接，重新构造服务，再验证模型与凭据解析。还要测：两连接同上游模型名、并发创建、删一条后另一条仍工作、编辑失败后重启仍读取原 Key。传输适配器可 mock 验证选了哪种协议，真实供应商兼容性另行验证。
- 测试要经过真实凭据入口：只用空凭据调适配器的测试会掩盖上游默认凭据污染；至少覆盖默认服务未配置、默认服务用不同 Key/代理、自定义连接切换与删除。
- 生产依赖同类陷阱：开发环境能导入不代表打包后能导入，动态 import 绕过静态检查，要从独立部署目录运行初始化检查。

## 5. api / provider / visibility 三分

- **api**：消息协议、tool call 格式、流式事件、usage 归一（`anthropic-messages`、`openai-completions`）；**provider**：供应商身份、密钥、默认 base URL、价格、个别默认参数（`deepseek`、`kimi`）；**visibility**：是否出现在用户可选入口（`public`/`internal`）。
- 反例：`if (provider === "deepseek") return new DeepSeekService()`——品牌同时代表 OpenAI-compatible 转换，DeepSeek 默认改走 Anthropic Messages 后冒出 `DeepSeekAnthropicService`，按品牌扩展下去会长出更多重复 service。工厂应先看 `api`，provider 只影响密钥、端点、供应商特有能力。
- “隐藏一个模型”≠“删除一个模型”：Kimi 收口为内部 helper 时，registry 保留全部模型，UI 列表只导出 `visibility: "public"`，`resolveModelSpec()`/内部 helper 仍能解析 `internal`，`isPublicModelId()` 专用于公开入口校验；删除会连带打断旧配置解析、搜索 helper、多模态辅助、测试夹具、历史 session 回放。
- 陷阱：把 provider 当 api；让 helper 能力（Kimi `$web_search` 是供应商 builtin）进入主模型工具表；兼容 wrapper（`KimiService`）继续长逻辑，新转换逻辑应进协议服务。

## 6. 退役供应商：按能力边界清理，不按供应商名

同一供应商名可出现在多条能力链路，但“文字模型供应商”和“图片生成服务”生命周期不共享。退役文字供应商时沿 Provider Registry、模型注册表、任务模型引用、文字密钥逐层清理；图片生成通过自己的 secret id、端点、模型配置继续运行。按供应商字符串全局删除会误删图片配置（设置页干净，真正生成图片才失败）；只隐藏 UI 不迁移持久化数据，旧模型仍会被任务模型选择器/runtime 解析。做法：先列能力边界（配置键、模型键、密钥 id、runtime 入口）；迁移只把旧字段当“待清理输入”并重写规范格式；回归测试用“旧文字配置 + 独立图片配置”断言一清一留。

## 自检

1. 稳定身份是否同时含 provider 和 upstream model ID？未知 legacy 值是明确失败还是默认回落？
2. 两个连接使用相同协议，Logo 一定相同吗？（否：展示身份、用户配置实例、执行策略是不同维度）
3. 新增模型真正改变的是协议 `api`，还是只是 provider/base URL/模型名/价格？应对用户公开还是仅内部 helper？
4. 删除 Provider Registry 条目时，是否还有别的能力使用同一 base URL 或品牌名？旧任务模型引用清理后历史 session 与 usage 仍可读吗？

来源：`docs/histories/2026-07/20260724-2222-multi-provider-llm.md`、`docs/histories/2026-06/20260602-0119-llm-contract-alignment-closeout.md`，以及 2026-08/09 连接与品牌改造。
