# filesystem-search

`@actspace/tool-fs-search` 拥有 grep、glob 的工具定义、注册和 lifecycle。

公开入口：`.`、`./manifest`、`./plugin`。

文件实现在本包 `node-ports.ts`，随 Harness 产物打包；Host 只通过可选的能力授予 `actspace.host.filesystem`（`@actspace/tool-runtime` 的 `FilesystemHostGrant`）给根目录和 artifact 解析，没有授予时工具注册但报告能力不可用。

详细契约见 [Tool 插件边界](../../../docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)。
