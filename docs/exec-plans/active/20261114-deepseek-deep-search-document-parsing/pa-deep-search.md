# PA：深度搜索

状态：待审核，尚未开始（交互模式）。上级：[总览](README.md)。依赖：[P0](p0-foundation-and-settings.md)。

## 目标

`deep_search` 从空壳变成能用的工具：向 DeepSeek 发一次流式请求，把结果整理成带出处的要点交给主模型；设置里有开关；对话里有 `Deep Search` 行。

完成后：

- 「搜索与网页读取」页多一行「使用 DeepSeek 深度搜索」，默认关。
- 开关打开且连接了 DeepSeek 后，从下一条消息起模型能调用 `deep_search`；关掉后从下一次模型请求起消失。
- 对话里的 `Deep Search` 行：运行中一行带当前动作，完成后行尾是次数统计，桌面端展开是搜索词和引用来源。
- Chat、Plan、Agent 三个模式都能用（Chat 的接入形式见 PA.8）。

## 必读

- [设计文档](../../../design-docs/tool-system/agent-deep-search-and-document-parsing.md) 第 3.1、3.3、7、9.1、9.3、10 节。
- [demo](../../../design-docs/frontend/deep-search-and-document-demo.html) 第 1、2、3、5 节。
- `docs/design-docs/tool-system/agent-web-tools.md`、`docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`。
- `docs/design-docs/frontend/front-新功能开发清单.md`、`front-视觉token规范.md`、`front-文案与状态表达规范.md`、`front-组件与交互模式规范.md`、`front-中间消息区规范.md`、`front-设置页规范.md`；验收方式见 `docs/FRONTEND_VERIFICATION.md`。
- 照着写的现有代码：`packages/web/tool-web/src/node-ports.ts`（注入 `fetch`、合并中止信号、失败结果、错误信息脱敏）、`apps/desktop/src/renderer/components/messages/ToolLogLine.tsx` 里的 `WebToolBlock`（展开时触发延迟加载）。

## 契约

### 内部请求

```json
{
  "model": "deepseek-flash",
  "stream": true,
  "stream_options": { "include_usage": true },
  "thinking": { "type": "enabled" },
  "tools": [{ "type": "deepseek_web_search" }],
  "messages": [
    { "role": "system", "content": "<DEEP_SEARCH_SYSTEM_PROMPT>" },
    { "role": "user", "content": "<question>" }
  ]
}
```

`POST https://api.deepseek.com/chat/completions`，请求头 `Authorization: Bearer <Key>`，`redirect: "error"`。不传 `tool_choice`。

系统提示词的初稿（PA.1 核对后定稿，写成 `node-ports.ts` 里的常量）：

```text
Search the web to answer the user's question, then reply with key points only: a short list of facts, numbers and dates. No introduction, no conclusion, no advice. If sources disagree, or you cannot find reliable information, say so plainly. Reply in the language of the question.
```

### 流的解析

每个 SSE 事件的 `data` 是一个 JSON chunk。逐个处理：

| chunk 里有 | 处理 |
| --- | --- |
| 以 `:` 开头的注释行 | 丢弃，不算收到数据（不重置空闲计时） |
| `error` | 失败，按下面的失败表映射；之后不等 `[DONE]` |
| `choices[0].delta.content` | 追加到正文；第一次出现时进度变成 `summarizing` |
| `choices[0].delta.reasoning_content` | 丢弃 |
| `choices[0].server_tool_event` | 见下 |
| `choices[0].finish_reason` | 记下；同一个 chunk 的 `delta.annotations`、`delta.server_tool_calls` 是完整结果 |
| `usage.server_tool_use` | 记下 `tool_search`、`tool_fetch` |
| `[DONE]` | 流结束 |

`server_tool_event` 带 `type`、`step`，调用事件另带 `call`：

- `call_started`：按 `step` 统计这一步的调用。`action.type` 为 `search` 时把 `action.queries` 记进搜索词列表（去重，保持顺序）；为 `open_page` 时这一步的读页数加一；`find_in_page` 不计。
- `call_completed`：`status` 为 `completed` 时，把 `sources[]`（`url`、`title`、`site_name`）和 `page`（`url`、`title`）按网址记进来源查找表；`open_page` 的 `status` 为 `failed` 时，把 `{ url, code: error.code }` 记进打不开的网页。
- 进度消息只看 `step` 最大的那一步：这一步有 `open_page` 时是 `reading <n> pages`，否则有搜索时是 `searching <n> queries`（`n` 是这一步的查询词条数）。消息和上一次相同时不上报。

最后一个 chunk 的 `server_tool_calls` 到了之后，用它重建一遍搜索词、来源查找表和打不开的网页（它是完整的；流里的事件只用来报进度）。没有收到它时，用流里攒下的。

未知字段、未知事件类型、未知 `action.type` 一律忽略，不报错。

### 交给主模型的文本、摘要、明细

照设计文档第 7.3、7.4、7.5 节。实现成不依赖网络的纯函数，放在 `packages/web/tool-deep-search/src/assemble.ts`：

```ts
export type DeepSearchSource = { readonly title: string; readonly url: string; readonly site?: string };
export type DeepSearchOutcome = {
  readonly content: string;
  readonly annotations: readonly { readonly url: string; readonly title?: string; readonly startIndex: number; readonly endIndex: number }[];
  readonly queries: readonly string[];
  readonly lookup: ReadonlyMap<string, { readonly title?: string; readonly site?: string }>;
  readonly failedPages: readonly { readonly url: string; readonly code: string }[];
  readonly billed: { readonly searches?: number; readonly fetches?: number };
  readonly finishReason: "stop" | "length";
};
export function assembleDeepSearchResult(outcome: DeepSearchOutcome): ToolBodyResult;
```

- 只接受 `http`、`https` 的网址；其余的引用和来源丢弃。
- 摘要里的 `S`：有 `billed.searches` 时用它；没有时用「返回了结果的搜索调用的查询词条数之和」。
- 明细一块，标签 `deep-search`：

```ts
{ queries: string[]; sources: DeepSearchSource[]; failedPages: { url: string; code: string }[]; billed: { searches: number; fetches: number } }
```

### 失败

照设计文档第 7.6 节。HTTP 层的映射：

| 情况 | 失败码 | `retryable` |
| --- | --- | --- |
| 执行时 `available()` 为假，或读不到 Key | `DEEP_SEARCH_UNAVAILABLE` | 否 |
| 401 | `DEEPSEEK_AUTH_FAILED` | 否 |
| 402 | `DEEPSEEK_INSUFFICIENT_BALANCE` | 否 |
| 429 | `DEEPSEEK_RATE_LIMITED` | 是 |
| 400 且消息含 `Content Exists Risk`；或 `finish_reason` 为 `content_filter` | `DEEPSEEK_CONTENT_RISK` | 否 |
| 40 秒没有收到数据 chunk | `DEEP_SEARCH_IDLE_TIMEOUT` | 是 |
| 从发请求算起超过 120 秒 | `DEEP_SEARCH_TIMEOUT` | 是 |
| 其余：别的状态码、流中途的 `error`、流在 `finish_reason` 之前断开、响应不是事件流、正文为空 | `DEEP_SEARCH_FAILED` | 5xx 和断流为是，其余否 |

- 调用方中止（`context.signal`）时返回失败码 `TOOL_ABORTED`，和 `inspect_image` 的写法一致；运行时把它记成 `aborted`。
- 超时、中止、失败都要取消请求并释放读取器。
- 失败消息是英文，经 `safeError` 那样的脱敏（去掉 `Bearer …`、`api-key …`）。DeepSeek 返回的错误消息截到 500 个字符。
- 失败时不返回已收到的部分正文，没有明细。

### 行的投影

```ts
// packages/util/shared/src/session/tool-preview.ts — ToolUiPreview 新增
| {
    kind: "deep_search";
    question: string;
    displayText: string;          // "Deep Search <question>"，运行中有进度时接 " · <progress>"
    stats?: string;               // 完成时的摘要，如 "6 searches · 11 sources"
    queries?: string[];
    sources?: { title: string; url: string; site?: string }[];
    failedPages?: { url: string; code: string }[];
    errorText?: string;           // 失败时展开显示的文字
  }
```

`packages/util/shared/src/session/message-block.ts` 新增同形的 `deep_search` 块，另带 `id`、`createdAt`、`status?`（和 `web_search` 块同一组取值）。

`toolPreview` 里 `deep_search` 的取值规则：

| 字段 | 来源 |
| --- | --- |
| `question` | 调用参数 `question`；没有时（历史里被延迟加载的行，调用事件的参数已被裁掉）取 `tool.argsSummary.fields` 里名为 `question` 的值；都没有时空字符串 |
| 进度 | 只在 `phase === "running"` 且 `data.summary` 是 `searching …`、`reading …`、`summarizing` 之一时采用（实时通道把进度消息放在 `data.summary` 里） |
| `stats` | 完成且成功、摘要匹配 `^\d+ search(es)? · \d+ sources?$` 时采用，否则不设 |
| `queries`、`sources`、`failedPages` | 标签为 `deep-search` 的明细块；没有明细（延迟加载的行）时不设。逐项校验类型和长度，网址只留 `http`、`https` |
| `errorText` | 失败时按失败码查中文；查不到用失败消息原文 |

失败码到中文的映射放新文件 `packages/client/client/src/sessions/tool-failure-text.ts`，导出 `deepSearchFailureText(code, message)`（PB 在同一个文件加 `documentFailureText`）。`TOOL_SCOPE_DENIED` 在这里和 `DEEP_SEARCH_UNAVAILABLE` 映射到同一句话：主 Agent 里，调用发出后工具被隐藏，运行时给的就是这个码。

## 任务

### PA.1 用真实接口核对提示词和引用位置

需要 `DEEPSEEK_API_KEY`。脚本放仓库外的临时目录，只从环境变量读 Key。

- 用上面的请求体跑 5 个问题：2 个中文、2 个英文的多来源问题，1 个不需要搜索的问题。保存完整的事件流。
- 核对并记录：
  1. 事件顺序和字段名是否和「流的解析」一节一致（`step`、`call`、`action`、`sources`、`page`、`error.code`、`usage` 出现在哪个 chunk）。不一致就改这一节和设计文档第 3.1 节。
  2. 系统提示词有没有把正文压成要点：正文字符数、从第一个正文字符到结束的时间。和 2026-11-14 没有系统提示词的实测（约 5.5 秒写完整回答）对比。
  3. 按码点把 `[n]` 插在每条引用的 `end_index` 处，人工看 5 份结果：标记落在句子或列表项末尾的比例、越界的引用条数。
  4. 不需要搜索的问题：有没有 `annotations`，`usage.server_tool_use` 是否缺席。
- 把 2 到 3 份事件流脱敏后存成测试夹具 `packages/web/tool-deep-search/src/test/fixtures/*.sse.txt`：不含请求头，来源标题和网址保留（是公开网页），正文里如有人名之外的个人信息则替换。
- 结论写进执行过程记录，不贴原始响应。

回退规则：

- 第 2 项没有改善：仍然用这段提示词，在设计文档第 13 节记下「要点提示词没有明显缩短耗时」。
- 第 3 项，落在句末的比例低于 80%：不在正文里插 `[n]`，改成只在末尾列 `Sources:`，工具说明里的那句话改成「引用时从 Sources 里选对应的网址」。同步改设计文档第 7.1、7.3 节。
- 没有 Key：按本文的写法实现，夹具按官方文档手写，执行摘要里把 PA.1 标成「未验证」。

验证：执行过程记录里有四项结论。

### PA.2 解析流、组装结果

- 新建 `packages/web/tool-deep-search/src/sse.ts`：`async function* readSseData(body: ReadableStream<Uint8Array>, onData: () => void): AsyncGenerator<string>`。按行切分，支持 `\n` 和 `\r\n`、跨 chunk 的半行、一个事件多行 `data:`；注释行不调用 `onData`。
- 新建 `packages/web/tool-deep-search/src/stream-state.ts`：把 chunk 逐个喂进去，维护正文、搜索词、来源查找表、打不开的网页、计费次数、结束原因、当前进度消息。
- 新建 `packages/web/tool-deep-search/src/assemble.ts`：见契约。
- 测试，`src/test/sse.test.ts`、`stream-state.test.ts`、`assemble.test.ts`：
  - 半行、`\r\n`、注释行、`[DONE]`。
  - 夹具回放后得到的搜索词、来源、进度消息序列（只在变化时出现）。
  - 一步里先搜索后读页时进度从 `searching` 变成 `reading`；单复数。
  - 引用标记：按码点切分（正文含 emoji 和中文）、从后往前插、同一位置同一来源只插一次、越界的不插但来源照列、同一网址一个编号、编号按第一次被引用的顺序。
  - 标题的取法：查找表 → 引用自带 → 网址。标题等于网址时不重复写。
  - 没有搜索就作答：没有 `Sources`，有那一行说明。`length`：末尾有说明。
  - 各项上限：正文 20,000 字符截断并说明；明细里的搜索词 50 条每条 200 字符、来源 50 条、打不开的网页 20 条；统计数字不受明细上限影响。
  - 非 `http`、`https` 的网址被丢弃。
  - `billed.searches` 缺席时的回落算法。

验证：`pnpm --filter @actspace/tool-deep-search test`。

### PA.3 Node 端口：请求、超时、失败

- 新建 `packages/web/tool-deep-search/src/node-ports.ts`：

```ts
export type NodeDeepSearchPortsOptions = {
  readonly apiKey: () => string | undefined;   // 每次调用时读取
  readonly available: () => boolean;
  readonly fetchImpl?: typeof fetch;
  readonly idleTimeoutMs?: number;             // 默认 40_000，测试里改小
  readonly totalTimeoutMs?: number;            // 默认 120_000
};
export function createNodeDeepSearchPorts(options: NodeDeepSearchPortsOptions): ToolPorts;
```

- `deep_search` 处理函数：先查 `available()` 和 Key → 校验 `question`（去掉首尾空白后 1 到 4000 个字符，否则 `INVALID_ARGUMENTS`）→ 发请求 → 读流 → 组装。进度用 `context.reportProgress({ message })`。
- 空闲计时器在每次 `onData` 时重置；总时长用 `AbortSignal.timeout`；两者和 `context.signal` 合并成一个信号传给 `fetch`。区分三种中止原因，分别返回 `DEEP_SEARCH_IDLE_TIMEOUT`、`DEEP_SEARCH_TIMEOUT`、`TOOL_ABORTED`。
- `src/index.ts` 加上 `export * from "./node-ports.js"`。`plugin.ts` 不 import 它。
- 测试，`src/test/node-ports.test.ts`（假 `fetch`，返回可控的 `ReadableStream`）：
  - 请求的网址、方法、请求头、请求体和契约一致；Key 不出现在任何结果、进度或错误消息里。
  - 两次调用之间换 Key，第二次用新 Key；Key 变空时返回 `DEEP_SEARCH_UNAVAILABLE` 且没有发请求。
  - `available()` 为假时不发请求。
  - 失败表的每一行各一条。
  - 只发 `: keep-alive` 的流在空闲超时后失败；每隔一段发真实 chunk 的流不会因空闲失败，但会在总时长到达时失败。
  - 中止：`fetch` 收到的信号被中止，读取器被释放，返回 `TOOL_ABORTED`。
  - 流中途的 `error` chunk、`finish_reason` 之前断流。
  - 成功路径：进度消息序列、摘要、明细。

验证：`pnpm --filter @actspace/tool-deep-search test`。

### PA.4 Host 接线

- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`：加

```ts
[DEEP_SEARCH_HOST_PORT_ID]: {
  available: () => options.modelRuntime.isDeepseekDeepSearchAvailable?.() === true,
  createPorts: () => createNodeDeepSearchPorts({
    available: () => options.modelRuntime.isDeepseekDeepSearchAvailable?.() === true,
    apiKey: () => options.modelRuntime.getDeepseekApiKey?.(),
  }),
},
```

- `packages/host/agent-host/src/node-ports/tool-host-services.ts`：`createNodeToolHostServices` 里，`ACTSPACE_DEEPSEEK_DEEP_SEARCH === "1"` 且有 `DEEPSEEK_API_KEY` 时 `available` 为真，Key 取环境变量。`createUnavailableToolHostServices` 不提供这个端口。
- `apps/desktop/package.json`、`packages/host/agent-host/package.json` 加依赖 `@actspace/tool-deep-search`；重新生成构建图。
- 测试：
  - 新建 `apps/desktop/src/main/test/runtime-v2-deep-search-port.test.ts`：开关或 Key 变化后 `available()` 立刻跟着变；端口每次调用读当前 Key；`modelRuntime` 没有这几个可选成员时 `available()` 为假。
  - `packages/host/agent-host/src/test/` 加一条：两个环境变量四种组合下 `available()` 的值。
  - `packages/core/runtime/src/harness/default-harness.test.ts` 里 P0.5 加的那条测试改用真实的 `createNodeDeepSearchPorts`（假 `fetch`），跑通一次工具调用，并确认 `explore` 预设的子智能体没有这个工具、`general` 预设有。

验证：`pnpm --filter @actspace/desktop test && pnpm --filter @actspace/agent-host test && pnpm --filter @actspace/runtime test && pnpm check:packages && pnpm check:desktop-build-graph`。

### PA.5 设置开关

- `apps/desktop/src/renderer/components/settings/SearchSettings.tsx`：第一组里「允许联网搜索」下面加一行。

| 项 | 内容 |
| --- | --- |
| 标题 | 使用 DeepSeek 深度搜索 |
| 说明 | 有 Key：「问题将发送至 DeepSeek · 搜索 ¥0.005 / 次，另计模型用量」；没有 Key：「请先连接 DeepSeek」 |
| 开关显示为开 | 有 Key 且 `deepseekDeepSearchEnabled === true` |
| 置灰 | 设置还没加载、正在保存、没有 Key、「允许联网搜索」关着 |
| 保存 | `saveTools({ deepseekDeepSearchEnabled })` |

  「允许联网搜索」关着时不改存着的值，只是置灰；重新打开后恢复原来的状态。
- 测试，`apps/desktop/src/renderer/test/search-settings.test.tsx`：两种说明文字、三种置灰条件、点击后保存的补丁。

验证：`pnpm --filter @actspace/desktop test`。

### PA.6 共享类型与行的投影

- `packages/util/shared/src/session/tool-preview.ts`、`message-block.ts`：新增 `deep_search`。
- `packages/util/shared/src/session-selectors.ts`：`messageBlockFromToolPreview` 的分支里加一个 `case "deep_search"`，只做字段搬运。
- `packages/client/client/src/sessions/tool-failure-text.ts`：新建。
- `packages/client/client/src/sessions/deep-search-preview.ts`：新建，导出 `deepSearchPreview(input)`，实现「行的投影」一节的规则。`tool-card.ts` 里只加一行分发：`if (localName === "deep_search") return deepSearchPreview({ … })`。
- `packages/client/client/src/live/stream-blocks.ts`：加 `getStreamingDeepSearchText(preview)`（返回 `displayText`）和 `toolEntryToBlock` 里的一个分支。
- 测试：
  - `apps/desktop/src/main/test/runtime-v2-tool-preview.test.ts`：生命周期表里加 `["deep_search", "deep_search"]`。
  - 新建 `packages/client/client/src/test/deep-search-preview.test.ts`：运行中没有进度、有进度；完成；失败码各一条加一条未知码；`denied`；中止；延迟加载的行（没有调用参数、没有明细，只有 `tool.argsSummary` 和摘要）得到问题和统计；超过 240 个字符的问题显示截断后的文字；明细里的坏数据（不是数组、网址不是 `http`）被丢弃。
  - `packages/util/shared` 里 `messageBlockFromToolPreview` 的现有测试加一条。

验证：`pnpm --filter @actspace/shared test && pnpm --filter @actspace/client test && pnpm --filter @actspace/desktop test`。

### PA.7 桌面端的行、Web / PWA 的单行、mock 场景

桌面端：

- 新建 `apps/desktop/src/renderer/components/messages/DeepSearchBlock.tsx`。从 `ToolLogLine.tsx` 导出 `ToolSummary`、`getToolLogLineClass`、`getToolFailureLabel` 三个现有的小函数给它用，不复制。

| 状态 | 样子 |
| --- | --- |
| 运行中 | 一行 `displayText`，共享流光（`ToolLogShimmer`），不能展开 |
| 完成 | `ToolSummary`：动作 `Deep Search`、目标是问题、行尾是 `stats`。能展开 |
| 展开 | 「搜索词」列表；「引用来源」编号列表，每条是标题链接加站点名；有打不开的网页时多一组「未能打开」，每条是网址加错误码 |
| 失败、`denied` | 行尾是 `getToolFailureLabel(status)`；展开是 `errorText` |
| 中止 | 行尾 `aborted`，不能展开 |
| 延迟加载的行 | 没有明细但有 `onExpand` 时仍然能展开；第一次展开调用 `onExpand()`，加载期间和加载失败的提示由现有的 `DeferredToolMessage` 负责 |

  来源链接写成 `<a href target="_blank" rel="noopener noreferrer">`，和 `WebToolBlock` 一样，由主进程的窗口安全规则交给系统浏览器。标题、站点名、网址都作为文本渲染。
- 新建 `apps/desktop/src/renderer/styles/deep-search.css`（在 `styles/index.css` 里引入）。只用主题 token；编号、标题、站点名的字号和颜色照 demo 第 2 节的方案 b。
- 分发，各加一个 `deep_search`：`components/conversation/render-message.tsx`（渲染 `DeepSearchBlock`，传 `onExpand`）、`components/conversation/turns.ts` 的 `TOOL_LOG_MESSAGE_KINDS`、`components/messages/messageFlowStyles.ts`（归入 `process`）。
- 测试，新建 `apps/desktop/src/renderer/test/deep-search-block.test.tsx`：上表每个状态一条；展开后链接的 `href`、`target`、`rel`；标题里的 HTML 作为文本出现；键盘能展开（按钮有 `aria-expanded`）；`deferred-tool-message.test.tsx` 加一条 `deep_search` 的延迟加载。

Web / PWA：

- `apps/web/src/sessions/transcript-model.ts`：`ExploreBlock` 和 `EXPLORE_KINDS` 加 `deep_search`。
- `apps/web/src/pages/session/blocks/ExploreGroup.tsx`：`exploreLine` 加 `case "deep_search": return { verb: "Deep Search", target: block.question, meta: block.stats }`。
- 测试：`apps/web/src/sessions/test/transcript-model.test.ts` 加一条分组；`ExploreGroup` 的行文字加一条。

mock 场景：

- 新建 `apps/desktop/src/renderer/mock/scenarios/deepseek-tools.ts`，在 `scenarios/index.ts` 登记为 `deepseek-tools`。一个会话：一条完成的 `Deep Search`（6 个搜索词、11 个来源、1 个打不开的网页）、一条失败的（余额不足）、一条中止的；回复里有两处行内链接。PB 在同一个文件里加文档的行。
- `docs/FRONTEND_VERIFICATION.md` 的 mock 场景表加一行。

验证：`pnpm --filter @actspace/desktop test && pnpm --filter @actspace/web test && pnpm check:frontend-tokens && pnpm check:frontend-theme`；`pnpm --filter @actspace/desktop dev:renderer` 打开 `?mock=deepseek-tools`，浅色、深色、480px 窄宽各看一遍，对照 demo。

### PA.8 Chat 模式

按总览「出入 1」的审核结论做。下面是计划里写的做法（独立工具）：

- `packages/web/tool-deep-search/src/plugin.ts`：`deep_search` 的 `modes` 改成 `["chat", "plan", "agent"]`。定义摘要变了，`definitionVersion` 仍是 1（这个版本还没有发布过）。
- `packages/core/agent/src/main-preset.ts`：Chat 预设的 `allowedToolNames` 类型和值加上 `"deep_search"`，注释写明它只在可用时出现。这个字段只用来说明，运行时按工具定义的 `modes` 决定。
- 测试：
  - `packages/core/agent/src/test/main-preset.test.ts`：标题和断言改成「Chat 固定两个工具，另有可选的 `deep_search`」。
  - `packages/core/runtime/src/harness/default-harness.test.ts`：Host 给了端口且可用时，Chat 的可见工具是 `["deep_search", "generate_image", "web"]`；不可用时是 `["generate_image", "web"]`。
  - Chat 里调用一次 `deep_search` 能完成（假 `fetch`）。
- `docs/design-docs/agent-runtime/agent-forms-and-modes.md`：四处「Chat 恰好两个工具」的表述（第 11、82、86、158 行附近）改成「固定 `web`、`generate_image`；深度搜索可用时多一个 `deep_search`」。

如果审核结论是坚持「`web` 的第三种动作」：这个任务换成总览里写的替代做法，开工前先把替代做法展开成同样粒度的步骤，再给用户看一眼。

验证：`pnpm --filter @actspace/agent test && pnpm --filter @actspace/runtime test && pnpm --filter @actspace/tool-deep-search test`。

### PA.9 文档、真实验收、history

文档：

- `docs/design-docs/tool-system/agent-web-tools.md`：「不通过额外 LLM 总结网页」限定为 `web`、`web_search`、`web_fetch`；「凭据不会改变 schema 注册」后面补一句 `deep_search` 例外并链接到设计文档；新增「深度搜索」一节（一段话加链接）；环境变量加 `ACTSPACE_DEEPSEEK_DEEP_SEARCH`。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：新增 `deep_search` 一节（运行中、完成、展开、失败、延迟加载时用什么）；`web_search` 一节不改。
- `docs/design-docs/frontend/front-中间消息区规范.md`：「工具行」一节加 `Deep Search` 行。
- `docs/design-docs/frontend/front-设置页规范.md`：第 6 节加这个开关。
- `docs/SECURITY.md`：第 72 行附近「联网能力」那句补上「打开深度搜索后，问题会发给 DeepSeek 由其服务端搜索」；第 76 行附近补上深度搜索写进会话的内容范围（要点、被引用来源的标题和网址、次数；不写网页原文和思考过程）。
- 设计文档：第 7 节和第 9.1、9.3 节改写成当前事实，写上实际的文件路径；第 13 节按 PA.1 的结论更新。
- `packages/web/README.md`、`packages/web/tool-deep-search/README.md`：补上 `node-ports.ts` 和测试命令。

真实验收（需要 Key；在真实应用里，`pnpm dev:log`）：

1. 没连接 DeepSeek：开关置灰，说明是「请先连接 DeepSeek」。
2. 连接后打开开关，不重启，发一条需要多来源的问题：模型调用 `deep_search`；行在运行中依次出现 `searching`、`reading`、`summarizing`；完成后行尾有统计；展开能看到搜索词和来源，点来源用系统浏览器打开；回复里有行内链接，网址都在来源列表里。
3. 关掉开关，同一个会话再问一次：模型不再调用 `deep_search`。
4. 运行中点停止：行变成 `aborted`，几秒内结束。
5. Chat 模式重复第 2 步。
6. 重启应用后打开这个会话：历史里的行、统计和展开内容都在。
7. 录屏或截图存进执行记录（浅色、深色各一张）。

收尾：

- `docs/histories/2026-11/` 新增一条；执行记录写 `execution-process.md`。
- 更新总览的进度和状态行。

验证：总览「统一验证命令」的两组。

## 完成标准

- 两组验证命令全部通过，和基线相比没有新增失败。
- 真实验收 7 步通过；没有 Key 时，执行摘要里写明哪几步没有验证。
- 开关关着时，发给模型的工具列表和 P0 完成时一样。
- `rg "sk-[A-Za-z0-9]{8,}"` 在仓库里没有命中；夹具和执行记录里没有 Key。

## 回退

关掉设置开关即可停用。要撤代码：回退 PA 的提交；P0 留着无害。`deepseekDeepSearchEnabled` 留在设置文件里不会被读取。
