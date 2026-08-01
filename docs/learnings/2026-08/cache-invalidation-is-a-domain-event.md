# 缓存失效应该是领域事件

## 问题

同一份底层状态常被多个界面消费。例如 Git working tree 同时驱动 Environment、Composer summary 和 Review Workbench。一次 commit 后，如果只有发起操作的组件重新读取 Git，就会出现局部正确、整体矛盾的 UI：Environment 已显示 clean，Review 仍展示提交前的 diff。

这不是“少调用了一次 refresh”这么简单，而是缓存失效的所有权放错了位置。

## 为什么按钮回调不够

把刷新逻辑写在点击按钮的 Renderer 回调里，会漏掉其他 mutation 来源：

- 另一个面板执行 stage、commit 或 branch switch。
- commit 成功但 push 失败，本地状态已经改变。
- Git hook 失败，但 hook 或前置 `git add` 已改变 index。
- 多窗口同时打开同一个 workspace。

局部回调还容易形成多套刷新协议：一个组件递增 `refreshKey`，另一个直接读 Git，第三个监听 DOM event。只要其中一条链路没有接上，缓存就会分叉。

## 更稳定的模型

让拥有 mutation 的进程在操作结束后发布统一的领域事件：

```text
explicit Git mutation
  -> main invalidates workspace generation
  -> main emits review:changed(workspaceId, generation, reason)
  -> Review reloads its snapshot
  -> summary consumers reload the same generation
```

这里的关键不是事件总线本身，而是三条约束：

1. **失效发生在事实源旁边。** main 执行 Git，因此 main 最清楚何时状态可能改变。
2. **事件携带稳定身份。** 使用 `workspaceId + generation`，不要依赖组件实例或当前打开的 Tab。
3. **消费者重新查询，不传播旧数据。** 通知只表达“旧 snapshot 已失效”，真实内容仍从 main-owned query 读取。

## 部分失败也要建模

mutation 结果不是简单的成功或失败。`commit and push` 可能 commit 成功、push 失败；commit hook 失败前，index 也可能已经被 `git add` 改变。因此失效判断要围绕“底层状态是否可能改变”，不能只看顶层 `ok`。

反过来，纯 Push 通常只改变远端跟踪关系，不改变 working tree diff。若 Review scope 只表示 `HEAD -> Working tree`，就不需要因此制造额外 generation 和 UI loading。

## 自检

- 一个 mutation 有多少个 UI 消费者？它们是否共享同一失效信号？
- 部分成功或 hook 失败时，缓存是否仍可能过期？
- 通知表达的是“数据已变化”，还是错误地携带了某个组件计算出的旧快照？
- 多窗口或后台 mutation 是否能触发同一条刷新链路？
