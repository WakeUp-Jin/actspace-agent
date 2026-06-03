# 系统事件不要混进普通消息 turn

> 提炼自 `docs/histories/2026-06/20260604-0118-context-compaction-layout.md`（上下文压缩条布局修复）。

## 是什么

聊天式 Agent UI 通常会把一组 `user -> assistant -> tool/status` 渲染成一个 turn，并在 turn 尾部放复制、可视化、更多操作等按钮。但有一类内容不是这轮回复的一部分，而是时间线上的系统事件，例如上下文压缩、会话归档、权限状态变更、模型切换记录。

这类事件应该作为 timeline 的一级节点渲染，而不是追加到最近一个 message turn 里。

## 为什么需要

turn 不是一个纯视觉容器，它通常还携带交互归属：

- 操作栏属于 assistant 回复。
- sticky prompt 属于用户输入。
- 工具日志和 thinking 属于某次执行过程。
- 系统分隔线只说明时间线发生了一个外部状态变化。

如果把系统事件塞进最近的 turn，它会继承这个 turn 的布局和操作语义。典型表现是：assistant 回复操作栏被系统分隔线挤到下方，看起来像这些按钮是在操作系统事件，而不是操作上一条回复。

## 怎么判断

问一个问题：这个节点的操作对象是谁？

- 如果操作对象是某条 assistant 回复，放在该回复 turn 里。
- 如果操作对象是某次工具执行，放在执行块或工具日志组里。
- 如果它只是说明会话时间线状态变化，放成独立 timeline 节点。

## 实现模式

分组函数里不要只用 `user` 作为 turn 边界。遇到系统级事件时，主动切断当前 turn，并输出一个独立节点：

```ts
if (message.kind === "context_compaction") {
  currentTurn = null;
  turns.push({
    id: message.id,
    user: null,
    messages: [message],
  });
  continue;
}
```

这样前一个 assistant turn 的操作栏会先完成渲染，系统事件再作为下一条 timeline item 出现。

## 常见陷阱

- 只看视觉顺序，不看交互归属。按钮位置错了，根因往往不是 CSS，而是节点被分错了容器。
- 用负 margin 修视觉。它可能暂时把按钮挪上去，但 DOM 语义仍然错，后续菜单定位、键盘顺序、复制对象都会继续含糊。
- 把所有非 user 消息都追加到当前 turn。对 thinking/tool 合理，对会话级系统事件不合理。

## 自检问题

1. 这个 timeline 节点能不能被“复制 assistant 回复”这类操作影响？
2. 如果它后面再插入另一个系统事件，是否还应该共享上一条回复的操作栏？
3. 当前分组函数的边界条件，是按视觉相邻，还是按交互归属？
