# 上下文引擎不再每次请求复制对话

> 管上下文引擎每次请求时怎样对待对话、怎样判断「上下文变了没有」、发给模型的请求怎样检查。引擎结构见 [上下文管理引擎](../上下文管理引擎设计/README.md)，对话节点从哪里来见[对话内容只存一份](agent-spec-surface-derived.md)，请求记录见[请求记录](agent-spec-request-record.md)。

状态：已实现。执行计划与记录见 [20261107-context-trusted-surface](../../exec-plans/completed/20261107-context-trusted-surface.md)；实机分配对比（§6 最后一条）待用户重跑 monitor。

## 1. 为什么改

run7（父会话 + 4 个子 Agent，`tmp/heap/run7/`）主进程的分配采样里，上下文引擎这几处合计约 960 MB：

| 位置 | 分配 | 在做什么 |
|---|---|---|
| `freezeContextView` ← `registry.apply`、`#assemble` | 约 250 MB | 把整段对话序列化、解析回来、再深度冻结一份副本 |
| `stateDigest` ← `instances.acquire` | 约 240 MB | 每次提交都把整个上下文（含整段对话）转成一个 JSON 字符串，和上一次比较；每次请求提交 2 次 |
| `toLlmInput` 末尾的 `freezeRequest` | 约 140 MB | 拼好的全部消息再序列化、解析、冻结一次 |
| 会话源 `context-conversation` 的 `cacheKey` | 约 133 MB | 每次组装都把整段对话转成字符串当缓存 key |
| 其余 `contextValue` / 面板投影 | 约 190 MB | 零散的冻结，以及面板读取时的 `projectContext` 整份复制 |

而转换消息本身（`convertMessages` 和 `surfaceMessage`）只有 5–8 MB。也就是说，钱几乎都花在复制和转字符串上。

这些复制保护的东西，对话在日志那一层已经做过了：

- 事件进入日志时（`journal.ts` 的 append、appendMany、seed），`snapshotSessionJson` 会做一整套处理（`event-envelope.ts`）：
  - 校验只含普通 JSON、数字有限、深度不超过 32；
  - 拒绝密钥字段，名单和引擎的 `SECRET_KEY` 相同；
  - 限制单条不超过 1 MiB；
  - 整份拷贝后深度冻结。
- 对话条目由 `SessionSurface` 折叠。条目本身和 `sourceEventSeqs` 都冻结；节点由 `surfaceNode(event)` 推出，直接引用已冻结的 `data`，不新建可变对象。
- 引擎里只有一个 reducer 会碰对话，它只能原样沿用上一次的对话（`reducers.ts`，`content.conversation = previous.content.conversation`）。会话源只是把它原样转交（`context-conversation/src/source.ts`）。

引擎还在每次请求时，用「序列化再解析」的方式把这段已经冻结的对话复制一遍。原因是它认不出这个对象可以信任：`contextValue` 只认自己冻结过的对象（`trusted` WeakSet），而日志每次读 `surface` 都返回一个新包装对象（`surface.ts` 的 `get view()`），所以每次都认不出。

## 2. 别家怎么做

| 项目 | 历史怎么传 | 怎么防止被改 | 怎么判断「变了」 |
|---|---|---|---|
| DSH | 事件进入时深冻结一次，之后共享引用；请求时用 WeakSet 记住冻结过的消息，不再复制 | 入口冻结 | `contentGeneration` 计数器，压缩或替换时才加 |
| codex | `Arc` 共享，要改时才复制（写时复制） | Rust 所有权 | `history_version` 计数器 |
| opencode / pi | 每步重读或直接用原数组 | 类型和约定 | 不判断 |

## 3. 改法

### 3.1 日志交出的对话视图是「已信任」的

- **怎么登记：** `@actspace/session-journal` 导出 `isTrustedSurfaceView(view): view is TrustedSurfaceView`。只有 `SessionJournal.surface` 交出的视图登记进模块内的 WeakSet（`surface-trust.ts`）。
  - `SessionSurface.fromView` / `fromEvents` 接受调用方的任意输入（runtime 的 surface 投影就用 `fromView`），它们的视图不登记。
  - 登记的视图本身、`entries` 数组、每个条目、节点外壳都已冻结（`surfaceNode` 推出节点时冻结外壳）；节点字段来自日志里已深度冻结的事件 data。
- **编译期区分：** `TrustedSurfaceView` 是带标记的类型（branded type），只有日志能产出。引擎内部的参数类型写清楚哪里要求已信任视图，编译时就能拦住把普通对象传进去。
- **运行时仍要查：** 运行时以 WeakSet 为准，不以类型为准。兼容旧调用的 `contextFromCandidate` 在内容不一致时会自己拼一个对话，这种对象不在 WeakSet 里，引擎照旧整份检查、冻结。
- **同一份对话只登记一个视图：** 视图对象按 `SessionSurface` 缓存，`#entries` 或 `#replaceGeneration` 变了才换新对象。这样同一份对话连续读两次，拿到的是同一个对象。
  - 这一条同时让下游按对象身份判断「对话没变」变得可靠，比如 WeakMap 缓存。

### 3.2 引擎遇到已信任的对话直接引用

- `contextValue(value)`：`value` 是已信任视图时原样返回，不复制、不冻结。
  - 一层包装（源交来的 `{ conversation: 视图 }`、组装中间的 content）里有已信任视图时，该子项原样引用，其余子项照旧检查、复制、冻结，键顺序不变。
- `freezeContextView` 里对话这一片也就跟着不再复制。其他片段的处理不变：系统提示词片段、模型事实、补充内容、工具、request、status 照旧检查并冻结。它们来自插件，日志没有检查过。
- `registry.ts` 里插件交来的内容（`contextValue(contribution)`）照旧检查。

### 3.3 判断「上下文变了没有」时，对话用版本号

- 现在：`stateDigest` 把除 `request` 以外的整个上下文转成字符串比较。
- 改后：对话这一片换成一个版本号。其余片段照旧转字符串，它们都很小。
- **版本号的组成：**
  - 已信任视图用 `${replaceGeneration}:${entries.length}:${最后一个条目的最大 sourceEventSeq}`。
  - 对话只能经过日志改变：要么追加（条数和最后一个 seq 会变），要么替换（`replaceGeneration` 会加 1）。所以版本号相同，内容就一定相同。
  - 不是已信任视图时（兼容路径），照旧转字符串。
- **约束（写进引擎规范）：** 任何 source 或 reducer 想改对话，只能交出日志的视图，或者交出一个新的普通对象（会走兼容路径）。不能原地修改。原地修改本来就会被冻结拦住，这条只是写明。
- 版本号只给上下文面板和请求记录用，Agent 循环不读。这个改动只改变「什么时候加 1」的计算方式，对同一段对话，结果和改前一致。

### 3.4 会话源的缓存 key

`context-conversation` 的 `cacheKey` 现在是 `JSON.stringify(context.content.conversation)`，改为和 §3.3 相同的版本号。函数 `surfaceViewVersion(view)` 由日志导出，引擎和会话源共用，不是已信任视图时退回转字符串。

### 3.5 发给模型的请求只检查新生成的部分

- 现在 `toLlmInput` 会对整个请求（全部消息、工具、options）做一次 `freezeRequest`。
- **改后：**
  - **对话转成的消息：** `convertMessages` 新建的消息对象，引用的是已冻结的节点内容；artifact 内联后的文字，是我们自己拼的字符串。消息数组和每条消息只做浅冻结（`Object.freeze`），不再序列化，也不再深拷贝。
  - **补充内容、系统提示词、工具、options：** 在组装时已经由 `contextValue` 检查并冻结过，这里直接引用。
  - **整体再查一遍：** 实现时改为按对话来源分支：对话是已信任视图或经引擎检查过的对象时，消息只做浅冻结（外壳、content 数组、块）；否则（调用方直接把普通 Context 交给 `toLlmInput`）消息照旧整份 `freezeRequest`。补充内容、系统提示词、工具、options 在组装时已由 `contextValue` 检查过，这里直接引用。
- **会削弱的东西：** 现在 provider 适配层如果原地改了消息里的深层对象，会因为深度冻结而报错。改后，消息里来自对话的部分仍然是冻结的（日志冻结过），引擎新建的消息外壳和数组是浅冻结。所以只有「改引擎新建的深层对象」这一种情况不再被运行时拦住。适配层（`@actspace/llm-service`、`@actspace/llm-pi-ai`）只读不写，执行时逐个核对，并加一条测试。

### 3.6 面板投影

`projectContext` 现在对整个 `context.content`（含对话）做 `freezeRequest`。改后，对话这一片直接引用已信任视图，其余照旧。投影已经按 Context 对象缓存，这里只是不再复制对话。

## 4. 不变的东西

- 插件交来的内容（系统提示词、补充、工具、status）照旧检查 JSON、拒绝密钥字段、冻结。
- 请求记录（`requestRecords`）照旧对系统提示词、工具和小快照做 `freezeRequest` 和摘要。它们不含对话，run7 里合计约 23 MB。
- 日志的校验和冻结不变。
- 发给模型的内容、请求记录、面板投影、版本号的含义，都和改前一致。

## 5. 不做

- 不把整个上下文改成深只读类型、去掉中间那几次小片段冻结（讨论中的方案二）。这几次冻结的分配占比很小，去掉的话还要动多个包的类型，并失去中间的防线。
- 不做增量组装或消息缓存（方案三）。转换消息本身只有 5–8 MB；而补充内容的插入位置、压缩后缓存失效、artifact 异步内联都要处理一致性，复杂度最高。
- 不改日志格式，不改请求记录。

## 6. 验收

- **等价：** 同一段会话（复用 `apps/desktop/src/main/test/fixtures/surface-derived/`，再加补充内容和工具），改前改后：
  - `toLlmInput` 的输出深度相等；
  - `projectContext` 深度相等；
  - 一串请求里每次的 `contextRevision` 序列相同；
  - `requestRecords` 相同。
- **不复制：** 已信任对话经过 `getContext`、`reconcile`、`toLlmInput` 后，`entries[i].node` 与日志里的是同一个对象。
- **兼容路径：** `contextFromCandidate` 自己拼的对话，照旧被检查、冻结；它里面带密钥字段时照旧被拒绝。
- **冒充：** 一个形状相同、但不是日志产出的对象，不会被当作已信任视图。
- **版本号：** 追加一条、压缩替换一次，`contextRevision` 都会加 1；只换 requestId，不加。
- **分配：** 用 run7 的问法重跑 monitor，`freezeRequest`、`stateDigest`、`contextValue`、会话源 `cacheKey` 的分配合计降到改前的 1/5 以下。
- `pnpm typecheck`、各包测试、`check:docs` 通过。
