# P3 实施与验证记录

2026-10-03。用户已明确授权执行 P3。实现、自动化与 Computer Use 验收已完成。未提交或推送。

## 实现结果

新增 `@actspace/harness-control`，独立承担固定产物 Patch、候选检查、Host 授权、持久选择与维护恢复。Runtime 只组装可信端口并拥有服务生命周期；另提供标准 Cordis Plugin Entry。底层 generation manager 仍负责装配/租约/实例退役，不承担存储和授权。

`replace` 保持组合槽位，使用 manifestEntryId 解析真实行为；insert 同样从固定产物清单导出。默认 manifest 补服务/事件版本与 mode。配置覆盖需要固定纯 validator，必需依赖缺失/重复提供者/事件模式不符拒绝；可选依赖的 fallback 与最终条目顺序进入准备报告。共享模块受 Host 白名单限制，codec 改变需要重启。事件 checker 核对触达领域的明确字符串调用点；动态封装语义由 adapter 测试覆盖，不声称静态证明所有 JS 行为。

控制服务默认不授权启用。准备、批准等待在提交门外；持久写入与同步内存选择位于门内。主/子 Run、压缩及能力查询均异步获取租约。实例释放与固定文件保留分开；`artifactUsage()` 只报告固定产物文件大小，不做 GC，不表示 Node ESM 内存已卸载。

选择日志使用独立 writer lease、连续序号、checksum、文件及目录 fsync。半行先保存并同步恢复证据再截断；完整损坏停止恢复。缺产物/Host 指纹不符保持 blocked，维护服务可用；`recoverBuiltin` 仍需授权且幂等。普通任务失败不触发自动回退。

## 与计划实现路径的细化

- 不扩展严格校验的持久 harness 对象；摘要写入既有可扩展 `run.configuration.harnessExecutionDigest`，保留 P2 codec 的读取兼容性。
- 事务互斥在 control 封装完成，生产不暴露裸 manager；没有在 boot 增加第二套持久事务。boot 新增恢复 revision。提交门目前为单 control 共用，生产只有 main 路由；不覆盖准备、授权和旧实例回收。
- Runtime 现有生命周期直接拥有 control 服务，与标准 Plugin Entry 共用同一个实现；无需修改 Profile/cordis.yml 重建装配路径。
- 真实 Runtime 扩展现有 default-harness 集成测试，恢复集成集中于 control 与真实子进程 fixture；未机械创建计划中预估的每一个测试文件名。
- CLI ephemeral 仍不保存会话历史；Host 的代码与选择缓存持久保存，CLI 断言同步区分这两种生命周期。

## 自动化覆盖矩阵

| 点 | 当前证据 |
| --- | --- |
| A1 | composition harness-patch：稳定槽位、固定清单、保留未变条目、同插件多产物与伪造 insert 拒绝。 |
| A2 | composition compatibility、adapter contracts、control candidate：版本/模式/重复提供者、必需提供者、纯配置验证与可选 fallback；event checker 正反例。 |
| A3 | composition 拒绝未授权 shared module/codec；control 拒绝额外 shared service、无配置 validator。 |
| A4 | boot harness-generations 的隔离/失败清理/全局状态负例，Runtime 固定工厂集成；不将同进程 Cordis 当作恶意代码沙箱。 |
| A5 | control 默认拒绝、身份逐字段绑定、过期、丢弃后迟到批准、关闭后批准。 |
| A6 | 同基线竞争、重复 activationId、回退 revision、恢复内置幂等。 |
| A7 | control 提交门中 acquire 等待与立即取消无引用泄漏；主/子/压缩共享该生产租约端口，相关服务回归。 |
| A8 | Runtime 正式路径发布替代 Loop 固定产物并启用，同会话后续 Run 使用替代实现，旧父租约保留、子 Run 选择新实现。 |
| A9 | store 部分尾行/完整损坏/真实写入失败/真实锁丢失；进程竞争及控制层阻断。 |
| A10 | 子进程在落盘前、落盘后回执前、成功回执后 SIGKILL；等真实 stale lease 过期后恢复，未删除/伪造锁。任务不自动重放另由 P2 测试与 U5 检查。 |
| A11 | control 重启恢复、缺产物/Host 指纹变化阻断、维护内置恢复；真实 Runtime 经 checked-in Cordis 树重启后阻断旧权限、保留 control，受授权恢复内置成功；Desktop readiness 独立回归确认保留 Host。 |
| A12 | 控制层旧租约清理失败不撤销成功记录，重启仍恢复新选择；历史固定产物占用可查，普通任务无自动回退分支。 |
| A13 | 既有 P2 codec 直接验证新增摘要记录；Runtime 老会话继续使用新 Loop；真实旧历史读取见 U1。 |
| A14 | Desktop/CLI/Headless/Loop/AgentService 自动化与真实 UI 分开登记。 |

## 已运行检查

- Runtime：40；boot：23；AgentService：25；core-agent-loop：33；Headless：2；CLI：13，均通过。
- harness-control：22；composition：14；adapter：27 通过、1 跳过；subagent：11；DesktopApp：11，均通过。
- Desktop：982 通过、1 跳过（仓库既有跳过），类型检查与完整生产构建通过；Runtime 最终接线重跑 40 项通过。
- CLI 真实进程：2 通过；恢复杀进程及竞争进程测试通过。
- 包边界 44 manifests、Desktop 构建图 39 projects、事件目录与负向测试通过。

## Computer Use 与交付边界

委派用户指定 `gpt-6.1-sol`，使用隔离 Electron 测试数据及本地模型夹具。按 U1–U5 记录，U1–U5 全部通过，含修复后的重载和同构建退出重启，详见 [Computer Use 报告](phase-3-computer-use-acceptance.md)。不使用真实 Provider，也不证明模型回答质量、远端 Host、签名发布或未来自进化能力。

P3 没有新增启用页面；Patch、授权、恢复使用实际服务接口及固定产物测试，界面验收是 Desktop 回归。P4 独立 Host/连接协议和 P5 全仓整理仍未实施。用户自己的工作区文件保持不变。

## 验收中发现的问题

- 代码复核发现获取 Harness 失败原本会永久封死会话调度器，导致维护恢复后不能继续原队列。现在只针对“尚未领取且执行环境阻断”暂停内容队列，通知当前等待者失败；修复后可显式继续，已有 Session 存储故障仍保持严格阻断。AgentService 回归验证不丢输入、未创建 Run，恢复后完成。
- `/compact` 首次 UI 失败由本地模型夹具导致：历史中包含审批测试文本，夹具忽略 `tools: []` 返回 tool_calls 且没有摘要。独立 HTTP 重现确认。夹具修正后已真实交互复验通过；不把该次失败归为产品通过，也不为适配错误夹具修改压缩语义。
- 真实窗口重载发现普通运行任务丢失运行指示和停止按钮：Host 仍在执行，但 renderer 只恢复队列和审批。现从 Host 任务快照恢复当前/后台会话运行实例及原 Run 停止目标，并拒绝被终止事件超越的旧快照；回归先红后绿，审批/普通运行/过期快照 5 项通过，真实界面定向复验通过。

最终 CU 夹具准备：停止中间构建后，将其选择目录保留为 `/tmp/actspace-p2-electron-data/harness-state-intermediate-20261003-215504`，保留所有会话；最终代码重新初始化一次选择基线。该操作仅为中间产物清理，不作为恢复成功证据。U5 实际使用同一最终构建及原选择目录退出/重启，没有再重置选择。模型夹具 HTTP 验证：无工具摘要请求返回文字，有 bash 工具请求才返回工具调用。

## 最终恢复证据

同一最终构建由真实 UI CmdQ 退出，再启动；`selections.jsonl` 仍为一行、revision 1，前后 SHA256 均为 `4a1175c93a4bb0b52bda7eb4a3b5d52a3b077fcf4003cdbf4342d6ed1d5194d4`，没有重新 bootstrap。UI 历史可读、队列暂停，手动继续后完成。辅助 Journal：seq157 recover、158 手动 resume、159/160 单次 start/claim、170 completed。这条 UI 路线验证正常退出恢复；SIGKILL 故障恢复由独立真实进程测试覆盖。

类型、完整 Desktop 构建、包边界、构建图、事件检查及文档检查均通过。P3 完成；下一阶段 P4 仍需单独讨论计划，未开始实施。
