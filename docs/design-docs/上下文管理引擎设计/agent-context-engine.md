# 上下文引擎规范

> 每次模型请求之前，上下文怎样由 Session、提示词来源和工具清单拼出来，怎样随 Step 更新，怎样变成发给模型的输入。路径的活跃与睡眠见[渐进式披露](agent-progressive-disclosure.md)，压缩见[上下文压缩](agent-context-compaction.md)，请求落盘与估算见[请求记录与上下文估算](../agent-plugin-runtime/agent-spec-request-record.md)，界面见 [front-Context面板规范](../frontend/front-Context面板规范.md)。
>
> 实现在 `packages/context/`，包表见 [`packages/context/README.md`](../../../packages/context/README.md)。类型只有一份，在 `packages/context/context-engine/src/types.ts`，本文不抄。

## 三个对象

| 对象 | 是什么 | 寿命 |
|---|---|---|
| Session | 事实：Journal 事件，以及由它派生的对话（Surface） | 落盘 |
| `Context` | 引擎为「某个 Session 里的某个 Agent」维护的当前上下文：内容加管理状态 | 只在内存，随时可由 Session 重建 |
| `LlmInput` | 某一次请求发给模型的不可变输入，由 `toLlmInput(context)` 转出 | 一次请求 |

`ContextProjection` 是 `Context` 给 Host 和界面的只读投影。

Context 不是新的存储格式：对话直接用 Session 的 Surface 视图，消息、工具、图片的类型沿用 LLM 层。引擎往 Session 写的只有「事件与兼容」里的两种插件事件。

## 身份与寿命

- **身份 = Session + 逻辑 Agent 身份。** 主 Agent 是 `main:<sessionId>`，子智能体和 fork 是各自的 `agentId`。身份里没有 requestId、stepId、Run 或 scope id，所以同一个 Agent 跨 Step、跨 Turn、跨 Run 用同一个 Context。
- **每个 Harness 一个 `context.engine` 服务**，持有实例登记表和唯一的压缩协调器。Loop 每次请求用 `create(options)` 拿一个引擎门面，门面共用登记表。
- **提交是整份替换。** 同一身份的提交串行；内容摘要没变时 `contextRevision` 不加一；带着旧 Journal 水位迟到的结果不会盖掉新状态。`instanceGeneration` 在实例新建时生成，界面靠它知道「实例换过了」。
- **不落盘。** 进程重启或 Harness 重建后由 Session 重新组装。编辑重发时 Host 主动丢弃该会话主 Agent 的实例。

保留长期实例的原因：每个 Step 从零组装会重复加载规则与 Skill、重算没变的部分；界面也只能看到上一次请求，看不到现在。

## 内容和管理状态

- **内容**（`content`）是会进模型的四片：`system`（提示段与模型事实）、`conversation`、`supplements`、`tools`。
- **管理状态**（`status`）给引擎和插件自己用：Journal 水位、压缩周期、路径表、睡眠索引、Host 事实，以及各插件按自己 id 存的状态（`status.plugins`）。

状态不会自动进模型。要让模型看到，必须由某个来源把它写成内容，例如披露把活跃路径写成一条补充。

## 来源

内容由来源（`ContextSource`）贡献。每个 Agent scope 一张来源表，由 `context.assembly` 按 Agent 角色（`main` / `subagent` / `fork`）搭好。

| 种类 | 包 | 顺序 | 贡献 | 什么时候重算 |
|---|---|---|---|---|
| `system` | `context-system` | 0 | 基本系统提示段；Host 可按模型换成整份提示词 | 见表下 |
| `runtime` | `context-runtime` | 10 | 模型事实；一条运行状态补充（模式、日期、时区） | 见表下 |
| `background-tasks` | `context-background-tasks` | 15 | 一条后台任务清单补充；只给主 Agent | 每个 Turn 一次 |
| `rules` | `context-rules` | 20 | 用户规则、工作区规则 | 见表下 |
| `skills` | `context-skills` | 30 | Skill 目录、选中的 Skill 正文 | 见表下 |
| `conversation` | `context-conversation` | 40 | 对话 | 对话版本号变化 |
| `tools` | `context-tools` | 50 | 工具清单 | 工具定义变化 |
| `disclosure` | `context-disclosure` | 60 | 一条路径导航补充 | 周期、路径表或睡眠索引变化 |

`system`、`runtime`、`rules`、`skills` 四个来源在这些东西变化时重算：Turn、路由、模型、模式、选中的 Skill、Host 事实。Step 和请求 id 不在其中，所以一个 Turn 里的后续 Step 直接复用。

规则：

- **只写自己声明的片，只署自己的名。** 来源声明能写哪几片，写别的片、冒用别人的 owner、结束后再写都会被拒绝。
- **顺序确定。** 按顺序号再按 id 执行；id 重复直接报错。系统提示词里各段的先后由段自己的序号决定（层 × 1000 + 段内序号，层依次是 core、profile、host、agent、plugin），和来源顺序无关；模型事实合成一个 `<runtime_facts>` 块放在最后。
- **必需与可选。** 必需来源失败，这次请求失败；可选来源失败只记一条诊断，它已经写的部分全部丢弃。`system` 和 `conversation` 两个种类缺一不可（`context-assembly` manifest 的 `config.required`），缺了在建 Agent 时报错。上表里只有 `background-tasks` 是可选的；Host 按会话追加的来源也都是可选的。
- **声明了依赖才复用。** 来源给出 `cacheKey` 时，key 不变就复用上次的贡献；不给就每次重算。
- **来源只读 Context、只交回内容。** 不写 Session 事件，不在 `get` 里执行有副作用的工具，不交回函数或类实例，不带凭据。引擎对交回的内容做检查：只接受 JSON，键名是凭据的（`authorization`、`apiKey`、`secret`、`password`、`cookie`、`accessToken`、`refreshToken` 这几类）直接拒绝。
- **注册随插件生灭。** 插件停用后它的来源从下一次组装起消失；新注册也只影响下一次组装，不改正在进行的请求。
- **Host 可以按会话追加来源**（`PromptExtensionRegistry`）。按会话登记的来源只给主 Agent，fork 沿用父会话主 Agent 的那些；要给别的 Agent，登记时写明它的 scope。侧边对话、会话记录、英语学习用的是这条路。

规则与 Skill 的加载边界：

- Agent 和 Plan 模式只读两处 `AGENTS.md`：用户数据目录和工作区根目录，用户规则在前。不读嵌套目录的规则，不读 `CLAUDE.md`。
- Chat 模式只带用户规则，不带工作区规则、Skill、工作区事实和脚本说明。
- 每个新 Turn 重新读一次，不监听文件。Turn 中途改了规则，下一个 Turn 生效。

## 补充与临时插槽

补充（supplement）是来源想让模型看到、又不属于对话的文字：路径导航、运行状态、后台任务清单。

- **不改对话。** 补充存成插件事件 `plugin/actspace.context/supplement`，`surface` 固定为 `null`。
- **挂在写入时的对话末尾。** 事件记下当时最后一条对话的位置作为锚点；对话还是空的就挂在最前面。发给模型时渲染成一条 `user` 消息，外面包一层 `<runtime_context owner=… id=…>`，插在锚点之后；锚点后面紧跟工具结果时，挪到这批结果之后，不拆开工具调用和它的结果。
- **文字变了才写新事件。** 文字不变就不写。变了就在当前末尾追加新版本，旧版本留在原处，所以之前的请求前缀不变，provider 缓存还能命中。文字里要自己说明「后出现的为准」。
- **压缩之后重新挂。** 锚点被压缩掉的版本不再出现；每条补充只把最新一版重新挂到末尾。
- **交回空文字等于移除。**

临时插槽是有寿命的补充，由 `engine.insert(owner, id, text, lifetime, turnId)` 写入，owner 必须是已注册的来源：

- `turn`：留到这个 Turn 结束。
- `request`：只给一个 Step。请求 prepare 成功后才算用掉；同一个 Step 的重试仍然带着它，下一个 Step 不带；没发出去的请求不消耗它。步数用尽时的收尾提示用的是这一种。

## 从 Context 到 LlmInput

`toLlmInput` 只做转换：不写 Session，不调来源，不压缩，不把管理状态塞进消息。

- 系统提示词 = 各段按序号拼接 + 模型事实。
- 消息 = 对话逐条转换，补充按锚点插入。角色、工具调用与结果的配对、图片、需要回放的推理内容原样保留；文本 artifact 解析成可读路径（见[工具输出与引用](../tool-system/agent-tool-output-references.md)）。
- 工具 = `content.tools`。

**每次真实请求之前都做硬容量检查**，重试也做：prepare 之后的消息与工具的估算值达到窗口，或估算值加上请求的 `maxTokens` 超过窗口，就不发送，报 `Context exceeds model capacity`。窗口未知时跳过检查，不拿一个假想的常量来比。

**重试会重新组装。** 传输重试换新的 `requestId`，重新取 Context、重新转换、重新检查容量，不复用上一次的输入。

## 每个 Step 的顺序

1. **取 Context。** 还没有实例就完整组装；已有实例就对齐（reconcile）到已落盘的 Journal 位置。
2. **发请求。** `agent/request` 钩子（它换了路由或模型，就按新模型再取一次）→ prepare → 硬容量检查 → 记下这次的模型、窗口和自动压缩阈值 → 绑定 `request` 插槽 → 写请求记录 → checkpoint → 发出。
3. **收尾。** 模型回复和整批工具都结束 → `step/end` → checkpoint → 再对齐一次并发出实时消息 `context-updated` → 判断自动压缩 → 压缩成功则 checkpoint 后再对齐一次。

两条约束：

- **先落盘，再前进。** Context 只前进到已经落盘的 Journal 位置，要求对齐到还没落盘的位置会报错。对齐过程中来源写了补充事件，也要先 checkpoint 再对外发布。不落盘的临时会话不受此限。
- **工具结果逐条观察。** 每条工具结果写进 Journal 后交给 `context.assembly` 上登记的观察者，披露靠它登记路径。

## 已信任的对话视图

对话会越来越长，所以引擎不在每次请求时复制或序列化整段对话。

- **只有日志交出的视图算已信任。** `SessionJournal.surface` 交出的视图在事件入日志时已校验并深度冻结，由日志包登记；登记函数不从包入口导出。`fromView` / `fromEvents` 用任意输入构造的视图不算。
- **同一份对话只有一个视图对象。** 对话没变，连续读到的是同一个对象。
- **已信任视图直接引用。** 引擎不复制、不重新检查它；只包了一层的对象（如来源交回的 `{ conversation: 视图 }`）保留里面的视图，其余部分照常检查、复制、冻结。来源交回的其他内容一律检查。
- **用版本号判断变没变。** 已信任视图的版本号是 `替换代数:条数:最后一条的最大事件序号`。对话只能经日志追加或替换，版本号相同内容就相同。对话来源的 `cacheKey` 和实例的内容摘要都用它。不是已信任视图时退回整份 JSON 比较。
- **不能原地修改。** 想换一份对话，只能交出日志的视图，或者交出一个新的普通对象（走检查路径）。
- **`toLlmInput` 浅冻结。** 对话已检查时，引擎只冻结自己新建的消息外壳，里面引用的是已冻结的节点；对话没经过检查时，整份消息照旧检查、复制、冻结。Provider adapter 只能读消息，不能改。
- 请求记录仍然整份检查并算摘要，不走这条捷径。

不做：把类型全改成深度只读；增量组装或消息缓存。

## 给界面的投影

- `context.engine` 的 `getProjection(sessionId, logicalAgentScopeId, basis)` 返回只读的 `ContextProjection`；没有实例时返回空，界面改用 Journal 折叠出的数据。
- 读取不组装、不调来源、不写 Journal、不消耗插槽、不触发压缩，也不启动 Run。
- 按条读全文（`readEntry`）要带 `contextRevision` 和 `instanceGeneration`，对不上就报 `Context revision stale; reload the panel.`。
- 界面只展示主 Agent 的 Context。面板各块分别读哪个来源、分页与体积上限见 [front-Context面板规范](../frontend/front-Context面板规范.md) §6。

## 事件与兼容

- 引擎拥有两种插件事件：`plugin/actspace.context/supplement`（补充与插槽）和 `plugin/actspace.context/state`（披露状态）。两者的 Codec 都是 required，并且校验 `surface` 必须为 `null`。
- owner 固定是 `actspace.context`。来源、披露、压缩已经拆成各自的包，但事件仍由引擎包拥有，旧会话才能照常解码。新增的 Context 事件也放在 `plugin/<owner>/…` 下并注册 Codec。
- Codec 和行为分开加载：Host 在恢复 Session 之前加载 Codec，停用行为插件不影响读历史。required 事件缺 Codec 时的访问状态见 [Session 格式 v1](../agent-plugin-runtime/agent-spec-session-format-v1.md)。
- 没有这两种事件的旧会话按默认值处理：没有补充，周期为 0，路径表为空。
