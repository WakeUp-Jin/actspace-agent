# P4 独立 Host 与 Desktop 远端接入（首版范围完成）

P4 获批首版范围已经实施并验收。以下保留过程状态，最新结论为第十轮修复后复验完成；未提交或推送。

## 改动

- 从 DesktopAppService 提取共同 AgentApplication，保留 Desktop 标题策略；Headless 与 Desktop 复用模式写入。任务调度仍只有 AgentService，新增维护闸门。
- 新建 agent-host 包：Node 能力、Cordis application plugin、Host Profile、RPC/WSS、设备配对撤销、观察快照、审批、上传及结果快照；CLI 管理入口与单 writer 管理目录。
- client 增加浏览器兼容的薄 Host transport；Desktop Main 管理 safeStorage 凭据、系统 SSH、SessionRef 路由、待确认上传记录、结果校验下载。
- Desktop 新增连接设置、统一会话标签及创建位置/Host 工作区/模型选择；隔离远端与本机开发工具入口。

## 依据与验证

详见 [P4 计划](../../exec-plans/completed/20261003-agent-harness-host-refactor/phase-4.md)、[过程记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-4-process.md)、[Host 指南](../../agent-host/README.md)。工程构建、Host 28 项、Desktop 993 项、真实 TLS/隔离 SSH、独立进程断线继续、P3 强杀恢复已通过。Computer Use 由 gpt-6.1-sol 进行，结论单列；Linux ARM64 容器内解压产物的 6 项真实进程测试已通过；真实云部署/真实 Provider 未验证。

待完成项保留在过程记录，不以单测代替界面验收。不改写现有 Session Journal，不清理用户并行设计文件。

本轮涉及可迁移的提交幂等与崩溃窗口设计，满足学习沉淀条件；学习文档已随实现添加。

第二轮增加大响应分页、离线缓存、上传确认偏移与订阅释放，修复 CU 发现的问题；学习记录见 `docs/learnings/2026-10/20261004-remote-submission-identity.md`。P4 验收仍在进行，未提交。

第五/六轮修复 shared 根入口指纹漂移与空会话队列入口遗漏，保留原选择和 Journal 后恢复旧任务；本机模式、审批、停止/继续和压缩交互通过。第七轮维护/重启队列继续、设备撤销和审批回访交互通过。双 Desktop 同时观察/审批仍被第二应用的 macOS 钥匙串等待阻塞，T7 不签收；详细证据按 P4 覆盖矩阵记录。

第九轮已补齐真实双 Desktop 同步、双向审批、退出恢复及双 Host 同 ID 隔离。随后按用户授权修复 B1–B6：列表与连接元数据刷新、配对前去重、移除后位置标识、历史轮次边界与片段统计、失败会话不阻断 drain。新增回归均有修复前失败证据；Desktop 1000、Runtime 43、AgentService 28、Host 真进程 7 项通过，构建及类型检查通过。用户要求暂停等待切换 gpt-6.1-sol 后做交互复验，因此 T7 仍未签收。学习记录见 [有界历史与整轮统计](../../learnings/2026-10/20261004-bounded-history-turns.md)，详细限制见 [修复记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-4-bug-fixes.md)。

第十轮由 gpt-6.1-sol 完成 B1–B5 真实 Electron 定向复验与双端审批/完全退出恢复/双 Host 同 ID 隔离回归，B6 真实进程专项 2/2 重跑通过。历史片段用正常工具链与透明慢前翻网络夹具观测，完整统计恢复正确；没有改写产品代码或 Journal。T1–T7 完成，明确保留手机前端、外部 Provider、云部署与 systemd 未验证边界。详情见第十轮验收报告。
