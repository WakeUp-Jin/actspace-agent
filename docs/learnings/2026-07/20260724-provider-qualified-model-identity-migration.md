# 动态模型迁移：身份加命名空间，兼容走并行字段

当模型从“代码里固定四个 ID”升级为“多个供应商下可动态添加模型”时，最危险的捷径是把有限联合类型直接改成 `string`。这会让编译器失去约束，也会把旧代码中“任何模型都一定存在于静态注册表”的假设悄悄保留下来。

## 1. 模型身份为什么必须包含供应商

上游模型 ID 不是全局唯一键。同一个 `apiModel` 可能由不同供应商提供，使用的凭据、Base URL、代理、价格和能力验证状态都不同。因此稳定身份应是：

```ts
type ModelKey = `${ProviderId}:${string}`;

// 示例
"deepseek:deepseek-v4-pro"
"openrouter:anthropic/claude-sonnet-4"
```

`ModelKey` 是配置和运行时引用；`apiModel` 只是发给具体供应商的请求参数。两者不能混为一谈。

## 2. 为什么不要直接把旧字段改成大联合

旧消费者通常依赖有限 `ModelId` 做穷举、静态索引和默认回退。如果直接把字段改为 `ModelId | ModelKey`，旧代码虽然可能只出现少量类型错误，但所有 `MODEL_REGISTRY[id]` 都变成潜在的运行时空值。

更安全的迁移方式是并行字段：

```ts
interface RunTurnInput {
  /** 旧客户端兼容 */
  model?: LegacyModelId;
  /** 新客户端使用 */
  modelKey?: ModelKey;
}
```

消费方按固定顺序解析：优先 `modelKey`，否则把已知 legacy ID 单向映射为 `ModelKey`。未知值返回明确失败，不偷偷回落默认模型。

同样的原则适用于持久化：先并存 `AppSettingsV1` 与 `AppSettingsV2`，等迁移和消费者全部完成后再切换生产 alias。这样每个阶段都能保持主干 typecheck，而不是在多个包之间长期留下一半新、一半旧的红色状态。

## 3. 注册表类型也要承认“动态键可能不存在”

下面的声明看似方便，实际承诺了任意合法格式的 key 都存在：

```ts
const registry: Record<ModelKey, ModelDefinition>;
```

但动态 key 的集合是无限的，内置注册表只包含少数条目。准确类型应是：

```ts
const registry: Partial<Record<ModelKey, ModelDefinition>>;
```

这会迫使调用方处理缺失模型，也是避免“类型说一定存在、运行时却是 undefined”的关键。

## 4. 可用性不是布尔值，而是可解释的解析结果

多供应商环境中，模型不可用可能来自供应商未启用、未配置密钥、最近连接失败、模型未安装、模型被停用或能力不匹配。只返回过滤后的数组会让 UI 和后台任务无法解释失败。

统一 resolver 应返回稳定原因：

```ts
type ModelResolution =
  | { ok: true; model: UsableModel }
  | { ok: false; reason: ModelUnavailabilityReason };
```

这样 Composer 可以提示用户重选，utility 可以按规则回退当前主模型，Kairos 可以暂停，而不是各自复制一套不一致的判断。

## 核心检查表

- 稳定身份是否同时包含 provider 和 upstream model ID？
- 未知 legacy 值是否明确失败，而不是默认回落？
- 动态注册表是否用 `Partial` 表达缺失可能？
- 新旧 IPC/设置是否按阶段并行，而非一次扩宽所有字段？
- 可用性解析是否返回原因，供不同调用场景采取不同策略？

来源：`docs/histories/2026-07/20260724-2222-multi-provider-llm.md`。
