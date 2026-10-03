# P2 暂停与后续修复交接

> 历史交接快照：用户随后已授权修复并重新验收。CU-B01 与 E-B01 已修复，当前进展见 [P2 摘要](phase-2-summary.md)。下文保留暂停时的待办与证据，不代表仍在等待授权。

2026-10-03 用户要求 Computer Use 验收统一使用 GPT-6.1 Sol，Astra 留给开发和 Bug 修复。本轮只完成验收与问题记录，随后暂停；不修改源码或测试，不提交。P2 尚未完成验收，不得标记阶段完成。

## 已落地但待最终验收的实现

- `agent-service` 持久内容队列、submissionId 去重、串行 mutation、Run 调度和执行预算。
- 默认内置 Harness 固定产物、每次 Run 获取租约、主子运行独立选组合。
- Desktop/Headless 共用任务管理；renderer 展示 Host 队列；移除旧 RunController 和 AgentLoopService。
- 同会话 Run 间切换模式；当前 Run 固定模式；普通排队和补充输入在消费时读取配置。

这些实现保留在当前未提交工作区中。本轮停止开发之后，仅维护验收和交接文档。

## Computer Use 结果

见 [真实桌面验收记录](phase-2-computer-use-acceptance.md) 和 [P2 摘要](phase-2-summary.md)。报告区分已复现产品问题、待确认现象和测试环境因素，并逐项记录 U1–U6 覆盖。复现使用隔离临时数据和本机模型夹具，不读取真实用户凭据，不代表真实模型供应商验收。

## 已有自动化证据

下列结果来自暂停前的测试日志，本轮只读取结果，未新增测试执行。部分代码在后续集成中变化，因此不能把历史通过数当成当前完整回归结论。

| 检查 | 记录结果 | 说明 |
| --- | --- | --- |
| AgentService | 22 项通过 | 持久接纳、去重、恢复、调度与预算 |
| 默认 Loop | 31 项通过 | Loop 专项 |
| subagent | 11 项通过 | 后续生产 start/finish 接线仍需最终复验 |
| Runtime | 38 项通过 | 默认固定闭包、会话和运行集成 |
| desktop-app / headless | 11 / 2 项通过 | 应用适配 |
| CLI 真实进程 | 2 项通过 | SIGINT smoke |
| Desktop 队列、流式消息、引用专项 | 65 项通过 | 不能代替 Desktop 全量 |
| Desktop registry/admission 专项 | 6 项通过 | 包含新增任务接纳/重配置互斥与已修测试夹具 |
| Runtime 生命周期/队列通知专项 | 2 项通过 | Cordis observer 接收成功提交快照 |
| Desktop 最近全量 | 968 通过、9 失败、1 跳过，另 1 个 teardown error | 尚未获得干净全量结果 |

原始日志保留在本机临时目录，可能被系统清理。关键计数和失败用例已写入本文，不依赖日志永久存在。

## 已确认工程阻断

E-B01：`packages/runtime/src/runtime/agent-runtime-lifecycle.test.ts:18` 使用 `ctx.on("agent/tasks-updated", …)`，但 Cordis `Events` 类型未包含该事件。增量编译报 `TS2345`；对应 Vitest 2 项通过并不能证明 TypeScript 编译成功。这项测试在用户要求暂停前加入，本轮只记录，未修复。后续先补齐事件类型声明或符合现有端口边界的测试类型，再跑构建；不能据此声称当前 build 通过。

## 自动化待复验清单

这些是自动化失败或未完成项，不自动归类为产品 Bug。

1. `runtime-v2-chat-admission-ipc.test.ts` 原因是夹具没有 taskCommand；暂停前已修夹具，最近专项 2 项通过。完整测试尚未重跑。
2. `app-streaming-user-message.test.tsx` 的后台失败输入恢复、延迟 stop 回应两项在全量中 5 秒超时；同文件专项此前通过。停止 dev 后以单 worker 复验，若仍失败再定位。
3. `provider-model-settings.test.tsx` 的模型能力/价格编辑，以及 `settings-page.test.tsx` 的 Browser 主开关两项 5 秒超时。
4. `trajectory-render-view.test.tsx` 的请求边界/嵌套工具以及历史分页两项超时，后者超时限制为 15 秒。
5. `workbench-responsive.test.tsx` 的 Chat/Trajectory 切换草稿保持超时；空会话底部 Composer 用例随后找不到“查看执行轨迹”按钮，需判断是否为前一用例超时残留。
6. `user-message.test.tsx` teardown 后 Radix HoverCard 定时器触发 `window is not defined`；需检查组件/测试清理，不以通过用例数掩盖未处理异常。
7. 最终 Runtime 依赖闭包 build、Desktop typecheck/renderer/electron build、CLI 单元、boot/adapter、包边界、文档检查和 `git diff --check` 尚须对最终修复版本复验。
8. 补全真实子 Run 的 production ledger/Harness 身份验证；核对剩余兼容入口、预算和压缩停止语义。此项是实施收尾，未发现问题前不能称为已确认 Bug。
9. history、learning、重构代码行数对比及 T1–T6 完成状态尚未收尾。不要覆盖 P1 的 before 基线，不要提前勾选。

## 本轮结束状态

首次 GPT-6.1 Sol 验收因 Mac 锁屏停止。用户手动解锁并要求继续后，原子智能体补验：暂停队列切 Plan、插入实际消费、未读归队即时刷新、后台审批状态恢复、轨迹及跨会话草稿保持、一次审批后的测试命令执行均通过。取消 IPC 错误/侧栏失败问题再次复现，见 CU-B01；未发现独立归队通知缺陷。合法图片已选取并接纳到暂停队列，图片执行结果和独立文件引用未覆盖。最终范围以验收报告为准。开发进程和本机模型夹具保留，主测试会话有两条暂停待发任务；测试数据独立于真实用户目录。补验只纠正本机临时模型夹具的必填 intent 和调用 ID，不修改产品源码/测试，不提交。

## 继续修复的顺序

用户切换到 Astra 并重新要求修复之后，先按真实 UI 报告的 Bug 编号逐项定位，再修自动化失败。固定源码后完整重启 Electron，防止只热更新 renderer 而 main 仍使用旧代码。定向回归通过后复验受影响的 U 项，最后执行最终构建与回归、文档/history/learning/统计收尾。未获用户新的修复指令前保持暂停。
