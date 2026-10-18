## 2026-10-17 | Task: 修复完全权限下 Bash 反复审批

### Execution Context

- Agent：Codex 主智能体；真实 Computer Use 委派 gpt-6.1-sol。
- Runtime：macOS，本地独立修复分支；用户已授权提交、推送修复分支并创建 PR，合并由用户审核后执行。

### 用户诉求

完全权限已开启，Bash 仍反复要求审批且有卡住体验。用户批准修复范围，要求先写计划再实现。

### 改动与动机

- Shell 权限先执行既有 hard guard，再按 full-access 自动允许或 default 审批；同步权限说明与当前设计。
- Tool Runtime 订阅 Session 权限变化，关闭旧审批后重新评估；保留用户拒绝/超时优先级、资源与模式复查。Desktop 取消精确到 requestId，防止影响同 run 其他请求；真实 UI 验收发现并移除切换前 expireAll 的旧路径，避免被提前判为超时。
- Bash 异步准备完成后、创建进程前检查取消，防止已取消调用仍执行。
- 增加确定性 Provider 的连续命令、硬拒绝和后台任务验收标记，不使用真实用户凭据或会话。

### 验证

权限与等待切换回归先失败后通过；取消前 spawn 回归先失败后通过。Shell、Tool Runtime 与 Desktop 定向测试、类型检查、构建的结果及真实 Electron 验收见[执行摘要](../../exec-runs/20261017-bash-full-access/execution-summary.md)。

原现场 git status 超时未复现，临时仓库真实沙箱/非沙箱命令可快速完成，不能把此结果等同于原用户仓库问题已修好。Runtime 全量中的工具组合测试超时、仓库历史图片链接缺失分别记录，不混同于定向回归。

### 关键文件

- `packages/tools/shell-tools/src/plugin.ts`、`node-ports.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/runtime/src/harness/agent-factory-plugin.ts`
- `apps/desktop/src/main/runtime-v2/approval-broker.ts`、`approval-registry.ts`
- `apps/desktop/src/renderer/components/workbench/PermissionModeControl.tsx`

权限失效与异步取消具有可迁移性和竞态陷阱，已生成[学习速记](../../learnings/2026-10/20261017-approval-invalidation.md)。

### PR 交付

用户已授权 commit、推送及创建 PR，待本人审核后合并。已补充官网更新日志，站点测试 23/23 与构建通过；基础 CI 的历史文档链接失败保留在执行摘要。
