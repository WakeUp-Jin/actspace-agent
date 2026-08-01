# Turn 产物应该是终态投影

## 问题

一个 Agent Run 往往不是“工具执行完，然后回复”这么简单。模型可能先输出一段文本，再调用工具；同一个文件可能先创建、反复修改，最后又被删除。如果 UI 只要看到一条成功 Write 或一段 assistant 文本就发布产物，会得到两个错误结果：

- 仍在运行的 turn 提前出现“最终产物”。
- 已删除的临时文件继续留在列表里，点击后只能得到 `not_found`。

## 两层生命周期不能混用

`tool_finished` 是单个工具调用的事实，只负责让对应工具行立即结束 running 状态。`agent_run_finished` 才是整个 turn 的终态，适合发布跨工具聚合出来的 Artifacts。

```text
tool_finished(write A)  -> A 可进入候选集合，Run 仍在继续
tool_finished(edit A)   -> 合并 A 的统计
tool_finished(delete A) -> 从候选集合移除 A
agent_run_finished      -> 发布最终集合
```

提前使用 `tool_finished` 发布聚合 UI，会把过程事实误当成产品终态；反过来，为了等待 Run 完成而延迟工具行状态，也会让执行反馈失真。两者必须各自消费正确的生命周期信号。

## 用事件折叠得到终态

Artifacts 更接近 reducer，而不是 append-only 日志：

1. Write/Edit 按稳定文件身份 upsert。
2. 同一文件重复修改合并为一项。
3. 成功 Delete 移除同一文件。
4. Run 完成前不发布当前集合。

稳定身份应优先使用 executor 返回的 workspace 相对路径或规范化绝对路径，不能只用 basename。basename 只适合作为旧数据兼容回退，并且必须确保候选唯一，否则 `src/a.ts` 和 `test/a.ts` 会被错误关联。

## 统计口径要说清楚

把工具返回的 additions/deletions 累计起来，表达的是“本轮 Agent 做过多少变更”；它不一定等于当前 Git 工作树的净 diff。后者需要 Git-aware snapshot，并且不适用于非 Git workspace。UI 和文档必须明确选择的口径，不能因为视觉相似就把两者混为一谈。

## 自检

- 当前组件消费的是单工具完成信号，还是整个 Run 的终态信号？
- 创建后删除的临时文件，最终还会不会出现在产物列表？
- 文件身份能否区分不同目录下的同名文件？
- 展示的 diff 数字是操作累计还是工作区净变化？
