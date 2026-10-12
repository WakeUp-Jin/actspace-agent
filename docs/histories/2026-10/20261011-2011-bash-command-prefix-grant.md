## 2026-10-11 | Task: 添加 Bash 会话命令前缀授权

### Execution Context

- Agent: Codex，模型 GPT-6；本地桌面运行。
- Computer Use 委派：gpt-6.1-sol。

### 用户诉求

保留 Bash 既有安全检查，不扩展沙箱；按已批准完整方案添加命令前缀授权。

### 变更

- shared、Journal、projection 支持 process.execute / command_prefix 和 grant-used 审计。
- shell-tools 保守识别简单命令、程序/子命令白名单和排除参数；cwd/workspace 使用 realpath。
- Runtime 校验授权身份、政策、前缀、资源变化，审计失败或撤销阻止启动；Desktop 本地主 Agent 接线。
- 切换工作区撤销 process 授权，权限模式降级继续仅回收原有文件授权。
- 前端读取正式类型并避免审批切换残留建议，增加显式 mock 场景。

### 设计与验证

前缀代表用户明确允许的调用范围，不代表沙箱或只读保证。授权分析不替代既有 hard deny。

完整验证与外部门槛见 [执行摘要](../../exec-runs/20261011-bash-command-prefix-grant/execution-summary.md)。本轮未提交或推送，保留原有未提交改动。

学习沉淀命中新概念、可迁移、陷阱：见 [命令前缀授权](../../learnings/2026-10/20261011-command-prefix-permission.md)。
