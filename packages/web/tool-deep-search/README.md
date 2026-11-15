# deep-search

`@actspace/tool-deep-search` 拥有 `deep_search` 的工具定义、注册和 lifecycle：把一个问题交给 DeepSeek 深度思考搜索，拿回带出处的要点。

公开入口：`.`、`./manifest`、`./plugin`。

Host 端口为 `actspace.host.tools.deep-search`（`DEEP_SEARCH_HOST_PORT_ID`），是可选注入：没有端口时不注册工具，服务 `tools.deep-search` 标明不可用；有端口时 `createPorts()` 构造联网实现，`available()` 作为工具的可见性判断（开关关或没有 DeepSeek Key 时模型看不到这个工具）。DeepSeek 的请求代码由 Host 提供，不在本包的 `plugin.ts` 里。

详细契约见 [DeepSeek 深度搜索与文档解析工具](../../../docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md)。
