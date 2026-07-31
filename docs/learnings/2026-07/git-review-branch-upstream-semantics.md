# Git Review 中 local branch、upstream 与 remote-tracking ref 的区别

## 是什么

Review UI 显示 `main → origin/main` 时，左侧是本地分支，右侧通常是本机保存的 remote-tracking ref。`origin/main` 不是每次查询远程服务器得到的实时结果；它只会在 fetch/pull 等显式网络操作后更新。

## 为什么容易做错

把 Branch scope 建模为“用户输入一个 base ref，再比较 `merge-base(base, HEAD)..HEAD`”看起来通用，但会丢失产品语义：

- 不知道用户选的是哪个本地分支。
- 无法可靠展示本地分支与 upstream 的关系。
- Renderer 可以传任意 ref，扩大 Git 输入边界。
- `HEAD` 可能不是被选择的分支，尤其在 detached HEAD 或多 worktree 场景。
- UI 容易把“本机 remote-tracking 状态”误写成“已实时访问远程仓库”。

## 推荐建模

Renderer 只保存本地 branch 名称：

```ts
type BranchSelection = {
  kind: "branch";
  branch: string;
};
```

Main 负责：

1. 从 `refs/heads/*` 列出本地分支及 upstream。
2. 重新验证 `refs/heads/<branch>`。
3. 通过 `<branch>@{upstream}` 解析 upstream。
4. 使用 `git rev-list --left-right --count upstream...local` 计算 behind/ahead。
5. 使用 `merge-base(upstream, local)..local` 展示本地独有提交。

这里不能写成 `refs/heads/<branch>@{upstream}`。Git 的 upstream revision suffix 应作用于 branch 名称，例如：

```sh
git rev-parse --abbrev-ref --symbolic-full-name 'feature@{upstream}'
```

把完整 `refs/heads/feature` 与 `@{upstream}` 直接拼接，在真实 Git 中可能得到 `no such branch`。

## Diff 方向与 UI 方向

“将要 push 的内容”实际 Diff 是：

```text
merge-base(upstream, local) → local
```

但 UI 可以显示：

```text
local → upstream
```

它表达的是推送目标关系，不是 raw Diff 的 baseline/target。因此数据契约最好单独提供 `comparison` metadata，不要篡改真实 baseline/target 字段。

## 不自动 fetch 的原因

打开 Review 就 fetch 会带来网络、认证、延迟和外部状态变化。更稳定的边界是：

- Review 读取本机 remote-tracking ref。
- Refresh 只重读本地 Git 状态。
- Fetch/Pull 是显式 Git 操作。
- UI 或文档明确 remote-tracking ref 可能落后于服务器。

## 自检

- 当前 Diff 是否使用选择的 local branch，而不是无条件使用 HEAD？
- upstream 是否由 Main 重新解析，而不是信任 Renderer？
- behind/diverged 是否有提示？
- 产品文案是否错误暗示已经实时访问远程服务器？

关联变更：`docs/histories/2026-07/20260730-1832-review-workbench.md`。
