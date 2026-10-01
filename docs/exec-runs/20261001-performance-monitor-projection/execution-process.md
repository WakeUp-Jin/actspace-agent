# 执行过程

## 2026-10-01

- 用户批准计划落盘后执行。保留消息队列、压缩时间线等已有工作区变更，未提交。
- T1：新增 replayTail，先校验连续序号，再按 projection 折叠有效事件，全部成功才提交；缓存恢复不创建中间视图。覆盖 checkpoint 尾部、pending 压缩事务与序号错误。
- T2：requestContext 按 surface/events/activeTurnId 引用缓存重计算结果，保留水位、请求时间与旧 browseContextState 语义。逐事件与冷重放等价测试通过。保留 live chunk 消费；不改全局流式调度与 usage cache 失效语义，后者只有风险证据，尚无独立复现。
- 删除 WorkbenchLayout 的默认范围预加载，UsageStatisticsPage 自己按已保存范围请求，避免进入页面两次调用。
- T3/T4：新增可信主窗口 IPC、100ms 分辨率主事件循环延迟采集、2 秒 renderer 请求。关闭/隐藏/销毁/重载清理；设置通用页持久化，独立组件更新，无持续磁盘输出和无限历史。
- 修复侧栏收起时 SplitView 卸载子树的问题：紧凑监控由外层 WorkbenchLayout 挂载。设置导航窄屏使用固定紧凑入口。
- 自动化：Desktop 全套 970 passed / 1 skipped；后续新增 IPC 测试通过、投影 13、缓存 2、Runtime 4 通过。类型、依赖构建、主题/token、文档检查通过。新增测试首次失败分别是 node:perf_hooks mock 默认导出和 fixture 缺 chunkIndex，已修正再通过。
- 离线同 7 会话共 8209 事件，旧逐条 apply 约 8380ms，新批量约 21ms + 最终快照约 8ms。未把它当成端到端页面耗时。
- CU：确认默认 off，打开后数值（例如 CPU 0.1%、323 MB）、进程明细和时间/延迟；确认聊天、设置及收起侧栏可见。页面切换/开发重载恢复偏好。
- CU 工具单次 AX 读取约 60 秒，热更新及用户侧界面变化导致索引失效；重新读取后发现当前界面已回聊天且面板关闭，保留最新状态，停止争用界面。未完成的路线在摘要逐项列出，不能视作通过。

## 提交前独立验证（2026-10-01）

从 d43de08 创建独立检出，只应用本次暂存补丁，排除消息队列和压缩时间线 WIP。Runtime 依赖闭包、Client、renderer 与 Electron main/preload 构建通过；Desktop renderer/main 类型检查通过。定向测试 81 项通过：projection 13、projection-cache 2、Runtime context/session-projection 16、Desktop 监控/统计/设置/响应式 50。current-docs、主题色和设计 token 检查通过。

独立检出的 `pnpm check:docs` 未全绿：基线已有 `20260926-site-homepage-redesign.md` 顶部“已完成”措辞触发 active 生命周期检查。该文件与 d43de08 完全相同；原工作区存在其他任务对此文件的修正，本提交未混入。原工作区文档检查通过不等于本提交独立文档全检通过。

提交前核对 IPC 可信主窗口/mainFrame 来源、采集清理、历史事务/序号边界、上下文语义缓存和最终 UI 范围，未发现阻止本次提交的新问题。未推送、发版或声称剩余实机验收通过。
