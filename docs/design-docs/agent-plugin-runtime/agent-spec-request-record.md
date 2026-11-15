# 请求记录：只在变化时写完整内容，估算全部从日志推算

> 管每次模型调用在日志里留下什么（`request/header`、`request/context`，以及新增的 `request/system-prompt`、`request/tools`），以及上下文 token 估算从哪里来。流式输出见[流式输出只走实时通道](agent-spec-live-assistant-stream.md)，事件词汇见[事件模型](agent-spec-dsh-event-model.md)，投影架构见[Runtime Projection](agent-spec-runtime-projection.md)。

状态：已实现，执行计划 [20261106-request-record](../../exec-plans/completed/20261106-request-record.md)。压缩替换按 DSH 的做法，在替换事件上记录被替换部分的估算（§6.3.1）。§9 的实机对比待用户删除旧会话后重跑。

## 1. 为什么改

2026-11-06 的实机记录 `tmp/heap/run2/` 是同一工作区、一次 26 个请求的运行。日志 9.1 MB，其中 `request/context` 占 7.9 MB。每次请求都把这次发给模型的全部输入原样存一份：

| 字段 | 26 次里有几种不同的值 | 合计 | 说明 |
|---|---|---|---|
| `messages` | 26 | 4.8 MB | 整段对话，每次是上一次加上新增的结尾；最后一条 340 KB |
| `contextManifest` | 26 | 586 KB | token 估算明细，每条消息一行，从 62 行涨到 174 行 |
| `tools` | 1 | 546 KB | 每次约 21 KB，一模一样 |
| 系统提示词（`renderedSystemPrompt` / `systemSections` / `contextSections`） | 1 | 565 KB | 同一份内容存了三种形式 |
| 模型事实（`modelFacts` / `contextModelFacts`） | 1 | 641 KB | 同一份内容存了两种形式，技能目录约 12 KB |
| 其他（`contributorProvenance`、`prepared`、`facts` 等） | 1 | 约 40 KB | |

问题：

- **对话存了第二份。** 模型请求每次都由上下文引擎从对话事件、补充事件重新拼出（`context-engine/src/engine.ts` 的 `toLlmInput`）。快照里的 `messages` 没有任何地方拿来重建请求，纯属重复。
- **不变的内容每次重写。** 提示词、工具、模型事实每次约 80 KB。
- **估算数存进了日志。** `contextManifest` 是从内容推算出来的数字，随对话增长，而且和面板、输入框用的另外两套估算算法不一致（§6.1）。
- **长会话会写入失败。** 单条日志记录上限 1 MiB（`session-journal/src/event-envelope.ts`）。快照超过 960 KB 时会丢掉部分字段，但从不裁剪 `messages`，所以对话 JSON 一旦超过约 1 MB，这条事件就写不进去，请求直接失败（按代码推断，没有实测）。
- **投影热点。** `requestContext` 投影每遇到一个带 surface 的事件，都拿最新快照把整段对话重算一遍（`projectContextState`）。run2 里这一项分配约 0.7 GB。

## 2. 对齐 DeepSeek harness

DSH 的原则是「凡是发给模型的东西，都能从日志重新拼出来」（`tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.zh.md`）。所以它的每个组成部分都只记一次：

| 组成 | DSH | 本规范 |
|---|---|---|
| 对话 | 对话事件，发生时记一次 | 相同：快照不再存对话 |
| 系统提示词 | `system/message`，内容变化才写 | `request/system-prompt`，变化才写（§4）。不放进对话 |
| 工具 | 在 `request/header` 里，header 变化才写 | `request/tools`，变化才写（§4） |
| 模型配置 | `request/header` + `request/context`，变化才写 | `request/header` 仍每次写（§3） |
| token 估算 | 不进日志，投影从日志算（`dsh-token-meter`） | 相同（§6） |

DSH 试过「只记差异」的 header-delta，后来删掉了，原因是要维护 diff/apply 两套逻辑。它也否决过「只引用上一份」的轻量标记，原因是只加载后半段日志时找不到那一份。本规范沿用它的结论：**变化时写一份完整、自包含的内容，不变就不写。**

和 DSH 不同的两点：

- **系统提示词不进对话。** DSH 把它做成对话里的第 0 条消息，是为了支持对话中途追加系统提示词、保住 KV 缓存。这需要改请求拼装、压缩和对话投影，和省空间无关，这次不做。以后要做，可以从 `request/system-prompt` 升级过去。
- **`request/header` 仍每次写。** 它只有约 200 字节，并且带 `requestId`。轨迹、用量统计、崩溃恢复、日志校验（每个请求必须有 header）都靠它把事件按请求对上。

## 3. 一次请求写哪些事件

顺序固定，都写在 `request/header` 之后、`request/context` 之前：

```
request/header          每次写
request/system-prompt   本次提示词与日志里最近一条不同时才写
request/tools           本次工具与日志里最近一条不同时才写
request/context         每次写
```

- 「不同」按内容 digest 比较，比较对象是**日志里**最近一条同类事件，不是内存。所以进程重启、恢复会话后，只要内容没变就不会重写。子 Agent 有自己的日志，第一次请求时照常写。
- 重试（`loop.ts` 的 `llm/retry` 之后）也走同样的规则，通常不会多写。
- 关系校验（`invariant-validator.ts`）：两种新事件只能出现在「已打开、还没写 `request/context`」的请求里，`requestId` 必须相同。`request/context` 仍是每个请求一条。
- 无 `contextSources` 的旧拼装路径已删除（2026-11-13）：`AgentLoop` 的 `contextSources` 是必填项，测试夹具默认带对话和工具两个透传来源。

## 4. 两个新事件

### 4.1 `request/system-prompt`

```
{ requestId, turnId, stepId, digest,
  sections:    [{ owner, id, order, content, provenance? }],   // 系统提示词各段
  modelFacts:  [{ owner, id, order, content }],                // 模型事实（含技能目录）
  contributorProvenance: [...] }                               // 提供方来源
```

- 只存结构化的一份。拼好的文本由 `renderSystemPrompt(sections, modelFacts)` 推出，这个函数移到 `@actspace/shared`，引擎和轨迹共用。
- `digest` 是上面三项的内容 hash。

### 4.2 `request/tools`

```
{ requestId, turnId, stepId, digest, tools: LlmToolDefinition[] }
```

### 4.3 读取规则

某次请求生效的提示词和工具，是 **seq 不大于该请求 `request/context` 的最近一条** `request/system-prompt` / `request/tools`。所有读取方都用 `@actspace/shared` 里的同一个函数取，不各写一套。

## 5. `request/context` 只留每次都会变的小字段

```
{ requestId, turnId, stepId, snapshot: {
    schemaVersion: 3, sessionId, logicalAgentScopeId,
    contextRevision, throughJournalSeq, surfaceGeneration, turnId, stepId,
    systemPromptDigest, toolsDigest,
    prepared, requestOptions, contextModel,
    compositionDigest, hostCapabilityDigest } }
```

- 删除的字段：
  - `messages`；
  - `tools`；
  - `renderedSystemPrompt`、`systemSections`、`contextSections`；
  - `modelFacts`、`contextModelFacts`；
  - `facts`、`contributorProvenance`；
  - `contextManifest`。
- 删除 `request-snapshot.ts` 里 960 KB / 256 KB 的裁剪逻辑：已经没有能长到那么大的字段。
- 每条约 1–2 KB。按 run2 估算，日志从 9.1 MB 降到 1 MB 左右。

## 6. 上下文估算：只从日志推算

### 6.1 一套算法

目前有三套，同一段中文最多差 4 倍：

| 现在 | 规则 | 用在哪 |
|---|---|---|
| `estimateContextTokens`（context-engine） | 字数 ÷ 4 | 面板、Harness 统计、自动压缩、容量检查 |
| `estimateTokens`（shared/context-projection） | ASCII 4 字 1 token，其余每个 UTF-16 单元 1 token | 输入框圆环（部分情况）、Web 百分比 |
| `tokensOf`（harness-stats-projection） | 字数 ÷ 4 | 输出、索引等统计 |

统一成 `@actspace/shared` 里的一套，照 DSH `dsh-token-meter/src/estimate.ts`：

- 文本：所有字符一律 4 个算 1 token（`Math.ceil(length / 4)`）；非字符串内容先 `JSON.stringify`。
- 结构开销：每块内容加 4 token，每条消息再加 4 token；系统提示词整体、工具定义整体各加 4 token。
- 用 run1、run2 共 58 次请求对照服务商报告的输入 token（输入 + 缓存读 + 缓存写）：平均 −3%，范围 −8% ~ +6%。实际请求里约 98% 是 ASCII（代码、工具输出、JSON），纯中文文本会少算更多，这一点接受。

上面三处，以及自动压缩触发、请求前的容量检查，都改用它。估算版本号随之更新。

### 6.2 估算明细的定义只有一份

「哪些内容算一项、属于哪个分类、key 是什么」现在写在 `content-manifest.ts` 的 `describeContextContent` 里。把它改成 `@actspace/shared` 里的纯函数，输入是：

- 系统提示词各段、模型事实；
- 工具；
- 补充上下文；
- 对话；
- 哪些消息是压缩摘要。

分类沿用现有六个：系统提示词、规则、技能、工具、对话、压缩摘要。entry key 的格式不变。引擎（面板「当前」、自动压缩）和日志折叠（§6.3）都调用它，所以两边的数字一定相同。

### 6.3 上下文估算投影

新增会话投影 `contextEstimate`，替代现在的 `requestContext`。照 DSH `dsh-token-meter` 的 `contextBreakdown`（`tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-10-13-context-breakdown-system-prompt-state.zh.md`）设计：**状态大小只取决于系统提示词和工具的项数，不随消息数增长。**

状态：

- 系统提示词、规则、技能、模型事实、工具的逐项估算（key、分类、标题、估算）。这些项来自最近一条 `request/system-prompt` / `request/tools`，平常几十项。
- 补充上下文的逐项估算，按 `owner/id`。
- 对话的两个合计：`conversation` 和 `summarizedConversation`。
- 上下文窗口：来自最近一条 `request/header` 或 `request/context` 的 `contextModel`。

折叠：

| 事件 | 处理 |
|---|---|
| `request/system-prompt` | 系统提示词、规则、技能、模型事实各项整体换成新的 |
| `request/tools` | 工具各项整体换成新的 |
| 追加对话节点（user / assistant / tool 结果等 surface `append`） | 这个节点的估算加进 `conversation` |
| 补充上下文增删 | 增加或删除对应项 |
| 压缩替换（`surface/replaced`，`kind: "replace"`） | 按事件里的被替换估算（§6.3.1）从两个对话合计里减掉，再把摘要节点的估算加进 `summarizedConversation` |
| 其他 | 返回原状态 |

对外提供：当前总数、六个分类合计、上下文窗口、非对话项的明细。每个事件只做一次增量计算，不再重算整段对话。

#### 6.3.1 被替换部分的估算写在替换事件上

- 压缩在写 `surface/replaced` 时，在 `data` 里带上：
  - `replacedTokens: { conversation, summarizedConversation }`：被替换范围按当前算法的估算，按节点是否是之前的压缩摘要分开记；
  - `estimatorVersion`。
- 这两个数由压缩代码在提交时用同一个估算函数算出。`context-engine/src/compaction.ts` 的 `compactionTokens` 已经在算被替换范围（`removed`），改成统一算法后直接复用。
- 新写的 `surface/replaced` 必须带这两个字段，codec 校验。目前只有压缩会产生 `replace`；以后新增替换来源也必须带。
- 投影遇到替换事件时，减去这两个数，两个合计都不低于 0。
- 已接受的代价：日志里存了被替换部分的估算数。以后换算法，这个数仍是旧算法的结果，压缩之后的合计会有偏差。`estimatorVersion` 用来识别这种情况。

#### 6.3.2 对话的逐条明细按需现算

投影不保存逐条对话的估算。

- 面板「当前上下文」需要对话明细时，用 §6.2 的同一个函数对当前对话现算一次：
  - 引擎在线时，用引擎实例的内容；
  - 引擎不在线时，用日志折叠出的当前对话（`SessionSurface`），加上投影里的系统提示词、工具和补充项。
- 只在打开面板、翻页时算，不在每个事件上算。

### 6.4 各功能改读什么

| 功能 | 改后来源 |
|---|---|
| 输入框圆环、Web 端百分比 | `contextEstimate` 投影。只有这一个来源；删除 `describeContext` 轮询里另一套算法的结果 |
| 面板「当前上下文」总数、分类 | `contextEstimate` 投影 |
| 面板「当前上下文」明细 | 非对话项来自投影；对话项按需现算（§6.3.2） |
| 面板明细的预览、全文 | 不变，按 key 向引擎实时实例读取（`readContextEntry`）。引擎不在线时没有预览，这和现在一样 |
| 对比上一次请求 | 非对话项：SQLite 历史投影在每个 `request/context` 时存下当时的非对话明细，只保留最近 2 次。对话项：seq 在上一次请求的 `request/context` 之后的标为新增；之后被压缩掉的部分由压缩事件标记，不再逐条对比 |
| 趋势图 | 同一个历史投影每次请求记一行：总数、六个分类，外加已有的实际用量 |
| 「工具清单已变化」事件 | 第一条之后，每出现一条 `request/tools` 就记一次 |
| 「模型已切换」事件 | 不变（`contextModel`） |
| Harness 统计：分类、逐项、估算误差、技能目录、工具曝光 | 同一个折叠在每次请求时的结果；技能目录从 `request/system-prompt` 的模型事实读 |
| 自动压缩触发、容量检查 | 引擎实时内容 + 统一算法（§6.1） |

主进程 SQLite 历史（`context-history-projection.ts`）和 Harness 统计（`harness-stats-projection.ts`）调用和投影**同一个折叠函数**，不再读日志里的估算数。两处 SQLite 的 projector 版本号都要更新，让已有索引重建。

## 7. 其他读取方

- **轨迹：**
  - 系统行和工具 Schema 读 §4.3 生效的那一条。
  - 「已加载 / 已更新 / 已移除」上下文记录（`context-sections.ts`）改成比较相邻两条 `request/system-prompt`。
  - 「原始内容」显示 `request/context`，加上当时生效的提示词和工具。
  - 删除 `inheritPrompt` / `promptUnchanged`。
- **历史窗口（`slimHistoryWindow`）：**
  - 加载最近 20 轮时，把窗口起点之前最近一条 `request/system-prompt` 和 `request/tools` 一起带上，否则轨迹的系统行显示不出来。
  - 删除对 `request/context` 的裁剪和 `promptUnchanged`：它已经足够小。
- **context-disclosure 插件：** 改成从 `request/system-prompt` 的 `contributorProvenance` 判断 disclosure 是否启用，读取规则同 §4.3。
- **用量统计、会话列表：** 只读 `prepared.route/model`，不变。
- **崩溃恢复（`recovery.ts`）：** 只看 `requestId`，不变。
- **删除：**
  - `persisted-manifest.ts`；
  - `projectContextState` / `projectManagedContextState` 里从快照读 `messages` 的逻辑；
  - `browseContextState`：生产代码里没有任何地方写它。

## 8. 旧会话

开发阶段，不做兼容。读取方遇到旧格式缺字段时按「没有」处理，不崩溃，也不写回退代码。旧会话由用户自行删除，代码不碰用户数据目录。

## 9. 验收

- 用 `tmp/heap/monitor.mjs` 在同一工作区重跑一次，与 run2 对比：
  - 日志总大小；
  - `request/context` 单条大小；
  - 两种新事件的条数，应等于提示词、工具实际变化的次数；
  - 主进程累计分配，重点看原来 `requestContext` view 那 0.7 GB。
- 功能：
  - 输入框圆环和面板总数是同一个数；
  - 面板明细、对比上一次请求、趋势图、工具变化事件、Harness 统计都正常；
  - 自动压缩按阈值触发，压缩后估算下降；
  - 轨迹系统行、工具 Schema、上下文增减记录正常，历史窗口翻页后系统行仍显示；
  - context-disclosure 正常启用。

## 10. 排除的方案

- **同一个 `request/context` 里省略不变字段，用 digest 标记：** 同一事件会有两种形状，每个读取方都要分开处理。
- **对话存增量（沿用前 N 条 + 新增）：** 没有读取方需要快照里的对话。
- **估算明细继续每次存（原 D1）：** 估算数和真实内容成了两份，换算法时旧数字不会跟着变。
- **系统提示词进对话（DSH 的 `system/message`）：** 见 §2，这次不做。
- **投影保存逐条对话估算，压缩时自己减：** 日志里不存任何估算数，但投影状态随消息数增长，还会写进投影缓存。DSH 在这一点上踩过坑（836 个会话累积到 7.13 MB），后来改成在替换事件上记录被替换部分的估算。
