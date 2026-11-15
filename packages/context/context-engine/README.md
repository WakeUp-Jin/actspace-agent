# @actspace/context-engine

长期 `Context` 实例、来源注册表、`LlmInput` 转换、补充与状态事件、只读投影和唯一的压缩协调器；提供 `context.engine`。行为规则见[上下文引擎规范](../../../docs/design-docs/上下文管理引擎设计/agent-context-engine.md)，压缩的提交顺序见[上下文压缩](../../../docs/design-docs/上下文管理引擎设计/agent-context-compaction.md)，这里只说代码在哪。

公开入口：`.`、`./manifest`、`./plugin`、`./codec`、`./state`。

| 文件 | 内容 |
| --- | --- |
| `types.ts` | `Context`、`ContextRequest`、`ContextStatus`、`ContextSupplement`、`ContextProjection`、`LlmInput`；类型只在这里定义 |
| `plugin.ts` | 提供 `context.engine`：实例登记表、压缩协调器、`create(options)` 引擎门面、`getProjection` |
| `engine.ts` | `ContextEngine`：取 Context、对齐到已落盘的 Journal 位置（`reconcile`）、临时插槽（`insert`）、`toLlmInput` |
| `instances.ts` | `ContextInstanceRegistry`：按 Session + 逻辑 Agent 身份存实例，串行提交，管 `contextRevision` 与 `instanceGeneration` |
| `registry.ts` | `ContextSourceRegistry`：按顺序调来源，检查能写的片和 owner，必需与可选，`cacheKey` 复用 |
| `reducers.ts` | `ContextReducerRegistry`：按事件更新 `status` 的框架；目前没有插件注册 reducer |
| `context-snapshot.ts` | 来源交回内容的检查、复制与冻结；已信任的对话视图直接引用 |
| `conversion.ts` | 对话转成模型消息，补充按锚点插入 |
| `supplements.ts` | 补充与插槽：读写 `plugin/actspace.context/supplement`，锚点与压缩后重挂 |
| `state.ts` | 披露状态事件的折叠（路径表、周期、睡眠索引） |
| `disclosure-contract.ts` | 引擎与披露插件共用的类型和上限；引擎不依赖披露插件的实现 |
| `codec.ts` | 两种插件事件的 Codec 和 owner 常量 |
| `compaction.ts` | `ContextCompactionCoordinator`：排队、检查对话有没有变、提交四条 core 事件、通知披露；策略与披露的登记接口 |
| `projection.ts`、`content-manifest.ts` | 给 Host 和界面的只读投影；条目的预览与全文 |
| `request-snapshot.ts` | 请求记录（提示词、工具、快照）的生成、凭据键检查与冻结 |
| `modules.ts` | `packages/context/` 下各插件包的 id、owner 和负责的片 |
| `assembly.ts` | 旧的 `ContextAssembler`，只剩自身测试在用；退役见[技术债表](../../../docs/exec-plans/tech-debt-tracker.md)「上下文引擎遗留」 |

测试：`pnpm --filter @actspace/context-engine test`。
