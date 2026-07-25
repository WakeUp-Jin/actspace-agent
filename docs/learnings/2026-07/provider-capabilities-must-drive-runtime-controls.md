# Provider 能力必须驱动运行时控制项

来源：`docs/histories/2026-07/20260725-2010-model-search-reasoning-effort.md`

## 核心问题

同一个“推理模型”标签下面，供应商实际支持的控制方式可能完全不同：有的只能开关推理，有的支持有限的 effort 档位，有的强制推理，还有的目录没有声明任何可调参数。如果 UI 写死一套 Thinking / Low / Medium / High 表单，最常见的结果是“控件能点，但请求无效或被 provider 拒绝”。

因此，运行时控制项必须是 capability pipeline 的末端呈现，而不是组件自行发明的配置。

## 可复用的链路

```text
provider catalog
  -> metadata normalization
  -> model capabilities
  -> usable model view
  -> UI control
  -> IPC input
  -> runtime validation
  -> provider request adapter
```

每一层只做自己的事：

- catalog 负责提供供应商事实。
- normalization 把供应商字段收敛为应用内部枚举。
- UI 只展示 capability 允许的选项。
- runtime 不信任 UI，发送前再次过滤。
- adapter 最后把通用语义翻译成供应商参数。

## `undefined`、`null` 与 `Auto` 不是一回事

- `reasoningEfforts === undefined`：没有足够能力信息，不展示强度选择器。
- `reasoningEfforts === null`：供应商明确表示支持应用定义的全部标准强度。
- `Auto`：用户没有覆盖模型默认策略，请求中省略 effort。

如果把三者都折叠成空数组，应用会失去“未知”“全集”“使用默认值”之间的重要语义差异。

## 为什么 runtime 还要再校验

Renderer 状态可能来自旧窗口、旧缓存或被修改的 IPC 调用。仅在界面禁用一个选项不能保证请求安全。runtime 应按最终解析出的模型能力重新检查：

1. 当前模型是否支持 reasoning。
2. thinking 是否允许关闭；mandatory 时强制开启。
3. 显式 effort 是否属于支持集合。
4. 不合法值应被丢弃，而不是透传给 provider。

这是一种通用的“界面提供体验，运行时守住事实”模式。

## 常见陷阱

- 把上下文窗口当成 `max_tokens`：前者是输入与输出的总容量边界，后者通常只是生成输出上限。
- 只改 UI：用户能选择 effort，但 IPC 或 loop 没有携带，最终请求仍无变化。
- 只相信远端目录：目录字段会缺失或变化，必须归一化、限制枚举并有兼容默认值。
- 只刷新目录缓存：已安装模型通常保存的是添加当时的能力快照；目录刷新后必须主动 reconcile，否则旧模型会永久缺少新能力字段。
- 只刷新局部设置组件：App 根层如果持有 usable models，添加或 reconcile 后还要显式通知它重拉，否则 Composer 继续展示旧列表。
- 用一个全局 Options 状态：切换模型后，上一个模型的 Thinking / Effort 会污染新模型。
- 显式发送默认 effort：会把供应商未来调整默认策略的能力锁死；`Auto` 应省略覆盖。

## 自检问题

1. 新增一个 provider-specific 控制项时，能力事实来自哪里，在哪一层被归一化？
2. Renderer 绕过限制直接传入非法值时，runtime 是否仍能阻止它到达 provider？
3. “未声明能力”“支持全部能力”“使用供应商默认值”是否被三个不同状态表达？
