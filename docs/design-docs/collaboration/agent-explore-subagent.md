# Explore 内置子代理设计

> 状态：当前 v2 静态 Preset 与工具边界。Explore 与通用 Agent 共用一次性 Subagent provider，以 Preset 和任务定位区分；当前两个 Preset 均限制为只读研究。

运行时总规范见 [`agent-subagent-runtime.md`](agent-subagent-runtime.md)。

## 定位

`actspace.subagent/explore` 用于聚焦、只读的仓库探索，例如：

- 定位一两个相关文件；
- 查找类型、调用链或配置来源；
- 验证一个明确假设；
- 返回精炼的事实摘要。

它不是通用并行工作器，不应承担写文件、运行高风险命令、跨系统副作用或长时间自主任务。

## 与 Agent Preset 的区别

| 维度 | `actspace.agent` | `actspace.explore` |
| --- | --- | --- |
| 目标 | 通用一次性委托 | 聚焦只读探索 |
| Session | 独立 child Session | 独立 child Session |
| 工具 | 四个只读工具与父可见工具的交集 | 相同只读白名单 |
| `readOnly` | `true` | `true` |
| 递归深度 | 最大 1 | 最大 1 |
| 生命周期 | one-shot | one-shot |

当前两个 Preset 都使用 Runtime 解析出的默认 route / model。未来允许独立模型前，必须通过 Preset 和 LLM route contract 显式配置，不能从旧 `exploreModelId` 或 Desktop 环境变量隐式推断。

## 只读硬约束

Agent 与 Explore 最终工具集只允许以下精确名称：

```text
read_file
list_directory
grep
glob
```

Provider 在启动 child 前再次验证工具集合。即使父 Agent 可见 Bash、编辑、Web、Browser 或 Agent 工具，两者都不能继承这些能力，不新增权限设置或子任务审批交互。

只读约束由 Preset 与 provider admission 同时执行，不能只依赖 Prompt 描述。

## 上下文

Explore 不继承父 Agent 完整对话。它只获得：

- 用户委托的 task；
- 父 Session 的 workspace root；
- child Session Header 中的 lineage；
- Preset 允许的 Prompt / Context contributor；
- 只读工具定义。

这减少了主上下文污染，也意味着委托描述必须包含完成任务所需的范围、目标和输出要求。

## 输出

Explore 返回普通 `SubagentTerminalResult`。固定 renderer 将 `actspace.explore` 与通用 `actspace.agent` 统一显示为可点击的独立 Panel，并在右侧 SubAgent 视图中读取 child Session；主消息区只保留状态与摘要。这是 Host projection 差异，不改变后端 Session 或 Tool ABI。

主 Agent 应消费：

- 结论；
- 关键路径或证据；
- 未确认项；
- child Session reference。

不应把 child Journal 全量复制回父上下文。

## 失败边界

- 任务超出只读能力时明确失败，不自动升级为 Agent；
- 父取消、Preset timeout 或 Runtime shutdown 会级联中止；
- child 已 dispatch 的副作用理论上不应存在，因为 Explore 无副作用工具；
- child Session 损坏时不得从父 tool result 猜测完整 transcript；
- 缺少 required read capability 时 admission 失败。

## 验收

- Agent 与 Explore 都只能看到四类只读工具；
- child Session lineage 正确指向父 Tool Call；
- 父取消会关闭 child writer lease 和 Scope；
- 返回摘要不会展开 child 全量执行流；
- renderer 展示差异不影响后端 Tool / Session 契约；
- Explore 与通用 Agent 都在主消息区显示紧凑两行入口，不内联展开 transcript；右侧 SubAgent 视图是唯一详情入口；
- 没有旧单包 Runtime、独立 transcript 文件或 `ContextManager` 依赖。

## 运行预算与实时展示（2026-09-15）

两个内置 Preset 默认 300 步、30 分钟时限。第 300 步不暴露工具，只要求总结已确认事实与阻塞；终态仍是 step-limit，不把预算收尾当作任务成功。父取消继续级联。SUBAGENT_STEP_LIMIT / SUBAGENT_TIMEOUT 与部分发现返回主任务，保留 transcript 入口；不原样自动重试。工作区内找不到目标时应尽早说明，不能将无匹配直接推断为运行系统故障。

主消息流使用主题感知轻边框两行入口。第二行从 child live event 的 parentSessionId / parentCallId 关联父工具调用：思考、分析、读取文件、搜索、并行工具数量、整理回复。正文增量只转换成状态，不展示其内容。重复阶段不重复发布；不同活动即时显示，不再用 400ms 合并丢弃短暂工具详情。工具结束后保留最近操作，例如“正在分析 · 刚读取 ConversationView.tsx”；失败工具显示“刚尝试读取”，并行状态保留最近一个仍在执行的工具对象，正文阶段仍只显示“正在整理回复”。敏感值按凭据形态过滤，不因文件名包含 token 等单词而整条清空。使用 180ms、4px 上移交叉淡入淡出；终态即时显示，reduced motion 禁用位移动画。详情仍在右侧 SubAgent 面板。
