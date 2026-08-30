# 扁平 Tool Name 与 Plugin Provenance 必须分离

## 是什么

Agent Tool 同时有两种不同语义：模型和 Provider 需要一个符合外部函数名规则的扁平 `name`，Runtime/审计需要知道哪个插件拥有它的 `pluginId`。把两者拼成 `pluginId/name` 会把内部 ownership 泄漏到外部 wire，并可能违反 Provider 的名字正则。

## 为什么需要

Provider 的 `function.name`、Responses `name`、Anthropic `name` 和 pi-ai 工具 schema 都是外部协议字段。它们必须直接收到 `read_file` 这类稳定名称。插件归属、definition digest 和 registration lease 仍然应在 Runtime、approval、Session provenance 和 diagnostics 中独立保存。

## 怎么用

```ts
// 错误：把内部 namespace 当成模型身份
{ pluginId: "actspace.core-tools", toolId: "actspace.core-tools/read_file" }

// 正确：外部身份扁平，归属单独存在
{ pluginId: "actspace.core-tools", name: "read_file" }
```

Registry 直接 `capture(name)`，Provider adapter 直接读取 `tool.name`，Session codec 只接受符合 `^[a-zA-Z0-9_-]+$` 的 `name`。如果两个插件在同一个可见 scope 中注册相同 name，应在 admission 阶段拒绝，而不是重新引入编码映射。

## 常见陷阱

- 只修 OpenAI Chat，却遗漏 Responses、Anthropic 或 pi-ai replay；这些路径必须共享同一 name contract。
- 为了“兼容”保留 `toolId` fallback 或 aliases，导致旧身份继续进入 wire/session。
- 机械替换所有 `toolId`，误伤 Workspace Open Tool 这类非 Agent Tool identity。

## 自检问题

1. `pluginId` 变化时，模型看到的 `name` 是否必须变化？不应当；它们是不同维度。
2. 两个插件都想注册 `read_file` 时，应该在哪里失败？在 Registry admission，而不是 Provider 请求时。
3. `registrationId` 是否可以作为 Provider tool name？不可以；它是进程内 lease 身份。
