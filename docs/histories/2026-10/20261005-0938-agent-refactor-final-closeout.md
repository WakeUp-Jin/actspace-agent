## 2026-10-05 09:38 | Task: 完成 Agent 重构的代码、目录与文档清理

### 执行上下文

- Agent：Codex 主智能体；Computer Use 委派 gpt-6.1-sol。
- Runtime：Codex Desktop，本机隔离源码快照与 synthetic Provider/Host。
- 状态：批准范围的清理与自动化完成；35/35 界面验收签收，计划已归档。

### 用户诉求

> 完成本次重构目标内所有清理，保留模块解耦和存储适配边界；清理冗余代码、过时文档及根目录。保护 histories、learnings、设置与既有工作。

### 主要改动

- 删除 23 个内置插件仅供旧测试使用的 activate 工厂、旧装配别名、空生命周期包装和未用局部符号；测试改为真实 Cordis 生命周期，不合并模块职责。
- 收窄后台 Inbox 写侧；用户任务沿 Host Task 流转。修正 CLI 失败诊断、LLM 重试尝试的持久终态与冷恢复、Headless resume 暂停队列，以及工具 diff 统计。
- CU 发现 Agent/Plan 超限附件被误判为提交未知；将任务接纳前的准备错误返回明确拒绝，接纳后的回执丢失继续保持去重核对，相关 18 项回归和类型检查通过，真实界面明确拒绝与草稿保留已定向复验通过。
- CU4.3 发现远端队列编辑丢失图片：Host 保存 uploadIds，renderer 原先只读本机 attachments。改为从持久 artifact 恢复带 Session 归属的附件，编辑时认证预览、重发时重新上传；不依赖本地原文件，保留重试身份和跨会话隔离，定向回归及 Reload 后真实编辑回填、修改重发已通过复验。
- 增加真实 HTTP CLI 成功/失败/重试/信号/恢复验证，保持默认一次尝试；修正全新源码 typecheck 的构建依赖闭包。
- artifacts 整体忽略并取消 7 项跟踪；根讨论稿、素材、诊断与实验脚本归位，删除确认可再生成的缓存和空目录，保护有路径绑定的独立仓库。
- 合并重复架构说明，校准 ABI、Task、存储、设置、Composer 和工具预览文档；已实施计划归 completed，历史入链保留短入口。

### 设计动机

降低维护成本以模块边界清晰为前提。静态 import 为零不能证明动态插件无用；持久请求尝试的终态也不能等同于整个 Run 失败。删除以真实消费者、生命周期和恢复行为为依据，未证明冗余的独立能力保留并说明限制。

### 验证与证据

- 隔离当前未提交源码的 frozen install、构建、typecheck、完整测试和必需门禁成功；CLI HTTP 与 fixture 保活/恢复编号 12 项与真实 Cordis/sshd 覆盖通过。
- 原有 817 个 histories/learnings 的路径和内容不变，本轮处置范围链接扫描无新增断链（外部并行前端方案与动态 HTML 模板的扫描结果单列）；既有 lint/链接基线单列，不改写历史来消除旧告警。
- Computer Use 35/35 签收；最后的标题竞争使用用户授权的原生菜单辅助，19.024 秒内手动改名保留，未将自动化当作界面验证；不涉及真实云部署、线上 Provider 或发行签名。
- [执行摘要](../../exec-runs/20261005-agent-refactor-final-closeout/execution-summary.md)与[逐项界面验收](../../exec-runs/20261005-agent-refactor-final-closeout/computer-use-acceptance.md)持续记录最终状态。本轮未提交或推送。

### 关键位置

- `packages/core/agent/src/inbox.ts`
- `packages/session/journal/src/invariant-validator.ts`
- `packages/session/persistence/src/recovery.ts`
- `packages/headless/src/runner.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `scripts/test/agent-cli-process.test.mjs`
- `docs/exec-runs/20261005-agent-refactor-final-closeout/cleanup-ledger.tsv`

本次命中可迁移、有深度和恢复陷阱，另新增[重试尝试的终态](../../learnings/2026-10/20261005-retry-attempt-terminal.md)学习记录。

### 用户复审补充

2026-10-05 用户明确要求删除独立鹈鹕动画；删除此前从根目录迁入的 `docs/design-demos/pelican-bike.html`，同步处置清单。原始动画 history 保留，其他目录迁移尚未执行。此为资料删除，不涉及产品代码，无需新增测试。

2026-10-05 用户批准文档目录合并：两个工具流 HTML 原样迁入 design-docs/frontend，Host 指南及 systemd 示例迁入 agent-plugin-runtime，内部装配说明归入总体架构。同步现行链接和临时前端方案中的路径引用；design-demos 删除，旧 agent-host 仅保留历史入链跳转页，原 histories/learnings 不改。
