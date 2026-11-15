# document

`@actspace/tool-document` 拥有 `read_document` 的工具定义、注册、权限契约和 lifecycle：用 DeepSeek OCR 读 PDF、Word、PowerPoint 的文字。

公开入口：`.`、`./manifest`、`./plugin`。

Host 端口为 `actspace.host.tools.document`（`DOCUMENT_HOST_PORT_ID`），是可选注入：没有端口时不注册工具，服务 `tools.document` 标明不可用；有端口时 `createPorts()` 构造 OCR 实现，`available()` 作为工具的可见性判断。`path` 和 `artifact_id` 恰好给一个由本包在调用端口前检查；按路径读时走文件读取审批，授权范围是本包自己的 `document-read`，和 `read_file` 互不通用。

详细契约见 [DeepSeek 深度搜索与文档解析工具](../../../docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md)。
