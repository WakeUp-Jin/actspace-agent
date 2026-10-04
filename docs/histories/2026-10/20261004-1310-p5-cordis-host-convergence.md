## [2026-10-04 13:10] | Task: P5 Cordis 与 Host 职责收敛

### Execution Context

- Agent：当前主智能体 `/root`。
- Base Model：Codex GPT-6；不从用户讨论推断具体后端变体。
- Runtime：Codex Desktop，本地 workspace。

### 用户诉求

执行已批准 P5：模块解耦优先，精简重复事件/工具链与 CLI 空转发，同步测试、文档和目录。保留设置，Patch 仅完整新组合独立装配。用户随后要求在第 9 节 Computer Use 前暂停，切换 gpt-6.1-sol 再验收。

### 已落地改动

- checkpoint 从 required 事件改成 `session.checkpoint.flush`；默认 Harness 与 Profile 注入同步，服务缺失/持久化失败继续 fail closed。
- 原生 Cordis emit 发布通知，监听注册处隔离同步和异步错误；移除仅为通知持有的 scope 租约，插件自己等待其异步工作。
- 工具扩展统一为 Cordis 插入点；删除 middleware 类型/排序链，保留权限、审批、checkpoint、lease 与提交约束；post hook 不改写执行成败且报错仍清理。
- 独立 Host bootstrap/lifecycle 迁入 agent-host，CLI 注入 Runtime 窄端口；维护关闭等待当前 pass，启动失败有序回收并保留清理诊断。
- 删除三个 CLI 转发文件，产物领域测试迁入 agent-host。AgentApplication/AgentService/ManagedRuns、Desktop 标题与 Headless 退出职责保留。
- 收敛架构、事件与 Loop 文档；修复契约矩阵既有通知数量漂移，生成物由 generator 更新；补充测试映射及 CU 交接。

### 验证与状态

自动化结果与路径清单见 [P5 过程](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-process.md)及[摘要](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-summary.md)。Computer Use 未开始，不宣称 P5 全部完成。未清理用户历史、未改设置格式、未提交或推送；无关前端 space 设计与 myplan.md 保留。

### 学习沉淀

命中新概念、可迁移、陷阱和模式：记录 [通知与异步资源生命周期](../../learnings/2026-10/20261004-notification-lifetime.md)。

### 2026-10-04 CU 后修复

用户要求修复第二轮验收问题。修复本机凭据加密失败被误报网络问题、远端断线读取暴露原始 IPC 错误两项；当前消息、历史分页和列表加载统一处理。第三项“切换 blocked Host 残留旧工作区/模型”复核为同名夹具误报，撤回结论并补不同 Host 数据的组件回归，不修改切换逻辑。

Desktop 1008 项通过、2 跳过，类型检查和 renderer 构建通过；本轮未进行 Computer Use，按用户分工待 Sol 定向复验。无提交或推送。详见 [修复与复核](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-feedback-fixes.md)。

误报复核命中可迁移、陷阱与模式，补充 [可区分的验收夹具](../../learnings/2026-10/20261004-distinguishable-acceptance-fixtures.md)。

### 2026-10-04 最终验收与计划归档

Sol 第三轮 R1–R3 实机定向复验通过，无新 Bug，详见 [第三轮报告](../../exec-runs/20261003-agent-harness-host-refactor/phase-5-cu-round3.md)。P5 计划范围签收，P1–P5 整计划移入 completed 并同步链接；更新最终统计和测试接替表。本轮未新增产品改动、未提交或推送，用户设置及无关改动保留。
