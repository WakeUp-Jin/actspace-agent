# 执行过程

- 2026-10-17：用户批准修复并要求计划先行。当前工作树干净，HEAD 与 fetch 后 origin/main 一致，创建 codex/bash-full-access。已读协作、架构、计划、前端验证与 history 规范。
- 确认固定 ask 和等待模式变化拒绝路径；git status 原现场超时尚无运行证据。计划已写，开始先失败测试。

- 先失败验证：Shell 完全权限回归返回 ask；Runtime 等待切换回归超时 denied。实现后通过。新增拒绝与切换竞态测试发现初始检查排队抢先于已返回决定，修为仅真实模式差异触发，并等待 Host 关闭旧请求后保留已决定的拒绝。
- 执行基线：真实沙箱/非沙箱 printf、git status、空仓库 git log 均在几十毫秒内返回；空仓库 log 返回 128 属于预期。git init 被沙箱 .git/config 写保护拦截，改为测试准备阶段初始化，不改沙箱。取消前创建进程回归先失败后修复。
- Desktop 首次组件测试因新工作树缺少 client 产物未启动；完成 Desktop 依赖构建后 10 项定向测试通过。

- 工程验证：Shell 75/75、Tool Runtime 38/38、Desktop 定向 10/10。Desktop build/typecheck 通过；最初 typecheck 与 CLI shared clean 构建交叠导致缺产物，顺序重跑通过。
- Runtime 全量 55/56，通过单 worker 复测仍为 tool-composition 15 秒超时；对基线 26175b4d 做独立源码快照、安装并构建，原测试同样 15 秒超时，确认非本次引入。
- check:docs 报 314 个历史缺失图片链接，本次变更文档未出现在错误列表；不改旧验收记录。
- 同类扫描：Shell 主进程 spawn 已补最终取消检查；sandbox capability probe 为全局有界 3 秒探测，并非用户命令，不复用该取消语义。HostApprovalBroker 本身按 requestId 管理取消；Desktop 原按 run 取消已收窄，显式停止 run 仍保留 run 级取消。

- 真实 Electron 委派 gpt-6.1-sol，使用隔离 HTTP Provider 和数据目录。CU 工具每次约 60 秒返回，已观察首条普通 Bash 待审批与新版权限说明；不把工具观察延迟归因于命令执行。主侧另跑审批恢复/远端审批 12/12、Host broker 2/2 通过。

- 真实 UI 首轮 A3 暴露 Desktop registry 旧逻辑：切换模式前 expireAll 将请求提前判 timeout（Journal 时间距 asked 仅 6 分钟，非自然过期）。新增 registry 回归先失败，移除该调用后 9/9 通过；保留撤销 grant 的失效逻辑。等待重启后定向复验，首轮不能记通过。

- 重启后 A3 复验通过：fixture-11 asked → mode-set full-access → permission-mode-changed aborted → completed；fixture-12 随后自动完成，各一次结果。A1 once/completed 与 user-denied/denied 对应明确；A2 两条 Bash 均无新审批。以验收记录区分交互与 Journal 补证。

- A1–A7 实机路线完成：硬拒绝、后台/输出/kill、停止待审批、刷新保留、不同会话权限隔离均已观察；工具内容/执行一次另有 Journal 补证。关闭本轮隔离 Electron/Provider/Agent Host，保留数据。计划归档 completed；未提交或推送。
