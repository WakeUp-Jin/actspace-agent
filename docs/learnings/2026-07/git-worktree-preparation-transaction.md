# Git Worktree 准备为什么要成为首轮 Turn 的事务前置阶段

## 核心问题

聊天应用里的“Workspace”通常是用户长期选择的项目，而 Agent 真正运行时需要的是一个确定的 execution root。使用 Git worktree 后，两者不再是同一个目录：侧栏和 Recents 应继续指向源项目，工具、系统提示词和文件访问则必须绑定到新 worktree。

## 正确顺序

1. Renderer 只提交用户最终选择的 source workspace、base branch 和 run location。
2. Main 检查 Git/HEAD/branch，并创建和验证 worktree。
3. Main 更新 SessionMeta 的最终 execution root 与 worktree identity。
4. 用最终 root 构建 Agent dependencies，让所有工具从一开始就看到同一个目录。
5. ContextManager 恢复历史后，再持久化本轮 `user_message` 和 preparation event。
6. Agent.run 注入本轮输入并开始模型循环。

## 容易踩的坑

### 先写用户消息再恢复上下文

如果 ContextManager 从 session.jsonl 恢复历史时已经读到本轮 `user_message`，Agent.run 又会把相同输入注入一次，模型会收到重复消息。因此“准备成功后立刻写 user event”仍然过早，必须等依赖与历史恢复完成。

### 只创建目录，不验证 Git identity

`git worktree add` 返回成功只是第一层信号。至少还应验证：生成分支、HEAD commit、git common dir，以及目标目录存在。任何验证失败都应删除本次生成的 worktree 和分支。

### 把 worktree 注册为普通 Workspace

这样会污染 Recents，并让用户误以为临时执行目录是长期项目。更稳定的模型是：Session 保留 source workspace identity，同时单独持久化 execution root 和 worktree metadata。

## 可迁移结论

任何会改变 Agent 文件系统视图的动作，例如容器挂载、远程 checkout、临时 sandbox，都应在 Agent dependencies 创建前完成，并以“用户上下文身份”和“实际执行位置”两个字段建模。这个边界比具体使用 Git worktree 更重要。
