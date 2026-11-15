# deep-search

`@actspace/tool-deep-search` 拥有 `deep_search` 的工具定义、注册和 lifecycle：把一个问题交给 DeepSeek 深度思考搜索，拿回带出处的要点。

公开入口：`.`、`./manifest`、`./plugin`。

Host 端口为 `actspace.host.tools.deep-search`（`DEEP_SEARCH_HOST_PORT_ID`），是可选注入：没有端口时不注册工具，服务 `tools.deep-search` 标明不可用；有端口时 `createPorts()` 构造联网实现，`available()` 作为工具的可见性判断（开关关或没有 DeepSeek Key 时模型看不到这个工具）。DeepSeek 的请求代码由 Host 提供，不在本包的 `plugin.ts` 里。

联网实现在本包的 `src/node-ports.ts`（`createNodeDeepSearchPorts`），从 `.` 入口导出，由桌面端和 CLI Host 构造端口时调用：

- `node-ports.ts`：发请求、空闲 40 秒 / 总 120 秒超时、HTTP 状态到失败码的映射。Key 每次调用时读取。
- `sse.ts`：逐行读事件流（`\r\n`、多行 data、`: keep-alive` 注释不重置空闲计时）。
- `stream-state.ts`：把数据块累积成进度消息和最终结果（搜索词、来源、打不开的网页、计费次数）。
- `assemble.ts`：插入 `[n]` 标记，拼出交给主模型的文本，生成摘要和 `deep-search` 明细块。
- `failure.ts`：失败结果，上游消息去掉 Key 后截到 500 字符。

测试在 `src/test/`，回放夹具在 `src/test/fixtures/`（PA.1 真实调用录下、去掉了 Key）：`pnpm --filter @actspace/tool-deep-search test`。

详细契约见 [DeepSeek 深度搜索与文档解析工具](../../../docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md)。
