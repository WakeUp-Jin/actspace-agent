# Provider 协议迁移要同时收口三层

把一个 LLM provider 从一种兼容协议切到另一种，不能只修改请求 URL。一个完整迁移至少涉及模型事实、运行时请求和持久化配置三层。

## 三层边界

1. **模型与 provider 元数据**决定新会话应该选择哪种协议、默认端点和可用能力。UI 应从这里读取 High / Max 等选项，而不是按 provider 名硬编码完整菜单。
2. **运行时请求适配**负责把统一选项翻译成供应商字段。例如 DeepSeek OpenAI-compatible 请求使用 `thinking.type` 和 `reasoning_effort`，默认值必须在非 UI 入口也成立。
3. **持久化设置迁移**处理旧版本保存的协议专用 URL。否则代码虽然选择了新协议，请求仍可能被旧 Base URL 发到错误 endpoint。

## 防御性默认为什么要有两处

模型能力声明 `reasoningDefaultEffort=max`，让 Composer、Desktop runtime 和其他能力消费者得到同一默认值；provider adapter 在 Thinking 开启但 effort 缺失时再次回退 Max，保护 CLI、旧调用方或不完整输入。

这不是重复业务逻辑：前者是产品能力事实，后者是网络请求边界的最后校验。

## 迁移 URL 时不要误伤自定义网关

只迁移精确匹配的旧官方地址。不能用“路径包含 `/anthropic`”一类宽泛规则，因为用户的代理或自部署网关可能有自己的路由约定。迁移后保存 `null` 表示继续继承 provider 注册表的默认根地址，避免复制另一份容易漂移的默认值。

## 自检

- 非 Composer 入口是否也会得到正确的默认 effort？
- 旧设置会不会让新协议请求继续发往旧 endpoint？
- 修改是否意外改变了其他 provider 的 Auto 或默认推理策略？

来源：`docs/histories/2026-07/20260731-1319-deepseek-openai-thinking-effort.md`
