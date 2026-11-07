# 工具权限分级：deny / ask / allow 的语义、环境契约与调度分层

合并自四篇：工具权限调度（v1）、破坏性工具区分 deny/ask/执行环境、沙盒下 deny 与 ask 的语义分界（含 .git 延迟执行逃逸）。后两篇的核心判断标准至今适用；`ToolScheduler` 是 v1 实现，v2 已由 Permission Runtime（见 [权限准入与审批生命周期](../2026-09/permission-admission-and-approval-lifecycle.md)）取代，下文标为历史背景。

## 1. 三态决策是唯一的权限状态

```ts
type ToolPermissionDecision = "allow" | "deny" | "ask";
```

`reason`、`summary`、`riskLevel`、`sanitizedArgs` 是随决策返回的上下文，不是额外状态：`riskLevel: high` 不等于拒绝，`summary` 不等于审核请求，“危险”也不是足够精确的工具状态。

历史背景（v1 `ToolScheduler`，已不在代码里）：权限逻辑放在注册表与 executor 之间的调度层，而不是写进每个工具——否则 Bash、Write、Edit、网络工具各自重复实现审核/拒绝/日志/状态恢复，前端审核面板还要理解每个工具的私有状态。工具只回答：能否直接执行、是否必须硬拒、是否可让用户审核、参数是否需清洗；执行顺序、结果裁剪、待审核状态由调度层管。`ToolManager.execute()` 保持兼容、内部委托给 scheduler，调用方可渐进迁移；调度层不应依赖 Electron renderer 的审核按钮。`ask` 时不能启动 executor——暂停的是工具调度，不是已运行的进程。

## 2. deny 与 ask 是语义差别，不是严厉程度

直觉会把“危险命令”统统塞进最严的 deny。但 deny 的真实语义是**用户批准也救不回**，准入标准是“**不存在正当场景**”，不是“危险”：

- `rm -rf /`、eval、删 `.git` 本体 → 任何场景都不该发生 → deny。
- `git reset --hard`、`git push --force`、`rm foo.txt` → 用户可能真要 → 塞 deny 会堵死正当任务 → ask。

判定一条规则进哪档，问两个问题：① 有没有正当场景？没有 → deny；② 出错有没有回滚路径？没有 → ask（且沙盒放宽不豁免）；有 → 可自动放行。第二问解释了“写/编辑文件”不用 ask 而“删文件”要：写坏了 diff/revert 能救，删掉的 untracked 文件没有机制能救——**不可逆操作摧毁的往往恰是回滚路径本身**（`git reset --hard` 摧毁的就是“git 可回滚”这个兜底）。例：`git branch -D` 不在不可逆清单（reflog 能救），`git stash drop` 在。

反例：权限层只返回 `dangerous operation`，模型会理解成“正在等审批”，但 deny 分支不会创建审批请求。硬拒绝还会诱导模型绕道（模型被拒后立刻改用 bash 写文件）；把“用户能理解并授权”的风险从 deny 挪到 ask，反而收窄了绕过面。

## 3. 删除安全看目标，不看 flag

`rm -rf` 的 `-rf` 只表示递归强制，不能单独证明目标没有正当删除场景。hard reject 取决于目标边界：workspace 根、workspace 外、glob、`.git` 等无法安全授权的对象。

## 4. 沙盒不豁免 workspace 内的不可逆操作；同一动作入口同档

- 沙盒写白名单必含 workspace，所以**对 workspace 内部破坏力零防护**。“沙盒可用就自动放行”的放宽必须带例外清单：不可逆操作在沙盒内也要问人，否则沙盒反成 rm 的免审通道，比没沙盒（至少走 allowlist-miss 的 ask）更危险。
- 专用工具 `delete_file` 永远 ask，而 bash `rm` 因沙盒自动放行，模型很快学会用 bash 绕审批——**同一动作的多个入口必须同档**。

## 5. `.git/hooks` 与 `.git/config` 是沙盒外未来的延迟执行点

沙盒约束“进程运行时能做什么”，但有些写入的危害发生在沙盒外的未来：写 `.git/hooks/pre-commit`（用户之后在真实环境 `git commit` 以全权限执行）；写 `.git/config` 的 `core.fsmonitor`/`core.pager`（等价 hook，任何 git 操作触发）。路径在 workspace 内（沙盒写白名单内），文本层又防不住 `cp payload .git/hooks/`，只能在 profile 机制层定向 deny，且必须放在广域写放行**之后**（Seatbelt last-match-wins）。范围取舍：拦 `**/.git` 会让沙盒内 `git clone` 与子目录 `git init` 全部失败（要写 hooks 模板），所以只保护 workspace 根仓库的 `.git`；代价（根仓库 `git remote add`/`git push -u` 写 config 被拦）由“违规标注 + 升级审批”兜底。

## 6. 文本匹配可靠的前提是语法收缩

`rm $DIR`、`$(echo rm) x` 之所以不用防，是因为管道/重定向/命令替换/子 shell 在更早一级被整体拒绝——先收缩语法空间，token 级文本匹配才所见即所得。哪天放开这些语法，整个文本规则层的可信前提塌掉，必须换 AST 级解析。

## 7. 环境契约：计划环境属于审批，实际环境属于事实

- 权限决策先回答 `deny/ask/allow`；deny 的模型回填明确写“执行前拒绝、没有审批请求”。
- ask 事件携带**计划执行环境**，审批卡展示用户将批准什么；executor 返回**实际执行环境**，最终 preview 用实际值覆盖计划值。
- 沙盒初始化失败要停止执行（fail closed），不能静默降级成真实环境，否则审批时展示的环境承诺失效。
- UI 为执行前拒绝建模 `notExecuted`（`packages/util/shared/src/session.ts`），不要把“未知环境”误当“未执行”。

## 自检

1. 新的破坏性命令该进 deny 还是 ask，先问哪两个问题？
2. 如果把 `.git/hooks` 保护从根仓库扩大到 `**/.git/hooks`，哪两个常见命令会在沙盒内坏掉？
3. 如果 `checkPermissions` 返回 `ask`，executor 应启动吗？`riskLevel` 为什么不该是权限状态枚举的一部分？
4. 审批卡上的环境是计划值还是实际值？沙盒起不来时会怎样？

来源：`docs/histories/2026-05/20260524-1545-tool-permission-scheduler.md`、`docs/histories/2026-07/20260704-2010-bash-permission-tiers.md`、`docs/histories/2026-07/20260726-0802-fix-bash-delete-approval-environment.md`。
