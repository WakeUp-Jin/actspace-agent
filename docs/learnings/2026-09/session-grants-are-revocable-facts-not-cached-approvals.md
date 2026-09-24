# Session Grant 是可撤销事实，不是缓存审批结果

## 是什么

一次审批回答“这一个 prepared call 能否继续”，Session Grant 回答“在明确生命周期内，哪个 subject 可以对哪类资源执行哪种 action”。两者不能用同一个布尔缓存表达。

一个可靠的 Session Grant 至少包含：

- subject：Session 与 Agent；
- audience：plugin、permission domain 与 policy version；
- action/access：例如 `file.read/read`；
- selector：exact 或路径段安全的 subtree；
- provenance：来源 request、call、tool 与签发时间；
- lifecycle：Journal add/revoke、可选 expiry 与恢复规则。

## 为什么不能缓存审批

如果 Host 收到一次 allow 后只在内存里记一个“这个路径允许”，会马上遇到几个无法回答的问题：

- 重启后要不要恢复？
- 另一个 Session 或 Subagent 能不能使用？
- 工具升级后旧授权是否兼容？
- 用户如何查看和撤销？
- 多资源调用只覆盖了一部分时怎么办？
- mode 降级或权限域变化时如何失效？

没有显式模型时，系统通常会在不知不觉中把一次审批扩大成不可审计、不可撤销的长期权限。

## 推荐模型

```text
permission/asked
-> user chooses Runtime suggestionId
-> Runtime validates pending request and suggestion
-> permission/decided(session)
-> permission/grant-added
-> Projection rebuilds candidate state
-> Runtime matches current call again
-> permission/grant-revoked / expiry / policy mismatch
-> future calls ask again
```

Projection 只负责从事实生成读模型，不负责安全决定。真正消费时，Runtime 仍要重新验证 subject、audience、policyVersion、action/access、expiry 和全部资源覆盖。

## 三个关键模式

### 1. suggestionId capability

Renderer 不提交路径、action 或 audience，只提交 Runtime 生成的 suggestionId。这样 UI 可以选择权限，但不能发明权限。

### 2. revoke tombstone

Projection 遇到未知 grantId 的 revoke 时保留 tombstone，而不是忽略。即使坏序列后来出现同 grantId 的 add，也不能把已经撤销的权限重新激活。

### 3. checkpoint 前完整复验

不能只确认“某个 grantId 仍存在”。多资源调用可能由多个 Grant 共同覆盖，其中一个已撤销；因此 checkpoint 前应重新执行完整 matcher，证明当前全部资源仍被有效 Grant 覆盖。

## 常见陷阱

- 用字符串前缀做 subtree，误把 `/project-old` 当作 `/project` 子目录。
- 目录资源继续取父目录作为 suggestion，静默扩大 grep/glob 范围。
- Grant 只绑定路径，不绑定 action，导致 read 授权覆盖 write。
- 只在 UI 隐藏高风险选项，但 Runtime 仍接受任意 session decision。
- 把 Project Grant、用户级 Grant 或 Subagent 继承提前塞进首版，导致撤销和恢复边界无法说清。

本条学习来自 [Desktop Session Scope Grant](../../histories/2026-09/20260924-0045-desktop-session-scope-grants.md)。
