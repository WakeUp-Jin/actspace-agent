# 共享实施契约

本文件补齐设计中的工程边界，不增加 Context/LlmInput 以外的公共业务模型。所有阶段先读[总计划](README.md)，已有 Session、LLM 类型以源码为准；下面标为“新增”的路径是本计划确定的目标文件。

## 1. 类型、依赖与所有权

- 公共 `Context`、`ContextRequest`、`SystemContext`、`ContextSupplement`、`ContextStatus`、`ContextPathState`、`LlmInput` 落在新增 `packages/context/src/types.ts`；现有 `SessionSurfaceView`、LLM 消息/工具类型原样引用。
- `packages/context/src/engine.ts`（新增）提供 `getContext(request)`、`toLlmInput(context)`，以及注册来源/策略、受控插槽操作。沿用现有 `context.assembly` 入口作 P1 兼容接线，新增服务 ID `context.engine`；P2 完成后移除未使用的旧 assembly 生产入口。
- 引擎依赖 Session/LLM 类型和受注入的 Host 能力，不 import Prompt、Compaction、具体工具或披露策略实现。稳定系统段渲染和通用转换移入 Context，Prompt 依赖 Context；禁止 Context 又依赖 Prompt 形成环。
- 来源注册有稳定 ID、归属、顺序和 required/optional。注册返回幂等撤销函数，纳入 Cordis effect。注册表按 Agent scope 隔离，持久状态按 Session 隔离；Harness 两个 generation 可以同时工作而不污染。
- 英语学习服务当前处于 Host scope，而引擎处于 Harness scope，不能直接反向查找子树服务。复用 `actspace.host.prompt` 端口扩展一个按 Session/Agent scope 登记来源的注册表，英语插件登记/撤销其读取回调，Harness 将这些回调接入普通来源注册；回调消费 Context，不传递 LogicalRequestCandidate。端口通过已有共享服务机制进入 Harness，不新增第二个上下文引擎。
- 来源消费只读 Context，通过其注册时允许的字段写入回调贡献数据；回调仅在本次调用有效。来源不能直接改别人的 section、Session Surface 或 paths 计数；引擎检查 JSON-safe 和归属后深冻结最终结果。无需为业务方暴露另一种 Entry/Assembly 数据对象。
- `SystemSection.owner` 是贡献归属；插件事件 envelope owner 是写入这些事件的 `actspace.context`，两者不是必须相同。扩展插件通过引擎登记自己的内容，不冒充 Codec owner。
- 系统、AGENTS、Skill、运行信息来源放在 `packages/prompt/src/context-sources/`（新增）；会话和工具来源放在 `packages/context/src/sources/`（新增）；披露放在 `packages/context/src/disclosure/`（新增）；压缩沿用 `packages/compaction`。这些目录不是新增 workspace 包。

## 2. 请求转换与快照

手动压缩等 Turn 之间的操作允许 ContextRequest.turnId/stepId 缺省，正常请求仍校验必填；不为方便组装新增虚构的 Session 身份。

请求源模型/route/options 来自该次 Run 配置，冻结后传入 Prompt 与 LLM。第一版仅开放模型选择接口并提供现有默认模板；`default` 等别名不得冒充已解析模型事实。实际 route/model/capacity 继续写 prepared 快照。未来接入模型专用模板时必须使用一致的解析身份，不能根据两份可变配置选择模板与调用模型。

`toLlmInput` 只读，不写 Session、不调用来源、不压缩、不推进周期。异步仅用于注入的 artifact resolver。保留 role、tool call ID、tool error、图片、签名/replay、文件引用与回复摘录；使用表驱动 fixture 对照现有转换。

系统段排在前部；补充以带 Runtime 来源的消息插入会话序列；tools 独立传递。status 不整体序列化。`request/context` 仍使用现有 schemaVersion 2 快照，内部从最终 LlmInput 和来源信息映射原字段。计数与未展示路径不计入模型输入；`contextWindow` 使用实际 prepared/header 事实，未知保持 0 的现有展示，不恢复固定容量猜测。

区分传输重试与逻辑新请求：同一准备调用的传输重试复用内容；当前 Loop 会产生新 requestId 的重试接线仍保留关联与 attempt。不得因失败重复读取 AGENTS、追加相同补充或二次消费单次插槽。用户新输入、已提交工具结果或现有请求恢复逻辑确需重建内容时，产生新的逻辑输入版本；继续使用原来捕获的 LLM 路由/lease 规则，不能删除既有 request-error 钩子语义。

## 3. 持久事件与解码

新增 `packages/context/src/codec.ts`，由 `actspace.context` 拥有 `plugin/actspace.context/supplement`、`plugin/actspace.context/state` 两类 v1 事件。`surface: null`；状态变化在 data 中带操作种类与幂等键。两类均为 required：丢失补充/生命周期或周期状态可能改变继续执行语义，不把它们伪装成可忽略诊断。

- supplement 操作：新增/撤销，包含 owner、稳定 ID、文本、锚点、生命周期与 Turn/request 绑定。ContextSupplement 是已经筛选的展示对象，无需暴露所有事件内部字段。
- state 操作：来源路径登记、读取事实、压缩候选引用、周期整理完成与导航 artifact 身份。只保存必要增量，不在每次请求写完整 Context。
- 读取事实使用工具结果事件 seq/callId 作为去重来源；只有工具成功事实可增加计数。新增上下文工具事实放在已有 `tool/result.detail` 的可选命名字段内，由来源解析并可重放，不改变 tool/result envelope 和 Surface。
- 写入事件遵守现有 1 MiB 上限；批量路径按编码体积拆为不超过 256 KiB 的 state 事件。单项超限显式报错，不静默截断；分批候选只有全部批次和最终摘要事务完成才生效。索引正文使用现有 artifact，不塞入 state。
- 当前 Host discovery 按启用 behavior 过滤，默认 Harness manifest 也没有 Context Codec。P2 在 `packages/runtime/src/profiles/composition.ts` 提供内置 Context 的纯 Codec 描述，扩展当前内置 Codec loader；在 `startup/boot.ts` 明确将该已准入内置 Codec 纳入发现，不要求其行为启用，也不把执行引擎装到 Host 树中。不能通过行为激活后动态补 registry 来弥补恢复失败。
- 第一次使用新状态前记录初始化边界；旧 Session 从默认 cycle/空路径开始，不回扫旧工具记录伪造读取次数。首次压缩仍可从实际待压缩内容提取路径。关闭行为后 Codec 仍可重放；重新启用从停用前状态继续，不补算停用期间读取。

## 4. 补充、安全锚点与插槽

以有效 Surface 中来源 seq 对应的消息边界定位 `afterEventSeq`。引擎只能在完整 assistant tool-call 及其全部结果之后插入；用户后续消息/请求尾部同样遵守此规则。历史消息原地不改，锚点查不到时禁止随意塞到工具结果中间。

持久普通动态内容变化时追加，文本相同不重复；计数变化不算展示变化。历史版本保留到覆盖其锚点的压缩。被覆盖的补充不重新播放，当前仍有效的最新版本在新安全尾部补入一次；这由插件事件身份、有效替换记录及 owner 判定，不用全文正则删除用户文本。

插槽位置只支持下一次安全请求尾部。生命周期两种：单逻辑请求；当前 Turn 内直到显式撤销或 Turn 结束。准备失败不消费单次插槽；提交前把 request 绑定持久化并经过现有 checkpoint，重试复用绑定。进程重启对已有 request 的消费结果以 Journal 为准，不试图证明远端是否收到网络字节；不在后续新 Turn 重发已绑定单次内容。相同文本但显式新 ID 的用户插件操作不被全局正文去重吞掉。

## 5. 压缩与周期的一致性

手动与自动压缩都从引擎调用同一注册策略。Session 写入由引擎协调器承担，压缩策略负责判断、区间、摘要与引用建议，不能调用披露策略。主请求与压缩按现有 Session/Run 调度串行；摘要异步结束后复核待替换 Surface generation/来源，发生变化则丢弃候选并重新选择，不覆盖新输入。

复用四条连续 core 事务；不在 `compaction/start` 与 `compaction/end` 之间插入无关插件事件。顺序：

1. 生成摘要及候选路径，分配 compactionId；保存候选 state（id、基准周期/来源、分批 pathlist）并 flush。
2. 沿用 `createCompactionTransaction`，提交四条 core 事件并 flush。
3. 对这个已成功的 compactionId 统一排序披露状态；生成导航 artifact，保存 cycle-applied state 并 flush，然后才允许下一次模型请求。

恢复时：只有候选没有有效 compaction/end，不应用候选、不清零；有效 end 已持久但 cycle-applied 缺失，由纯 reducer 在相同事件边界重算并补记一次；已有 applied 则幂等跳过。flush 失败阻止继续请求，不把“摘要已提交、索引生成失败”报告为摘要完全回滚。摘要已提交时重试修复派生状态，不再次请求模型生成摘要。没有披露策略时不生成其候选/周期事件。

计数先用于选择，再清零；active ID 顺序持久在 applied 数据或重放顺序中，Context.paths 保持该顺序。不能每次读取后因新计数改变已展示顺序。排序及新增容量裁剪遵循设计：reads 降序、lastReadAt 降序、addedCycle 降序、ID 升序；已有睡眠项读取后不即时唤醒。

## 6. 引用、索引、fork 与读取

普通文件在来源工作区下解析为规范化绝对路径；可访问时校验真实文件类型，不对任意 regex 文本自动信任。目录只可存在于摘要说明；无法确认是具体文件的匹配不进活跃列表，明确来源信息保留用于诊断。删除/不存在的旧文件仍可保留引用，不增加 watcher。工作区与 Host 身份参与解析，远端路径不能拿到本机读取。

同一原始 Journal 路径合并精确 seq 集合。原始历史不是 artifact 副本，也不生成摘录。Host 提供解析当前 Session 原始历史路径的能力；无文件后端返回无能力，不拼造路径。读取沿现有权限系统准入，仅特定文件 read，不授予整个 sessions 根目录或写入权限。模型自行用工具分页/搜索；序号不等于行号，JSONL 可能含长单行，不承诺它等同于人类对话文本。

睡眠索引是可重建的 UTF-8 artifact：文件路径、必要说明、历史 seq 提示；不写计数。引用集合变化才生成新版，空列表不注入入口，计数变化不刷新正文；模型只看索引路径，避免全文注入。索引 artifact 用已有类型化 artifactId 引用持久化，便于现有 fork 复制；不把绝对路径作为唯一身份。read_file 缓存以 Session + replaceGeneration + path/range 为键；索引不参加热度排名。

fork 沿现有边界复制 Journal，保持原序号。由引擎在首次组装时依据 lineage 重建当前子 Session 的索引入口和本地历史路径，关闭继承的旧导航补充，追加子会话当前导航，不重写父/子原始事件。父工作区普通文件保留其原身份，不盲目换前缀；计数从 fork 边界继承后独立发展。跨会话历史来源继续保留其来源 sessionId/精确 seq；未授权父历史不能靠路径继承获得读取权限。当前 Session 的已复制历史可以指向子 Journal。父子索引后续更新不共享可变文件。

## 7. 行为卸载与失败

可选来源撤销后排除其贡献；历史原文不删，共享路径仍有有效 owner 才展示。冻结中的请求不受卸载影响。必要的系统/会话来源缺失则明确失败；规则文件不存在是正常空来源，读取失败按该来源约定报错/诊断，不能静默使用跨工作区旧缓存。

压缩策略缺失：正常运行，不自动压缩；手动 compact 返回明确不可用结果。披露策略缺失：不注入导航、不记录/整理路径，但工具正文和普通压缩继续工作。最多一个压缩策略与一个披露策略绑定同一 Agent，重复注册报错。

允许开关通过 Harness/Profile 装配管理；不把整包禁用等同于移除 Codec。所有 Host 能力失败、摘要空输出/错误、取消、工具失败、索引缺失都要有定向测试；不得用可选 observer 来执行必须完成的保存或清零。
