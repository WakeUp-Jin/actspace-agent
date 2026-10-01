# web-tools

`@actspace/tools-web-tools` 拥有 web、web_search、web_fetch 的工具定义、注册和 lifecycle。

公开入口：`.`、`./manifest`、`./plugin`。

Host port 为 `actspace.host.tools.web-tools`；factory 只创建本包资源。

`web` 的供应商输入 schema 使用普通 object，不在顶层使用 `oneOf` / `allOf` / `anyOf`，以兼容 Anthropic（包括经 OpenRouter 转发的请求）。`action=search` 必须提供非空 `query`，`action=open` 必须提供 `url`；这些条件由参数描述告知模型，并由 Node Host handler 在网络调用前校验。

详细契约见 [Tool 插件边界](../../../docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)。
