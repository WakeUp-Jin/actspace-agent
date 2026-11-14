# PB：文档解析

状态：待审核，尚未开始（交互模式）。上级：[总览](README.md)。依赖：[P0](p0-foundation-and-settings.md)。和 [PA](pa-deep-search.md) 互不依赖，默认排在 PA 之后；PA 新建、这里往里加的几个文件，任务里都写了先做 PB 时怎么办。

## 目标

`read_document` 从空壳变成能用的工具：把 PDF、Word、PPT 上传给 DeepSeek OCR，按页放进缓存，分页把 Markdown 交给模型；设置里有开关；输入框「+」能选文档；对话里复用 `Read` 行。

完成后：

- 「工具」页「多媒体」组多一行「文档解析」，默认关。
- 开关打开且连接了 DeepSeek 后，从下一条消息起 Plan、Agent 里的模型能调用 `read_document`；关掉后从下一次模型请求起消失，模型按官方 Skill 用本机 Python 提取。
- 本机 Agent / Plan 的「+」在文档解析可用时变成「图片与文件」，能选 PDF、Word、PPT。
- 对话里的行是 `Read 报告.pdf`，完成后行尾是 `2 pages` 或 `pages 31-45`，展开是解析出的开头几行。
- 同一份文档翻页不再请求、不再计费。缓存在内存里，应用重启或 Harness 重新装配后清空。

## 必读

- [设计文档](../../../design-docs/tool-system/agent-deep-search-and-document-parsing.md) 第 3.2、3.3、5、6、8、9.2、9.3、9.4、10、13 节。
- [demo](../../../design-docs/frontend/deep-search-and-document-demo.html) 第 4、5 节。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`、`docs/design-docs/execution-safety/agent-tool-permission-model.md`、`docs/design-docs/tool-system/agent-tool-output-references.md`、`docs/design-docs/tool-system/agent-script-execution.md`。
- `docs/design-docs/frontend/front-新功能开发清单.md`、`front-视觉token规范.md`、`front-文案与状态表达规范.md`、`front-组件与交互模式规范.md`、`front-中间消息区规范.md`、`front-设置页规范.md`、`front-聊天输入框规范.md`；验收方式见 `docs/FRONTEND_VERIFICATION.md`。
- `docs/coding-standards/perf-memory-conventions.md`：行的投影在每次会话投影的路径上。
- 照着写的现有代码：
  - `packages/fs/tool-fs-read/src/node-ports.ts`：按已准入的资源复核路径、先 `open` 再用同一个句柄 `stat` 和读、读取失败的映射。
  - `packages/web/tool-web/src/node-ports.ts`：注入 `fetch`、合并中止信号、失败结果、错误信息脱敏。
  - `packages/llm/llm-pi-ai/src/deepseek-files.ts`：`multipart/form-data` 上传。
  - `packages/image/tool-image-inspection/src/node-ports.ts`：按会话读附件。
  - `apps/desktop/src/renderer/components/conversation/display-settings.ts`：跟着设置变更通知刷新的模块级订阅。

## 契约

设计文档第 8 节是真源。这里只写实现时需要定死、而设计文档没有写到这么细的部分；两边不一致时先改设计文档。

### 一次调用的顺序

1. 执行时 `available()` 为假，或读不到 Key：失败，不读任何东西。
2. 解析 `pages`：`"7"` 是第 7 页，`"31-45"` 是第 31 到 45 页；格式不对或起点大于终点时 `INVALID_ARGUMENTS`。
3. 找到文件，得到显示名和缓存键（见「文件从哪来」）。
4. 上报一次进度，内容是显示名。
5. 查缓存。命中就跳到第 8 步。
6. 做本机检查里不用读完整文件的几步：大小、扩展名、文件头（见「本机检查」）。不通过就失败。
7. 加载：同一个键已经在加载时，等那一次的结果；否则排队，轮到之后读进整个文件、判断具体类型、上传、解析响应、整理页、写进缓存（见「OCR 请求」「页的整理」「缓存、并发、中止」）。
8. 按 `pages` 和字符上限取页，组装文本、摘要和明细。

### 文件从哪来

| | `path` | `artifact_id` |
| --- | --- | --- |
| 第 3 步 | 路径规则照 `read_file`：`context.admittedResources` 里有文件资源时，`canonicalizeFileResource` 的结果必须和它的 `canonicalPath`、`targetKind` 相同；没有时只允许 `realpath` 之后仍在工作区内的路径。然后 `open`，用同一个句柄 `stat` | `readArtifact(context.sessionId, artifact_id)`，读到全部字节。抛错，或 Host 没给读取器：`DOCUMENT_ARTIFACT_NOT_FOUND` |
| 显示名 | 模型给的路径去掉结尾的分隔符后的最后一段（按 `/` 和 `\` 切） | 附件元数据里的 `fileName`，没有就是 `attachment` |
| 缓存键 | `path:` + 规范路径 + `stat` 的大小 + `mtimeMs` | `artifact:` + artifact ID |
| 第 6 步 | 用第 3 步的句柄读前 1,024 字节，然后关闭句柄。排队期间不占着句柄 | 字节已经在内存里，直接做完整的类型判断 |
| 第 7 步轮到之后 | 再复核一次路径，重新 `open`、`stat`；大小或修改时间和缓存键里的不一样时失败（`IO_ERROR`，消息说明文件在读取期间变了）；读进整个文件，关闭句柄 | 用第 3 步读到的字节 |

- 每次调用都会走到第 3 步，包括命中缓存的调用：按路径读靠它过路径复核，读附件靠它检查归属（读取器只返回本会话自己的附件）。权限检查由运行时在调用端口之前做。
- 显示名里的控制字符换成空格，最长 255 个字符，空了就用 `attachment`。
- 路径复核和读取失败的映射照 `read_file`：`ENOENT` → `FILE_NOT_FOUND`，`EISDIR` 或不是普通文件 → `NOT_A_FILE`，其余（包括路径越界、准入之后路径变了）→ `IO_ERROR`。这几个小函数复制到本包里，不从 `tool-fs-read` 引入（总览「范围」里写了不抽公共代码）。

### 本机检查

按顺序做，任何一步不通过都不上传：

1. 大小不超过 100 MiB（104,857,600 字节）。按路径读时用 `stat` 的大小判断，不用先读文件。
2. 显示名有扩展名时，扩展名（不分大小写）必须是 `.pdf`、`.doc`、`.docx`、`.ppt`、`.pptx` 之一。
3. 看前 1,024 字节，判断大类：里面出现 `%PDF-` 是 PDF；以 `PK\x03\x04` 开头是 ZIP；以 `D0 CF 11 E0 A1 B1 1A E1` 开头是 OLE2。都不是就失败。
4. 整个文件读进内存之后，判断具体类型：

| 大类 | 做法 | 结果 |
| --- | --- | --- |
| PDF | 不再检查 | `pdf` |
| ZIP | 在文件末尾 65,557 字节里找结束记录（`PK\x05\x06`），按它给的偏移和条数遍历中央目录（`PK\x01\x02`），只读文件名。名字比较不分大小写 | 必须有 `[Content_Types].xml`；另外有以 `word/` 开头的条目是 `docx`，有以 `ppt/` 开头的条目是 `pptx`（两种都有时按 `docx`）；其余不支持。结束记录找不到、偏移越界、条数或偏移是 ZIP64 占位值，都按不支持 |
| OLE2 | 不解析扇区链，从偏移 512 起每 128 字节当作一个目录项来看（目录项总是落在 128 字节的整数倍上）：名字是 UTF-16LE，`+64` 处是名字的字节数（含结尾的 0），`+66` 处的类型为 2（流）。三样都对上才算 | 有 `WordDocument` 是 `doc`；有 `PowerPoint Document` 是 `ppt`；两种都没有但有 `EncryptedPackage`，是设了打开密码的 docx / pptx / xlsx，返回 `DOCUMENT_PASSWORD_PROTECTED`；其余不支持 |

- 不要求扩展名和判断出的类型一致。
- 不支持 ZIP64：100 MiB 以内的文档用不到它。个别工具会给小文件也强制写 ZIP64 的结束记录，这种文件会被当成不支持，模型改用本机 Python 读。
- 老格式 DOC、PPT 自带的加密和设了密码的 PDF 本机认不出来，由 DeepSeek 返回的错误消息识别。
- PDF 的判断比设计文档原来写的「以 `%PDF` 开头」宽：PDF 阅读器都接受文件头前面有少量杂字节。DOCX、PPTX 的判断不要求主文档叫 `word/document.xml`、`ppt/presentation.xml`：有些工具生成的文件主文档是别的名字。

### OCR 请求

- `POST https://api.deepseek.com/v1/tools/ocr`，请求头 `Authorization: Bearer <Key>`，`redirect: "error"`。
- 请求体是 `FormData`，只有两个字段：`purpose` = `text_recognition`；`file` = `new Blob([bytes], { type })`，带文件名。`type` 按判断出的类型给：`application/pdf`、`application/msword`、`application/vnd.openxmlformats-officedocument.wordprocessingml.document`、`application/vnd.ms-powerpoint`、`application/vnd.openxmlformats-officedocument.presentationml.presentation`。
- 上传用的文件名：显示名的扩展名是五种之一时原样用；否则在后面补上判断出的类型的扩展名（`report` → `report.pdf`，`attachment` → `attachment.docx`）。
- Key 在调用 `fetch` 之前从 `apiKey()` 读。
- 只有一个计时：从调用 `fetch` 起 190 秒。服务端自己的上限是 180 秒，多等 10 秒是为了让服务端的结论先到。不设空闲超时，识别期间服务端只发换行符。排队和读文件的时间不算在内。
- 响应体整个读成文本再 `JSON.parse`。开头的换行符是 JSON 允许的空白，不用另外处理。
- 工具自己不重试。

### 失败

从上到下第一条命中的生效。`error.message` 的规则对「状态码 200、响应体是错误对象」和「状态码不是 200、响应体里带 `error.message`」两种情况都适用，比较时不分大小写。

| 情况 | 失败码 | `retryable` |
| --- | --- | --- |
| 执行时 `available()` 为假，或读不到 Key | `DOCUMENT_UNAVAILABLE` | 否 |
| `pages` 格式不对或起点大于终点 | `INVALID_ARGUMENTS` | 否 |
| 附件读不到或不属于本会话 | `DOCUMENT_ARTIFACT_NOT_FOUND` | 否 |
| 路径不存在；不是普通文件；其余读取错误 | `FILE_NOT_FOUND`；`NOT_A_FILE`；`IO_ERROR` | 否 |
| 本机检查：超过 100 MiB | `DOCUMENT_TOO_LARGE` | 否 |
| 本机检查：扩展名或内容不是五种之一 | `DOCUMENT_UNSUPPORTED_FORMAT` | 否 |
| 本机检查：OLE2 里有 `EncryptedPackage` | `DOCUMENT_PASSWORD_PROTECTED` | 否 |
| 401 | `DEEPSEEK_AUTH_FAILED` | 否 |
| 402 | `DEEPSEEK_INSUFFICIENT_BALANCE` | 否 |
| 429 | `DEEPSEEK_RATE_LIMITED` | 是 |
| `error.message` 含 `password-protected` | `DOCUMENT_PASSWORD_PROTECTED` | 否 |
| `error.message` 含 `more than 1000 pages` | `DOCUMENT_TOO_MANY_PAGES` | 否 |
| `error.message` 含 `too large`；或 413 | `DOCUMENT_TOO_LARGE` | 否 |
| `error.message` 含 `did not finish` | `DOCUMENT_TIMEOUT` | 否 |
| `error.message` 以 `Failed to recognize the file` 开头 | `DOCUMENT_PARSE_FAILED` | 否 |
| 408、504 | `DOCUMENT_TIMEOUT` | 是 |
| 本机的 190 秒计时到了 | `DOCUMENT_TIMEOUT` | 否 |
| 状态码 2xx，`pages` 是空数组 | `DOCUMENT_PARSE_FAILED` | 否 |
| `error.message` 含 `temporarily unavailable` 或是 `Internal Server Error`；状态码 500 及以上；网络错误 | `DOCUMENT_FAILED` | 是 |
| 其余：别的状态码、2xx 但响应体不是 JSON 或没有 `pages` 数组、认不出的 `error.message` | `DOCUMENT_FAILED` | 否 |
| 取到页之后，`pages` 的起点大于总页数 | `DOCUMENT_PAGES_OUT_OF_RANGE` | 否 |

- `more than 1000 pages` 那一行必须排在 `Failed to recognize the file` 前面：官方的消息是 `Failed to recognize the file: the document has more than 1000 pages`。
- 识别超时（`did not finish`）不标可重试：重试会重新排队，而且多半还是超时。408、504 是上传阶段的超时，标可重试。
- 调用方中止（`context.signal`）时返回失败码 `TOOL_ABORTED`，写法和 `inspect_image` 一致，运行时把它记成 `aborted`。什么时候取消请求见「缓存、并发、中止」。
- 失败消息是英文，给模型看，要说明下一步能做什么。例如 `DOCUMENT_UNSUPPORTED_FORMAT`：`read_document only reads PDF, Word (.doc, .docx) and PowerPoint (.ppt, .pptx) files. Use read_file for text and code, a script for spreadsheets, inspect_image for images.`；`DOCUMENT_ARTIFACT_NOT_FOUND`：`No attachment with this id in this session. Ask the user to attach the file again or give its path.`；`DOCUMENT_PAGES_OUT_OF_RANGE`：`The document has <N> pages.`
- 消息经 `tool-web` 里 `safeError` 那样的脱敏（去掉 `Bearer …`、`api-key …`）。DeepSeek 返回的消息截到 500 个字符。Key 不出现在结果、进度和错误消息里。
- 失败不进缓存。

### 页的整理

响应通过上面的检查之后：

1. 按 `index` 升序排。有哪一页的 `index` 不是整数，或者有重复，就保持数组原来的顺序。总页数用 `pages` 的长度，不用 `page_count`。
2. 每页的 `text` 不是字符串时当作空字符串。
3. 去标记：`<｜box｜>…<｜/box｜>` 连同里面的坐标整段删掉；`<｜ref｜>`、`<｜/ref｜>` 只删标记，保留中间的文字。只认官方文档里写的这两种全角竖线的写法，不删别的尖括号内容。`text_recognition` 正常不带这些标记，这一步是防御。
4. `finish_reason` 为 `length` 的页记为「识别不完整」。其余取值都算完整。
5. 拆超长页：整理后超过 50,000 个字符的页，按行贪心地拆成每份不超过 50,000 个字符的连续几页；单独一行就超过上限时在 50,000 处硬切，不切开代理对。「识别不完整」的标记留在拆出来的最后一份上。

拆页之后的页数才是工具对外说的总页数 N。为什么要拆：一次调用最多返回 50,000 个字符，一页超过这个数时，不拆的话它后面的内容永远读不到。逐页识别的页实测每页几千个字符，到不了这个数；不含图片的 Word、PPT 由 DeepSeek 直接提取文字，官方没有说明这时怎么分页，长文档有可能整份只算一两页（PB.1 第 2 项实测）。这一条替换设计文档第 8.4 节原来的「只返回它的前 50,000 字符并说明」。

字符数按 JavaScript 字符串的 `length` 算，和 `web_fetch` 的 50,000 同一个口径。

### 交给模型的文本

```text
Document: <显示名> (<N> pages)
Showing pages <a>-<b> of <N>. To continue, call read_document again with pages "<b+1>-<N>".
Pages recognized incompletely: 13, 27.
Long pages were split; page numbers here are positions in this output, not the document's own page numbers.

--- Page <a> ---
<这一页的 Markdown>

--- Page <a+1> ---
…
```

- 取页：从起点开始按整页装，各页正文的字符数之和不超过 50,000（说明行和分页标记不算）。每页都不超过 50,000，所以至少能装一页。没有 `pages` 时起点是 1、终点是 N；`pages` 的终点大于 N 时按 N 算。
- 第一行：N 为 1 时写 `(1 page)`。
- 第二行：返回的不是整份文档时才有。`a` 等于 `b` 时写 `Showing page <a> of <N>.`。后半句只在 `b < N` 时出现。
- 第三行：有识别不完整的页时才有。不带 `pages` 的调用列整份文档里的，带 `pages` 的调用只列本次返回范围内的。最多列 50 个页码，再多写 `and <k> more`。
- 第四行：这份文档有页被拆开过时才有。
- 没有文字的页，正文写 `(no text on this page)`。

### 摘要、进度、明细

照设计文档第 8.6 节。

- 进度：只上报一次，`context.reportProgress({ message: <显示名> })`。
- 摘要：不带 `pages` 完成是 `<显示名> · <N> pages`（N 为 1 时 `1 page`）；带 `pages` 完成是 `<显示名> · pages <a>-<b>`（只有一页时 `pages <a>`）；端口返回的失败（包括中止）是 `<显示名>`，显示名还不知道时是失败消息。
- 明细一块，标签 `document`：

```ts
// 完成
{ fileName: string; pageCount: number; range: { from: number; to: number }; incompletePages: number[]; incompletePageCount: number }
// 端口返回的失败，且显示名已知
{ fileName: string }
```

  `incompletePages` 的范围和第三行相同，最多 20 个；`incompletePageCount` 是这个范围里的总数。
- 不上报 `actspace.context.file` 明细。

### 缓存、并发、中止

照设计文档第 8.5 节，另外定下这几条：

- 缓存由端口持有。同一棵 Harness 里的所有会话共用一个端口，所以缓存跨会话共享；Harness 重新装配时旧端口被 `dispose()`，缓存跟着清空。
- 缓存里每份文档只存整理后的页、「识别不完整」的页码、「有没有拆过页」和字符数。不存显示名（附件的名字以每次读到的元数据为准）。
- 上限 8,000,000 个字符。写入新的一份时从最久没用的开始淘汰，刚写入的这一份不淘汰。命中时挪到最近使用。
- 同一个键正在加载时，后来的调用等同一次加载，不再读文件、不再上传。
- **同时最多 2 份文档在读入和上传**，其余按先后排队。一份文档上传时在内存里占大约两倍文件大小，这条把峰值限制在 400 MiB 左右。排队的加载不占文件句柄。
- 一次加载由端口持有，不属于哪一次调用。每个调用方各自拿它和自己的中止信号赛跑：
  - 调用方中止：这次调用立刻返回 `TOOL_ABORTED`。
  - 加载还没调用 `fetch`（在排队或读文件），而且已经没有调用方在等：取消这次加载，什么都不发出去。
  - 已经调用了 `fetch`：不取消，结果照常写进缓存。DeepSeek 收完文件后不会因为断开而停止识别，也照常计费。
  - `dispose()`：取消所有加载，包括已经发出的请求；清空缓存。

### 行的投影

复用 `read` 这一种预览和消息块，各加一个可选字段：

```ts
// packages/util/shared/src/session/tool-preview.ts
/** read_document 的行才有。有它时行上显示 name，不显示 filePath。 */
export type DocumentReadInfo = { name: string; stats?: string; warning?: string; errorText?: string };
// ToolUiPreview 的 read 分支加 document?: DocumentReadInfo
```

`packages/util/shared/src/session/message-block.ts` 的 `read` 块加同一个字段。

`toolPreview` 里 `read_document` 的取值规则：

| 字段 | 来源 |
| --- | --- |
| `filePath` | 调用参数 `path` 经 `displayPath`；没有时（读附件，或历史里被延迟加载的行）是空字符串。只有等待审批的卡片用它显示完整路径 |
| `document.name` | 按顺序取第一个有的：① 调用参数 `path` 的最后一段，切法和端口相同；② 完成且摘要匹配 `^(.+) · (\d+ pages?\|pages \d+(-\d+)?)$` 时的第 1 组；③ 明细 `document` 里的 `fileName`；④ `phase === "running"` 时的 `data.summary`（实时通道把进度消息放在这里）；⑤ `attachment` |
| `document.stats` | 完成且摘要匹配上面的正则时的第 2 组，否则不设 |
| `displayText` | 运行中是 `Read <name>`；结束后是摘要 |
| `resultPreview` | 完成时：从交给模型的文本里去掉第一个 `--- Page n ---` 之前的所有行和所有 `--- Page n ---` 行，再取前 8 个非空行，每行最多 240 个字符，和 `read_file` 同一规则 |
| `document.warning` | 完成且明细里 `incompletePageCount` 大于 0：1 到 5 页时「第 3、13 页识别不完整，内容已截断。」，超过 5 页时「有 N 页识别不完整，内容已截断。」 |
| `document.errorText` | 结束，状态不是完成也不是 `aborted`：`documentFailureText(code, message)` |
| `range` | 不设 |

- 不用 `tool.argsSummary` 里的 `path`：它经过脱敏，绝对路径会变成 `[PATH]`。
- 文档的结果通常超过 24,000 字节，历史里的行大多是延迟加载的：没有调用参数、没有明细、没有正文，只有摘要。这时名字和统计都来自摘要，`warning` 和 `resultPreview` 在展开、加载完明细之后才有。失败的结果很小，不会被延迟加载。
- 摘要经过运行时和投影层现有的脱敏，文件名长得像密钥（`sk-…`）时会显示成 `[REDACTED]`。不为此加特例。

`documentFailureText(code, message)` 放在 `packages/client/client/src/sessions/tool-failure-text.ts`（PA.6 新建的文件；先做 PB 时由 PB 新建）：

| 失败码 | 文字 |
| --- | --- |
| `DOCUMENT_UNAVAILABLE`、`TOOL_SCOPE_DENIED` | 文档解析已关闭或 DeepSeek 未连接。 |
| `DOCUMENT_UNSUPPORTED_FORMAT` | 只支持 PDF、Word 和 PPT 文件。 |
| `DOCUMENT_TOO_LARGE` | 文件超过 100 MB，DeepSeek 不接受。 |
| `DOCUMENT_PASSWORD_PROTECTED` | 文件设有打开密码，无法解析。去掉密码后再试。 |
| `DOCUMENT_TOO_MANY_PAGES` | 文档超过 1,000 页，DeepSeek 不接受。 |
| `DOCUMENT_PARSE_FAILED` | DeepSeek 无法解析这个文件。 |
| `DOCUMENT_TIMEOUT` | DeepSeek 在 180 秒内没有完成解析。 |
| `DEEPSEEK_AUTH_FAILED` | DeepSeek API Key 无效或已被删除。 |
| `DEEPSEEK_INSUFFICIENT_BALANCE` | DeepSeek 账户余额不足，文档没有解析。 |
| `DEEPSEEK_RATE_LIMITED` | DeepSeek 请求过于频繁，稍后再试。 |
| 其余 | 失败消息原文 |

`TOOL_SCOPE_DENIED` 和 `DOCUMENT_UNAVAILABLE` 是同一句话：主 Agent 里，调用发出后工具被隐藏，运行时给的就是这个码。

## 任务

### PB.1 用真实接口核对

需要 `DEEPSEEK_API_KEY`。脚本放仓库外的临时目录，只从环境变量读 Key。测试文件自己造（用 `actspace-python` 的 `python-docx`、`python-pptx`、`pypdf` 生成，内容是无意义的占位文字），不用真实文档。

核对并记录：

1. PPTX（带图片的、只有文字的各一份）、老格式 PPT、老格式 DOC：能不能读，返回几页，耗时。老格式文件本机造不出来时，这一项记成「未验证」。
2. 只有文字的长 DOCX（约 60 页）：返回几页，每页多少字符。用来确认「页的整理」里拆页的前提。
3. 设了打开密码的 PDF 和老格式 DOC：状态码和 `error.message` 原文。设了密码的 DOCX 本机就拦下，不用传。
4. 一页内容很密的扫描件：有没有 `finish_reason: "length"`，文本在哪里断。
5. 扫描版 PDF 用 `text_recognition`：文本里有没有 `<｜ref｜>`、`<｜box｜>`。同一个文件用 `rich_layout_recognition` 再跑一次，看 `<｜ref｜>` 里包的是正文还是块的类型名。
6. 错的 Key、改了扩展名的 xlsx、文件头前面有 16 个杂字节的 PDF：状态码、响应体的形状。
7. 响应是不是以换行符开头，`response.text()` 之后能不能直接 `JSON.parse`；响应头的 `content-type`。

把 2 到 3 份响应存成测试夹具 `packages/document/tool-document/src/test/fixtures/*.json`（内容是自己造的占位文字，不含请求头）。结论写进执行过程记录，不贴原始响应。

回退规则：

- 第 1 项里读不了的格式：从支持的扩展名和类型判断里去掉，同步改界面文字（「只支持 PDF、Word 和 PPT 文件。」、输入框的说明、「读文档」插件的说明）、工具失败消息和设计文档第 8.2、13 节。工具定义里的说明文字要改时，`definitionVersion` 仍是 1（这个版本还没有发布过）。
- 第 2 项：直接提取出来的文档不管分几页，拆页规则都适用，不用改。
- 第 3、6 项的消息和「失败」表对不上：改表，并改设计文档第 3.2 节。
- 第 5 项，`<｜ref｜>` 里是块的类型名：`<｜ref｜>…<｜/ref｜>` 也整段删掉。
- 第 6 项，带杂字节的 PDF 被拒绝：本机判断不改（放过去的后果只是多一次 `DOCUMENT_PARSE_FAILED`），记进执行过程。
- 没有 Key：按本文的写法实现，夹具按官方文档手写，执行摘要里把 PB.1 标成「未验证」。

验证：执行过程记录里有七项结论。

### PB.2 纯函数：类型判断、响应解析、分页组装

都不碰网络和文件系统，放在 `packages/document/tool-document/src/`：

- `sniff.ts`：

```ts
export type DocumentType = "pdf" | "docx" | "pptx" | "doc" | "ppt";
export const DOCUMENT_TYPES: Readonly<Record<DocumentType, { readonly extension: string; readonly mediaType: string }>>;
/** 没有扩展名时返回 undefined。 */
export function hasSupportedExtension(name: string): boolean | undefined;
/** 只看前 1,024 字节。 */
export function sniffHead(head: Uint8Array): "pdf" | "zip" | "ole2" | undefined;
export function sniffDocument(bytes: Uint8Array): DocumentType | "encrypted" | undefined;
```

- `ocr-response.ts`：

```ts
export type ParsedDocument = { readonly pages: readonly string[]; readonly incomplete: readonly number[]; readonly split: boolean; readonly chars: number };
export type DocumentFailure = { readonly code: string; readonly message: string; readonly retryable: boolean };
export type DocumentLoadResult = { readonly ok: true; readonly document: ParsedDocument } | { readonly ok: false; readonly failure: DocumentFailure };
export function parseOcrResponse(status: number, bodyText: string): DocumentLoadResult;
```

  `incomplete` 里是从 1 开始的页码，升序。

- `assemble.ts`：

```ts
export type PageRange = { readonly from: number; readonly to: number };
/** 没有给 pages 时返回 undefined；格式不对或起点大于终点时返回 "invalid"。 */
export function parsePagesArg(value: unknown): PageRange | "invalid" | undefined;
export function displayName(value: string | undefined): string;
export function readPages(input: { readonly document: ParsedDocument; readonly fileName: string; readonly pages?: PageRange }): ToolBodyResult;
export function failedResult(failure: DocumentFailure, fileName?: string): ToolBodyResult;
```

- 测试，`src/test/sniff.test.ts`、`ocr-response.test.ts`、`assemble.test.ts`。ZIP 和 OLE2 的样本在测试里用小函数拼出字节（`src/test/bytes.ts`），不提交二进制文件：
  - `sniff`：`%PDF-` 在开头、在第 1,000 字节处、在 1,024 字节之后；DOCX、PPTX、XLSX、普通 ZIP；主文档不叫 `word/document.xml` 的 DOCX；有 `word/` 条目但没有 `[Content_Types].xml` 的 ZIP 不支持；同时有 `word/` 和 `ppt/` 条目时是 `docx`；条目名大小写不同；带注释的结束记录；结束记录缺失、偏移越界、ZIP64 占位值；DOC、PPT、XLS；只有 `EncryptedPackage` 的 OLE2 是 `encrypted`，同时有 `WordDocument` 时是 `doc`；名字对但类型不是流的目录项不算；纯文本、空文件、只有 3 个字节的文件。
  - 扩展名：五种各一条、大写、没有扩展名、`.xlsx`、`.pdf.exe`。
  - `parseOcrResponse`：夹具回放；开头有换行符；`index` 乱序、重复、缺失；`text` 不是字符串；`page_count` 和 `pages` 的长度不一致；两种标记的清理（标记跨行、一页里多处、别的尖括号内容不动）；`length`；「失败」表里从 401 到 `DOCUMENT_FAILED` 的每一行各一条，包括「状态码 200、响应体是错误对象」和「状态码 400、带同样的消息」两种形状；`more than 1000 pages` 不会被判成 `DOCUMENT_PARSE_FAILED`；DeepSeek 的长消息被截到 500 个字符；消息里的 `Bearer …` 被去掉。
  - 拆页：一页 120,000 个字符拆成 3 页；刚好 50,000 不拆；单独一行 70,000 个字符硬切；切点落在代理对中间时往前挪一位；`length` 的标记在最后一份上；`split` 为真；拆完之后各页拼起来等于原文。
  - `parsePagesArg`：`"7"`、`"31-45"`、`"45-31"`、`"0"`、`"a-b"`、数字、没有给。
  - `displayName`：正斜杠和反斜杠的路径、结尾带分隔符、控制字符换成空格、超过 255 个字符被截断、空字符串和没有给时是 `attachment`。
  - `readPages`：整份装得下时没有第二行；装不下时第二行带后半句、摘要是 `<N> pages`；带 `pages` 时摘要是实际返回的范围、单页时 `pages <a>`；终点超过 N 时按 N 算且第二行没有后半句；起点超过 N 时 `DOCUMENT_PAGES_OUT_OF_RANGE`，消息里有 N；第三行两种范围、超过 50 个时 `and <k> more`；第四行；没有文字的页；`1 page`；明细里 `incompletePages` 最多 20 个而 `incompletePageCount` 是实际数；返回的各页正文之和不超过 50,000。
  - `failedResult`：有显示名时摘要是显示名、明细是 `{ fileName }`；没有时摘要是消息、没有明细。

验证：`pnpm --filter @actspace/tool-document test`。

### PB.3 缓存与并发

- 新建 `packages/document/tool-document/src/cache.ts`：

```ts
export type LoadControl = { readonly signal: AbortSignal; readonly startUpload: () => void };
export class DocumentCache {
  constructor(options?: { readonly maxChars?: number; readonly maxLoads?: number });   // 默认 8_000_000 和 2
  get(key: string): ParsedDocument | undefined;
  /** 同一个键正在加载时等那一次；否则排队执行 job。只有 ok 的结果进缓存。callerSignal 中止时得到 TOOL_ABORTED 的失败结果。 */
  load(key: string, callerSignal: AbortSignal, job: (control: LoadControl) => Promise<DocumentLoadResult>): Promise<DocumentLoadResult>;
  dispose(): void;
}
```

  `job` 在调用 `fetch` 之前先调 `control.startUpload()`；`control.signal` 在「没有调用方在等且还没 `startUpload`」和 `dispose()` 两种情况下中止。
- 测试，`src/test/cache.test.ts`（用可控的 Promise，不用真实计时）：
  - 命中后挪到最近使用；超过上限时淘汰最久没用的；一份文档自己就超过上限时仍然保留，再写入第二份时它被淘汰。
  - 同一个键并发两次 `load`，`job` 只执行一次，两边拿到同一个结果。
  - `job` 返回失败时两边都收到同一个失败，缓存里没有这个键，下一次 `load` 重新执行。`job` 抛错时两边都被拒绝，名额被释放。
  - 三个不同的键同时 `load`：只有两个 `job` 在跑，第一个结束后第三个才开始；顺序是先来先跑。
  - 排队时调用方中止：`job` 没有执行，名额不被占用。
  - 一个调用方中止、另一个还在等：`control.signal` 没有中止，另一个拿到结果。
  - 所有调用方都中止、还没 `startUpload`：`control.signal` 中止，缓存里没有这个键。
  - 所有调用方都中止、已经 `startUpload`：`control.signal` 不中止，`job` 完成后结果在缓存里。
  - `dispose()`：正在跑的 `job` 的 `control.signal` 中止，排队的不再执行，缓存清空，之后的 `load` 直接得到 `TOOL_ABORTED`。

验证：`pnpm --filter @actspace/tool-document test`。

### PB.4 Node 端口

- 新建 `packages/document/tool-document/src/node-ports.ts`：

```ts
export type DocumentArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string; readonly fileName?: string }>;
export type NodeDocumentPortsOptions = {
  readonly apiKey: () => string | undefined;   // 每次调用时读取
  readonly available: () => boolean;
  readonly workspaceRoot: string;              // context.workspaceRoot 为空时用它
  readonly readArtifact?: DocumentArtifactReader;
  readonly fetchImpl?: typeof fetch;
  readonly totalTimeoutMs?: number;            // 默认 190_000，测试里改小
  readonly maxBytes?: number;                  // 默认 104_857_600，测试里改小
};
export function createNodeDocumentPorts(options: NodeDocumentPortsOptions): ToolPorts;   // read_document 和 dispose
```

- 实现「一次调用的顺序」。每个 `await` 之后看一眼 `context.signal`，已中止就返回 `TOOL_ABORTED`。
- 文件句柄都在 `finally` 里关。
- `fetch` 的信号是 `AbortSignal.any([control.signal, AbortSignal.timeout(totalTimeoutMs)])`，和 `context.signal` 无关。
- `src/index.ts` 加上 `export * from "./node-ports.js"`。`plugin.ts` 不 import 它。
- `packages/document/tool-document/README.md`：补上 `node-ports.ts`、缓存和测试命令。
- 测试，`src/test/node-ports.test.ts`（假 `fetch`、临时目录里的真实文件、假的附件读取器）：
  - 请求的网址、方法、请求头；`FormData` 里只有 `purpose` 和 `file` 两个字段，`file` 的文件名和类型符合契约；显示名没有扩展名时上传名补上了扩展名。
  - Key 不出现在任何结果、进度或错误消息里。两次调用之间换 Key，第二次用新 Key；Key 变空时返回 `DOCUMENT_UNAVAILABLE` 且没有发请求，也没有读文件。
  - `available()` 为假时不发请求。
  - 本机检查的每一种失败都没有调用 `fetch`：超过上限（把 `maxBytes` 改小）、扩展名不对、内容不对、设了密码的 DOCX。
  - 路径：工作区内的相对路径和绝对路径；`admittedResources` 和实际路径不一致时 `IO_ERROR`；没有 `admittedResources` 且路径在工作区外时 `IO_ERROR`；不存在的路径、目录。
  - 排队期间文件被改了（大小变了）：轮到之后得到 `IO_ERROR`，没有调用 `fetch`。
  - 附件：读取器拿到的是 `context.sessionId`；读取器抛错、没有读取器时 `DOCUMENT_ARTIFACT_NOT_FOUND`；有 `fileName` 时显示名用它，没有时是 `attachment`；每次调用都调了读取器，包括命中缓存的那次；会话 A 读过的附件，会话 B 用同一个 ID 调用时读取器先被调用并失败，拿不到缓存里的内容。
  - 缓存：同一份文件读两次只发一次请求；改了文件内容（大小或修改时间变了）之后重新发；两个会话读同一个路径共用缓存。
  - 成功路径：进度只上报一次且内容是显示名；摘要、明细、文本符合契约；没有 `actspace.context.file` 明细。
  - 「失败」表里 HTTP 那几行各一条走完整路径；`fetch` 抛网络错误时 `DOCUMENT_FAILED`；190 秒计时（测试里改小）到了时 `DOCUMENT_TIMEOUT`。
  - 中止：读文件之前中止，没有调用 `fetch`；`fetch` 已经发出后中止，这次调用返回 `TOOL_ABORTED`，`fetch` 收到的信号没有中止，请求完成后再读同一份文件不发请求。
  - `dispose()`：`fetch` 收到的信号被中止；之后的调用返回 `TOOL_ABORTED`。

验证：`pnpm --filter @actspace/tool-document test`。

### PB.5 Host 接线与授权范围

- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`：加

```ts
[DOCUMENT_HOST_PORT_ID]: {
  available: () => options.modelRuntime.isDeepseekDocumentAvailable?.() === true,
  createPorts: () => createNodeDocumentPorts({
    available: () => options.modelRuntime.isDeepseekDocumentAvailable?.() === true,
    apiKey: () => options.modelRuntime.getDeepseekApiKey?.(),
    workspaceRoot: options.workspaceRoot,
    readArtifact: options.readArtifact,
  }),
},
```

  `readArtifact` 选项的类型换成 `DocumentArtifactReader`。它比图片分析用的 `SessionArtifactReader` 只多一个可选的 `fileName`，图片分析照常用。
- 授权范围：桌面端只信任列在 `trustedGrantAudiences` 里的范围，不在里面的工具，审批卡上没有「本会话允许」，已有的会话授权也不会对它生效。把 `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts` 第 152 行附近的集合挪到新文件 `apps/desktop/src/main/runtime-v2/trusted-grant-audiences.ts`，导出 `DESKTOP_TRUSTED_GRANT_AUDIENCES`，加上 `"actspace.document\u0000document-read\u00001"`。
- `packages/host/agent-host/src/node-ports/tool-host-services.ts`：`createNodeToolHostServices` 里，`ACTSPACE_DEEPSEEK_DOCUMENT === "1"` 且有 `DEEPSEEK_API_KEY` 时 `available` 为真，Key 取环境变量，`readArtifact` 和 `workspaceRoot` 用现有的选项。`createUnavailableToolHostServices` 不提供这个端口。这里的两个附件存储都不带文件名，按 `artifact_id` 读到的显示名是 `attachment`；agent-host 没有登记受信任的授权范围，`read_document` 和那里的文件工具一样没有「本会话允许」。这两点都是现有限制，不在这次范围里。
- `apps/desktop/package.json`、`packages/host/agent-host/package.json` 加依赖 `@actspace/tool-document`；按总览「统一验证命令」重新生成构建图。
- 测试：
  - 新建 `apps/desktop/src/main/test/runtime-v2-document-port.test.ts`：开关或 Key 变化后 `available()` 立刻跟着变；端口每次调用读当前 Key；`modelRuntime` 没有这几个可选成员时 `available()` 为假；`DESKTOP_TRUSTED_GRANT_AUDIENCES` 正好是原来的四个加上文档这一个。
  - `packages/host/agent-host/src/test/` 加一条：两个环境变量四种组合下 `available()` 的值。
  - `packages/document/tool-document/src/test/` 新建 `permission.test.ts`（运行时环境的搭法照 `packages/core/tool-runtime/src/test/runtime.test.ts` 里会话授权那一条）：范围受信任时，工作区外的 `path`（放在临时目录里）触发审批，带精确路径和所在目录两条授权建议；按所在目录授权之后，同目录的第二份文档不再询问；发给 `actspace.filesystem-read` 的会话授权不让 `read_document` 通过；`artifact_id` 的调用不触发审批。
  - `packages/core/runtime/src/harness/default-harness.test.ts` 加一条：Host 提供 `actspace.host.tools.document` 且可用时，Plan、Agent 的可见工具里有 `read_document`，Chat 里没有；用真实的 `createNodeDocumentPorts`（假 `fetch`）跑通一次调用；不可用时三个模式都没有，Run 能正常启动。
  - `packages/subagent/subagent/src/test/preset.test.ts`（PA.4 新建的文件；先做 PB 时由 PB 新建）加 `subagentToolNames` 的两条：父级允许 `read_document` 时 `general` 预设有它，`explore` 预设没有；它不在已注册名单里（被隐藏）时两个预设都没有。

验证：`pnpm --filter @actspace/desktop test && pnpm --filter @actspace/agent-host test && pnpm --filter @actspace/runtime test && pnpm --filter @actspace/subagent test && pnpm --filter @actspace/tool-document test && pnpm check:packages && pnpm check:desktop-build-graph`。

### PB.6 附件的文件名和媒体类型

- `apps/desktop/src/main/runtime-v2/artifact-store.ts`：
  - `ArtifactMetadata` 和 `create` 的入参加可选的 `fileName`。写入前清理：去掉控制字符，最长 240 个字符，空了就不写这个字段。
  - `parseMetadata`：`fileName` 存在时必须是非空字符串，否则当作没有，不让读取失败。旧附件没有这个字段，照常能读。
  - `readForSession` 的返回值带上 `fileName`（有的话）。`copyForSession` 复制时带上。
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`：
  - `importAttachment` 调 `create` 时传 `fileName: basename(path)`。
  - `attachmentMediaType` 挪到新文件 `apps/desktop/src/main/runtime-v2/attachment-media-type.ts` 并导出（`runtime-registry.ts` 已经 845 行，不再往里加），补四种：`.doc` → `application/msword`，`.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`，`.ppt` → `application/vnd.ms-powerpoint`，`.pptx` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`。
- 附件导入的 20 MiB 上限、`Attached file: <名字> (<id>)` 这一行文字、Chat 的附件路径都不改。
- 新增的四种媒体类型只改变新导入的文档附件存下来的类型（今天这四种扩展名存成 `text/plain`），不改变附件怎么交给模型：
  - Chat 用自己的 `chatAttachmentMediaType`，不经过 `attachmentMediaType`，Office 和 PDF 在 Chat 里照旧被拒绝。
  - Agent / Plan 里 `fixed-renderer-ipc.ts` 的 `toRunContent` 按附件的 `kind` 分支，不看媒体类型；文档是 `kind: "file"`，仍然是一行 `Attached file: <名字> (<id>)`，模型靠这一行拿到 `artifact_id`。
  - `reuseAttachment` 只在 Chat 里解码文本内容。
  - `read_document` 读附件时按内容判断类型，不看存下来的媒体类型，所以这次改动之前导入的文档附件（存成 `text/plain`）也能读。
- 测试：
  - `apps/desktop/src/main/test/runtime-v2-artifact-store.test.ts`：带 `fileName` 创建后 `readForSession` 能读回；没有 `fileName` 的旧元数据照常读；元数据里 `fileName` 是数字或空字符串时当作没有；控制字符被去掉、超长被截断；`copyForSession` 带着名字；另一个会话读不到。
  - 新建 `apps/desktop/src/main/test/attachment-media-type.test.ts`：原有的每种扩展名和新增的四种，大小写不敏感，未知扩展名仍是 `text/plain`。
  - `apps/desktop/src/main/test/runtime-v2-run-references-ipc.test.ts` 加一条：Agent 模式下 `kind: "file"` 的 PDF 附件，发给模型的内容里是一行 `Attached file: <名字> (<id>)`。
  - `apps/desktop/src/main/test/runtime-v2-chat-attachments.test.ts` 现有的「Chat 拒绝 Office / PDF」用例不改就能通过。

验证：`pnpm --filter @actspace/desktop test`。

### PB.7 设置开关

- 新建 `apps/desktop/src/renderer/components/settings/deepseek-key.ts`：`hasDeepseekKey(settings)`，就是 `SearchSettings.tsx` 里现有的那个表达式（`settings.searchProviders.deepseek?.hasApiKey === true || settings.providers.deepseek.hasApiKey`）。`SearchSettings.tsx` 改成调用它；PB.8 也用它。
- `apps/desktop/src/renderer/components/settings/sections/ToolsSection.tsx`：「多媒体」组里，现有两行后面加一行。

| 项 | 内容 |
| --- | --- |
| 标题 | 文档解析 |
| 说明 | 有 Key：「文档将发送至 DeepSeek · ¥0.0015 / 页」；没有 Key：`InlineWarning`「尚未连接 DeepSeek，文档由本机 Python 提取。」 |
| 开关显示为开 | `settingsV4?.settings.tools.deepseekDocumentEnabled === true`，不看有没有 Key |
| 置灰 | 只在设置不可写时（`!tools.v4Writable`），和「显示写入变动」一样。没有 Key 时不置灰 |
| 保存 | `writeToolsPatch({ deepseekDocumentEnabled: next }, () => undefined, "document parsing settings")` |

  行的写法照同组的 `renderToolRow`（`SettingRow tight`）。这一行不是「停用工具」列表里的一项，不走 `tools.setToolEnabled`。
- 测试，`apps/desktop/src/renderer/test/settings-page.test.tsx`：两种说明文字；没有 Key 时开关仍然能点；点击后保存的补丁；设置不可写时置灰；这一行排在「图片分析」后面。`search-settings.test.tsx` 现有用例不改就能通过（确认换成 `hasDeepseekKey` 之后行为没变）。

验证：`pnpm --filter @actspace/desktop test`。

### PB.8 输入框「+」

- 新建 `apps/desktop/src/renderer/components/composer/attachment-entry.ts`：
  - `useDocumentParsingAvailable(): boolean`。模块级的值加 `useSyncExternalStore`，写法照 `display-settings.ts`：第一个订阅者挂上 `eventsApi.settingsChanged` 并读一次，最后一个订阅者卸载时撤掉。每次刷新并行读 `settingsApi.get()` 和 `settingsApi.getV4()`（有没有 Key 只在前者里），值是 `tools.deepseekDocumentEnabled === true && hasDeepseekKey(settings)`。读取失败时保持上一次的值，初始值是 `false`。
  - `attachmentEntry(input)`，纯函数，从上到下第一条命中的生效：

| 条件 | 名字 | 说明 | 图标 | 打开哪个选择框 |
| --- | --- | --- | --- | --- |
| Chat | 图片与文件 | PNG、JPEG、WEBP、GIF、TXT、Markdown、JSON、CSV | `files` | `files` |
| 目标能接受文件（远程） | 图片与文件 | 无 | `files` | `files` |
| 本机目标，且文档解析可用 | 图片与文件 | PNG、JPEG、WEBP、GIF、PDF、Word、PPT | `files` | `documents` |
| 其余 | 图片 | 无 | `images` | `images` |

  前两行和最后一行就是今天 `Composer.tsx` 里的行为，只是挪了地方。
- `apps/desktop/src/renderer/components/Composer.tsx`（507 行）、`apps/desktop/src/renderer/components/conversation/TurnPromptEditor.tsx`：各调一次 `useDocumentParsingAvailable()` 和 `attachmentEntry()`，用返回值替换现有的 `acceptsFiles` 三元表达式。`TurnPromptEditor.tsx` 的按钮文字在「图片」时是「添加图片」，其余是「添加图片或文件」。不加别的逻辑。
- `apps/desktop/src/renderer/components/composer/ComposerAttachments.tsx`：`selectFiles` 加一个参数 `kind: "files" | "documents" = "files"`，`"documents"` 时调 `dialogsApi.selectFiles({ documents: true })`。
- `packages/util/shared/src/desktop-bridge/contract.ts`：`dialogs.selectFiles` 的入参加可选的 `documents?: boolean`。`apps/desktop/src/main/ipc/guards.ts`：这个通道的校验加 `documents: "boolean?"`。
- 新建 `apps/desktop/src/main/runtime-v2/attachment-dialog-filters.ts`：`attachmentDialogFilters(input)` 返回文件选择框的过滤器。`remote` 为真时是任意文件（和今天一样，优先）；`documents` 为真时是 `png、jpg、jpeg、webp、gif、pdf、doc、docx、ppt、pptx`；都不是时是今天 Chat 的那一组。`fixed-renderer-ipc.ts`（868 行）里 `dialogs.selectFiles` 的处理函数改成调用它，别的不动。选回来的文档和今天拖进来的文件一样是 `kind: "file"`。
- 拖放、粘贴、Chat、远程目标都不改。mock（`apps/desktop/src/renderer/mock/handlers.ts`）不看入参，不用改。
- 测试：
  - 新建 `apps/desktop/src/renderer/test/attachment-entry.test.tsx`：表里四行各一条；hook 的初始值是 `false`，开关开且有 Key 时为真，只满足一个条件时为假；触发 `settingsChanged` 之后跟着变；读取失败时保持原值；最后一个订阅者卸载后撤掉了监听。
  - `apps/desktop/src/renderer/test/composer-palette.test.tsx` 或 `composer.test.tsx`：本机 Agent 里文档解析可用时入口是「图片与文件」加新的说明，点击后调的是 `selectFiles({ documents: true })`；不可用时仍是「图片」。`turn-prompt-edit.test.tsx` 加一条按钮文字。
  - `apps/desktop/src/renderer/test/composer-attachments.test.tsx`：`selectFiles("documents")` 传的入参；选回来的 PDF 出现在附件里。
  - `apps/desktop/src/main/test/ipc-guards.test.ts`：`dialogs.selectFiles` 的合法入参加 `{ documents: true }`，非法入参加 `{ documents: "yes" }`。
  - 新建 `apps/desktop/src/main/test/attachment-dialog-filters.test.ts`：三种入参各一条，`remote` 和 `documents` 同时为真时按 `remote`。
  - `apps/desktop/src/renderer/test/desktop-bridge-contract-types.test.ts`：跟着契约改。

验证：`pnpm --filter @actspace/shared test && pnpm --filter @actspace/desktop test && pnpm check:renderer-bridge && pnpm check:ipc-channels`。

### PB.9 共享类型与行的投影

- `packages/util/shared/src/session/tool-preview.ts`、`message-block.ts`：按「行的投影」加 `DocumentReadInfo` 和 `document` 字段。
- `packages/util/shared/src/session-selectors.ts`（674 行）：`messageBlockFromToolPreview` 的 `case "read"` 里加一行，把 `preview.document` 搬到消息块上。
- `packages/client/client/src/sessions/tool-failure-text.ts`：加 `documentFailureText`。
- 新建 `packages/client/client/src/sessions/document-preview.ts`，实现「行的投影」的规则。入参都是 `tool-card.ts` 已经算好的值，这个文件不反过来引用 `tool-card.ts`：

```ts
export function documentPreview(input: {
  readonly path?: string;                                   // 调用参数 path
  readonly displayPath: (path: string) => string;
  readonly phase: "streaming" | "prepared" | "running" | "finished";
  readonly state?: string;                                  // 结果状态
  readonly summary: string;
  readonly progress?: string;                               // data.summary
  readonly output: string;                                  // 交给模型的文本
  readonly detail: unknown;                                 // 标签为 document 的明细
  readonly failureCode?: string;
  readonly failureMessage?: string;
}): Extract<ToolUiPreview, { kind: "read" }>;
```

  `tool-card.ts` 里只加一行分发：`if (localName === "read_document") return documentPreview({ … })`，放在 `read_file` 那一行后面。
- `packages/client/client/src/live/stream-blocks.ts`（512 行）：`getStreamingReadText` 里的目标改成 `preview.document?.name ?? preview.filePath`；`toolEntryToBlock` 的 `read` 分支加一行 `document: tool.preview.document`。
- 测试：
  - `apps/desktop/src/main/test/runtime-v2-tool-preview.test.ts`：生命周期表里加 `["read_document", "read"]`。
  - 新建 `packages/client/client/src/test/document-preview.test.ts`（经 `toolPreview` 调用，写法照同目录的 `directory-preview.test.ts`）：
    - 名字的五个来源各一条，以及它们的先后；Windows 写法的路径；文件名里带 ` · ` 时摘要仍然拆对。
    - 运行中：有 `path` 时是 `Read <最后一段>`；读附件、进度消息到了之后是 `Read <进度里的名字>`，到之前是 `Read attachment`。
    - 完成：`2 pages`、`1 page`、`pages 31-45`、`pages 7` 四种统计；摘要不匹配时没有统计。
    - `resultPreview` 不含 `Document:`、`Showing pages`、`Pages recognized incompletely`、`Long pages were split` 和 `--- Page n ---` 这几种行；最多 8 行，每行最多 240 个字符。
    - `warning`：1 页、3 页、6 页三种写法；没有明细时不设。
    - 失败：「失败码到文字」表里每一行各一条，加一条未知码；`denied`；执行前的失败（`INVALID_ARGUMENTS`）显示消息原文；中止时没有 `errorText`。
    - 延迟加载的行（没有调用参数、没有明细、没有正文，只有摘要和 `tool.argsSummary`）：得到名字和统计，`filePath` 是空字符串，没有用 `argsSummary` 里的 `[PATH]`。
    - `filePath`：工作区内是相对路径，工作区外是绝对路径。
    - 同一份预览经 `toolEntryToBlock`（实时）和 `createMessageBlocks`（持久化）得到的 `read` 块都带着 `document`；实时块运行中的文字是 `Read <name>`。
    - `read_file` 的预览没有 `document` 字段（确认没有影响原来的行）。
  - `packages/util/shared/src/test/session-selectors.test.ts`：带 `document` 的 `read` 预览恢复成消息块后字段还在；不带的和今天一样。

验证：`pnpm --filter @actspace/shared test && pnpm --filter @actspace/client test && pnpm --filter @actspace/desktop test`。

### PB.10 桌面端的行、Web / PWA 的单行、mock 场景

桌面端，`apps/desktop/src/renderer/components/messages/ToolLogLine.tsx` 的 `read` 分支，`message.document` 存在时：

| 状态 | 样子 |
| --- | --- |
| 等待审批 | 不变：现有的 `FileReadApprovalLine`，卡上是 `message.filePath`（完整路径） |
| 运行中 | `Read <document.name>`，共享流光 |
| 完成 | `ToolSummary`：动作 `Read`、目标是 `document.name`、行尾是 `document.stats`。文件名不是链接：不传 `onOpenFile` |
| 展开 | `resultPreview` 的几行；有 `document.warning` 时它是第一行，用警示色，可以换行。只有 `warning` 没有预览行时也能展开 |
| 失败、`denied` | 行尾是 `getToolFailureLabel(status)`；展开是 `document.errorText` |
| 中止 | 行尾 `aborted`，不能展开 |
| 延迟加载的行 | 不变：没有预览行但有 `onExpand` 时能展开，第一次展开时加载，由现有的 `DeferredToolMessage` 负责 |

- `ResultPreviewBlock` 加一个可选的 `warning?: string`，渲染成展开列表里的第一项 `<li className="tool-result-item is-warning">`。
- `apps/desktop/src/renderer/styles/tool-result.css`：加 `.tool-result-item.is-warning`，颜色 `var(--color-warning)`，允许换行。只用现有的主题 token。
- `message.document` 不存在时，`read` 分支的行为一个字都不变。
- 测试，`apps/desktop/src/renderer/test/tool-result-failures.test.tsx` 加失败的几条；新建 `apps/desktop/src/renderer/test/document-read-line.test.tsx`：上表每个状态一条；完成的行里没有可点击的文件名（没有打开文件的按钮）；`warning` 是展开后的第一项且带 `is-warning`；文件名里的 HTML 作为文本出现；等待审批时卡上是完整路径；`deferred-tool-message.test.tsx` 加一条文档行的延迟加载（加载后出现预览行和 `warning`）；普通 `read_file` 的行文件名仍然能点。

Web / PWA：

- `apps/web/src/pages/session/blocks/ExploreGroup.tsx`：`exploreLine` 的 `case "read"`，目标改成 `block.document?.name ?? block.filePath`，行尾在有 `block.document` 时用 `block.document.stats`，否则仍是 `block.range`。
- 测试：`apps/web/src/pages/session/test/ExploreGroup.test.tsx`（PA.7 没建的话新建）加两条 `exploreLine`：完成的文档行、带页码范围的文档行；普通 `read` 行不变。

mock 场景：

- `apps/desktop/src/renderer/mock/scenarios/deepseek-tools.ts`（PA.7 新建并登记的场景；先做 PB 时由 PB 新建并在 `scenarios/index.ts` 登记为 `deepseek-tools`，同时在 `docs/FRONTEND_VERIFICATION.md` 的场景表里加一行）加一个会话，内容照 demo 第 4 节：带附件的用户消息；读附件 2 页的完成行；124 页的长文档先 `124 pages`，再 `pages 31-45`、`pages 46-60`；带「第 13 页识别不完整，内容已截断。」的一行；设了密码的失败行；超过 1,000 页的失败行。场景表里这一行已经有了的话，把文档的行补进它的说明。

验证：`pnpm --filter @actspace/desktop test && pnpm --filter @actspace/web test && pnpm check:frontend-tokens && pnpm check:frontend-theme`；`pnpm --filter @actspace/desktop dev:renderer` 打开 `?mock=deepseek-tools`，浅色、深色、480px 窄宽各看一遍，对照 demo 第 4 节。

### PB.11 提示词与三个官方 Skill

提示词里的文字不跟着开关变，写成「工具在列表里时」的条件句。这样切换开关只让工具列表变一次，系统提示词不变。

- `packages/context/prompt/src/core-contributors.ts` 的 `coreScripting`：只改 `Office and PDF files` 那一行，不加行。改成先说 `read_document`，再说原来的做法：

```text
- Office and PDF files: when read_document is in your tool list, use it to read text from PDF, Word and PowerPoint files (it also reads scans); otherwise, and for spreadsheets, convert with markitdown when the data extension is installed or read with python-docx / openpyxl / pypdf. To see a page's layout render it with pypdfium2 and inspect_image. Data analysis needs the data extension (numpy, pandas); when it is not installed, say so and point the user to 设置 › 扩展 › 插件 › 命令行.
```

- `packages/skill/official-skills/skills/pdf/SKILL.md`，三处：
  - 「速查」表前面加一行：「工具列表里有 `read_document` 时，读文字（包括扫描件）先用它，按页返回 Markdown；没有这个工具时按下表。合并、拆分、填表单、提取表格数据仍然按下表。」
  - 「速查」表「OCR」那一行现在写的是「本机没有」。改成：有 `read_document` 时用它；没有时渲染成图后用 `inspect_image` 读。「要可搜索 PDF 就说明做不到」那半句留着。
  - 「看版面」一节里「扫描件没有文本层时只能走这条路」那句改成：有 `read_document` 时先用它读文字，没有时走这条路；要看版面仍然渲染成图。
- `packages/skill/official-skills/skills/office-docx/SKILL.md`、`office-pptx/SKILL.md`：路线表「读取内容」那一行，路线的开头加「工具列表里有 `read_document` 时先用它（老格式 `.doc` / `.ppt` 也能读）；否则」，后面是原来的文字。PB.1 里老格式读不了时去掉括号里那句。
- `office-xlsx`、`data-analysis` 两个 Skill 不改：表格不走 OCR。
- 测试：
  - `packages/context/prompt/src/test/scripting.test.ts`：这一段仍然不超过 10 行；包含 `read_document`；原有的断言不变。有提示词快照的测试跟着更新，逐个看 diff。
  - `packages/skill/official-skills/src/test/resources.test.ts`：`pdf`、`office-docx`、`office-pptx` 三份都包含 `read_document`；原有的断言不变。

验证：`pnpm --filter @actspace/prompt test && pnpm --filter @actspace/official-skills test`。

### PB.12 文档、真实验收、history

文档：

- `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md`：第 37 行附近「Desktop 仅信任这三个 audience」改成当前事实（Bash、文件读、文件搜索、文件写、文档五个），写明 `actspace.document` 的 `permissionDomain` 是 `document-read`，和 `read_file` 的授权互不通用。包表里 P0 加的 `@actspace/tool-document` 那一行，核对工具名和 Host 端口与实际一致。
- `docs/design-docs/tool-system/agent-tool-output-references.md`：补两句。附件元数据多了可选的文件名（旧元数据没有这一项，照常读）；文档附件由 `read_document` 按 `artifact_id` 读取，归属校验和现有的 artifact 读取是同一套，不给模型文件路径。
- `docs/design-docs/execution-safety/agent-tool-permission-model.md`：所有权表加 `packages/document/tool-document` 一行；「可以共享」那一组规则后面补一句 `read_document` 用自己的授权范围，不和 `read_file`、`grep`、`glob` 共享。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：`read_file` 一节后面新增 `read_document` 一节（`kind: "read"` 加 `document` 字段；名字和统计的来源；延迟加载时用什么；不能点开）。
- `docs/design-docs/frontend/front-中间消息区规范.md`：「工具行」一节的表里加文档的 `Read` 行，写明文件名不是链接、警示行的写法。
- `docs/design-docs/frontend/front-设置页规范.md`：第 7 节「多媒体」一行补上「文档解析」和它的两种说明。
- `docs/design-docs/frontend/front-聊天输入框规范.md`：`+` 面板和「附件」一节：入口的四种情况；附件表加一行「图片与文件」本机 Agent / Plan（文档解析可用时）及其可选类型。
- `docs/design-docs/tool-system/agent-script-execution.md`：第 7 行那段背景后面补一句现在另有可选的 `read_document` 并链接到设计文档；第 113 行附近「PDF / Office 用随包库读」改成和新提示词一致。
- `docs/design-docs/tool-system/agent-web-tools.md`：环境变量那一段加 `ACTSPACE_DEEPSEEK_DOCUMENT`。
- `docs/SECURITY.md`：在图片分析那两条后面加一条：文档解析打开后，`read_document` 会把文档的全部字节和文件名发给 DeepSeek；本机先检查类型，不是 PDF、Word、PPT 的文件不发；工作区外的路径要审批；Key 只在主进程；解析结果只在内存缓存里，写进会话的只有本次返回的页。
- 设计文档：第 8 节和第 9.2、9.3、9.4 节改写成当前事实，写上实际的文件路径；第 3.2、13 节按 PB.1 的结论更新。
- `packages/document/README.md`：核对和实际的文件一致。

真实验收（需要 Key；在真实应用里，`pnpm dev:log`）：

1. 没连接 DeepSeek：「工具」页「文档解析」一行是警示文字，开关能拨；本机 Agent 的「+」是「图片」。
2. 连接后打开开关，不重启：「+」变成「图片与文件」，文件选择框只列图片和五种文档。
3. 选一份 2 页的 PDF 发出：模型调用 `read_document`；行运行中是 `Read <文件名>`，完成后行尾 `2 pages`，展开是开头几行；回复用到了文档内容。
4. 工作区里一份 100 页以上的 PDF，让模型读后面的内容：第二次调用带 `pages`，行尾是 `pages a-b`，几乎立刻返回；DeepSeek 控制台里只多一次 OCR 请求。
5. 工作区外的文档路径（放在「文稿」「桌面」下面的子文件夹里，直接放在这两个目录或主目录下时没有目录这一档）：出现文件读取审批卡，卡上是完整路径；点「授权范围」选「目录及子项」，再点「本会话允许」，之后同目录的另一份文档不再询问，而用 `read_file` 读同目录的文本文件仍然会询问。
6. 扫描版 PDF、DOCX、PPTX 各一份，加上 PB.1 里确认能读的老格式。
7. 设了打开密码的 PDF：行尾 `failed`，展开是「文件设有打开密码，无法解析。去掉密码后再试。」。让它读一份 xlsx：展开是「只支持 PDF、Word 和 PPT 文件。」，模型随后改用脚本。
8. 关掉开关，同一个会话再让它读同一份文档：模型不再调用 `read_document`，改用本机 Python。
9. 读一份大文档时点停止：行变成 `aborted`。稍后再读同一份：立刻返回。
10. 重启应用后打开这个会话：历史里的行和行尾统计都在，展开后能加载出预览。
11. Plan 模式重复第 3 步。Chat 模式里问「你有哪些工具」，确认没有 `read_document`。
12. 录屏或截图存进执行记录（浅色、深色各一张）。

收尾：

- `docs/histories/2026-11/` 新增一条；执行记录写 `execution-process.md`。
- 更新总览的进度和状态行。

验证：总览「统一验证命令」的两组。

## 完成标准

- 两组验证命令全部通过，和基线相比没有新增失败。
- 真实验收 12 步通过；没有 Key 时，执行摘要里写明哪几步没有验证。
- 开关关着时，发给模型的工具列表和 P0 完成时一样；「+」和今天一样。
- 普通 `read_file` 的行、Chat 的附件入口、远程目标的输入框和今天一样（对应的现有测试不改就能通过）。
- `rg "sk-[A-Za-z0-9]{8,}"` 在仓库里没有命中；夹具和执行记录里没有 Key，也没有真实文档的内容。

## 回退

关掉设置开关即可停用。要撤代码：回退 PB 的提交；P0 留着无害。`deepseekDocumentEnabled` 留在设置文件里不会被读取；附件元数据里多出来的 `fileName` 旧版本读取时会忽略；回退之前导入的 Word、PPT 附件存下来的媒体类型是新增的那四种，旧版本对 Agent / Plan 的附件只区分是不是图片，照常当普通文件。
