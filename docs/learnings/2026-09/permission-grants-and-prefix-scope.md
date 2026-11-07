# 权限授权（Grant）：生命周期、可撤销事实与命令前缀边界

合并自三篇：能力授权与拒绝的不对称生命周期（Browser）、Session Grant 是可撤销事实、命令前缀授权为什么不能用 startsWith。主线：一次审批只回答“这一个调用能不能继续”；要让未来调用免问，必须把用户意图建模成**有主体、有范围、有生命周期、可撤销、可审计**的 Grant。

## 1. 允许与拒绝的生命周期不对称（Browser Use 例）

同一能力下的工具（`tabs`、`navigation`、`locator`、`cua`…）共享同一种外部能力。每次叶子调用都审批会连续弹窗；一次拒绝永久封禁又让用户无法在下次明确指令里改变决定。

```text
允许 -> Session capability grant （当前应用运行期间、同一 Session，后续同类工具静默放行）
拒绝 -> Turn-scoped denial     （本 Turn 内同类工具静默拒绝，防止模型换工具名再申请；下一 Turn 失效）
应用重启 -> 内存 grant 自然失效，不把临时授权变成长期账户权限
```

“不再显示审批卡”不等于“权限状态正确”：权威注册表在执行入口前判断——① Settings/策略硬拒绝；② 已有 Session grant 直接允许且不产生 pending；③ 本 Turn 已拒绝直接拒绝，不产生第二张卡；④ 都没有才创建审批并暂停工具。只在 Renderer 去重，Agent Core 仍会等一个用户永远看不到的审批，表现为任务卡住。审批请求要携带创建时的 `sessionId` 与 `turnId`，不能在点击时读“当前活动会话”（用户可能已切走，或另一会话同时发起调用）；活动会话只作旧调用方 fallback。

陷阱：按工具名缓存允许（60 多个同能力工具仍逐个审批）；把拒绝缓存到 Session（下一轮无法重新授权）；拒绝后仍允许同一 Turn 换工具重弹；只存布尔不存 scope（分不清一次性审批与能力租约）；UI 持有权限真相而主进程/调度器没有静默决策路径。

## 2. Session Grant = 可撤销事实，不是缓存的审批结果

Grant 至少包含：subject（Session+Agent）、audience（plugin、permission domain、policy version）、action/access（如 `file.read/read`）、selector（exact 或路径段安全 subtree）、provenance（来源 request/call/tool、签发时间）、lifecycle（Journal add/revoke、可选 expiry、恢复规则）。

Host 收到一次 allow 就在内存记“这个路径允许”，会立刻面对无法回答的问题：重启恢复吗？别的 Session/Subagent 能用吗？工具升级后兼容吗？用户如何查看/撤销？多资源调用只覆盖一部分怎么办？mode 降级或权限域变化如何失效？——不知不觉就把一次审批扩大成不可审计、不可撤销的长期权限。

```text
permission/asked -> 用户选择 Runtime 生成的 suggestionId -> Runtime 校验 pending request 与 suggestion
-> permission/decided(session) -> permission/grant-added -> Projection 重建候选状态
-> Runtime 对当前调用再次匹配 -> grant-revoked / expiry / policy mismatch -> 未来调用重新 ask
```

Projection 只生成读模型，不做安全决定；消费时 Runtime 仍重验 subject、audience、policyVersion、action/access、expiry、全部资源覆盖。三个关键模式：
1. **suggestionId capability**：Renderer 只提交 Runtime 生成的 suggestionId，不提交路径/action/audience（`packages/core/tool-runtime/src/prepared-execution.ts`）。UI 能选权限，不能发明权限。
2. **revoke tombstone**：遇到未知 grantId 的 revoke 保留 tombstone；之后出现同 grantId 的 add（坏序列）也不能让已撤销权限复活。
3. **checkpoint 前完整复验**：不能只确认“某个 grantId 还在”；多资源调用可能由多个 Grant 共同覆盖，其中一个已撤销，所以要重跑完整 matcher。

陷阱：用字符串前缀判 subtree（`/project-old` ≠ `/project` 子目录）；目录资源继续取父目录做 suggestion，静默扩大 grep/glob 范围；Grant 只绑路径不绑 action（read 授权覆盖 write）；只在 UI 隐藏高风险选项而 Runtime 接受任意 session decision；首版就塞 Project Grant、用户级 Grant、Subagent 继承，撤销与恢复边界说不清。

## 3. 命令前缀授权：别用 `startsWith`

字符串前缀 `pnpm` 会命中 `pnpmx`、`pnpm test && other`；用空格切分也不够，引号、变量、重定向会改变 shell 解释。可靠做法：只识别自己能**完整理解**的简单语法，得到 argv 与授权前缀；未知语法回到审批，不猜等价性。

- 分工：工具理解命令政策（“这次调用可按 pnpm 授权”），Runtime 理解授权身份与生命周期（同一会话、Agent、工作区、政策版本）。不让通用 Runtime 内置 npm 特例，也不只信界面按钮。
- 命中也不等于可立刻执行：等待期间 cwd 符号链接、权限模式、授权本身可能变；执行前重算资源并复验，持久化检查之后也不能忽略撤销。审计记录授权准入，实际成功与否看工具结果。
- 限制 cwd 不是文件系统隔离，允许 pnpm 也不是只读：项目脚本能做很多事。前缀授权减少交互，沙箱限制进程能力，是两种独立机制。
- 自检：允许 `git status` 是否也允许 `git show`？不——是不同的两 token 前缀。同一 pnpm 授权能给另一个 Agent 用吗？不能，身份也是授权边界。

## 自检

1. 允许一次后，同一 Session 的下一 Turn 是否完全不产生审批？拒绝后同一 Turn 第二个同类工具是否静默拒绝、下一 Turn 能否重新申请？
2. 审批期间切换会话，决定是否仍作用于原始请求？
3. 删掉 Projection，Grant 状态能否从 Journal 的 add/revoke 重建且撤销不复活？

来源：`docs/histories/2026-07/20260711-2315-browser-session-authorization.md`、[Desktop Session Scope Grant](../../histories/2026-09/20260924-0045-desktop-session-scope-grants.md)、2026-10 命令前缀授权改造。
