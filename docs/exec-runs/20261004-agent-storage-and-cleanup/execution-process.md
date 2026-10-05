# 执行过程

## 2026-10-04

- 用户批准开始；基于既有脏工作树继续，未重置任何修改。
- 已记录全文件SHA256基线于本机临时文件，生成重构前统计。
- 建立存储、应用、文档三个实施批次；从存储读写整体解耦开始。

## 存储与任务迁移中

- 新增中性 session-storage 契约与独立内存实现，JSONL Provider 经 Cordis 注入 SessionStore；冷读/列表/fork/恢复已接入。
- 依赖闭包构建通过；Session persistence 44、JSONL 4、内存 3、Runtime 冷读/分页/fork 17 个用例阶段性通过。随后修改仍需最终复验。
- 新增 ManagedRuns 自定义 Run 返回值用例，completed/cancelled/failed 不依赖默认 Loop reason，确认 dispose/release 先于返回；结合资源关闭用例本次 5/5 通过。
- 本地首发正在迁移 submitTask；删除旧长 Promise IPC 与旧队列别名，同步迁移测试中。Chat 附件/引用拒绝 2/2 通过，远端提交 1/1 通过。尚未进行本轮 Computer Use。
- shutdown 重试复用尚未结束的 cleanup；实际失败可重试。多 Session 关闭聚合错误并继续释放。对应全面复验待完成。

## 实施与自动化复验

- 存储契约覆盖写入和读取两条链；JSONL 的布局、writer lease 与物理修复留在适配器，Session 保留语义恢复。独立 Memory backend 用于证明业务层不依赖文件布局。
- 关闭回归暴露 Cordis effect 并行释放与 Session 最后落盘的顺序冲突；Host 改为依次 drain Agent、关闭 Session、释放候选树与其他资源，每步失败仍尝试后续释放。CLI end-seed、跨进程续聊和关闭重试重新验证通过。
- 审查补充修复 JSONL open/create 与 provider.close 的竞争；读取缓存限制为 3 个条目及 16 MiB 序列化估算，避免无限保留全量事件。该限制不等于进程内存上限。
- 本地首发、远端及队列共用 submitTask；/compact 使用任务操作，不作为普通用户提示；Run outcome/value 与默认 Loop 文本结果解耦，Headless 等待资源 settlement。
- 生产 manifest 校验 behavior 提供服务集合与 contributions 一致；修正 browser-tools 静态声明。默认 Harness 构建与运行共用定义，矩阵补齐 Host/Session/领域事件声明和负向用例。
- 删除旧 Run/Compact 公共 DTO；测试输入留在测试 fixture。定向 renderer 58 项通过，完整 Desktop 先前 1001 项通过、2 项跳过。
- 两份审计文档改为实施结果；六组旧后端计划逐项说明已替代、已完成或转技术债，原路径保留短跳转，避免破坏 histories/learnings。
- 自动化、进程与真实 Computer Use 的结果分别记录。最终结果见 execution-summary；Computer Use 由 gpt-6.1-sol 执行，未完成前不认定全部交付。

## Computer Use 第一处修复

Sol 在 CU6 发现 running Reload 后用户消息与轮次导航重复；请求计数证明没有重复执行。修复恢复占位与持久化用户消息合并时的稳定标识去重。新增回归在修改前失败（2 条），修改后通过（1 条）；相关 renderer 59 项通过、Desktop 类型检查通过。继续由 Sol 定向实机复验并推进剩余验收点。

Sol 在 CU4 发现压缩重试停在暂停队列。补充重试接收后检查新任务仍 pending 再 resume；避免普通提交解除用户主动暂停，也避免已再次失败的任务被误恢复。测试 fixture 改为真正等待 resume 后执行压缩，59 项回归通过，继续定向实机复验。

Sol 定向复验确认两处修复：CU6 新 running 任务与 compact 队列 Reload 后只显示一条用户消息及轮次，运行/停止和队列状态恢复；CU4 再次摘要失败后点击重试直接进入压缩，release 后完成。模型切换 UI 与实际回复一致。图片、重开、远端继续覆盖。

## 2026-10-05 重开验收

CU7 正常 Cmd+Q 退出完成，但默认开发重启的 `tsc -b` 屏障发现 Todo 投影 filter 参数隐式 any；未绕过构建。为经类型谓词校验的输入显式标注 unknown，同一 build:deps:dev 全部通过，通知 Sol 按默认启动继续。此问题说明逐包 noEmit 检查不能替代实际开发 composite 构建。

## 本轮收尾

2026-10-05 Sol 完成远端配对/审批/工具结果预览/离线草稿/重连唯一发送，正常退出隔离 Electron，并仅关闭本轮明确 PID 的 Host、Provider、proxy。无未修复已确认产品 Bug；附件选择器、队列编辑回草稿、参数/技能逐项消费、标题竞争、busy compact 取消后重排执行未覆盖，保留为验收门禁。实施完成不等于全量实机验收通过，计划保留 active 状态以追踪这些剩余项。
