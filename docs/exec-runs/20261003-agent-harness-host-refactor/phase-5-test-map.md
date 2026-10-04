# P5 测试接替表

所有结果为本轮自动化，不含 Computer Use。包 selector 均实际命中。

| 原测试/范围 | 保护行为 | 新归属/处理 | 本轮结果 |
| --- | --- | --- | --- |
| core-agent required dispatch | checkpoint 缺失/失败不能继续 | 删除 required 分发断言；checkpoint-policy 服务测试与 agent-loop 的服务缺失、待完成屏障测试接替 | checkpoint-policy 3；core-agent-loop 34 通过 |
| core-agent pending notification | 通知与资源生命周期 | Run 不再为观察者持租约；插件拥有异步工作并在清理中等待；保留 carrier 隔离 | core-agent 17；cordis-adapter 36 通过、1 条环境条件跳过 |
| tools-runtime middleware fixture | before/body/after、安全校验与资源释放 | 原生 Cordis pre/post；新增无效参数改写、移除监听、post 抛错/篡改成败回归 | tools-runtime 31 通过 |
| CLI artifact-store 2 项 | 产物保存、Session 归属和访问边界 | 整体迁至 agent-host node-artifact-store，CLI 不再引用空 alias | 已包含于 agent-host 44；CLI 接入 11 通过 |
| boot/harness-control generation | 新旧组合、失败候选、最后释放 | 保留整组合隔离与 Run lease，不接入实例共享实验 | boot 23、harness-control 22 通过 |
| English-learning | Session carrier 与异步 speech 所有权 | emitNotification 名称迁移，observe 同步接纳，队列测试仍等待业务信号 | english-learning 19；Runtime 相关测试通过 |
| Host 生命周期 | drain、force、blocked、重复 stop | 新 lifecycle-coordinator 6 项；bootstrap 8 项含启动失败各阶段、保留清理错误、admin 与订阅回收 | 包合计 44 通过 |
| Host process suites | 断线继续、丢回执去重、审批/结果、多端、锁、子任务、正常/强停 | 保留真实进程及本机 Provider fixture；不是 CU | 7/7 通过 |
| CLI process suites | 默认 ephemeral、persist/resume 与打包入口实际执行 | 保留 | 2/2 通过 |
| AgentService/DesktopApp/Headless | 队列和调度、标题策略、单次运行与退出 | 保留职责，不增加继承框架 | 28/11/2 通过 |
| Runtime | 固定产物、组合契约与 Session 子任务 | checkpoint fixture 迁移为服务；配置声明同步 | 43 通过 |
| Desktop | 主进程/renderer 既有行为 | 任务通知错误隔离；CU 后补充本机凭据错误分类、远端读取错误与重试、不同 Host 切换和 blocked 禁发回归 | 初始 1000 通过、2 跳过；修复后 1008 通过、2 跳过 |
| harness event checker | 声明/调用模式相符、错模式拒绝 | 删除 required 特例，支持新 emitNotification 和可选链调用 | 通过 |
| contract matrix | 目录与声明一致、错误 fixture 真正拒绝 | 移除过时 12/10/6 假设；验证实际成员；checkpoint 注册为 Service | 通过；修复基线 2 项失败 |
| 文档/包/退役路径门禁 | 链接、包边界、删除路径无消费者 | 保留检查；清理 contributions 遗留输出后重建 | 通过 |

构建和 `typecheck` 串行于消费 dist 的测试。首次基线并发曾造成 CLI dist 短暂缺失，构建完成后复跑通过，不作为产品缺陷；没有删除任何有效行为断言来规避失败。
