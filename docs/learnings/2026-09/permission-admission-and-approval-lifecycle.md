# 权限准入、审批生命周期与“审批后放行”

合并自四篇：权限准入与执行强制分层、权限变化是重新判断、模型判断不能直接变成执行权限（auto-review）、sanitizedArgs 审批放行标记（v1）。主线：**批准是绑定到一次具体调用的短命凭据，任何会改变判断条件的事件都要触发重新判断，而不是沿用旧批准**。

## 1. 两层：admission 与 enforcement

- admission 在副作用前决定这次 prepared call 能否继续，产出可解释的 `allow/ask/deny`；enforcement 在真实 syscall/进程启动前，重新确认实际资源仍与获批资源一致，只能执行或 fail-closed。两层共享 canonicalization 与资源模型。
- 文件路径不是稳定字符串：审批后父目录可能被替换、普通文件变符号链接、workspace 内路径解析到外部。只信审批时的字符串，用户批准 A、syscall 触碰的可能是 B。反过来全推迟到 executor，Runtime 无法在 checkpoint 前给出稳定拒绝原因与脱敏审批摘要。

```text
materialize args -> canonicalize structured resources -> Host ceiling + sensitivity + scope
-> tool decision -> combine deny/ask/allow -> optional once approval
-> re-check mode, digests, lease, resources -> durability checkpoint
-> executor re-canonicalization -> syscall / process spawn
```

要点：审批只生成绑定 `requestId + callId + args digest + definition digest` 的一次性准入凭据，不是可复用布尔值，不绕过 Host ceiling、protected resource、executor sandbox；资源用结构化 `kind/access/canonicalPath/targetKind`；`deny > ask > allow`，全局 `pass` 是中性结果不是批准；审批在 durability checkpoint 前，审批后重检所有可能变化的输入；executor 只消费已准入资源并在 syscall 前重新解析，不一致返回稳定拒绝；一次批准不能被 Host registry 悄悄缓存成 Session 授权。

陷阱：用路径字符串前缀判 subtree（`/work/app-old` 被当 `/work/app` 子目录）；对不存在的写入目标直接 `realpath`，失败后退回未验证原路径；审批后不重检 symlink/mode/lease/abort；把 `full-access` 当“所有工具自动允许”从而绕过删除、Bash、敏感文件规则。

## 2. 权限变化是重新判断，不是批准旧请求

等待审批时用户切换权限，改变的是“命令是否可执行”的条件，旧请求记录的仍是旧条件，不能直接变成“已批准”。流程：关闭旧请求并记录关闭原因 → 用新权限重新提取资源并执行策略判断 → 再开始命令。即使新模式更宽松，硬拒绝与资源检查也不会被绕过。只需一个短生命周期通知订阅，不必轮询。

- “用户拒绝”与“权限变化”可能同时到达：`Promise.race` 只选最先完成者，不理解谁有业务权威。先收到的拒绝必须保留；取消旧请求后还要检查 Host 已做的决定，不能把已拒绝命令重新放行。回归测试要主动安排这个顺序，而不只测正常点击。
- 取消范围要准确：重新评估一个请求只取消该 requestId；取消整个 run 会连带关闭其他工具的审批。订阅、超时计时器、AbortSignal 监听都在 `finally` 释放。
- 检查位置：异步路径解析、沙箱准备、持久化屏障都会让之前的检查过期。进程创建前再查取消状态，执行体调用前确认权限仍与准入时一致。已在运行的命令是另一个生命周期，权限变更不等于进程终止。
- 真实界面揭示的分层测试盲区：工具层已能响应新策略，Host 入口却先把所有请求标记超时，重新评估永远到不了；界面显示“任务完成”不代表每条工具成功，要看单条工具结果和 Journal 时间，区分自然过期与代码主动失效。回归应落在产生错误决策的 Host 入口，而不是只补更多工具层 mock。
- 自检：日志里的“取消”是谁触发的？两个审批同时存在时能只关一个吗？拒绝与模式切换同时发生，能证明不会执行命令吗？

## 3. 模型判断（auto-review）不能直接变成执行权限

自动审批放在原权限系统的“需要询问”位置，只替代一次人的判断，不替代命令解析、资源范围、取消、执行前复验。例：模型看到读取 `notes.txt` 的调用返回允许；等待期间用户切回普通模式，或 `notes.txt` 变成指向别处的链接——执行器若只查 `approved === true`，执行的已不是判断时的操作。解法：判断绑定当前 invocation（参数、工具版本、资源快照一致），模式变化取消等待，执行前重新提取资源并比较；模型超时或坏格式回到既有人工流程。

- 只看最近一条消息不行：“可以”可能是在回应助手提出的某项操作，要保留对应提议；但助手提议本身不能充当人类授权。原始用户消息、助手文本、工具结果保留来源区别，压缩摘要不能升级成原始授权。上下文不足时回人工比截断后猜测可靠。
- 审计不必另造状态机：工具结束事件已含调用身份和执行状态，加实际审批路径与可空理由即可解释“谁允许、为什么”（包括允许后执行失败）。审计字段描述过去，不能被重放成未来的权限。
- 自检：审批期间模式变化会怎样？模型理由为空会误判失败吗？历史结果写着 auto，恢复时会错误复用允许吗？

## 4. 历史：sanitizedArgs 标记（v1 工具调度）

v1 中权限检查器与 executor 各自做边界校验，出现结构问题：检查器判“越界但用户已批准”，executor 再跑硬守卫拒掉。做法：检查器返回 `ask` 时在 `sanitizedArgs` 里塞内部标记（`APPROVED_OUTSIDE_BOUNDARY_ARG: true`），调度器批准后**用 sanitizedArgs 而非原始 args 执行**，executor 见标记跳过边界守卫。（这套 v1 代码已被 v2 prepared call 取代，原则仍有效。）

- 授权信息随“这次调用的参数”流动，不放全局/会话状态（粒度错、会泄漏到后续调用）；executor 不能直接放开边界。
- 不变式：**标记只能由权限检查器写入，模型传入的同名参数必须在检查器入口统一剥除**（`const { [FLAG]: _, ...cleanArgs } = args`）。只在越界分支剥除、允许分支忘了剥，会让工作区内路径带着伪造标记通过。必须有测试锁住“模型自带标记被剥除”。前提是调度器契约：批准后必须以 sanitizedArgs 执行。
- 硬拒绝看似更安全，实际诱导绕道；用户能理解并授权的风险应在 ask。

## 自检

1. executor 信任 args 里的哪些字段？是否都只能由可信层写入？
2. 用户批准的范围是“这一次调用”还是“以后类似的都行”？实现粒度与意图一致吗？
3. 对不存在的写入目标，路径解析失败后会退回原始路径吗？

来源：[Permission Runtime 基础切换](../../histories/2026-09/20260923-2300-permission-runtime-foundation.md)、`docs/histories/2026-07/20260705-1522-user-message-clamp-diff-preview-write-approval.md`，以及 2026-10 审批失效、auto-review 相关改造。
