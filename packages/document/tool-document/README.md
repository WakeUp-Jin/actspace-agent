# document

`@actspace/tool-document` 拥有 `read_document` 的工具定义、注册、权限契约和 lifecycle：用 DeepSeek OCR 读 PDF、Word、PowerPoint 的文字。

公开入口：`.`、`./manifest`、`./plugin`。

Host 端口为 `actspace.host.tools.document`（`DOCUMENT_HOST_PORT_ID`），是可选注入：没有端口时不注册工具，服务 `tools.document` 标明不可用；有端口时 `createPorts()` 构造 OCR 实现，`available()` 作为工具的可见性判断。`path` 和 `artifact_id` 恰好给一个由本包在调用端口前检查；按路径读时走文件读取审批，授权范围是本包自己的 `document-read`，和 `read_file` 互不通用。

实现：

- `src/sniff.ts`：上传前的本机类型判断（PDF、DOCX、PPTX、DOC、PPT，设了密码的 OOXML）。
- `src/ocr-response.ts`：DeepSeek OCR 响应解析、失败码映射、页的整理（去标记、拆超长页）。
- `src/assemble.ts`：`pages` 参数、显示名、按 50,000 字符分页组装给模型的文本、摘要和 `document` 明细。
- `src/cache.ts`：`DocumentCache`，按字符数 LRU（默认 8,000,000），同时最多 2 份文档在读入和上传，同一份文档的并发调用共用一次加载。
- `src/node-ports.ts`：`createNodeDocumentPorts`，Host 用它构造端口；缓存由端口持有，`dispose()` 时清空。`plugin.ts` 不引用它。

测试：`pnpm --filter @actspace/tool-document test`（ZIP、OLE2 样本由 `src/test/bytes.ts` 在内存里拼，`src/test/fixtures/` 是自己造的占位文档的真实响应）。

详细契约见 [DeepSeek 深度搜索与文档解析工具](../../../docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md)。
