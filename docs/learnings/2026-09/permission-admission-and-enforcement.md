# 权限准入与执行强制必须分层

## 是什么

工具权限不能只在“是否弹审批框”这一处判断。可靠的模型至少分成两层：admission 在副作用前决定这次 prepared call 是否可以继续；enforcement 在真实 syscall 或进程启动前，重新确认实际资源仍与获批资源一致。

这两层共享 canonicalization 和资源模型，但职责不同。admission 产生可解释的 `allow/ask/deny`，enforcement 面对真实文件系统和 Host capability，只能执行或 fail-closed。

## 为什么需要

文件路径不是稳定字符串。审批发生后，目标的父目录可能被替换，普通文件可能变成符号链接，原本位于 workspace 内的路径也可能解析到外部。如果 executor 只相信审批时的字符串，用户批准的是 A，真实 syscall 触碰的却可能是 B。

反过来，如果所有判断都推迟到 executor，Runtime 无法在 checkpoint 前给出稳定的拒绝原因，也无法生成准确、脱敏的审批摘要。准入与强制分层，才能同时获得可解释性和真实边界。

## 推荐流程

```text
materialize args
-> canonicalize structured resources
-> Host ceiling + sensitivity + scope
-> tool decision
-> combine deny/ask/allow
-> optional once approval
-> re-check mode, digests, lease and resources
-> durability checkpoint
-> executor re-canonicalization
-> syscall / process spawn
```

审批只生成绑定到 `requestId + callId + args digest + definition digest` 的一次性准入凭据。它不应成为可复用的布尔值，更不能绕过 Host ceiling、protected resource 或 executor sandbox。

## 核心要点

1. 使用结构化资源表达 `kind/access/canonicalPath/targetKind`，不要把权限边界压成字符串路径数组。
2. `deny > ask > allow`；全局 `pass` 是中性结果，不是最终批准。
3. 审批发生在 durability checkpoint 前，审批后必须重新检查所有可能变化的输入。
4. executor 必须只消费 Runtime 已准入的资源，并在 syscall 前重新解析；不一致时返回稳定拒绝。
5. 一次批准只属于一个 prepared call，不能被 Host registry 悄悄缓存为 Session 授权。

## 常见陷阱

- 用路径字符串前缀判断 subtree，导致 `/work/app-old` 被误认为 `/work/app` 的子目录。
- 对不存在的写入目标直接 `realpath`，失败后退回未经验证的原始路径。
- 审批后不重检 symlink、mode、lease 或 abort，让陈旧批准继续执行。
- 把 `full-access` 理解成“所有工具自动允许”，意外绕过删除、Bash 和敏感文件规则。
- Host 把 once decision 缓存到 Session，实际上偷偷实现了没有生命周期、撤销和审计语义的 Grant。

本条学习来自 [Permission Runtime 基础切换](../../histories/2026-09/20260923-2300-permission-runtime-foundation.md)。
