# 性能面板与会话投影优化

状态：实现完成，人工验收部分完成，详见执行摘要。2026-10-01 用户批准整理计划后执行。执行模式：交互模式，本轮范围已授权。

## 目标与依据

设置 → 使用统计冷加载时主进程 CPU 峰值约 110.9%，负载持续约 8 秒。离线七份 journal 逐条 apply 约 8380ms，批量 replay 约 43ms；这不是端到端加速承诺。证据见 [诊断](../../exec-runs/20261001-usage-performance-diagnosis/execution-summary.md)。借鉴 tmp/deepseek-harness 的批量折叠、最终视图和按需通知。

## 必读与边界

阅读 AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、CODING_BEHAVIOR、FRONTEND_VERIFICATION、主题规范、HISTORY_GUIDE、QUALITY_SCORE。保留已有消息队列与压缩时间线改动。不删除流式 journal，不改变持久化格式、不迁移用户数据。2026-10-01 后续授权提交本任务一个 commit，不推送。性能优化以实测为准。

## 任务顺序与契约

- [x] T1 在 packages/session/projection/src/registry.ts 增加历史批量折叠入口，在 packages/session/projection-cache/src/journal-cache.ts 接入。保留 seq 连续性、checkpoint pending 事务、codec 过滤；最终状态与逐条 apply 等价，恢复不产生中间视图。补等价、事务和错误回归。
- [x] T2 检查 packages/runtime/src/projection/durable-session.ts 的 requestContext 计算，避免无关 chunk 重复估算 token/构建预览；保留水位和最终上下文语义。检查使用统计重复请求和失效路径，作有证据的局部修复。
- [x] T3 在 packages/shared/src 定义监控 IPC 契约，apps/desktop/src/main 增加按需采集，preload/index.ts 与 global.d.ts 接桥。只向可信 renderer 提供当前应用进程指标，CPU/内存单位明确；关闭、隐藏、销毁停止采样。
- [x] T4 在 renderer 添加独立性能组件，左栏底部常驻，设置常规提供默认关闭且持久化的开关，收起侧栏时提供紧凑状态。约 2 秒一次采样，仅组件自身更新，无无限历史、无日志落盘，最终按用户确认仅以 11px 显示 CPU/内存，无边框、内边距或展开明细；保留等待采样提示。
- [x] T5 定向测试、依赖构建与类型检查及离线基准完成；CU 和受控开销对比仅部分完成，剩余边界见摘要。
- [x] T6 更新执行记录、架构/前端说明、history；符合条件时记录学习文档，完成后归档计划。

## 验收点

- P01：聊天、设置、导航及侧栏收起时可见监控状态，不遮挡交互。
- P02：默认关闭；开关即时生效且重启保留；隐藏暂停、关闭清理。
- P03：CPU 与内存口径明确，保留失败/过期提示，进程退出不遗留记录。最终精简版不显示时间、延迟和进程明细。
- P04：同数据同操作比较关闭/开启的空闲、流式、导航 CPU/内存/响应；不得声称零开销。
- P05：使用统计冷加载、热加载、刷新、切换范围正确，记录响应和主进程负载。
- P06：批量与逐条最终投影一致，覆盖 checkpoint 尾部、未闭合压缩事务、序号错误。
- P07：流式展示、停止、中断、最终输出、切换会话与重启恢复不丢数据。
- P08：浅/深主题与窄窗口无溢出，语义色符合规范。

## Computer Use 操作分组

1. 设置与导航：常规开关 → 聊天 → 设置 → 收起侧栏 → 重启；覆盖 P01/P02/P03，关键状态截图，结合运行时采样验证清理。
2. 使用统计：固定数据，冷启动进入 → 刷新 → 切换范围；覆盖 P04/P05，保存时序与 CPU/内存采样，开启/关闭作对照。
3. 流式会话：发送 → 切换 → 返回 → 停止/恢复，补浅深主题和窄窗口；覆盖 P04/P07/P08。P06 由自动化验证，不用静态检查冒充实机通过。

## 验证与回退

运行 pnpm --filter @actspace/session-projection test、projection-cache/runtime 对应测试、pnpm --filter @actspace/runtime... build、Desktop 定向测试与 typecheck，pnpm check:frontend-theme、pnpm check:docs。记录现存失败与新增失败的区别。对照原始只读基准；禁止删除实际缓存或 journal 制造冷启动，必要时使用临时数据副本。若语义回归，独立撤回新批量入口接入；若监控影响响应，默认关闭并撤回采集入口。只恢复本任务改动，保留此前工作区变更。

执行过程与证据：[执行记录](../../exec-runs/20261001-performance-monitor-projection/execution-process.md)、[执行摘要](../../exec-runs/20261001-performance-monitor-projection/execution-summary.md)。
