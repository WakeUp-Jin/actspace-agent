# P2 验证记录

状态：2026-10-03 P2 阶段签收，T1–T6 完成。后端、Desktop/Headless 接入、工程回归和现有可达 UI 通过；无 FileReference UI 入口和真实 Provider 等边界如下。P3 尚未开始，无提交或推送。

## 完成交付与证据映射

| 计划项 | 已实现内容 | 验证依据 |
| --- | --- | --- |
| T1 持久内容任务 | 同 submissionId 去重、内容冲突、flush 后可见、队列 revision、fork 归属隔离、恢复暂停 | agent-service task-ledger 10 项；缺 required codec 的旧读取器进入 browse-only |
| T2 调度与生命周期 | 单 Session 所有者、消费时配置、Run 固定模式、预算与审批等待、过期 deadline、释放顺序 | agent-service run-manager 11 项与 lifecycle/harness-run，合计 23 项 |
| T3 默认固定组合与子 Run | 22 文件固定闭包、执行策略归 Harness、主/子各自 acquire/release | Runtime default-harness 生产集成：父持 revision 1 时子选择 revision 2，子任务完成落盘且租约归零；替代 Loop 并存由 agent-service harness-run 验证 |
| T4 共同服务 | Desktop/Headless 共用 AgentService；Session 不持有长期 Loop | desktop-app 11 项、headless 2 项；Runtime lifecycle/fork/session 用例 |
| T5 客户端接入 | Host 队列快照、稳定重试身份、消费配置、CLI 输出/退出码兼容 | Desktop 全套 979 通过、1 跳过；CLI 13 项及 SIGINT 真实进程 2 项 |
| T6 清理与收尾 | 删除 RunController/AgentLoopService；兼容 adapter 只委派共同服务 | Runtime 40 项；包边界、构建、类型检查及 UI 报告；最终补验通过 |

配置与审批细节的自动化分别由 Loop steer、RunBudget 和既有 tools-approval 测试覆盖。真实 UI 的审批、模式、队列、停止与恢复证据见下方报告，自动化不能代替这些交互。

## 本轮最终自动化

- `pnpm --filter @actspace/runtime... build` 通过，默认固定产物重建完成。
- Desktop typecheck、renderer build、electron build 通过；构建仍有已有 CSS/minifier 与 chunk size 提示。
- Desktop 全套 132 文件：979 通过、1 跳过，无未处理异常。这次替代了先前 968/9/1 的失败快照。
- AgentService 23、Runtime 40、subagent 11、desktop-app 11、headless 2、boot 22、Cordis adapter 26（另 1 跳过）、CLI 13；默认 Loop 本轮完整 33 项、compaction 14 项、tools-approval 1 项通过。
- CLI SIGINT 两项真实进程验证通过。CLI ephemeral 不保存会话，允许缓存固定 Harness 代码；回归同步到 Host task/user-message 事件，不再要求旧 inbox/spliced。
- 文档、43 包依赖边界、diff 空白检查通过。package-cutover 非 strict 扫描无 monolith/deepImports/genericPlugins，但报告 3 个既有 site `/eval` 引用；不称为 strict 发布门禁通过，不属于 P2 运行迁移。

## 本轮补齐的边界

1. 正常取消返回结构化 aborted 结果；结算故障继续抛错。进一步修复调度器将“执行抛错且 signal 已取消”误吞成正常取消的问题；Run 工厂执行开始后，正常取消必须作为 outcome 返回。
2. ManagedRuns 的迟到取消关联原 task/run，不读取“当前活跃 Run”去取消下一次任务。回归明确模拟原任务完成、新 Run 已启动而旧调用仍等待返回。
3. 生产子智能体持久 start/finish、当前组合选择及独立租约已加入真实默认 Harness 集成测试；不再仅依赖替代子工厂测试。
4. agent/tasks-updated 由 agent-service 扩展 Cordis DomainEvents，adapter 不反向依赖领域包，原 TS2345 已消除。

## Computer Use

执行统一委派 GPT-6.1 Sol，使用独立临时数据、本机模型夹具与假凭据。不是对真实模型供应商的验证。

- [首轮及解锁补验](phase-2-computer-use-acceptance.md)：U1–U6 的模式、队列、补充、后台、审批、恢复记录。
- [取消修复复验](phase-2-fix-computer-use-acceptance.md)：不重载即可 Stopped/空闲、未读补充归普通暂停队列、继续后完成。CU-B01 已解决。
- [最终交互补验](phase-2-final-computer-use-acceptance.md)：新 PNG 提交成功并预览、回复批注提交/查看、/compact 排队→停止暂停→继续压缩通过；最终实例停止→暂停→继续普通消息亦通过。11 子项中 10 通过、1 无现有 FileReference UI 入口，0 新增确认 Bug。

FileReference 后端字段与 IPC 转换有自动化兼容证据，但当前 Composer 没有生成文件引用的 UI 入口。工作区文件预览不是引用提交。P2 不新增此功能，也不将回复批注当成 FileReference 验收；两者分开记录。

## 统计与后续阶段

使用原 `architecture-refactor` before 基线生成 [after 统计](../architecture-refactor/refactor-stats-after.md)，未覆盖 before。该统计包含 P1+P2 和原基线以来的工作区变更，不是纯 P2 diff；源码行数并非质量评分。精简以解耦为前提，最终文档/目录集中整理属于 P5。

P3 将讨论 Patch 的候选准备、基线冲突、审批、显式启用和回退；本轮没有实现任意插件打包或在线启用。P4 的独立 Host、远端 WSS/SSH 和后续手机服务仍未交付。真实 Provider、Chrome Extension、签名安装包属于独立外部验证门槛。
