# PB：文档解析

状态：待审核，尚未开始（交互模式）。上级：[总览](README.md)。依赖：[P0](p0-foundation-and-settings.md)。和 [PA](pa-deep-search.md) 互不依赖；默认排在 PA 之后，共用 PA 建的 `tool-failure-text.ts` 和 mock 场景文件（PA 没做时在这里新建）。

## 目标

`read_document` 从空壳变成能用的工具：把 PDF、Word、PowerPoint 交给 DeepSeek OCR，按页返回 Markdown；设置里有开关；输入框能选文档；对话里文档显示成 `Read` 行。

完成后：

- 「工具」页「多媒体」组多一行「文档解析」，默认关。
- 开关打开且连接了 DeepSeek 后，从下一条消息起模型能调用 `read_document`，读工作区里的文档、审批后读工作区外的文档、读本会话的附件。
- 本机 Agent / Plan 的「+」在文档解析可用时变成「图片与文件」，能选 PDF、Word、PPT。
- 文档解析不可用时，一切和今天一样：模型按官方 Skill 用本机 Python 提取。

## 必读

- [设计文档](../../../design-docs/tool-system/agent-deep-search-and-document-parsing.md) 第 3.2、3.3、8、9.2、9.3、9.4、10 节。
- [demo](../../../design-docs/frontend/deep-search-and-document-demo.html) 第 4、5 节。
- `docs/design-docs/execution-safety/agent-tool-permission-model.md`、`docs/design-docs/tool-system/agent-tool-output-references.md`、`docs/design-docs/tool-system/agent-script-execution.md`。
- `docs/design-docs/frontend/front-新功能开发清单.md`、`front-视觉token规范.md`、`front-文案与状态表达规范.md`、`front-组件与交互模式规范.md`、`front-聊天输入框规范.md`、`front-中间消息区规范.md`、`front-设置页规范.md`；验收方式见 `docs/FRONTEND_VERIFICATION.md`。
- 照着写的现有代码：`packages/fs/tool-fs-read/src/node-ports.ts`（路径解析、按已准入资源复核）、`packages/llm/llm-pi-ai/src/deepseek-files.ts`（`multipart/form-data` 上传、并发调用共用一次请求）、`packages/image/tool-image-inspection/src/node-ports.ts`（读会话附件）、`apps/desktop/src/renderer/components/conversation/display-settings.ts`（renderer 里跟着设置变更刷新的共享值）。

## 契约

### OCR 请求

`POST https://api.deepseek.com/v1/tools/ocr`，请求头 `Authorization: Bearer <Key>`，`redirect: "error"`。请求体是 `FormData`，恰好两个字段：`purpose` = `text_recognition`；`file` = `new Blob([bytes])`，第三个参数是文件名。

响应体整个读成文本再 `JSON.parse`（前面的换行是合法的 JSON 空白）。**先看有没有 `error`，再取 `pages`**，不管状态码是多少。

错误的映射（`error.message` 按开头或包含匹配，大小写不敏感）：

| 情况 | 失败码 | `retryable` |
| --- | --- | --- |
| 401 | `DEEPSEEK_AUTH_FAILED` | 否 |
| 402 | `DEEPSEEK_INSUFFICIENT_BALANCE` | 否 |
| 429 | `DEEPSEEK_RATE_LIMITED` | 是 |
| 413，或消息含 `file is too large` | `DOCUMENT_TOO_LARGE` | 否 |
| 消息含 `password-protected` | `DOCUMENT_PASSWORD_PROTECTED` | 否 |
| 消息含 `more than 1000 pages` | `DOCUMENT_TOO_MANY_PAGES` | 否 |
| 消息以 `Failed to recognize the file` 开头（上一行之外的） | `DOCUMENT_PARSE_FAILED` | 否 |
| 408、504，消息含 `did not finish`，或本机 180 秒计时到了 | `DOCUMENT_TIMEOUT` | 否 |
| 其余：别的状态码、响应不是 JSON、`pages` 不是数组、网络错误 | `DOCUMENT_FAILED` | 500、503 和网络错误为是，其余否 |

失败消息是英文，脱敏后截到 500 个字符。

### Node 端口

```ts
// packages/document/tool-document/src/node-ports.ts
export type DocumentArtifactReader = (sessionId: string, artifactId: string) =>
  Promise<{ readonly bytes: Uint8Array; readonly mediaType: string; readonly fileName?: string }>;

export type NodeDocumentPortsOptions = {
  readonly workspaceRoot: string;
  readonly apiKey: () => string | undefined;      // 每次调用时读取
  readonly available: () => boolean;
  readonly readArtifact?: DocumentArtifactReader;  // 必须自己保证附件属于这个会话
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;                     // 默认 180_000
  readonly maxCacheChars?: number;                 // 默认 8_000_000
};
export function createNodeDocumentPorts(options: NodeDocumentPortsOptions): ToolPorts & { dispose(): Promise<void> };
```

一次调用的顺序（顺序本身是契约，测试要守住）：

1. `available()` 为假或读不到 Key → `DOCUMENT_UNAVAILABLE`。
2. 解析 `pages`（`"7"` 或 `"31-45"`，起点不大于终点，否则 `INVALID_ARGUMENTS`）。
3. 定位文件：
   - `path`：有 `context.admittedResources` 时按它复核规范路径（照 `read_file` 的 `recheckAdmittedFile`），否则要求路径在工作区内。然后 `stat`：不存在 → `FILE_NOT_FOUND`，不是普通文件 → `NOT_A_FILE`，大于 100 MiB → `DOCUMENT_TOO_LARGE`。文件名是模型给的路径的最后一段。缓存键是「规范路径 + 大小 + 修改时间」。
   - `artifact_id`：`readArtifact(context.sessionId, id)`。没有读取器或读取抛错 → `DOCUMENT_ARTIFACT_NOT_FOUND`。文件名是 `fileName`，没有时是 `attachment`。缓存键是「`artifact:` + ID」。
4. 上报一次进度，内容是文件名。
5. 查缓存。命中就跳到第 8 步。
6. 读字节（按路径读时在这里才读），做类型检查：不通过 → `DOCUMENT_UNSUPPORTED_FORMAT`，不发请求。
7. 上传。同一个缓存键已经有进行中的请求时，等那一个。成功后按页写进缓存。
8. 按 `pages` 取页，组装文本、摘要和明细。`pages` 的起点超过总页数 → `DOCUMENT_PAGES_OUT_OF_RANGE`；终点超过总页数时截到最后一页。

第 3 步在第 5 步之前，所以每次调用都先过权限复核或附件归属检查，再碰缓存。

中止：调用方中止时这次调用返回 `TOOL_ABORTED`，但已经发出的上传不取消，跑完后照常写进缓存。只有 `dispose()`（Harness 销毁）和 180 秒计时会取消请求。

### 类型检查

```ts
// packages/document/tool-document/src/sniff.ts
export type DocumentKind = "pdf" | "docx" | "pptx" | "doc" | "ppt";
export function sniffDocumentKind(bytes: Uint8Array): DocumentKind | undefined;
```

- PDF：文件以 `%PDF-` 开头。
- ZIP（以 `PK\x03\x04` 开头）：从文件末尾找中央目录结束记录，遍历中央目录的文件名；有 `word/document.xml` 是 `docx`，有 `ppt/presentation.xml` 是 `pptx`，都没有则不通过。不解压。
- OLE2（以 `D0 CF 11 E0 A1 B1 1A E1` 开头）：目录项是 128 字节一条、按 128 字节对齐的记录。从偏移 512 起每 128 字节看一次：名字（UTF-16LE，长度在偏移 64）等于 `WordDocument` 是 `doc`，等于 `PowerPoint Document` 是 `ppt`，并且类型字节（偏移 66）是 2。都没有则不通过。
- 文件名有扩展名时，扩展名（不分大小写）必须是 `.pdf`、`.doc`、`.docx`、`.ppt`、`.pptx` 之一；不要求和判断出的类型一致。

这是防止把不相干的文件发出去的检查，不是安全边界：构造出来的文件可以骗过它，后果只是 DeepSeek 返回「无法解析」。

读附件且没有文件名时，上传用的名字按判断出的类型取：`attachment.pdf`、`attachment.docx`、`attachment.pptx`、`attachment.doc`、`attachment.ppt`。

### 缓存

```ts
// packages/document/tool-document/src/page-cache.ts
export type CachedPage = { readonly text: string; readonly incomplete: boolean };
export class DocumentPageCache {
  constructor(maxChars: number);
  get(key: string): readonly CachedPage[] | undefined;   // 命中时刷新为最近使用
  set(key: string, pages: readonly CachedPage[]): void;  // 超出上限时从最久没用的淘汰；刚写入的这一份始终保留
  clear(): void;
}
```

进行中的请求另用一个 `Map<string, Promise<readonly CachedPage[]>>`，结束（成功或失败）时移除。失败的结果不进缓存。

每页文本进缓存前去掉 `<｜ref｜>…<｜/ref｜>` 的标记本身（保留里面的文字）和整段 `<｜box｜>…<｜/box｜>`。`finish_reason` 为 `length` 的页 `incomplete` 为真。`pages` 按 `index` 排序后使用。

### 返回的文本、摘要、明细

照设计文档第 8.4、8.6 节。实现成纯函数，放在 `packages/document/tool-document/src/render.ts`：

```ts
export function renderDocumentResult(input: {
  readonly fileName: string;
  readonly pages: readonly CachedPage[];
  readonly range?: { readonly from: number; readonly to: number };   // 1 起，含两端；没有时从第 1 页起
  readonly maxChars?: number;                                         // 默认 50_000
}): ToolBodyResult;
```

- 明细一块，标签 `document`：`{ name: string; pageCount: number; from: number; to: number; incompletePages: number[] }`。`incompletePages` 的范围和第三行说明一致：不带 `pages` 时是整份文档的，带 `pages` 时是本次返回范围内的。最多列 50 个。
- 工具自己判定的失败：摘要是文件名，明细是 `{ name }`。

### 附件文件名

- `apps/desktop/src/main/runtime-v2/artifact-store.ts`：`create()` 的输入加可选的 `fileName`；元数据类型加 `fileName?: string`；`parseMetadata` 在字段存在时要求它是字符串，不存在时照常通过；`readForSession` 的返回值加 `fileName?`；`copyForSession` 复制时带上它。写入前只留最后一段路径，截到 240 个字符。
- `importAttachment` 把 `basename(path)` 传进去。

### 行的投影

`ToolUiPreview` 的 `read` 和 `read` 消息块各加一个可选字段：

```ts
document?: { name: string; notice?: string };
```

`toolPreview` 里 `read_document` 的取值规则（实现放新文件 `packages/client/client/src/sessions/document-preview.ts`，`tool-card.ts` 只加一行分发）：

| 字段 | 来源 |
| --- | --- |
| `document.name`，同时写进 `filePath` | 按顺序取第一个有的：调用参数 `path` 的最后一段；完成后摘要里第一个 ` · ` 之前的部分；明细 `document.name`；运行中 `data.summary`（进度消息）；`attachment`。失败且摘要不是文件名（执行前就失败）时跳过摘要这一项 |
| `range`（行尾） | 完成且成功时，摘要里第一个 ` · ` 之后的部分，匹配 `^\d+ pages?$` 或 `^pages \d+(-\d+)?$` 才采用 |
| `resultPreview` | 模型输出去掉开头的说明行（`Document:`、`Showing pages`、`Pages recognized incompletely`）和 `--- Page n ---` 分隔行之后，取前 8 个非空行 |
| `document.notice` | 明细 `incompletePages`：1 到 5 页时「第 3、13 页识别不完整，内容已截断。」；超过 5 页时「有 N 页识别不完整，内容已截断。」；没有明细（延迟加载的行）时不设 |
| `displayText` | 成功时是摘要；失败时是 `documentFailureText(code, message)` |

`documentFailureText` 加在 `tool-failure-text.ts`，文字照设计文档第 8.7 节；`TOOL_SCOPE_DENIED` 和 `DOCUMENT_UNAVAILABLE` 同一句话。

## 任务

### PB.1 类型检查、OCR 请求、缓存、文本组装

- 新建 `sniff.ts`、`ocr-client.ts`、`page-cache.ts`、`render.ts`（都在 `packages/document/tool-document/src/`）。`ocr-client.ts` 导出：

```ts
export class DocumentOcrError extends Error { readonly code: string; readonly retryable: boolean }
export async function recognizeDocument(input: {
  readonly apiKey: string; readonly bytes: Uint8Array; readonly fileName: string;
  readonly fetchImpl: typeof fetch; readonly signal: AbortSignal;
}): Promise<readonly CachedPage[]>;
```

- 测试夹具在 `src/test/fixtures/`，都是测试里用代码生成的最小文件（不放真实文档）：只有文件头的 PDF、含 `word/document.xml` 的 ZIP、含 `ppt/presentation.xml` 的 ZIP、含 `xl/workbook.xml` 的 ZIP、空 ZIP、带 `WordDocument` 目录项的 OLE2、带 `Workbook` 目录项的 OLE2。
- 测试：
  - `sniff.test.ts`：上面每种夹具的结果；纯文本、PNG、截断的 ZIP（找不到中央目录）、中央目录偏移越界都不通过，也不抛错；扩展名规则。
  - `ocr-client.test.ts`：请求的网址、请求头、表单恰好两个字段、文件名；前面带换行的成功响应；状态码 200 加 `error` 对象；错误表每一行各一条（消息用官方文档里的原文）；Key 不出现在错误消息里。
  - `page-cache.test.ts`：命中刷新顺序；超出上限淘汰最久没用的；单独一份就超过上限时仍然保留；`clear()`。
  - `render.test.ts`：不带 `pages` 的第一行、第二行；按整页装到 50,000 字符；第一页自己超过上限时截断并说明；`pages` 的三种形式；起点越界失败、终点越界截到最后一页；识别不完整的页在两种调用下的列法；摘要的四种写法（`1 page`、`N pages`、`pages a-b`、`pages a`）；标记被去掉。

验证：`pnpm --filter @actspace/tool-document test`。

### PB.2 Node 端口

- 新建 `packages/document/tool-document/src/node-ports.ts`，实现「一次调用的顺序」。`src/index.ts` 加上导出。`plugin.ts` 不 import 它。
- 路径解析和已准入资源的复核照 `tool-fs-read` 写一份小的（约 20 行），不抽公共代码。
- 测试，`src/test/node-ports.test.ts`（临时目录里的真实文件加假 `fetch`）：
  - 顺序：不可用时不读文件、不发请求；类型检查不通过时不发请求；`pages` 不合法时不读文件。
  - 工作区内的路径直接读；工作区外的路径没有已准入资源时失败；有已准入资源但规范路径对不上（符号链接被换掉）时失败。
  - 第一次调用发一次请求，同一份文档第二次带 `pages` 的调用不发请求；文件改动（大小或修改时间变了）后重新请求。
  - 同一份文档的两个并发调用只发一次请求。
  - 调用方中止：这次调用返回 `TOOL_ABORTED`，`fetch` 收到的信号没有被中止；请求完成后再调用命中缓存。
  - `dispose()` 中止进行中的请求并清空缓存。
  - 附件：读取器拿到的是 `context.sessionId`；读取器抛错时返回 `DOCUMENT_ARTIFACT_NOT_FOUND`；会话 A 读过的附件，会话 B 用同一个 ID 调用时读取器先被调用并失败，读不到缓存。
  - 附件没有文件名时上传用 `attachment.pdf` 这类名字，行上的名字是 `attachment`。
  - 进度只上报一次，内容是文件名，不含目录。
  - 换 Key 后下一次请求用新 Key。

验证：`pnpm --filter @actspace/tool-document test`。

### PB.3 附件的文件名和媒体类型

- `apps/desktop/src/main/runtime-v2/artifact-store.ts`：见契约。
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`：`importAttachment` 传 `fileName`；`attachmentMediaType` 加四种：`.doc` → `application/msword`，`.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`，`.ppt` → `application/vnd.ms-powerpoint`，`.pptx` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`。
- 核对这四种类型不会让附件在别处被当成图片或文本处理：`fixed-renderer-ipc.ts` 的 `toRunContent`（Agent / Plan 里非图片文件仍然是一行 `Attached file: <名字> (<id>)`）、Chat 的文本附件读取、`reuseAttachment`。
- 测试：`apps/desktop/src/main/test/runtime-v2-artifact-store.test.ts` 加：写入带文件名、读回带文件名；旧元数据（没有这个字段）照常读；文件名不是字符串的元数据被拒绝；复制到子会话后文件名还在；文件名里的目录部分被去掉。`runtime-v2-chat-attachments.test.ts` 加四种扩展名的媒体类型，以及 Agent 模式下文档附件仍然是一行文字。

验证：`pnpm --filter @actspace/desktop test`。

### PB.4 Host 接线

- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`：`createDesktopToolHostServices` 的入参加 `readDocumentArtifact: DocumentArtifactReader`，由 `desktop-host-adapter.ts` 传 `(sessionId, artifactId) => artifacts.readForSession(sessionId, artifactId)`。加

```ts
[DOCUMENT_HOST_PORT_ID]: {
  available: () => options.modelRuntime.isDeepseekDocumentAvailable?.() === true,
  createPorts: () => createNodeDocumentPorts({
    workspaceRoot: options.workspaceRoot,
    available: () => options.modelRuntime.isDeepseekDocumentAvailable?.() === true,
    apiKey: () => options.modelRuntime.getDeepseekApiKey?.(),
    readArtifact: options.readDocumentArtifact,
  }),
},
```

- `packages/host/agent-host/src/node-ports/tool-host-services.ts`：`ACTSPACE_DEEPSEEK_DOCUMENT === "1"` 且有 `DEEPSEEK_API_KEY` 时可用；`readArtifact` 用现有的 `options.readArtifact`（没有文件名）。`createUnavailableToolHostServices` 不提供这个端口。
- `apps/desktop/package.json`、`packages/host/agent-host/package.json` 加依赖 `@actspace/tool-document`；重新生成构建图。
- 测试：
  - 新建 `apps/desktop/src/main/test/runtime-v2-document-port.test.ts`：开关或 Key 变化后 `available()` 跟着变；每次调用读当前 Key；附件读取走传入的读取器。
  - `packages/host/agent-host/src/test/` 加环境变量四种组合。
  - `packages/core/runtime/src/harness/default-harness.test.ts`：Host 给了端口且可用时，Plan、Agent 的可见工具里有 `read_document`，Chat 里没有；工作区外的路径触发文件读取审批，批准后执行；`read_file` 得到的会话授权不能让 `read_document` 免审批。

验证：`pnpm --filter @actspace/desktop test && pnpm --filter @actspace/agent-host test && pnpm --filter @actspace/runtime test && pnpm check:packages && pnpm check:desktop-build-graph`。

### PB.5 设置开关

- `apps/desktop/src/renderer/components/settings/sections/ToolsSection.tsx`：「多媒体」组里，现有工具行之后加一行。

| 项 | 内容 |
| --- | --- |
| 标题 | 文档解析 |
| 说明 | 有 Key：「文档将发送至 DeepSeek · ¥0.0015 / 页」 |
| 没有 Key | 行下面用 `InlineWarning` 写「尚未连接 DeepSeek，文档由本机 Python 提取。」；开关不置灰 |
| 开关显示为开 | `deepseekDocumentEnabled === true` |
| 置灰 | 设置还没加载、正在保存 |
| 保存 | `onUpdateNamespace({ namespace: "tools", patch: { deepseekDocumentEnabled } })` |

  「有 Key」的判断和 `SearchSettings.tsx` 里的 `hasDeepseekKey` 是同一个表达式；把它提成一个共用的小函数，两处都用。
- 测试：「工具」页现在没有单独的测试文件，新建 `apps/desktop/src/renderer/test/tools-section-document.test.tsx`：两种说明、没有 Key 时开关仍然能点、保存的补丁；`search-settings.test.tsx` 确认提出共用函数后行为不变。

验证：`pnpm --filter @actspace/desktop test`。

### PB.6 输入框「+」

- 新建 `apps/desktop/src/renderer/components/composer/document-parsing-available.ts`：照 `display-settings.ts` 的写法做一个模块级的共享值，导出 `useDocumentParsingAvailable(): boolean`。值是「`settingsApi.getV4()` 里 `tools.deepseekDocumentEnabled === true`」且「`settingsApi.get()` 里有 DeepSeek Key（PB.5 的共用函数）」。所有订阅者共用一次查询和一个 `eventsApi.settingsChanged` 监听；读取失败时保持上一次的值；缺省 `false`。存 Key、清 Key 都会触发设置变更通知，不用另加通知。
- 新建 `apps/desktop/src/renderer/components/composer/attachment-entry.ts`：

```ts
export type AttachmentPicker = "images" | "files" | "documents";
export function attachmentEntry(input: {
  readonly isChatForm: boolean; readonly isRemoteTarget: boolean;
  readonly targetAcceptsFiles: boolean; readonly documentParsingAvailable: boolean;
}): { readonly label: "图片与文件" | "图片"; readonly description?: string; readonly icon: "files" | "images"; readonly picker: AttachmentPicker };
```

| 情况 | 入口 | 说明 | 选择框 |
| --- | --- | --- | --- |
| Chat | 图片与文件 | PNG、JPEG、WEBP、GIF、TXT、Markdown、JSON、CSV | `files`（不变） |
| 远程目标 | 图片与文件 | 无 | `files`（不变） |
| 本机 Agent / Plan，文档解析可用 | 图片与文件 | PNG、JPEG、WEBP、GIF、PDF、Word、PPT | `documents` |
| 本机 Agent / Plan，文档解析不可用 | 图片 | 无 | `images`（不变） |

- `apps/desktop/src/renderer/components/Composer.tsx`（已超过 500 行）：`renderPanel()` 里现有的 `acceptsFiles` 那几行换成调用 `attachmentEntry`，不加别的逻辑。
- `apps/desktop/src/renderer/components/conversation/TurnPromptEditor.tsx`：第 112 行附近同样的判断换成 `attachmentEntry`。
- `apps/desktop/src/renderer/components/composer/ComposerAttachments.tsx`：加 `selectDocuments()`，调用 `dialogsApi.selectFiles({ documents: true })`。
- `packages/util/shared/src/desktop-bridge/contract.ts`：`selectFiles` 的入参类型加 `documents?: boolean`。
- `apps/desktop/src/main/ipc/guards.ts`：`selectFiles` 的形状加 `documents: "boolean?"`。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`：过滤器的选择现在内联在处理函数里，没有测试。提成新文件 `apps/desktop/src/main/runtime-v2/attachment-dialog-filters.ts` 里的纯函数 `attachmentDialogFilters(input)`，处理函数调用它。`documents === true` 时过滤器是 `{ name: "Images and documents", extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf", "doc", "docx", "ppt", "pptx"] }`。`remote` 优先于 `documents`；两个都没有时和今天一样。
- 拖拽不改。
- 测试：
  - 新建 `apps/desktop/src/renderer/test/attachment-entry.test.ts`：上表四行。
  - 新建 `apps/desktop/src/renderer/test/document-parsing-available.test.tsx`：开关和 Key 的四种组合；设置变更通知后刷新；读取失败保持原值；多个订阅者只查询一次。
  - `composer.test.tsx`、`turn-prompt-edit.test.tsx`：可用时入口文字和调用的选择框；不可用时和今天一样。
  - 新建 `apps/desktop/src/main/test/attachment-dialog-filters.test.ts`：三种入参的过滤器；`ipc-guards.test.ts` 的 `dialogs.selectFiles` 一行加 `{ documents: true }`（合法）和 `{ documents: "yes" }`（不合法）。

验证：`pnpm --filter @actspace/desktop test && pnpm check:ipc-channels && pnpm check:renderer-bridge`。

### PB.7 文档的 Read 行

- `packages/util/shared/src/session/tool-preview.ts`、`message-block.ts`：`read` 加 `document?`。
- `packages/util/shared/src/session-selectors.ts`：`read` 分支把 `document` 带过去。
- `packages/client/client/src/sessions/document-preview.ts`、`tool-failure-text.ts`：见契约。`tool-card.ts` 加一行分发。
- `packages/client/client/src/live/stream-blocks.ts`：`read` 分支把 `document` 带过去（`getStreamingReadText` 已经是 `Read <filePath>`，不用改）。
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`：`read` 分支在 `message.document` 存在时——不传 `onOpenFile`（名字不是链接）；有 `notice` 时作为展开内容的第一行，用警示色的 token。其余走现有的 `ResultPreviewBlock`。
- Web / PWA 不用改代码：`ExploreGroup` 已经显示 `Read <filePath> <range>`。加一条测试确认文档行显示的是文件名和页数。
- 等待审批的行不用改：`read_document` 的审批沿用现有的文件读取审批卡。核对审批卡拿到的是完整路径（来自权限资源，不是行上的文件名）。
- mock 场景：`apps/desktop/src/renderer/mock/scenarios/deepseek-tools.ts` 加文档的行——一条完成的（`report.pdf · 15 pages`，第 13 页识别不完整）、一条带 `pages` 的、一条读附件的、一条失败的（设有打开密码）。更新 `docs/FRONTEND_VERIFICATION.md` 里这个场景的说明。
- 测试：
  - `apps/desktop/src/main/test/runtime-v2-tool-preview.test.ts`：生命周期表加 `["read_document", "read"]`。
  - 新建 `packages/client/client/src/test/document-preview.test.ts`：文件名的五级取法各一条；运行中读附件靠进度消息显示名字；行尾的四种写法；摘要不合规时没有行尾；延迟加载的行（只有摘要）得到文件名和行尾；`notice` 的三种情况；说明行和分隔行不进 `resultPreview`；失败码各一条；执行前就失败时名字不取摘要。
  - `apps/desktop/src/renderer/test/` 加：文档行的名字不是按钮或链接；展开后第一行是提示；普通 `read` 行不受影响。

验证：`pnpm --filter @actspace/shared test && pnpm --filter @actspace/client test && pnpm --filter @actspace/desktop test && pnpm --filter @actspace/web test && pnpm check:frontend-tokens && pnpm check:frontend-theme`；`?mock=deepseek-tools` 浅色、深色、480px 各看一遍，对照 demo 第 4 节。

### PB.8 提示词和官方 Skill

模型看到 `read_document` 时应该先用它；看不到时照旧。

- `packages/context/prompt/src/core-contributors.ts`：`coreScripting` 里「Office and PDF files: …」那一行开头加一句 `When read_document is available, use it to read the text of PDF, Word and PowerPoint files; otherwise …`。这一节不能超过 10 行（现有测试守着），所以改这一行，不加行。Chat 模式没有这一节，不受影响。
- `packages/skill/official-skills/skills/pdf/SKILL.md`、`office-docx/SKILL.md`、`office-pptx/SKILL.md`：各在「读取」那一行或速查表前加一句「工具列表里有 `read_document` 时，读文字先用它（扫描件也能读）；这里的做法用于没有这个工具、要改文件、或要读表格数据的时候。」`pdf` 的速查表「OCR」一行改成「有 `read_document` 用它；没有就渲染成图后用 `inspect_image` 读」。
- `office-xlsx` 不改。
- 测试：
  - `packages/context/prompt/src/test/scripting.test.ts`：这一节包含 `read_document`，仍然不超过 10 行。
  - `packages/skill/official-skills/src/test/resources.test.ts`：三个 Skill 都提到 `read_document`；现有断言（`actspace-python`、`$ACTSPACE_SCRATCH`、许可证）仍然通过。

验证：`pnpm --filter @actspace/prompt test && pnpm --filter @actspace/official-skills test`。

### PB.9 文档、真实验收、history

文档：

- `docs/design-docs/frontend/front-聊天输入框规范.md`：「`+` 面板」和「附件」两节写上 PB.6 的表。
- `docs/design-docs/frontend/front-设置页规范.md`：第 7 节加这个开关。
- `docs/design-docs/frontend/front-中间消息区规范.md`：「工具行」一节加文档的 `Read` 行。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：`read_file` 一节后面加 `read_document` 一节。
- `docs/design-docs/tool-system/agent-script-execution.md`：第 113 行附近「PDF / Office 用随包库读」补上「`read_document` 可用时先用它」。
- `docs/design-docs/execution-safety/agent-tool-permission-model.md`：授权范围的说明里加 `read_document` 自己的范围，写明和 `read_file` 不共用。
- `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md`：`tool-document` 一行补上权限契约和 Host 端口的职责。
- `docs/design-docs/tool-system/agent-tool-output-references.md`：附件元数据多了可选的文件名。
- `docs/SECURITY.md`：数据外发的部分加一条「打开文档解析后，模型读的文档会整份发给 DeepSeek」。
- 设计文档：第 8 节和第 9.2、9.4 节改写成当前事实；第 13 节按真实验收的结果更新（尤其是 PPT、PPTX、DOC 是否能读）。
- `packages/document/README.md`、`packages/document/tool-document/README.md`：补上 `node-ports.ts`、缓存和测试命令。

真实验收（需要 Key；在真实应用里）。测试文档自己准备，不进仓库：一份文字版 PDF、一份扫描版 PDF、一份超过 50,000 字符的 PDF、DOCX、PPTX、DOC、PPT、一份设了打开密码的 PDF、一份 xlsx。

1. 没连接 DeepSeek 时打开开关：出现警示文字；发消息让模型读 PDF，模型用本机 Python。
2. 连接后不重启：让模型读工作区里的文字版 PDF 和扫描版 PDF，都调用 `read_document`，行是 `Read <文件名>`，行尾是页数。
3. 长 PDF：第一次调用后模型带 `pages` 继续读；DeepSeek 用量页里只多一次识别。
4. DOCX、PPTX、DOC、PPT 各读一次。读不了的格式：从类型检查、选择框的扩展名和界面文字里去掉，并更新设计文档。
5. 设了密码的 PDF、xlsx：分别得到「文件设有打开密码」和「只支持 PDF、Word 和 PPT 文件」；xlsx 没有发出请求。
6. 工作区外的 PDF：出现文件读取审批卡，卡上是完整路径；选「本次会话都允许」后再读同目录的另一份不再询问；`read_file` 读同一个目录仍然要审批。
7. 「+」里选一份 PDF 发送：模型用附件 ID 调用 `read_document`，行上是原文件名。
8. 关掉开关：「+」变回「图片」；同一个会话里模型不再调用 `read_document`。
9. 读一份大文档时点停止：行变成 `aborted`；等十几秒再让模型读同一份，不再发请求。
10. 重启应用后打开这个会话：历史里的行和行尾都在。
11. 录屏或截图存进执行记录。

收尾：

- `docs/histories/2026-11/` 新增一条；执行记录写完 `execution-process.md` 和 `execution-summary.md`。
- 全部完成后：`pnpm run ci`、`pnpm build`；设计文档标题去掉「目标设计，未实现」；在 Electron 里对照 demo 复验后删掉 demo，更新 `docs/design-docs/frontend/README.md` 的 demo 清单；计划目录移到 `completed/`，更新 `docs/exec-plans/README.md`。

验证：总览「统一验证命令」的两组。

## 完成标准

- 两组验证命令全部通过，和基线相比没有新增失败。
- 真实验收 11 步通过；没有 Key 时，执行摘要里写明哪几步没有验证。
- 开关关着时，发给模型的工具列表、输入框和 P0 完成时一样。
- `rg "sk-[A-Za-z0-9]{8,}"` 在仓库里没有命中；夹具和执行记录里没有 Key，也没有真实文档。

## 回退

关掉设置开关即可停用。要撤代码：回退 PB 的提交。附件元数据里的 `fileName` 是可选字段，旧版本读到会忽略；新增的四种媒体类型只影响回退之前导入的附件，旧版本把它们当普通文件处理。
