# Explore 内置子代理设计

> 状态：当前 v2 静态 Preset 与工具边界。Explore 与通用 Agent 共用一次性 Subagent provider，只在 Preset、工具权限和 Host 展示上区分。

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
| 工具 | 父可见工具与 Preset 的交集 | 仅只读文件搜索工具 |
| `readOnly` | `false` | `true` |
| 递归深度 | 最大 1 | 最大 1 |
| 生命周期 | one-shot | one-shot |

当前两个 Preset 都使用 Runtime 解析出的默认 route / model。未来允许独立模型前，必须通过 Preset 和 LLM route contract 显式配置，不能从旧 `exploreModelId` 或 Desktop 环境变量隐式推断。

## 只读硬约束

Explore 最终工具集只允许名称以以下能力结尾：

```text
/read_file
/list_directory
/grep
/glob
```

Provider 在启动 child 前再次验证工具集合。即使父 Agent 可见 Bash、编辑、Web、Browser 或 Agent 工具，Explore 也不能继承这些能力。

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

Explore 返回普通 `SubagentTerminalResult`。固定 renderer 可以把 `actspace.explore` 显示为内联折叠块，把通用 `actspace.agent` 显示为独立 Panel；这是 Host projection 差异，不改变后端 Session 或 Tool ABI。

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

- Explore 只能看到四类只读工具；
- child Session lineage 正确指向父 Tool Call；
- 父取消会关闭 child writer lease 和 Scope；
- 返回摘要不会展开 child 全量执行流；
- renderer 展示差异不影响后端 Tool / Session 契约；
- 没有旧单包 Runtime、独立 transcript 文件或 `ContextManager` 依赖。
