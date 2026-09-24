# v2 执行安全入口

> 状态：当前 v2 执行安全事实入口。v1 Bash、动态 allowlist 和 ApprovalGate 文档已归档到 [`docs/archive/v1/design-docs/`](../../archive/v1/design-docs/README.md)。

## 当前状态

- [`agent-tool-permission-model.md`](./agent-tool-permission-model.md)：权限模型事实源；只保留 `default/full-access`，once 与 Desktop 文件 Session Grant 已实施。
- [`permission-runtime-foundation`](../../exec-plans/completed/permission-runtime-foundation.md)：权限 Runtime、文件/Bash once、mode、Journal 与 Host 直接切换计划，自动化实施已完成。
- [`session-scope-grants`](../../exec-plans/completed/session-scope-grants.md)：Desktop 文件 Session Grant、恢复、管理与撤销计划；真实 Electron 主题/重启矩阵保留人工验收。

## 当前事实源

- [`../agent-plugin-runtime/agent-spec-tool-runtime-abi.md`](../agent-plugin-runtime/agent-spec-tool-runtime-abi.md)：definition、permission、approval、prepared execution、checkpoint、result 与 recovery 契约；
- `packages/tools/runtime/`：Tool Registry、PermissionEngine、prepared execution、Lease、redaction 与 ordered commit；
- `packages/tools/core-tools/`：文件、Bash、Web、图片等 concrete capability；
- `packages/tools/approval/`：Host-neutral ApprovalBroker 契约；
- `apps/desktop/src/main/runtime-v2/approval-broker.ts`：Desktop 审批适配；
- `apps/cli/src/runtime-v2/approval.ts`：CLI 交互式和非交互式审批适配。

## 执行顺序

```text
Tool Definition
→ 参数解析与 schema validation
→ Host capability / activation lease
→ 结构化资源提取与 canonicalization
→ Global Boundary + Tool Permission
→ resolve Session Grant
→ deny | ask | allow
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

`packages/tools/core-tools/src/bash/command-rules.ts` 在执行前拒绝：

- 控制字符和不支持的 Unicode whitespace；
- 当前分类器无法安全解析的 pipe、redirection、shell expansion；
- `eval`、`source`、`exec` 等 blocked builtin；
- 无显式目标、使用 glob、命中关键目录或逃出 workspace 的删除；
- 删除或移动 `.git` 元数据。

Bash executor 通过 Host port 启动进程，可选使用 macOS sandbox profile；当前进程环境仍可能被子命令读取，因此 provider credential 不应通过 Desktop 环境变量提供。提高 Bash 能力前应先定义更窄的环境白名单和明确的 shell 语法分类器。

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
- 对任意 shell pipeline / expansion 的安全静态分类。

已立项的权限目标只按上方两份 execution plan 实施。其他能力若重新立项，必须新增 v2 设计和 execution plan，不能直接恢复归档文档中的 v1 类型或文件路径。
