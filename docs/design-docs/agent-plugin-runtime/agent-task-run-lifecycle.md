# Task、Run 与 Harness 的生产接线

2026-10-03 P2 实现说明。验收结论以[执行记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-2-summary.md)为准。P3 已接入 Harness 控制服务，阶段验证见 [P3 执行记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-3-summary.md)；P4 的独立进程/远端传输尚未实现。

## 所有权

DesktopAppService、HeadlessRunner → Runtime 的 ManagedRuns 适配 → AgentService → SessionRunManager → 租约中的 RunFactory。

AgentService 管理每会话唯一调度器；TaskLedger 拥有持久任务状态；默认 AgentLoop 仅执行一次 Run。ManagedRuns 将既有桌面/CLI 请求转换成共同操作，不缓存 Loop assembly。旧 RunController 和 AgentLoopService 已移除，旧 Inbox 仍供默认 Loop 的内部通知及低层测试使用，不拥有生产排队任务。

Session 新建、恢复、fork 只打开存储和任务投影。实际执行才获取当前 Harness、派生 Run scope。主 Run 终止时依次停止并等待 Loop、持久化终态、释放租约；不能证明消费者已停止时保留租约并阻断继续，不能卸载仍被使用的组合。

## 默认固定产物

`packages/runtime/scripts/build-default-harness.mjs` 用仓库已有 esbuild 生成可枚举 ESM 闭包，发布前校验产物和共享模块摘要。默认 Loop、Prompt、工具注册、执行 LLM、compaction 都由 Harness 提供。Host 保留 Session writer/codec/projection、配置和凭据解析、工具底层能力、Agent registry，以及用于标题等辅助操作的 LLM。

Todo projection 只在 Host 注册一次；工具定义随 Harness 装载。Browser Host 的连接由 Host 释放，单个 Harness 的清理只注销工具。子智能体从自己的当前 Harness 租约创建策略 scope，不沿父策略 scope 继承；父权限上限、workspace 和取消通过显式输入传入。子会话也保存接纳、领取、Harness 身份和终态。

## 内容队列与实时配置

Task 保存内容、稳定 taskId/submissionId、顺序和消费目标，不保存待执行模型配置。普通输入实际启动时读取当前配置；指定给当前 Run 的补充输入在安全点领取，并刷新后续模型请求的模型/推理/技能选择。模式在 Run 内固定；同一 Session 的下一次 Run 可使用新模式。

指定插入、撤回及结束时未读归队都保留 taskId。已领取输入不能撤回或重放。取消/排序使用 revision；并发领取和编辑只有一个获胜。停止、失败、Host 恢复暂停队列；发送新输入不解除暂停。`/compact` 占同一调度槽，但没有 Loop Run。

## 持久化与客户端

`plugin/actspace.agent-service/{task,run,queue}` 使用 required codec。每次成功提交后才发布新快照；flush 失败不会把内存 Journal 当成持久事实回复。Fork 按 sessionId 隔离调度记录。

客户端首次发送前保存稳定标识，结果不明时沿用标识；Host 同标识同内容返回已有任务，不同内容拒绝。附件准备结果与原始提交内容共同记录；不因回复失败删除可能被持久 Task 引用的附件。首次发送保留等待结果的兼容 IPC，排队接纳使用 TaskReceipt；二者最终都进入同一 AgentService。

客户端读取 Host 队列，负责草稿和展示，不再推进待发队列。`agent/tasks-updated` 使用 `@mode emit` 观察通知触发重新读取；通知不是持久屏障。Task 终态与 Loop live event 的时机不同：最终结果等待 Run 清理、租约归还完成后返回。领域插件通过 adapter 的 `DomainEvents` 扩展 Cordis 事件类型，adapter 不反向依赖具体领域包。

默认 Loop 在取消的终态与 checkpoint 成功后返回 `reason: aborted`，由 RunFactory 映射为 `cancelled` 并保留结构化结果；正常停止不发执行错误通知。落盘阻断或收尾 checkpoint 失败仍抛出异常，不能以取消成功掩盖。

## 恢复与预算

Host 重启不恢复旧 Loop 内存，也不自动重放工具。已领取记录中断、未领取记录暂停；没有新任务事件的旧 Session 可继续读取。旧二进制缺少 required codec 时不能继续写入新 Journal，代码回退不等于数据可读性回退。

执行预算从真正执行开始计时，审批等待区间只暂停一次；绝对 deadline 不暂停。开始前已过 deadline 的输入取消，不获取执行租约。主 Run 取消传到子 Run；当前内置子智能体只读且不允许审批，沿用 preset 的执行时限。

执行器在进入 execute 后以 outcome 表达正常取消；抛出的异常即使发生于 AbortSignal 已触发之后，也不能被调度器改写为取消成功。ManagedRuns 的调用取消必须关联原 task/run；调用响应延迟时不得取会话当前 Run 作为取消目标。CLI ephemeral 仅保证不保存会话历史/任务 Journal，Host 独立保存 harness-artifacts 固定代码及 harness-state 选择记录；这两类数据不属于临时会话历史。

## P3 的选择边界

Runtime 组装 `HarnessControl` 的可信 Host 端口；控制服务复用 composition 和 boot，不承担任务调度。首次启动保存内置选择，后续启动恢复最后成功记录。主 Run、子 Run、手动压缩和能力查询都经异步租约入口；准备和授权等待不阻塞运行，仅最终持久提交窗口串行化新租约。排队期间不冻结模型配置，实际拿到租约后重新读取配置；绝对截止时间在获取前后均检查。

Run 已有 harnessId/generationId/revision 保持不变，跨重启稳定摘要放入 `run.configuration.harnessExecutionDigest`。P2 task codec 对 harness 对象字段严格校验，因此不向该对象追加字段，不升级 codec、不重写历史。configuration 原本是可扩展 JSON，旧读取器继续接受新增摘要。

替换只改变后续获取的组合。旧 Run 持有旧租约，父 Run 和子 Run 可使用不同 revision；同会话下一 Run 可更换 Loop。恢复缺产物、共享契约变化或选择日志损坏时执行 blocked，Host 控制服务仍存在；恢复内置组合需独立授权，成功产生新 revision。生产默认没有授权端口或面向用户的启用入口。普通任务失败不会触发 Harness 回退。
