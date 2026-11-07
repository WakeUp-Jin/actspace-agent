# 模型事实与控制项：发现目录、能力、费用快照、请求事实

合并自四篇：模型发现/能力事实/费用快照、Request 模型事实与设置状态边界、Provider 能力驱动运行时控制项、Provider 协议迁移三层收口。主线：**“能发现”≠“能力齐全”；设置是可变的，一次请求用了什么是不可变事实；UI 提供体验，运行时守住事实**。

## 1. 三个生命周期

`GET /models` 返回新 ID 只证明该连接看到了模型，不必含图片支持、工具能力、上下文容量、价格。把“能发现”当“能力齐全”会让 UI 接受图片却在发送时失败，也错估费用。

1. **发现目录**随服务商刷新，缓存用于网络失败时继续浏览；按服务商隔离，不能把一个连接的结果放到另一个连接下。
2. **能力与价格事实**来自官方资料或可信元数据；只有已知 ID 才补齐，未知保持未知；别名归一到一个正式身份，避免同一模型多个条目。
3. **请求费用快照**在实际调用时冻结模型、单价、倍率、来源；账单读快照，后续降价不让上周费用自动变化。

模型发布后更换价目是一条版本边界；每天峰谷价是另一种计价策略——产品采用固定高峰估算时，更新版本价目不意味着自动实现时段计费。迁移冲突：旧 Pro 与旧 Flash 同时映射到新 Flash，依赖对象遍历顺序会随机保留配置；必须明确优先级（正式 Flash > 旧 Flash > 退休 Pro）并在测试里反转输入顺序验证；历史请求不参与配置迁移。自检：远端未给价格时能否诚实展示未知？刷新后历史账单会变吗？两个别名同时存在时保留哪份凭据与启用状态？

## 2. 请求事实 vs 设置状态

模型配置是可变设置，某次请求实际使用的模型能力是不可变事实。请求发送前 Agent Loop 已完成 route、model、消息组装，此时解析 `contextWindow` 写入 `request/header` 与 `request/context.prepared`，后续投影回答“这次请求按什么容量算”而不是“设置页现在的默认是什么”；重试复用同一组事实，运行中改设置也不会让同一轮显示漂移。

- `settings.json` 存用户可改的模型定义、默认模型、任务绑定；Session Journal 存某次请求的 model facts 与完整 request snapshot；Renderer 只消费 Journal projection，旧 Session 没有该字段时显示未知，不填看似合理的默认值。
- 陷阱：renderer 直接读当前选中模型，会把历史请求映射到新模型；为兼容旧数据写死 200K，把“未知”伪装成“确定”；只记录 provider usage 两桶，丢失 system prompt、rules、skills、tool definitions 等上下文组成。

## 3. 运行时控制项是 capability 管线的末端

同一“推理模型”标签下，供应商支持的控制方式可以完全不同（只能开关；有限 effort 档位；强制推理；目录没声明任何可调参数）。UI 写死 Thinking/Low/Medium/High，结果是“控件能点，请求无效或被拒”。

```text
provider catalog -> metadata normalization -> model capabilities -> usable model view
-> UI control -> IPC input -> runtime validation -> provider request adapter
```

- catalog 提供供应商事实；normalization 收敛成应用内部枚举（`reasoningEfforts` 见 `packages/util/shared/src/model-layers.ts`）；UI 只展示 capability 允许的选项；runtime 不信任 UI，发送前再过滤；adapter 最后翻译成供应商参数。
- `reasoningEfforts === undefined`：能力信息不足，不展示强度选择器；`=== null`：供应商明确支持应用定义的全部标准强度；`Auto`：用户没覆盖默认策略，请求中**省略** effort（显式发送默认值会锁死供应商未来调整默认策略）。折叠成空数组会丢失“未知/全集/默认”的区别。
- runtime 再校验的理由：Renderer 状态可能来自旧窗口、旧缓存、被改的 IPC。按最终解析出的模型能力检查：是否支持 reasoning；thinking 能否关闭（mandatory 强制开启）；显式 effort 是否在支持集合；不合法值丢弃而不是透传。
- 陷阱：把上下文窗口当 `max_tokens`（前者是输入输出总容量，后者通常只是输出上限）；只改 UI 而 IPC/loop 没携带；只信远端目录（字段缺失或变化，需归一化、限制枚举、有兼容默认）；只刷新目录缓存——已安装模型保存的是添加时的能力快照，目录刷新后必须主动 reconcile；只刷新局部设置组件而 App 根层持有 usable models 没被通知重拉，Composer 继续展示旧列表；用一个全局 Options 状态导致切换模型后 Thinking/Effort 污染新模型。

## 4. 协议迁移要同时收口三层（DeepSeek OpenAI-compatible thinking effort）

从一种兼容协议切到另一种，不能只改 URL：① 模型与 provider 元数据决定新会话选哪种协议、默认端点、可用能力（UI 从这里读 High/Max，不按 provider 名硬编码）；② 运行时请求适配把统一选项翻成供应商字段（`thinking.type`、`reasoning_effort`），默认值在非 UI 入口也成立；③ 持久化设置迁移处理旧版本保存的协议专用 URL，否则代码选了新协议请求仍被旧 Base URL 发到错误 endpoint。

- 防御性默认两处：模型能力声明 `reasoningDefaultEffort=max`（产品能力事实，Composer/Desktop runtime 等得到同一默认）；provider adapter 在 Thinking 开启但 effort 缺失时再回退 Max（网络请求边界的最后校验，保护 CLI/旧调用方/不完整输入）。不是重复业务逻辑。
- 迁移 URL 只迁精确匹配的旧官方地址，不用“路径包含 `/anthropic`”这类宽泛规则（用户代理/自部署网关有自己的路由约定）；迁移后保存 `null` 表示继续继承 provider 注册表默认根地址，避免复制易漂移的默认值。
- 自检：非 Composer 入口是否也得到正确默认 effort？旧设置会让新协议请求继续发往旧 endpoint 吗？是否意外改变其他 provider 的 Auto/默认推理策略？

来源：`docs/histories/2026-09/20260902-0015-context-model-facts-and-popup.md`、`docs/histories/2026-07/20260725-2010-model-search-reasoning-effort.md`、`docs/histories/2026-07/20260731-1319-deepseek-openai-thinking-effort.md`。
