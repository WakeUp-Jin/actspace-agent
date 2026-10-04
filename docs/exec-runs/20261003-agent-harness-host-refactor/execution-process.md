# P1 执行过程

2026-10-03 用户授权执行 P1 T1–T5。工作区已有设计、计划和参考验证文档改动，保留，不提交或推送。

## T1

复核确认现有 integrity 仅覆盖入口；新增独立产物清单，不修改原算法。复用仓库已有 TypeScript AST 解析器，移入 adapter 运行依赖，用于检查构建后 ESM 导入及字面量动态导入；不编译用户源码、不新增打包器。显式共享模块解析为批准的文件 URL，并校验身份；普通依赖保持相对导入。

## T2

在当前 Cordis 4.0.1 / Loader 1.0.2 上实现 MemoryTree + group realm。两组同名 provider/consumer 通过普通 ctx.get 注入得到各自服务；复用 core-scope 的事件过滤，不改其实现。Host baseUrl 和共享服务保持可用。普通未声明 provide 在写入前拒绝，激活后审计树归属和 realm；内部 group ID 保留。

## T3

实现 prepare/activate/acquire/discard/close。activate 与 acquire 都为同步提交点；候选归属用 WeakMap，已回收记录从管理器集合删除。旧组合最后一个持有者释放后才销毁；重复 release/close 等待同一结果。使用 gate 验证 prepare 与 close 竞争，不用固定 sleep。

遇到的问题：Cordis Fiber.dispose 可能只记录异常、仍正常返回，最初清理失败测试因此失败。改为在清理期间按树专用 ownership 标记收集 logger error，并和 Promise 拒绝一起报告；测试确认新选择仍有效、旧记录标记 cleanup-failed、close 汇总失败。没有通过修改 Cordis 依赖来改变行为。

## T4

真实磁盘产物通过真实 Loader 装配。验证源码变化不影响旧使用者、新产物使用新代码；候选导入/激活/codec/产物/Host 能力失败不替换当前选择；同基线竞争、A→B→A、多个引用及幂等释放均有用例。

模块全局计数器负向用例确认相同产物在不同实例中共享 ESM 模块状态。明确禁止用它承载隔离状态，而非声称 Cordis 可隔离 JS 全局变量。同名工具注册使用真实 AgentScope 注册表验证；没有把这些持有者称作真实 Run。

## T5

构建与类型检查覆盖 Runtime 的 36 包依赖闭包；adapter、scope、composition、boot、runtime 测试及包边界/契约矩阵通过。adapter 默认跳过的 real Cordis Loader 用例额外用 ACTSPACE_REAL_CORDIS=1 启用并通过。最终命令和数量见 execution-summary.md。

新增两包公开模块说明，同步 P1/总计划及设计状态，记录 history 与选择/退役学习速记。原 runtime/boot、profiles/composition、DesktopAppService、HeadlessRunner、RunController 和 Loop 生产代码没有改动。未进行 Electron、真实模型或远端连接验收；这些不属于 P1。未提交、推送或删除既有目录。

## P2 启动

2026-10-03 用户明确批准开始。模式边界确定为 Run 间切换；执行文件清单和持久契约已补入 phase-2。先实现独立的持久队列与运行管理模块，再迁移生产消费者；不将基础模块测试冒充产品接入验收。

## P2 实现与集成

新增 agent-service 的纯 codec、TaskLedger、投影、SessionRunManager、预算及共同操作。默认产物包含执行策略，Host 只保留共享能力；Desktop/Headless 接共同队列。移除 RunController/AgentLoopService 及 Session 长期 assembly。首次发送保留结果适配，稳定标识和附件 envelope 用于不确定回执重试。

集成中修复：undefined 配置不符合 Journal JSON 契约；workspace mutation 必须先占调度槽；能力检查不能把服务对象带出租约；等待结果须覆盖清理屏障；构建闭包与 checked-in Cordis 树必须同步；测试夹具需支持多订阅。限定测试并发后排除了大部分机器负载超时，仍对实际失败逐一定位。

真实 Electron 启动使用临时数据目录与仅本机模型夹具。UI 点位及最终证据见 phase-2-summary.md；未验证部分不得标记通过。

## P2 验收与暂停要求

2026-10-03 用户要求 Computer Use 统一使用 GPT-6.1 Sol，Astra 留给开发和 Bug 修复。停止源码/测试修改，派发指定模型的单一验收子智能体；只补充真实 UI 覆盖、问题清单和暂停交接。自动化最新专项为 registry/admission 6 项、Runtime 生命周期/通知 2 项通过；Desktop 完整回归仍有失败，不宣布 P2 完成。验收结果见 phase-2-computer-use-acceptance.md，后续待办见 phase-2-pause-handoff.md。

## P2 补充验收恢复

用户已手动解锁 Mac 并要求继续验收。复用原 GPT-6.1 Sol 子智能体和隔离 Electron 环境，补 U1.3、U3.3/U3.4、U4.2/U4.3、U5.1、U6.3；仍只验收与记录，产品源码/测试修复留待 Astra。允许纠正本机模型夹具的 bash 必填参数，仅影响独立测试输入。最终覆盖与问题更新到原 Computer Use 报告。

补充验收结束：暂停改 Plan、实际插入领取、终态归队即时刷新、后台审批恢复、轨迹/跨会话草稿和一次审批执行均获得真实 UI 证据。CU-B01 取消走 IPC 错误及侧栏失败再次复现。合法图片接纳到暂停队列，执行结果/文件引用未覆盖。只修改独立临时模型夹具以补必填 intent 并避免调用 ID 冲突；产品源码与测试未修改，环境保留，按用户要求停止验收与修复。

## P2 验收问题修复

用户授权修复并在完成后由 GPT-6.1 Sol 复验。CU-B01 根因是默认 Loop 成功写入 aborted 后仍抛异常，调度器写 cancelled/null，ManagedRuns 拒绝空结果导致 IPC failed。改为成功完成取消 checkpoint 后返回结构化 aborted，持久失败仍异常；新增取消/收尾失败和固定产物经 ManagedRuns 的回归。E-B01 通过 adapter 可扩展 DomainEvents、任务插件声明合并修复，避免底层反向依赖。停止 dev 后复跑原失败桌面专项，最终结果见修复摘要。

### 修复复验的环境纠正

GPT-6.1 Sol 继续暂停队列后，PNG 及其后续历史请求出现 fetch failed。源码确认 DeepSeek 图片先经过 Files API；本机 Python 夹具将所有 POST 都按 JSON 聊天解析，无法处理 multipart 上传。仅在临时夹具补充 /files 返回合法文件 ID 并重启，同端口 multipart smoke 通过，不改产品和真实配置。此前图片请求失败归为夹具限制，修复后的真实 UI 仍需重新执行验证。

### P2 最终收尾

用户要求核对剩余并继续完成。全局 AGENTS 已加入默认 GPT-6.1 Sol 子智能体执行 Computer Use 的分工。补生产子 Run 从 AgentRuntimeService 选择最新默认组合、持久任务结果与释放证据。新增故障测试复现调度层吞掉取消期间结算异常，修正为执行器正常取消返回 outcome、执行异常保留失败。迟到调用取消改按原 Task 关联，防止误停下一 Run。

Desktop 最终全套 979 通过、1 跳过，无此前超时和 teardown 错误。CLI 原测试把固定代码缓存误当会话持久化，并依赖旧 inbox/spliced；同步到新 Host task 契约后 13 项通过。Runtime 40、AgentService 23 与依赖包回归/构建通过。最终 UI 由原 Sol 子智能体继续；FileReference 无 UI 构建入口，不把预览或回复批注冒充文件引用。原 before 统计未动，after 按同一基线生成。

最终 UI 补验已确认新 PNG、回复批注与 /compact 路线。压缩请求因测试夹具识别历史中的“等待”而进入受控 heartbeat，使用夹具 release 文件放行后完整 compaction 事务和 UI 成功，随后删除 release。最后完整重启曾在旧写锁 30 秒保护窗内遇到 SESSION_WRITER_LOCKED；确认旧进程已退出后等待自然过期，再重新启动恢复，未删除锁或改写 Journal。最终实例继续执行停止/普通后续发送冒烟。

最终实例 Computer Use 签收：停止后不重载即可 Stopped/空闲/队列暂停，普通后续继续完成；取消有 structured aborted，日志无原 IPC 错误或 writer-lock 错误。T1–T6 勾选，P2 签收；保留 FileReference 无 UI 入口、真实 Provider/Browser/签名未验证的明确边界。P3 仅待讨论，不实施；未提交或推送。

## 2026-10-04 P5 机制验证

P4 已提交 `a4f9c6e`。用户批准先验证 Cordis 增量复用，不直接实施生产装配改动。新增 8 项可复现实验，联同既有 Cordis 和 Boot 定向回归共 30 项通过。验证发现原地更新不保留旧 Run 资源、命名域不管理使用者、服务隔离不等于事件隔离；显式所有者下共享实例与新旧工具可并存。当前生产独立组合树行为未修改，P5 仍处设计讨论。详细证据与命令见 [验证报告](phase-5-cordis-feasibility.md)。

## P5 计划整理与范围收敛

用户否决提前实施实例复用优化，确认简单 Patch、三批职责清理、测试同步迁移、内部旧接口直接退役。数据仅要求保护设置及凭据/连接配置，历史必要时可清理，工作区文件和产物不在清理范围。

本轮只读核对源码后编写 phase-5.md，包含 T1–T9：checkpoint 服务、原生通知、工具中间件统一、生命周期回归、CLI 转发退役、Host 协调迁移、客户端职责、文档和删除验收。未改产品代码，未运行产品回归；`pnpm check:docs` 与 `git diff --check` 通过。计划待审阅，之前机制实验的 30 项结果不冒充本轮实施验收。
