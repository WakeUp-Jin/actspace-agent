# Git Unborn Branch 应按能力建模

## 是什么

刚执行 `git init -b main`、已经 `git add`、但尚未 commit 的 repository 处于 unborn branch 状态。此时 `HEAD` 是指向 `refs/heads/main` 的 symbolic ref，但 `refs/heads/main` 和 `HEAD` commit 都还不存在。

因此，下列命令描述的是不同事实：

```bash
git symbolic-ref --short HEAD  # main
git rev-parse --verify HEAD    # 失败
git show-ref --verify refs/heads/main  # 失败
git ls-files --stage           # 可以包含 staged 文件
```

## 为什么不能只判断是不是 Git repository

一个 workspace 至少有四种需要区分的状态：

| 状态 | 原位读写 | 切换已有分支 | 创建标准 Worktree |
| --- | --- | --- | --- |
| 非 Git 目录 | 可以 | 不可以 | 不可以 |
| Unborn repository | 可以 | 不可以 | 不可以 |
| 有有效 `HEAD` | 可以 | 可以 | 可以 |
| Git 检查失败 | 不应继续 | 不应继续 | 不应继续 |

如果把 `HEAD` 不存在统一视为 workspace 不可用，就会错误阻断原位 Agent；如果只看到 `main` 字符串便允许创建 Worktree，又会缺少可检出的基线 commit。

## 为什么 `git add` 不是 Worktree 基线

`git add` 把文件写入当前 Worktree 的 Index，并将内容写成 blob object，但没有创建由 branch ref 指向的 commit snapshot。每个 linked Worktree 有自己的 Index，因此新 Worktree 不会继承原 Worktree 尚未提交的 staged 状态。

`git worktree add --orphan` 虽然可以创建另一个 unborn branch，但新 Worktree 的 Index 和文件树是空的。它不能替代“从当前 staged workspace 创建隔离副本”。

## 推荐模式

不要把 Git 状态压缩成单一 `ready` 布尔值。先识别事实状态，再映射成产品能力：

```text
Git facts
  -> repository / symbolic branch / HEAD / refs
  -> canRunInPlace / canSwitchBranch / canCreateWorktree
  -> Desktop controls and Runtime preparation policy
```

同时避免为了启用 Worktree 自动提交用户文件、制造隐藏 commit 或复制未跟踪内容。这些动作都会改变历史、泄露本地文件边界，或者产生难以解释的合并语义。

关联变更：`docs/histories/2026-08/20260801-1035-unborn-workspace-turn-recovery.md`。
