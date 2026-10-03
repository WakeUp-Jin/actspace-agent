# Agent Harness 插件化与 Host 分离

状态：2026-10-03 分阶段推进中。P1 已获批执行；阶段验收见下方状态与执行摘要。P2–P5 仍需逐阶段细化和审阅。

## 目标与依据

以模块化、可替换性为优先，在解耦之后精简。Host 拥有运行生命周期，客户端仅连接和呈现。Session 跨运行保留，Run 固定 Harness 组合，后续 Run 选择最新成功启用的组合；Loop 也是可替换插件。

必读：仓库 AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、PLANS_GUIDE，以及[设计决策](../../../design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md)和[参考验证](../../../exec-runs/architecture-refactor/deepseek-harness-verification.md)。改代码前还须读 CODING_BEHAVIOR、HISTORY_GUIDE、QUALITY_SCORE 和相关包测试约定。

参考验证只说明 DSH 的实例共存与回收机制可用，不等于本项目已经支持 Run 切换或固定代码。当前 source-loader 校验完整性后仍从原目录导入；本项目 Cordis/Loader 固定版本与 tmp 参考源码有差异。实现不得依赖 tmp 仓库，也不默认升级 Cordis。

## 分阶段交付

| 阶段 | 交付 | 验收门槛 | 现有入口与迁移方向 |
| --- | --- | --- | --- |
| P1 组合与加载基础 | 固定产物入口、隔离的候选组合、引用回收；形成正式测试 | 同名工具和服务隔离，失败保留当前选择，资源编辑不影响旧实现 | cordis-adapter/source-loader 与 cordis-root；boot；core/scope；composition。见[P1详细计划](phase-1.md) |
| P2 共同应用操作和运行管理 | Desktop、Headless 共用任务管理；Session 与 Loop 生命周期分开 | 任务持久接纳、去重、排队；同会话下一 Run 和子 Run 选最新组合；不同 Loop 并存；现有功能回归 | desktop-app/service.ts、headless/runner.ts、runtime/runtime/run-controller.ts、core/agent-loop/service.ts；领域规则迁回所属插件 |
| P3 Patch 显式启用 | 基线检查、候选准备、启用、回退和回收接入真实 Run | 准备时不污染旧 Run；基线冲突拒绝；失败旧组合可继续接纳任务；回退不撤销工具副作用 | composition/patch.ts、compose.ts、runtime/profiles/composition.ts；复用 P1，不建第二套 Loader |
| P4 Host 与客户端分离 | 独立 Host、Desktop WSS/SSH 隧道及供后续 Web 使用的服务接口 | 断线继续、重连状态衔接、设备撤销、多端审批竞态、重启后手动继续 | Electron Main 持连接；renderer 走 IPC；共同应用契约供 JSON-RPC 适配器消费；SSH 只承载同一协议 |
| P5 文档和目录整理 | 当前设计与代码一致；删除已无消费者的旧路径 | 链接、构建、包边界、进程启动及功能验收通过；比较前后统计 | 按消费者检索结果列删除清单，保留历史和用户数据 |

每阶段结束时主应用必须可启动、现有使用方式可用。P1 不切换产品默认路径；P2 先用当前组合完成迁移；P3 再开放在线启用；P4 完成独立 Host 交付。不能用“预留接口”代替 Host 分离主线。后续阶段在进入前写独立详细计划，不把本路线表当成可直接执行全部代码的任务清单。

## 所有阶段共同验收

- Profile 稳定、Bundle 可复用、Patch 表达差异；不每个 Run 重建整个 Profile。
- 单进程一个 Host Cordis root；Harness 树隔离服务与注册，Run 持有组合引用。相同文件内容不等于状态可共享，只有明确兼容的 Host 能力共享。
- Loop 运行期间不替换；新旧实现可同时服务不同 Run；释放旧组合不终止新运行。
- Manifest -> 纯 codec 准入 -> behavior 激活顺序保留；事件明确 @mode，服务调用、策略链和事实通知分开。
- durable 接纳不承诺工具副作用 exactly-once；未知工具结果不得自动重放。
- 当前功能基线包括模式、模型选择、标题、压缩、审批、steer、队列、子 Agent、工具和历史读取。P2 计划为每项映射原测试与新测试，不靠删除旧测试消除失败。
- 遵循现有前端真实验收规则：验收点先于操作分组；mock、真实 Electron、协议客户端和源码检查分别报告。手机浏览器前端验收属于后续独立计划；本轮仍须用协议测试覆盖多设备行为。

## 已确认的交付范围与产品行为

2026-10-03 用户明确推迟手机 Web 前端，并接受启用权限与审批等待计时方案。以下是已确认行为，不代表批准全部代码实施。

1. 本轮先完成其他服务、独立 Host 和 Desktop 远端连接；手机 Web 前端后续单独立项实现。WSS、认证配对、会话/任务/审批接口和多设备行为仍在 P4 范围，须实际实现并测试，不能只预留接口。手机页面、PWA、推送和原生 App 不在本轮交付范围。
2. P3 将 Harness 启用作为独立权限操作，复用现有审批机制，首版默认明确批准。代码修改、产物准备和验证不等于启用授权，Bash/文件写入授权不自动授予启用权限；Host 在启用入口执行检查。批准并成功启用后仅影响后续 Run，当前 Run 保持原组合；后续可按明确授权范围自动启用。
3. P2 审批等待不计入执行时长预算；用户明确指定的截止时间仍生效。到期停止推进并使待处理审批失效，旧审批不能重新启动任务；不撤销已有工具副作用。客户端离线本身不触发超时或取消。

## 后续详细计划必须落实的技术契约

无需用户逐个选择技术字段，由实施计划提出具体方案并接受审阅：P2 的任务/Run 标识、持久化与去重保留、恢复状态；P3 的能力兼容声明、共享范围、产物保留；P4 的 RPC 错误、快照与订阅衔接、配对有效期/尝试限制、设备凭据保存与撤销、部署路径。它们不能以“实现时自行决定”进入获批实施计划。

## 风险与回退

P1 若发现当前 Cordis 无法提供所需隔离，提交具体失败证据和依赖调整方案，不静默换版本或另起运行框架。P2 数据新增采用可兼容读取的方式，先以 fixture 证明旧历史仍可读；涉及不可逆格式迁移时另给迁移计划。P3 回退只改变未来 Run 选择；P4 保留本机内嵌模式可用。P5 删除以引用与产物检查为依据，不删用户数据、历史材料或整个 tmp 目录。

不自动提交、推送、部署或清理其他工作区。记录每阶段修改范围，按阶段回退自己的改动，不使用清空工作区的操作。

## 执行记录与状态

实施开始后使用 `docs/exec-runs/20261003-agent-harness-host-refactor/` 的 execution-process.md 和 execution-summary.md。原重构统计与参考验证仍保留在 `docs/exec-runs/architecture-refactor/`，不得覆盖原 before 数据。

- [x] 目标、行为边界与参考实现验证已有记录。
- [x] 总路线和 P1 详细计划落盘，包含输入输出、身份、并发、清理与 A1–A12 验收矩阵。
- [x] 手机 Web 延后、Harness 启用权限和审批等待计时已确认。
- [x] 用户确认 P1 职责独立、不限制包数，以及明确依赖/资源的固定产物首版范围。
- [x] 按 P1 详细计划启动正式实施。
- [x] P1 实现与自动化验收，见[执行摘要](../../../exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)；真实 Run 与客户端尚未迁移。
- [ ] P2、P3、P4 各自详细计划、实现和验收。
- [ ] P5 清理与总体验收。
