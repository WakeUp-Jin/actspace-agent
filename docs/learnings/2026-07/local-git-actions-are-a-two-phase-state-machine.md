# 本地 Git 组合动作应该建模为两阶段状态机

桌面应用里的 `Commit and push` 看起来像一个按钮，实际上是两个不可原子回滚的阶段：本地 commit 会永久推进 `HEAD`，随后远端 push 仍可能因为认证、保护分支、网络或 remote 配置失败。

如果把它当成一个布尔动作，UI 很容易在 push 失败后只显示“操作失败”，让用户误以为 commit 也没有发生；更危险的补救是自动重试整个动作，从而生成重复 commit。

## 正确的结果模型

组合动作至少需要表达阶段和部分成功：

```ts
type GitMutationResult = {
  ok: boolean;
  action: "commit_and_push";
  phase: "commit" | "push";
  commitCreated?: boolean;
  commitHash?: string;
  pushed?: boolean;
  error?: string;
};
```

执行顺序也不是简单地先 commit 再问问题。任何不改变仓库状态的选择都应当前置：

```text
读取 branch / upstream / remotes
  -> 多 remote 时先让用户选择
  -> git add -A
  -> git commit -m <message>
  -> git push 或 git push -u <remote> <branch>
  -> 分别报告 commit 与 push
```

这样可以保证用户在 remote 尚不明确时不会“仅仅点开一次流程”就意外创建 commit。真正进入 commit 阶段后，如果 push 失败，结果必须携带 commit hash，UI 应提示“本地 commit 已创建，push 未完成”。

## 为什么不能自动补偿

Git commit 没有通用、安全的自动回滚：

- `reset` 会改变 index 或工作树，可能覆盖用户刚发生的其它操作。
- hook 可能已经产生外部副作用。
- push 请求可能已到达远端，只是客户端没有拿到确定响应。
- 自动重试完整流程会重复提交；自动 force push 又扩大了破坏范围。

因此桌面控制面的默认策略应是：不猜测、不自动回滚、不自动重试写阶段，保留真实状态并给出下一步。

## 本机能力还要绑定到可信 workspace

固定 Git argv 只能避免 shell 注入，不能阻止被篡改的 renderer 把 `/some/other/repo` 当成 `cwd`。对于 Commit、Push 和本机应用打开这类能力，main 还应把 renderer 提供的路径重新解析回应用已登记的 workspace registry 或 session workspace：

```text
renderer { action, workspaceRoot }
  -> main 查 workspace registry / session
  -> 取得 canonical workspaceRoot
  -> execFile("git", fixedArgv, { cwd })
```

这是一种通用的桌面权限模式：renderer 传“身份和意图”，main 重新解析“真实目标和能力”，而不是把绝对路径当作授权证明。

## 常见陷阱

- 多 remote 时先 commit，之后才发现无法决定 push 目标。
- push 失败只返回 `ok: false`，丢失已经创建的 commit。
- hook 失败后自动 reset index，破坏用户可检查的现场。
- 只用参数数组防注入，却允许 renderer 任意指定 `cwd`。
- 把 Git stderr 原样展示，泄露 workspace 路径或带凭据的 remote URL。

## 自检问题

- 用户尚未选择多个 remote 中的一个时，仓库状态会不会已经改变？
- push 超时后，界面能否准确告诉用户本地 commit 是否存在？
- renderer 被篡改后，是否能让 main 在未登记目录中执行 Git？

来源任务：`docs/histories/2026-07/20260729-1417-environment-and-local-git-actions.md`。
