# 用 api/provider 分层收口模型接入

来源：`docs/histories/2026-06/20260602-0119-llm-contract-alignment-closeout.md`

## 核心模式

做多模型接入时，不要把“供应商品牌”直接等同于“协议实现”。更稳的分层是：

- **api**：决定消息协议、tool call 格式、流式事件、usage 归一，例如 `anthropic-messages`、`openai-completions`。
- **provider**：决定供应商身份、密钥、默认 base URL、价格和个别默认参数，例如 `deepseek`、`kimi`。
- **visibility**：决定这个模型是否出现在用户可选入口里，例如 `public`、`internal`。

这样，一个 provider 可以换协议路线，一个协议服务也可以服务多个 provider。公开 UI 只消费 `visibility: "public"` 的列表；内部 helper 仍可从完整 registry 解析模型，不被 UI 收口误伤。

## 为什么需要

早期实现很容易长成这样：

```ts
if (provider === "deepseek") return new DeepSeekService(config);
if (provider === "kimi") return new KimiService(config);
```

看起来直接，但职责会慢慢糊在一起：DeepSeek 既代表品牌，又代表 OpenAI-compatible 转换；后来 DeepSeek 默认改走 Anthropic Messages，就会冒出 `DeepSeekAnthropicService`。继续按品牌扩展，下一次 provider 支持两种协议时还会长出更多重复 service。

更好的拆法是让工厂先看 `api`：

```ts
if (api === "anthropic-messages") return new AnthropicMessagesService(config);
if (api === "openai-completions") return new OpenAICompletionsService(config);
```

`provider` 仍然重要，但它只影响密钥、端点和供应商特有能力，不再决定通用消息转换算法。

## public/internal 的价值

“隐藏一个模型”和“删除一个模型”不是一回事。

当 Kimi 从公开主模型入口收口为内部 helper 时，最危险的做法是把它从模型注册表里删掉。这样会连带打断旧配置解析、内部搜索 helper、多模态辅助、测试 fixture 和历史 session 回放。

更稳的方式是：

- `MODEL_REGISTRY` 保留全部模型，包括内部 helper 模型。
- `MODEL_LIST` 只导出 `visibility: "public"` 的模型给 UI。
- `resolveModelSpec()` 和内部 helper 继续能解析 `internal` 模型。
- `isPublicModelId()` 专门用于公开入口校验，避免把 internal 模型重新漏到 UI。

这让产品入口可以收窄，同时保留运行时兼容性。

## 常见陷阱

- **把 provider 当 api**：一旦同一 provider 支持两种协议，service 层会变成品牌叉树。
- **把 internal 模型从 registry 删除**：UI 是干净了，但内部工具、旧配置和历史记录会一起断。
- **让 helper 能力进入主模型工具表**：例如 Kimi `$web_search` 是供应商 builtin，不应该伪装成普通 ToolManager 工具暴露给主模型。
- **兼容包装层继续长逻辑**：保留 `KimiService` 这类旧类名没问题，但新转换逻辑应该进协议服务，否则分层会再次倒退。

## 自检问题

1. 新增一个模型时，它真正改变的是协议 `api`，还是只是 provider、base URL、模型名和价格？
2. 这个模型应该被用户公开选择，还是只给内部 helper / fallback 使用？
3. 旧品牌 wrapper 是否只做兼容和默认值兜底，没有继续承载消息转换与 usage 归一？
