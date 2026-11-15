# DeepSeek 深度搜索与文档解析工具（目标设计，未实现）

本文是 `deep_search` 和 `read_document` 两个工具的目标设计。两个工具都还没有实现；实现步骤见[执行计划](../../exec-plans/active/20261114-deepseek-deep-search-document-parsing/README.md)，界面以 [demo](../frontend/deep-search-and-document-demo.html) 为准。实现合入后，把本文改写成当前事实，去掉标题里的「目标设计，未实现」。

本文负责：为什么做、做成什么样、模块边界、否决过的方案。改哪些文件、按什么顺序、每步怎么验证，写在执行计划里。

## 1. 要解决的问题

- **读不了 PDF 和 Office 文档的正文。** `read_file` 只读文本和图片。模型现在要靠 Bash 加 Python（官方 Skill `pdf`、`office-docx`、`office-pptx`）提取文字，依赖本机 Python 运行时和数据扩展，扫描件读不出来。
- **多来源的问题要模型自己拼。** 现有的 `web_search` 搜一次、`web_fetch` 读一页，查一个需要几处来源互相印证的问题，模型要来回调用很多轮。DeepSeek 新开放的「深度思考搜索」在服务端自己规划多轮搜索和读页，返回带出处的结论。

## 2. 已确认的决策

用户在 2026-11-14 逐项确认。第 9、11 项和确认时的表述有出入，执行计划总览里单独列出，等审核时定。

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | 深度搜索怎么接入 | 包装成独立工具 `deep_search`，工具内部单独向 DeepSeek 发一次请求 |
| 2 | 文档解析怎么接入 | 独立工具 `read_document`，走 DeepSeek OCR 接口，不并进 `read_file` |
| 3 | 开关关闭或没有 Key 时 | 工具不提供给模型；模型按官方 Skill 用本机 Python 提取。工具内部不做本机回退 |
| 4 | 运行时的工具行 | demo 方案 B：一行，行尾是当前动作 |
| 5 | 完成后展开看到什么 | demo 方案 b：搜索词和引用来源 |
| 6 | 回复里的出处 | 行内链接 |
| 7 | 文档开关放哪 | 设置「工具」页「多媒体」组（demo 位置 ②） |
| 8 | 深度搜索默认开还是关 | 关 |
| 9 | 文档解析默认开还是关 | 关（待复核） |
| 10 | 本机 Agent / Plan 的「+」 | 文档解析可用时放开 PDF、Word、PPT |
| 11 | Chat 模式 | 深度搜索进 Chat，文档解析第一版不进。接入形式待复核，见第 7.7 节 |
| 12 | 大文档的页数上限 | 第一版不设 |

另有五项是在讨论时说明「直接写进计划」的：

- `deep_search` 和 `web_search`、`web_fetch` 并存，由模型选。
- 内部请求只要要点和来源，不要完整回答。提示词能不能压到这个程度还没实测，执行计划第一步先验证。
- 40 秒没有新数据就停，总时长上限 120 秒，可以中止。
- OCR 用 `text_recognition`。
- 表格（xlsx）和纯文本不走 OCR。

## 3. DeepSeek 接口事实

核对日期 2026-11-14。来源：[联网工具](https://api-docs.deepseek.com/zh-cn/guides/web_tools)、[OCR](https://api-docs.deepseek.com/zh-cn/guides/ocr)。价格以官方定价页为准。

### 3.1 深度思考搜索

- 请求：`POST https://api.deepseek.com/chat/completions`，模型 `deepseek-flash`，`thinking: { type: "enabled" }`，`tools: [{ type: "deepseek_web_search" }]`。是否搜索由模型判断，`tool_choice` 不能强制这个工具（返回 400）。
- 模型最多调用约 20 次服务端工具后作答。动作有三种：`search`（带 `queries` 数组）、`open_page`（带 `url`）、`find_in_page`（带 `url` 和 `pattern`）。
- 流式输出时，正文走 `delta.content`，思考走 `delta.reasoning_content`。工具过程走 `choices[0].server_tool_event`（和 `delta` 并列，一个 chunk 最多一个）：`step_reasoning_done`、`call_started`（带完整 `action`）、`call_completed`（带 `status` 以及 `sources`、`page` 或 `error`）。
- 完整的 `server_tool_calls` 和 `annotations` 只在带 `finish_reason` 的最后一个 chunk 里发送一次。
- 引用是 `annotations` 里的 `url_citation`：`start_index`、`end_index` 按 `content` 的 Unicode 码点计数；`content` 本身没有引用角标；`title` 未知时是 URL 本身；没有引用时不返回这个字段。来源的标题、站点名按 URL 到 `sources` 或 `page` 里找。
- `finish_reason`：`stop`、`length`（回答被截断）、`content_filter`（内容审核拒答，`content` 为空）。
- 生成开始后出错：HTTP 状态码已经是 200，最后一个 chunk 带 `error`、`choices` 为空，之后没有 `[DONE]`。失败前已经执行的推理和搜索照常计费。
- 输入命中内容审核时返回 `400 Content Exists Risk`。401、402（余额不足）、429、5xx 和普通对话接口相同。
- 没有新内容时，流里会发 `: keep-alive` 注释。
- 计费：一次搜索调用返回了结果时，按它的查询词条数计费，每条 ¥0.005；打开网页只在真的从网络抓取时计 ¥0.005，打开搜索结果里已带内容的网页不计费；页内查找不计费。另外按 `deepseek-flash` 的 Token 价格计模型用量。`usage.server_tool_use.tool_search`、`tool_fetch` 是计费次数，三项都是 0 时不返回这个字段。

### 3.2 OCR

- 请求：`POST https://api.deepseek.com/v1/tools/ocr`，`multipart/form-data`，只有两个字段，都必填：`file`（必须带文件名）和 `purpose`。多传字段返回 400。
- 支持 PDF、Word（DOC、DOCX）、PowerPoint（PPT、PPTX）和常见图片。格式按文件内容判断。
- `purpose`：`text_recognition` 时，不含图片的 Word、PowerPoint 直接提取文字，其他文件逐页识别；`rich_layout_recognition` 时所有文件都逐页识别。
- 限制：文件 100 MiB（超过返回 413）；1,000 页；上传要在 120 秒内完成且中途停顿不超过 30 秒（否则 408）；从开始上传算起总时长 180 秒；每个账号同时最多 15 个识别（超过返回 429），客户端断开后没做完的识别仍然占名额。
- 响应：识别期间服务端持续发换行符，完成后返回一个 JSON：`page_count`（等于 `pages` 的长度）、`pages[]`（`index` 从 0 开始、`text`、`finish_reason`）。换行符是 JSON 允许的前导空白，整个响应体可以直接按 JSON 解析。`finish_reason` 为 `length` 表示这一页输出到了上限，文本不完整。
- `text` 是模型的原始输出，服务端不做清理。逐页识别的文本里可能带 `<｜ref｜>`、`<｜box｜>` 标记和坐标，例如 `<｜ref｜>标题<｜/ref｜><｜box｜>[[52, 40, 948, 96]]<｜/box｜>`；直接提取文字的文档不带。
- 上传阶段的错误用状态码返回：400（表单不合法或文件无法处理）、402、408、413、429、500、503（服务繁忙）、504（上传与提交超过总时长）。Key 无效时的 401 在 OCR 文档里没有列出，按 DeepSeek 通用的错误码处理。
- **识别开始后状态码已经是 200，失败时响应体是错误对象**（`{ "error": { "message", "type", "param", "code" } }`），必须检查 `error`。识别开始前就失败时，同样的 `error.message` 也可能跟着 HTTP 错误状态码返回。
- 重试解决不了的 `error.message`：`The file is password-protected and cannot be processed. Remove the password and upload it again.`；`Failed to recognize the file: …`（文件无法解析、格式不支持、图片无法解码）；`Failed to recognize the file: the document has more than 1000 pages`；`file is too large: max 100 MiB`；`OCR did not finish in time`、`OCR did not finish within 180 seconds`。暂时性的：`The OCR service is temporarily unavailable. Please try again later.`、`Internal Server Error`。
- 计费：按识别成功的页数（`page_count`），每 1,000 页 ¥1.5。失败或超时不计费。**客户端断开不会取消识别**，文件接收完成后识别照常执行、照常计费。

### 3.3 实测记录

2026-11-14 用真实 Key 调用得到，用来定下面的设计。

深度搜索：

- 把 `deepseek_web_search` 和普通函数工具放进同一次请求：关闭思考时接口直接拒绝（400）；开启思考时，6 次里 6 次模型都没有去搜索。所以只能单独发一次请求，包装成工具。
- 完整跑一次 13.3、14.4、22.6 秒。约 1 秒开始出思考，8 到 15 秒开始出正文，内部 2 到 3 步。
- 每次 ¥0.03 到 ¥0.08：计费的查询词 2 到 7 条，输入 9k 到 43k Token。
- 同一个问题两次跑出来的结论和来源不稳定，所以来源必须能点开核对。
- 来源的元数据不干净：有错的日期、错的或空的标题。所以界面不显示日期。
- 有一次在收到 6 秒数据后停住超过 7 分钟，连接没有断。5 次正常调用里最长的静默是 7 秒。空闲超时由此而来。
- 13.3 秒里约 5.5 秒花在写一份完整回答上，而主模型还会重写一遍。所以内部请求只要要点。

OCR：

- `text_recognition` 返回干净的 Markdown，表格是 HTML `<table>`，公式是 LaTeX；`rich_layout_recognition` 每个块都带 `<｜ref｜>`、`<｜box｜>` 标记和坐标。所以用前者，另外防御性地去掉这两种标记。
- 文字版 PDF 2 页 2.9 秒；扫描版 PDF 2 页 3.0 秒；DOCX 1 页 4.4 秒；论文 PDF 15 页 11.8 秒、5.8 万字，其中 1 页是 `length`；综述 PDF 124 页 15.6 秒、74 万字、约 ¥0.19。
- 纯文本和 xlsx 会被拒绝（状态码 200，响应体是错误对象）。
- PPT、PPTX 和老格式 DOC、PPT 没有实测。

## 4. 两个工具与可用条件

| 工具 | 出现的模式 | 可用条件 | 不可用时 |
| --- | --- | --- | --- |
| `deep_search` | Chat、Plan、Agent | 「允许联网搜索」开 + 「使用 DeepSeek 深度搜索」开 + 有 DeepSeek Key | 不提供给模型；模型用 `web_search`、`web_fetch`（Chat 里是 `web`） |
| `read_document` | Plan、Agent | 「文档解析」开 + 有 DeepSeek Key | 不提供给模型；模型按官方 Skill 用本机 Python 提取 |

两个开关默认都是关。

「有 DeepSeek Key」和现有的「使用 DeepSeek 抓取网页」是同一个判断：DeepSeek 默认连接和 DeepSeek 搜索通道共用的那一个 Key 存在。自定义连接里填的 DeepSeek Key 不算。

两个工具互不依赖，可以单独实现、单独打开。

## 5. 对模型可见的机制

现有工具的约定是「始终注册，缺配置时调用返回明确错误」。这两个工具不这样做，理由：

- 模型看到工具就会去调。默认关闭的付费工具摆在列表里，每次调用都白白失败一轮。
- `read_document` 只有从列表里消失，模型才会按提示词和 Skill 走本机 Python 那条路。

做法：工具始终注册，但登记时带一个同步的可见性判断。工具运行时列出工具定义时，跳过判断为「不可见」的工具；判断本身抛错时按不可见处理。按名字取工具执行的路径不受影响。

由此得到的时序：

| 情况 | 结果 |
| --- | --- |
| Run 开始时不可用 | 这个 Run 里没有这个工具。打开开关或填好 Key 后，从下一个 Run（下一条消息）起生效，不用重启 |
| Run 开始时可用，中途关掉 | 下一次模型请求起，工具从列表里消失 |
| 模型已经发出调用，执行前被关掉 | 不联网，返回「已关闭」的失败；模型可以改用别的工具 |
| 调用已经在执行 | 不打断，跑完为止 |

可见性判断在每次模型请求、每次工具调用的路径上都会执行，所以必须是 O(1)：只读内存里的开关值和 Key 是否存在，不做设置快照、哈希或 JSON 拷贝。

开关切换会改变发给模型的工具列表，下一次请求的提示词缓存会失效一次。

## 6. 插件、Host 端口与 Key

两个工具各自是一个可选的 Harness 插件，照网页和图片工具的方式：工具定义、参数校验和注册在插件里，联网实现由 Host 端口构造（Key 在 Host）。

| | 深度搜索 | 文档解析 |
| --- | --- | --- |
| 包 | `@actspace/tool-deep-search`，放在现有的 web 能力目录 | `@actspace/tool-document`，新建 document 能力目录 |
| 插件 ID | `actspace.deep-search` | `actspace.document` |
| 清单行 ID | `deep-search` | `document` |
| 工具 | `deep_search` | `read_document` |
| 提供的服务 | `tools.deep-search` | `tools.document` |
| Host 端口 | `actspace.host.tools.deep-search` | `actspace.host.tools.document` |
| 需要的 Host 能力 | `network` | `network`、`filesystem.read` |

- 两个插件都是「可选」的：Host 没有对应能力时跳过，不算启动失败。Host 没给端口时不注册工具，但仍然提供自己的服务并标明不可用，因为清单里声明的服务必须提供。
- 插件会出现在「扩展 › 插件」的内置插件列表里，不能关闭。是否给模型用，由上面两个设置开关决定，不由插件开关决定。
- Host 端口有两个成员：`createPorts()` 构造工具实现，每个 Harness 一次；`available()` 就是第 5 节的可见性判断。
- **Key 每次调用时读取**，不在构造时固定。换 Key 或删 Key 不用重启；调用时读不到 Key，返回「不可用」的失败。Key 只在主进程里流动，不进入 Journal、工具结果和 renderer。
- 桌面端从设置读开关和 Key。CLI 和远程 Host 用环境变量：`ACTSPACE_DEEPSEEK_DEEP_SEARCH=1`、`ACTSPACE_DEEPSEEK_DOCUMENT=1`，各自和 `DEEPSEEK_API_KEY` 一起才生效，和现有的 `ACTSPACE_DEEPSEEK_SEARCH`、`ACTSPACE_DEEPSEEK_FETCH` 同一写法。CLI 的 mock 模式不提供这两个端口。
- Harness 在多个会话之间共享，所以端口里的状态（文档缓存）是跨会话的，见第 8.5 节。

子智能体：`general` 预设按现有规则继承这两个工具，`explore` 预设没有。

## 7. `deep_search` 契约

### 7.1 参数与说明

```json
{
  "type": "object",
  "properties": {
    "question": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000,
      "description": "A self-contained question or research task. Include names, dates and constraints: the search runs without this conversation's context."
    }
  },
  "required": ["question"],
  "additionalProperties": false
}
```

工具说明要告诉模型四件事：什么时候用（需要多个来源或互相印证的问题；查一下就有答案的用普通搜索，已知网址用网页读取）；要 10 到 30 秒、按搜索次数计费；问题必须自带上下文；结果里的 `[n]` 标的是前面那段话的出处，引用时写成行内 Markdown 链接，不要编造网址。

### 7.2 内部请求

一次流式请求：系统提示词要求只写要点（事实、数字、日期的短列表，没有开场白和结语，来源互相矛盾或找不到可靠信息时直说，用问题的语言），用户消息就是 `question`。只声明 `deepseek_web_search`，不声明 `deepseek_read_url`。

不带会话历史，不带用户的其他消息。

### 7.3 交给主模型的文本

```text
<要点正文，句子后面带 [1]、[2] 这样的标记>

Sources:
[1] <标题> — <网址>
[2] <标题> — <网址>

Pages that could not be opened:
- <网址> (<错误码>)
```

- 编号按来源第一次被引用的顺序分配，同一网址只有一个编号。标题按网址到 `sources` 或 `page` 里找，找不到用引用自带的标题，再没有就用网址。
- 标记插在每条引用的 `end_index` 处，按码点切分，从后往前插；同一位置同一来源只插一次。下标越界的引用不插标记，但来源照常列出。
- 没有打不开的网页时，最后一段省略。模型没有搜索就作答时，没有 `Sources`，改为一行说明「没有进行联网搜索，结论没有出处」。
- 回答被截断（`length`）时，末尾加一行说明。

### 7.4 上限

| 项 | 上限 |
| --- | --- |
| 要点正文 | 20,000 字符，超出截断并说明 |
| 界面明细里的搜索词 | 50 条，每条 200 字符 |
| 界面明细里的来源 | 50 条；标题 200、网址 2,000、站点名 100 字符 |
| 界面明细里打不开的网页 | 20 条 |
| 空闲超时 | 40 秒没有收到数据块（`: keep-alive` 注释不算） |
| 总时长 | 120 秒 |

行尾的统计数字用真实数量，不受明细上限影响。

### 7.5 进度、摘要与明细

运行中的进度消息（英文，只在变化时上报）：

| 时刻 | 消息 |
| --- | --- |
| 收到第一个事件之前 | 空 |
| 当前这一步只有搜索 | `searching <n> queries`（1 条时 `searching 1 query`） |
| 当前这一步打开了网页 | `reading <n> pages`（1 个时 `reading 1 page`） |
| 开始出正文 | `summarizing` |

页内查找不改变消息。

完成后的摘要：`<S> searches · <N> sources`（单数时 `1 search`、`1 source`）。`S` 是 DeepSeek 实际计费的搜索次数，`N` 是结论里引用到的网页去重后的数量。

明细（供界面展开用）：搜索词列表、引用来源列表（标题、网址、站点名）、打不开的网页列表、计费次数。读过但没被引用的网页不列。

个别网页打不开而其余步骤正常时，整体仍算完成。

### 7.6 失败

工具返回稳定的失败码和英文消息；界面按失败码显示中文。没有对应中文的失败码，原样显示英文消息。

| 失败码 | 触发 | 界面文字 |
| --- | --- | --- |
| `DEEP_SEARCH_UNAVAILABLE` | 执行时开关已关或没有 Key | 深度搜索已关闭或 DeepSeek 未连接。 |
| `DEEP_SEARCH_IDLE_TIMEOUT` | 40 秒没有数据 | 40 秒没有收到新数据，已停止本次深度搜索。 |
| `DEEP_SEARCH_TIMEOUT` | 超过 120 秒 | 超过 120 秒仍未完成，已停止本次深度搜索。 |
| `DEEPSEEK_AUTH_FAILED` | 401 | DeepSeek API Key 无效或已被删除。 |
| `DEEPSEEK_INSUFFICIENT_BALANCE` | 402 | DeepSeek 账户余额不足，深度搜索没有执行。 |
| `DEEPSEEK_RATE_LIMITED` | 429 | DeepSeek 请求过于频繁，稍后再试。 |
| `DEEPSEEK_CONTENT_RISK` | 输入被拒（400）或回答被审核拦下 | DeepSeek 拒绝了这个问题（内容安全）。 |
| `DEEP_SEARCH_FAILED` | 其余情况，包括流中途的错误 | 原样显示 |

用户中止时状态是 `aborted`，没有明细。超时和中止都不返回已经收到的部分结果。工具自己不重试。

主 Agent 里，调用发出后工具被隐藏（第 5 节表格第三行），运行时在执行前就拒绝，失败码是 `TOOL_SCOPE_DENIED`，不是 `DEEP_SEARCH_UNAVAILABLE`。界面把这两个码显示成同一句话。`read_document` 同理。

### 7.7 Chat 模式

`deep_search` 的定义声明 Chat、Plan、Agent 三个模式，Chat 里和 `web`、`generate_image` 并列出现。不可用时不出现，Chat 仍然是原来两个工具。

**这和确认时的表述有出入。** 确认的是「做成现有 `web` 工具的第三种动作，Chat 仍然恰好两个工具」。用户看到的效果相同（Chat 里能用深度搜索），差别在形式。改成独立工具的理由：

- `web` 的参数结构是固定的。把 `deep` 写进动作枚举，它就一直在列表里；而开关默认关，模型调了只会失败。
- 让 `web` 的结构随开关变化行不通：同一版本的工具不允许有两份定义，而且 `web` 所在的插件是必需成员，重新注册会和正在进行的 Run 冲突。
- 独立工具在三个模式里是同一个工具、同一种行、同一套投影和测试。做成 `web` 的动作，Chat 和 Agent 就是两套。

代价是改一条现行规范：「Chat 恰好两个工具」变成「Chat 固定两个工具，深度搜索打开时多一个 `deep_search`」。

如果坚持原表述，改动范围见执行计划总览。

## 8. `read_document` 契约

### 8.1 参数与说明

```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string", "minLength": 1, "description": "Path of a document on disk, absolute or relative to the workspace." },
    "artifact_id": { "type": "string", "minLength": 1, "description": "Id of a file the user attached, shown in the conversation as `Attached file: <name> (<id>)`." },
    "pages": { "type": "string", "pattern": "^[1-9][0-9]{0,3}(-[1-9][0-9]{0,3})?$", "description": "Pages to return, 1-based and inclusive, for example \"31-45\" or \"7\". Omit on the first call." }
  },
  "required": [],
  "additionalProperties": false
}
```

`path` 和 `artifact_id` 必须恰好给一个。参数校验器不支持 `oneOf`，这条规则由插件在调用端口之前检查，不满足时返回 `INVALID_ARGUMENTS`。

工具说明要告诉模型：读 PDF、Word、PowerPoint 的文字（包括扫描件），返回 Markdown；文件会发给 DeepSeek，按页计费；第一次调用解析整份文档并返回开头几页，之后用 `pages` 读后面的页，不再解析；表格、纯文本、代码用 `read_file` 或脚本。

### 8.2 文件从哪来

- **`path`**：和 `read_file` 同一套路径规则。工作区内的文件直接读；工作区外的文件走现有的文件读取审批，卡上可以点「本会话允许」（只这个文件，或它所在的目录）。授权范围是这个插件自己的，`read_file` 得到的会话授权不会覆盖 `read_document`，反过来也一样。执行前按已准入的资源再核对一次路径。
- **`artifact_id`**：只能读本会话自己的附件，由会话级的 artifact 读取器保证归属。不走文件审批。

上传前在本机检查大小和类型，不通过就不上传：

- 大小不超过 100 MiB。
- 按文件内容判断类型，只放行五种：
  - PDF：文件开头 1,024 字节里出现 `%PDF-`。不要求正好在第一个字节：PDF 阅读器都接受文件头前面有少量杂字节。
  - DOCX、PPTX：文件是 ZIP，目录里有 `[Content_Types].xml`，并且有以 `word/` 或 `ppt/` 开头的条目。只是 ZIP 不够，xlsx 和普通压缩包也是 ZIP。不要求主文档叫 `word/document.xml`、`ppt/presentation.xml`，有些工具生成的文件用别的名字。
  - DOC、PPT：文件是 OLE2 复合文档，并且里面有 Word 或 PowerPoint 的数据流（`WordDocument`、`PowerPoint Document`）。只是 OLE2 不够，xls 也是 OLE2。
- 设了打开密码的 DOCX、PPTX 在本机就能认出来（它们是 OLE2 文件，里面没有上面两种数据流，只有 `EncryptedPackage`），直接报「设有打开密码」，不上传。设了密码的 PDF 和老格式 DOC、PPT 本机认不出来，由 DeepSeek 返回的错误识别。
- 知道文件名且有扩展名时，扩展名还必须是 `.pdf`、`.doc`、`.docx`、`.ppt`、`.pptx` 之一。不要求扩展名和内容判断出的类型一致。

类型检查的目的不只是省一次请求：模型有可能对着任意文件调用这个工具，本机检查保证非文档内容不会被发出去。图片不走这个工具，继续用 `inspect_image`。

OCR 接口要求上传时带文件名。按路径读时用路径的最后一段；读附件时用附件元数据里的文件名，没有就用 `attachment`。名字的扩展名不是五种之一时，在后面补上判断出的类型的扩展名（`attachment.pdf`、`report.docx` 等）。

### 8.3 OCR 调用

- `purpose` 固定为 `text_recognition`。
- 整个文件读进内存后一次上传。大文件上传时内存峰值约为文件大小的两倍，所以同时最多 2 份文档在读入和上传，其余排队。
- 只有一个计时：从发出请求起 190 秒。服务端自己的上限是 180 秒，多等 10 秒让服务端的结论先到。识别期间服务端只发换行符，所以不设空闲超时。
- 响应先按错误对象检查，再取 `pages`，按 `index` 排序。每页文本去掉 `<｜ref｜>`、`<｜box｜>` 标记（坐标整段删掉，`<｜ref｜>` 里的文字保留）。`finish_reason` 为 `length` 的页记为「识别不完整」。
- 整理后超过 50,000 个字符的页，按行拆成几页（见第 8.4 节）。
- 工具自己不重试。

### 8.4 返回给模型的文本

```text
Document: <文件名> (<N> pages)
Showing pages <a>-<b> of <N>. To continue, call read_document again with pages "<b+1>-<N>".
Pages recognized incompletely: 13.
Long pages were split; page numbers here are positions in this output, not the document's own page numbers.

--- Page 1 ---
<第 1 页的 Markdown>

--- Page 2 ---
…
```

- 每次调用最多返回 50,000 字符，按整页装，装不下的页留给下一次。
- 一页自己就超过 50,000 字符时，解析完就按行把它拆成几页，每页不超过 50,000 字符。逐页识别的页实测每页几千个字符，到不了这个数；不含图片的 Word、PPT 是直接提取文字的，长文档有可能整份只算一两页，不拆的话后面的内容永远读不到。拆过之后，工具说的页码是输出里的位置，总页数 N 也是拆完之后的页数，可能比 DeepSeek 计费的页数多。
- 第二行只在返回的不是整份文档时出现，后半句只在后面还有页时出现。第三行只在有识别不完整的页时出现：不带 `pages` 的调用列出整份文档里的，带 `pages` 的调用只列本次返回范围内的。第四行只在这份文档有页被拆开过时出现。
- `pages` 的起点超出文档页数时失败，终点超出时按最后一页算。起点大于终点按参数不合法处理。

### 8.5 缓存

第一次读一份文档时解析整份，按页放进内存缓存；之后按页读直接取缓存，不再请求、不再计费。

- 键：工作区文件是「规范路径 + 大小 + 修改时间」，附件是 artifact ID（附件内容不会变）。
- 上限：缓存总量 8,000,000 字符，超出时从最久没用的开始淘汰。最新解析的那一份始终保留，哪怕它自己就超过上限，否则大文档每读一段都要重新计费。
- 缓存属于 Host 端口，跨会话共享，Harness 销毁时释放。每次调用都先过权限检查或附件归属检查，再查缓存，所以一个会话读不到另一个会话的附件。
- 同一份文档的并发调用共用一次请求。不同文档同时最多 2 份在读入和上传，其余排队。
- 调用被中止时，这次调用立刻结束。请求还没发出（在排队或读文件）、而且没有别的调用在等同一份文档时，取消，什么都不发。请求已经发出的不取消：DeepSeek 那边不会停，也照常计费，所以让它跑完并写进缓存，下次读取不再计费。Harness 销毁时才取消已经发出的请求。
- 失败不进缓存。

缓存只在内存里。应用重启（或 Harness 重新装配）后第一次读会重新解析、重新计费。

### 8.6 摘要与明细

进度消息和最终摘要同一种写法：`<文件名>` 或 `<文件名> · <统计>`。只写文件名，不写完整路径。

文件名的取法：按路径读时是模型给的路径的最后一段（不用解析符号链接之后的名字）；读附件时是附件元数据里的文件名，没有就是 `attachment`。

| 情况 | 摘要 |
| --- | --- |
| 开始执行 | 上报一次进度，内容是文件名。读附件时，运行中的行靠它显示名字 |
| 完成，不带 `pages` | `<文件名> · <N> pages`（1 页时 `1 page`） |
| 完成，带 `pages` | `<文件名> · pages <a>-<b>`，实际返回的范围；只有一页时 `pages <a>` |
| 工具自己判定的失败（包括中止） | `<文件名>`，没有统计；文件名还不知道时是失败消息 |
| 执行前就失败（参数不合法、审批被拒、工具已不可见） | 运行时统一生成的失败消息，不是文件名 |

明细有一块，标签是 `document`：文件名、总页数、本次返回的页码范围、识别不完整的页码（最多 20 个）和它们的总数。工具自己判定的失败只带文件名；执行前的失败没有明细。

历史里结果较大的工具行只保留摘要（见第 9.2 节），所以摘要的写法是界面契约的一部分，改动时两边的测试要一起改。

`read_document` 不上报 `read_file` 用的「已读文件」明细。那份明细用来在上下文压缩后列出读过的文件、统计重复读取；文档是按页读的，记进去会把翻页算成重复读取。

### 8.7 失败

| 失败码 | 触发 | 界面文字 |
| --- | --- | --- |
| `DOCUMENT_UNAVAILABLE` | 执行时开关已关或没有 Key | 文档解析已关闭或 DeepSeek 未连接。 |
| `DOCUMENT_UNSUPPORTED_FORMAT` | 本机检查没通过 | 只支持 PDF、Word 和 PPT 文件。 |
| `DOCUMENT_TOO_LARGE` | 超过 100 MiB（本机检查或 413） | 文件超过 100 MB，DeepSeek 不接受。 |
| `DOCUMENT_PASSWORD_PROTECTED` | 文件设有打开密码（本机检查出来，或 DeepSeek 报告） | 文件设有打开密码，无法解析。去掉密码后再试。 |
| `DOCUMENT_TOO_MANY_PAGES` | 超过 1,000 页 | 文档超过 1,000 页，DeepSeek 不接受。 |
| `DOCUMENT_PARSE_FAILED` | DeepSeek 报告无法解析，或一页也没有返回 | DeepSeek 无法解析这个文件。 |
| `DOCUMENT_TIMEOUT` | 408、504、识别超时，或本机的 190 秒计时到了 | DeepSeek 在 180 秒内没有完成解析。 |
| `DEEPSEEK_AUTH_FAILED` | 401 | DeepSeek API Key 无效或已被删除。 |
| `DEEPSEEK_INSUFFICIENT_BALANCE` | 402 | DeepSeek 账户余额不足，文档没有解析。 |
| `DEEPSEEK_RATE_LIMITED` | 429 | DeepSeek 请求过于频繁，稍后再试。 |
| `FILE_NOT_FOUND`、`NOT_A_FILE`、`IO_ERROR`、`DOCUMENT_ARTIFACT_NOT_FOUND`、`DOCUMENT_PAGES_OUT_OF_RANGE`、`DOCUMENT_FAILED` | 本机读取失败、附件不存在、页码越界、其余情况 | 原样显示 |

### 8.8 附件

- 本机 Agent / Plan 里，非图片附件今天只以一行文字 `Attached file: <名字> (<id>)` 交给模型。`read_document` 用这个 id 读取。
- 附件导入的 20 MiB 上限不变。所以附件最大 20 MiB，按路径读的文件最大 100 MiB。
- 附件的元数据里加一个可选的文件名，导入时写入，供行显示。旧附件没有这个字段，显示 `attachment`。
- 附件的媒体类型补上 Word 和 PowerPoint 的四种，今天它们会被记成 `text/plain`。

## 9. 界面契约

样子以 demo 为准，这里只写契约。

### 9.1 Deep Search 行

- 运行中：`Deep Search <问题>`，有进度消息时接 ` · <消息>`，整行用共享的流光效果。
- 完成：动作 `Deep Search`，目标是问题，行尾是 `6 searches · 11 sources` 这样的统计。
- 展开：「搜索词」列表；「引用来源」编号列表，每条是标题（点击用系统浏览器打开）加站点名，没有图标、没有日期；有打不开的网页时多一组「未能打开」。
- 失败：行尾是 `failed`，展开是第 7.6 节的文字。中止：行尾 `aborted`，不能展开。
- 结果较大时，历史里的行先只有摘要和参数摘要（每个参数的前 240 个字符），展开时再加载明细。所以折叠状态只用这两样：统计来自摘要，问题来自参数摘要，超过 240 个字符的问题在展开前显示截断后的文字。
- 桌面端有展开内容；Web / PWA 第一版只有一行，不能展开。

这是一种新的行，工具预览规范要新增一节。现有 `Web Search` 一节「不在工具行里展示搜索结果正文或来源摘要」的规定不变，`Deep Search` 展开的来源列表是另行约定的样式。

### 9.2 文档的 Read 行

复用现有的 `Read` 行，不新增行的种类。`read` 这种预览和消息块各加一个可选的 `document` 字段（名字、行尾统计、警示、失败文字）；没有这个字段的 `Read` 行和今天完全一样。

- 运行中：`Read <文件名>`。完成：行尾是 `2 pages` 或 `pages 31-45`。
- 行上只显示文件名，不显示路径。名字按顺序取第一个有的：调用参数里路径的最后一段；完成后摘要里统计之前的部分；明细里的文件名；运行中的进度消息；都没有时显示 `attachment`。
- 展开：解析出的 Markdown 开头几行，和读普通文件一样；工具加在最前面的说明行（文件名、页码范围、分页标记）不算在内。有识别不完整的页时，第一行用警示色写「第 13 页识别不完整，内容已截断。」（多页时列出页码，超过 5 页写「有 N 页识别不完整，内容已截断。」），这一行可以换行，不截断。
- 失败：行尾 `failed`，展开是第 8.7 节的文字。中止：行尾 `aborted`，不能展开。
- 文件名不是可点击的链接：应用里没有 PDF 查看器。
- 工作区外的文件等待审批时，用现有的文件读取审批卡，卡上显示完整路径。
- 文档的结果通常比较大，历史里的行大多先只有摘要：文件名和行尾统计从摘要里取，展开时再加载正文和「识别不完整」的提示。

### 9.3 设置

- 「搜索与网页读取」页，第一组，「允许联网搜索」下面新增一行「使用 DeepSeek 深度搜索」。说明：有 Key 时「问题将发送至 DeepSeek · 搜索 ¥0.005 / 次，另计模型用量」，没有 Key 时「请先连接 DeepSeek」。没有 Key 或「允许联网搜索」关闭时置灰。
- 「工具」页「多媒体」组，「图片分析」下面新增一行「文档解析」。说明：有 Key 时「文档将发送至 DeepSeek · ¥0.0015 / 页」；没有 Key 时用警示写法「尚未连接 DeepSeek，文档由本机 Python 提取。」，开关不置灰。

### 9.4 输入框

本机 Agent / Plan 的「+」面板：文档解析可用时，入口从「图片」变成「图片与文件」，说明是「PNG、JPEG、WEBP、GIF、PDF、Word、PPT」，文件选择框只列这些类型。不可用时保持「图片」。

拖拽今天就接受任意文件，不改。Chat 和远程目标的输入框不改。

### 9.5 回复里的出处

最终回复由主模型写，出处是行内 Markdown 链接。渲染器不用改，只靠工具说明里的那句话约束模型。

## 10. 数据外发、费用与安全

- **什么会离开本机。** `deep_search`：模型写的那个问题。`read_document`：文档的全部字节和文件名。都只在对应开关打开、且模型调用了工具时发生。同意是在开关那一层给的，开关说明里写明了发给谁、多少钱；每次调用不再单独询问。
- **什么会写进会话。** 深度搜索：有上限的要点正文、被引用来源的标题和网址、次数。不写网页原文，不写 DeepSeek 的思考过程。文档：本次返回的页面文本，和其他工具结果一样受上下文管理。
- **费用不进用量统计。** 第一版只在工具行上显示次数和页数，不折算金额，不计入统计页。
- **联网内容不可信。** 搜索结论、来源标题和文档内容都是不可信输入，不扩展权限。
- **链接。** 来源链接只通过主进程现有的外部链接通道打开，只允许 `http`、`https`。
- **现行安全文档要改两句。** 「联网能力不依赖任何服务商的原生联网搜索」不再成立；「session 不写 provider tool result 原文」要补上深度搜索写入的内容范围。

## 11. 第一版不做

- 深度搜索和 OCR 的费用进用量统计。
- 「超过多少页先问一下」的确认。
- Chat 模式的文档解析。
- 工具内部回退到本机提取。
- 图片 OCR。
- 子智能体读取父会话的附件（附件归父会话所有；子智能体只能按工作区路径读文档）。
- 远程 Host 上传时保留文件名、远程目标的输入框改动。
- Web / PWA 上 Deep Search 行的展开内容。
- 把解析出的全文存成会话产物，以及在文档内搜索。见第 12 节。
- 压缩之后自动重读文档。模型需要时再调一次 `read_document`，命中缓存。

## 12. 否决的方案

| 方案 | 为什么不用 |
| --- | --- |
| 用 Files API 做文件解析（上传文件，在对话请求里引用） | 只能配合 DeepSeek 自己的模型，解析出的文字拿不出来，其他模型用不了 |
| 把联网搜索声明进主模型的请求 | 实测和函数工具放在一起时模型不搜索；而且只有 DeepSeek 模型能用 |
| `deep_search` 做成 `web` 的第三种动作 | 见第 7.7 节 |
| 第一版不进 Chat | 和已确认的决策冲突 |
| 工具始终出现在列表里，不可用时报错 | 见第 5 节 |
| 开关变化时动态注册、注销工具 | 模型已经发出调用后工具被注销，运行时会因找不到工具而让整个 Run 失败 |
| 用「扩展 › 插件」的开关控制 | 要重启才生效，而且 Key 是否存在不能是插件开关 |
| 用现有的「停用工具」列表控制 | 那个列表今天只影响搜索凭据，没有通用的按名隐藏 |
| 给文档新增一种行 | 和读文件是同一件事，多一种行就多一套投影、渲染和测试 |
| Key 变化时单独发通知 | 每次写 DeepSeek Key 都会同时写设置文件，现有的设置变更通知已经够用 |
| 把解析出的全文存成会话产物 | 能在文档内搜索、重启后不用重新计费；但后续读取的行会变成读一个内部文件名，和已确认的 demo 不一致。留作后续 |
| 流式读文件上传 | 依赖的接口还是实验性的；文件上限 100 MiB，一次读进内存可以接受 |

## 13. 已知限制

- PPT、PPTX 和老格式 DOC、PPT 没有用真实接口测过。
- 「只要要点」的提示词和 `[n]` 标记的位置质量还没验证，执行计划第一步先测，测不过有回退规则。
- 文档缓存只在内存里，重启后重新解析、重新计费。
- 不能在文档内搜索，只能按页读。
- 附件最大 20 MiB。
- 子智能体读不到父会话的附件。
- 从会话分叉出来的新会话读不到原会话里的文档附件：分叉只复制有类型的附件引用，文档附件在会话里只是一行文字。模型会得到「附件不存在」的失败，需要重新添加附件或给路径。
- CLI 和远程 Host 上的附件没有文件名；那里和文件工具一样，审批时没有「本会话允许」。
- 超长的页被拆开之后，工具显示的页码和页数是输出里的位置，和文档自己的页码、DeepSeek 计费的页数不一样。
- 设了打开密码的 PDF 和老格式 DOC、PPT 本机认不出来，要上传之后才知道。
- 文档解析不可用时，拖进本机 Agent / Plan 的 PDF 模型读不到。这是现有行为。
- 中止调用不会取消 DeepSeek 那边的识别，费用照常产生。
- 新增两个 Host 端口会改变 Host 契约摘要：已保存的 Harness 选择需要重启一次，未改动过的内置组合自动升级。
- 开关切换后，下一次请求的提示词缓存失效一次。

## 14. 现有代码落点

实现时要动的现有位置。新文件的路径在执行计划里。

- `packages/core/tool-runtime/src/registry.ts`：工具登记加可见性判断。
- `packages/core/runtime/src/plugin-catalog.ts`、`packages/core/runtime/src/harness/default-harness.ts`、`packages/core/runtime/src/harness/default-harness-definition.ts`：登记两个插件和两个可选的 Host 端口。
- `packages/web/tool-web/src/plugin.ts`、`packages/web/tool-web/src/node-ports.ts`：新插件照这里的结构写。
- `packages/fs/tool-fs-read/src/plugin.ts`：`read_document` 的权限契约照 `read_file`。
- `packages/llm/llm-pi-ai/src/deepseek-files.ts`：`multipart/form-data` 上传的现成写法。
- `packages/host/agent-host/src/node-ports/tool-host-services.ts`：CLI 和远程 Host 的端口。
- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`、`apps/desktop/src/main/model-runtime-service.ts`：桌面端的端口、开关和 Key。
- `apps/desktop/src/main/runtime-v2/artifact-store.ts`、`apps/desktop/src/main/runtime-v2/runtime-registry.ts`：附件文件名和媒体类型。
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`：桌面端受信任的授权范围，加 `read_document` 的那一项。
- `packages/util/shared/src/settings.ts`：两个设置字段。
- `packages/client/client/src/sessions/tool-card.ts`：工具行投影。
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`、`apps/desktop/src/renderer/components/settings/SearchSettings.tsx`、`apps/desktop/src/renderer/components/settings/sections/ToolsSection.tsx`、`apps/desktop/src/renderer/components/Composer.tsx`：行、设置、输入框。
- `packages/core/agent/src/agent-mode-policy.ts`、`packages/core/agent/src/main-preset.ts`：模式暴露。
- `packages/context/prompt/src/core-contributors.ts`：Office / PDF 那一行提示词。
- `packages/skill/official-skills/skills/pdf/SKILL.md`、`packages/skill/official-skills/skills/office-docx/SKILL.md`、`packages/skill/official-skills/skills/office-pptx/SKILL.md`：读文字的路线里「有 `read_document` 时先用它」的那几句；`pdf` 里说本机没有 OCR 的两处一起改。
