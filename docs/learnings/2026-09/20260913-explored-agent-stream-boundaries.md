# Explored 归组与子 Agent 入口的消息建模

> 历史方案：2026-09-14 已取消主流 Explored 分段，改为回合级 Worked 折叠。子 Agent 独立 Session / 右侧详情边界仍有效；折叠策略见 [折叠状态与组件生命周期](20260914-disclosure-state-lifetime.md)。

这次 UI 调整提炼出一个可迁移的消息流建模模式：不要按“所有工具调用”做一个大折叠组，而要按用户可理解的语义边界分段。

## 核心概念

直接 Read/Search/Grep/Glob/Directory List 与 Thought 都发生在当前 Agent 的探索时间线上，因此可以归组为 `Explored`。它们共享主消息上下文，展开后应该仍显示原始活动顺序。

Agent/Explore 则拥有独立 child Session、独立生命周期和独立 transcript。它们不是 `Explored` 的子项，而是主消息流中的委托入口；主流只显示最新活动，完整内容通过右侧面板读取。

## 为什么不能只看工具类型

如果简单地把所有 `tool` 消息包进一个 `Worked for`，会把三种不同含义混在一起：当前上下文的探索、需要审批或结果查看的操作、以及隔离上下文的子任务。用户会无法判断“展开后看到的是当前 Agent 的过程，还是另一个 Agent 的过程”。

更稳妥的做法是先定义消息语义集合，再按原始顺序切分连续片段：

```text
Explored activity  ->  one compact group
Agent/Explore      ->  one independent row
other work tools   ->  existing tool group
```

## 实现陷阱

- 分组只应改变 renderer 组合，不应让 renderer 重新解析 raw args 或 transcript。
- 流式状态与历史回放必须共用同一套分段规则，否则首帧、完成态和重新打开会话会出现不同布局。
- 新增展示字段（如 `agentKind`）应保持可选，旧 Journal 缺失字段时使用稳定 fallback。
- “最新一行活动”适合主流密度控制，但不能替代右侧 child Session 的完整事件来源。

这套模式也适用于构建日志、编译器诊断和多步骤工作流：先区分当前上下文活动与隔离任务，再决定是折叠、内联还是打开详情面板。
