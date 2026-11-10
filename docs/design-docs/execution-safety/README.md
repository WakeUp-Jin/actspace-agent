# v2 执行安全入口

> 当前 v2 执行安全事实入口。

## 当前状态

- [`agent-tool-permission-model.md`](./agent-tool-permission-model.md)：权限模型事实源；支持 `default/auto-review/full-access`，once 与 Desktop 文件、限定 Bash Session Grant 已实施。
- [`agent-沙箱设计.md`](./agent-沙箱设计.md)：沙箱设计；工具沙箱已实现（Harness 插件 `sandbox` + nono / Seatbelt 后端）；评估沙箱已实现（nono `run` 域名白名单 + `packages/harness-evolution/harness-evaluation`，开发环境与 CLI 可用，不在默认组合里）；Windows 原生后端尚未实现。
- [`permission-runtime-foundation`](../../exec-plans/completed/permission-runtime-foundation.md)：权限 Runtime、文件/Bash once、mode、Journal 与 Host 直接切换计划，自动化实施已完成。
- [`session-scope-grants`](../../exec-plans/completed/session-scope-grants.md)：Desktop 文件 Session Grant、恢复、管理与撤销计划；真实 Electron 主题/重启矩阵保留人工验收。

## 当前事实源

- [`../agent-plugin-runtime/agent-spec-tool-runtime-abi.md`](../agent-plugin-runtime/agent-spec-tool-runtime-abi.md)：definition、permission、approval、prepared execution、checkpoint、result 与 recovery 契约；
- `packages/core/tool-runtime/`：Tool Registry、PermissionEngine、prepared execution、Lease、redaction 与 ordered commit；
- `packages/fs/tool-fs-read/`、`packages/fs/tool-fs-search/`、`packages/fs/tool-fs-write/`、`packages/shell/tool-shell/`、`packages/web/tool-web/`、`packages/image/tool-image-generation/`、`packages/image/tool-image-inspection/`：文件、Bash、Web、图片等 concrete capability；
- `packages/approval/approval/`：Host-neutral ApprovalBroker 契约；
- `apps/desktop/src/main/runtime-v2/approval-broker.ts`：Desktop 审批适配；
- `apps/cli/src/runtime-v2/approval.ts`：CLI 审批适配。CLI 没有交互式审批面（stdin 整段作为提示词读完即关闭），需要审批时直接拒绝并在结果里报告 `APPROVAL_REQUIRED`。

## 执行顺序

```text
Tool Definition
→ 参数解析与 schema validation
→ Host capability / activation lease
→ 结构化资源提取与 canonicalization
→ Global Boundary + Tool Permission
→ resolve Session Grant
→ deny | ask | allow
→ auto-review（仅新模式的 ask；不允许或失败回人工）
→ once/session approval + admission re-check
→ dispatch checkpoint
→ executor body
→ result redaction / artifact ownership
→ ordered commit
→ Journal terminal event
```

### deny

硬拒绝必须在副作用开始前终止，并返回稳定 code / reason。Approval 不能覆盖 manifest Host ceiling、缺失 required capability 或 destructive hard guard。

### ask

审批请求绑定：

- `requestId`；
- `callId`；
- Session / Agent Run；
- plugin / tool identity；
- definition digest；
- normalized args digest；
- requested effects；
- risk 和脱敏参数摘要。

一次批准只对该 prepared call 有效。Desktop 的文件范围审批可选择 Runtime 生成的 Session suggestion；Grant 由 Journal 恢复且可撤销，CLI 仍只有 `once | deny`。

### dispatch checkpoint

checkpoint 之前失败可以安全报告 not-started；checkpoint 之后如果没有 durable terminal result，恢复时必须报告 outcome-unknown。系统不能自动重试无法确认副作用状态的工具。

## Bash 当前边界

`packages/shell/tool-shell/src/command-rules.ts` 在执行前拒绝：

- 控制字符和不支持的 Unicode whitespace；
- 未加引号的 `$`、反引号、子 shell、brace group、进程替换；输出重定向到工作区和临时目录以外；分隔符未加引号的 heredoc。引号内的脚本源码是字面量，管道按简单命令逐段分类（见[脚本执行](../tool-system/agent-script-execution.md)第 2.1 节）；
- `eval`、`source`、`exec` 等 blocked builtin；
- 无显式目标、使用 glob、命中关键目录或逃出 workspace 的删除；
- 删除或移动 `.git` 元数据。

Bash executor 经 Harness 的 `sandbox` 服务执行：macOS 优先 nono、其次 Seatbelt；工作区、输出目录和系统临时目录可写，`.git/hooks`、`.git/config` 与凭据目录受保护，网络不限制。`default` 与 `auto-review` 下每条命令都进沙箱，`full-access` 下不进（评估沙箱里的候选标 `inherited`）。Agent 要在沙箱外执行，须同时给 `sandbox_permissions: "require_escalated"` 和 `justification`：只给一个直接拒绝（`BASH_ESCALATION_INVALID`）；成对时每次单独审批，审批原因与审批卡上的理由就是 `justification`，没有前缀授权，也不记住批准。命令在沙箱里失败、退出码不是 2/126/127、输出含 `operation not permitted` / `EPERM` 时，工具结果末尾提示可以带参数重试一次（后台任务的结束通知同样提示）；这是猜测，命令自己的 `Permission denied` 不算。组合里没有沙箱、或者沙箱不能满足 `tool` 模板（Linux 缺少禁止写入、Windows 没有后端）时，bash 按“沙箱外执行”走审批，审批卡显示“真实环境”，没有前缀授权选项；执行端只认批准时的选择，沙箱中途不可用会拒绝执行而不是改为沙箱外执行，切换模式从下一条命令起生效。沙箱不过滤环境变量，子命令仍能读到完整的进程环境，因此 provider credential 不应通过 Desktop 环境变量提供。提高 Bash 能力前应先定义更窄的环境白名单和明确的 shell 语法分类器。

## Host 边界

- renderer 不执行工具，不持有 Node capability；
- Plugin manifest 声明 required / optional Host capability；
- Host 只注入已允许的 filesystem、shell、network、artifact、browser 和 credential port；
- concrete plugin 不能自行从全局环境发现额外能力；
- artifact 必须绑定 Session / call owner，并在读取时校验路径、大小和 digest；
- Browser Bridge 属于 Host capability，不因 Browser Tools package 激活而自动视为可用。

## 当前未实现

- 跨 Session、project 或用户级持久 Grant；
- Bash Session Grant 或命令 pattern；
- 运行中热更新 policy；
- 不可信第三方插件沙箱；
- 对 shell expansion（`$`、命令替换、子 shell）的安全静态分类。

已立项的权限目标只按上方两份 execution plan 实施。其他能力若重新立项，必须新增 v2 设计和 execution plan，不能直接恢复归档文档中的 v1 类型或文件路径。
