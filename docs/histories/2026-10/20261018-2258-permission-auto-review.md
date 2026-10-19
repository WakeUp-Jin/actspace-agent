## [2026-10-18 22:58] | Task: 补齐查询会话授权并接入替我审批

### Execution Context

- Agent ID: `/root`
- Base Model: GPT-6（Codex）
- Runtime: Codex Desktop

### 用户诉求

减少常见查询重复审批；新增替我审批模式，用简单插件调用已连接模型判断允许与可选理由。默认跟随会话模型，在既有工具结束事件记录两字段，不新增事件类型。先制定执行计划，再执行。

### 变更与动机

- 扩展 Bash 查询命令会话授权，校验选项、工作区真实路径和 git -C；无法识别的形式保持单次审批。
- 新建 auto-review 插件与默认 Harness 服务。模型只判断，Runtime 保留硬规则、取消、超时、复验和人工兜底，避免把模型回答直接当作执行权限。
- Desktop 增加模式与模型选择，默认跟随当前会话；指定模型失效回人工。工具结果复用 approvalMode / approvalReason，经持久化投影显示。
- 同步权限设计、包 README、执行记录，并沉淀 invocation 绑定、上下文来源与审计边界的学习文档。

### 关键文件

- `packages/tools/shell-tools/src/command-prefix.ts`、`query-paths.ts`
- `packages/auto-review/src/review.ts`、`context.ts`、`prompt.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/runtime/src/harness/agent-factory-plugin.ts`
- `packages/session/journal/src/core-codecs.ts`
- `apps/desktop/src/main/model-runtime-service.ts`
- `apps/desktop/src/renderer/components/settings/sections/TaskModelDefaultsSection.tsx`

### 验证与边界

398 项定向测试、依赖构建、Desktop 类型检查和两端构建、包边界/build graph/主题/token 检查通过。check:docs 仍被既有前端重构计划的失效 demo 链接阻塞。真实 Provider 未调用；按规定委派的 gpt-6.1-sol 无 Computer Use 工具，真实界面 U1–U7 未覆盖。沙箱增强不在范围内。详见执行摘要；未提交、推送。

### 追加真实交互验收

用户要求启动Computer Use后，委派gpt-6.1-sol使用CDP真实Electron、隔离数据与synthetic Provider完成U1–U7代表路线。发现主Agent和completeText取排序第一路由导致审批模型影响主对话；改为优先default并排除辅助路由。Runtime63项、DesktopApp13项测试和Desktop类型检查通过，重启真实应用后指定模型/跟随模式的HTTP请求证实修复。真实商业模型判断质量仍未验证，详细范围与证据见执行摘要。

### 2026-10-19追加原生Computer Use

按用户要求由gpt-6.1-sol使用macOS截图、CGEvent鼠标键盘操作真实Electron，U1–U7代表路线通过，不使用CDP或DOM驱动界面。覆盖模式与模型设置保持、查询会话授权复用、自动审计显示、拒绝/HTTP错误回人工、pending及新旧历史重载、浅深主题和480×800窗口。本轮未修改产品代码；曾误判审计文字缺失，原生滚动输出卡片内部后确认正常，撤销误报。详见`docs/exec-runs/20261018-permission-auto-review/native-computer-use-acceptance.md`。本地synthetic Provider仍不代表商业模型判断质量。
