# UI 选择态与提交态要分离

来源：`docs/histories/2026-06/20260602-0927-delayed-workspace-switch.md`

## 核心概念

有些 UI 控件表达的是"准备使用的值"，不是"已经发生的事实"。这类控件的选择态应该先保存在前端本地状态里，等用户触发真正动作时再提交到持久化事实源。

这次 Workspace 下拉就是典型例子：用户可能在发送消息前反复选择工作区。如果每次选择都立即写 session meta，会让会话归属在没有真实 turn 的情况下跳动，也会制造不必要的持久化 churn。

## 判断方式

问两个问题：

- 选择这个值本身是否已经完成了一件业务动作？
- 如果用户选择后又改回去，系统是否应该留下历史痕迹？

如果答案是否定的，通常应该把它建模为临时选择态，而不是立即写事实源。

## 实现模式

```txt
UI select change
  -> update local draft state
  -> optional preview uses draft state

User submits real action
  -> persist final selected value
  -> run domain action using persisted fact
```

对 actspace 来说：

- 顶部 Workspace 下拉更新 `selectedWorkspaceRoot`。
- 右侧文件树可以用这个 draft root 做发送前预览。
- 用户发送消息时，先把最终 root 写入 `session.meta.workspaceRoot`。
- Agent turn 再从 session meta 读取 workspaceRoot，确保工具根目录与会话事实一致。

## 常见陷阱

- 把 `onChange` 当成业务提交点，导致用户试探性选择也被持久化。
- 预览使用 draft 值，但最终 action 使用旧持久化值，造成"看的是 A，跑的是 B"。
- 持久化成功前先展示乐观发送消息，失败时 UI 要回滚，复杂度会变高。

## 自检

- 这个控件的值是 draft 还是 fact？
- 用户取消或改选时，是否应该修改持久化记录？
- 提交动作是否明确保证了预览值、持久化值和执行值三者一致？
