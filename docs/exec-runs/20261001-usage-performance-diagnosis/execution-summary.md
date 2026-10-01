# 设置使用统计卡顿诊断

2026-10-01 诊断阶段记录（修复前基线 d43de08）。当时只做诊断，未修改产品代码。用户确认触发位置为设置 → 使用统计。

## 结论

首次使用统计需要补建部分会话缓存，主进程逐事件调用实时投影接口，每条事件更新 requestContext 并重新计算上下文预览、Token 估算及深拷贝。大量流式事件由此产生重复工作。真实 Electron 高负载约 8 秒；相同数据的独立探针复现约 8.38 秒，主要 profile 帧吻合。现有十行统计表和汇总不是首要瓶颈。

## 证据

- Electron 39.8.10，原工作区启动。启动后进程存在，空闲 CPU 接近 0。首次点击时主进程 CPU 峰值 110.9%，RSS 峰值 313.42 MiB；渲染进程 CPU 峰值 10%。单核满载通常约 100%，可包含其他线程贡献。
- 10:03:22–10:03:29 高负载，主进程累计 CPU 时间由 1.35 秒升至 8.14 秒。不是用 Computer Use 工具返回耗时计算；该工具自身观察常有约 60 秒延迟。
- 设置页先出现正在读取，随后真实画面显示 40 次模型请求、43 条活动，按十行分页。没有证明整个窗口连续 8 秒完全无法响应；已证明这次慢加载和主进程计算突增。
- 71 个 journal、185,459 个事件、139.54 MiB。独立 Node 探针读取约 113ms、JSON 解析约 483ms、完整校验约 888ms；profile 中 snapshotSessionJson、validateJsonValue、deepFreeze 占主要校验开销。
- 首次点击期间 7 个 projection checkpoint 更新。对这 7 个 journal 的同一批事件，逐事件 apply 合计 8,380ms，已有批量 sync 合计 43ms。该对照用于定位，不代表修复后端到端耗时；探针使用现有基础 SessionReadModel，未启动完整插件 Host。
- apply profile 主要自耗时：requestContext.view 1,765ms，detached 1,493ms，estimateTokens 1,305ms，contextPreview 765ms，sanitizeRuntimeContext 637ms，projectContextState 619ms，contextTokenText 573ms，GC 563ms。
- 从 71 个已有 checkpoint 恢复约 98ms，snapshot 约 134ms；从所有事件提取 usage rows 约 22ms。现有统计索引只有 79 条记录，汇总首轮约 10ms，之后约 0.07–0.16ms。
- 同进程点击刷新后，主进程 CPU 峰值 5.4%、渲染 0.8%，主进程 CPU 时间约增加 0.09 秒，没有相同持续高负载。随后切换 7 天显示 79 条记录，恢复 24 小时并返回通用设置成功；已核对持久化范围为 24h。

结构化数字见 [measurements.json](measurements.json)。原始 native sample、CPU profiles 和临时诊断脚本只保存在本机 /tmp/actspace-perf-20261001，未把完整用户历史写入报告或提交。

后续实施结果见 [性能优化执行摘要](../20261001-performance-monitor-projection/execution-summary.md)。本文数值、源码路径与建议均保留为修复前证据，不作为当前实现说明。

## 源码路径（修复前）

1. apps/desktop/src/renderer/components/WorkbenchLayout.tsx:496 loadUsageStatistics → IPC。
2. apps/desktop/src/main/runtime-v2/usage-source-cache.ts:27 load：缓存失配时 inspectSession，再 inspectSessionEvents，最后提取统计；时间范围筛选在后续聚合阶段。
3. packages/session/projection-cache/src/journal-cache.ts:75：补建/追加事件逐个 registry.apply。
4. packages/session/projection/src/registry.ts:118：状态引用变化就调用 view，再 detached。
5. packages/runtime/src/projection/durable-session.ts:53：requestContext 对每条事件返回新对象；view 计算 projectContextState 并 JSON 克隆。

## 次要问题与边界

- 全量 journal inspect 在主线程解析校验，缓存失配时也会造成额外 CPU/分配，统计用途不需要所有原始大对象。
- WorkbenchLayout 的进入页 effect 和 UsageStatisticsPage 的 200ms effect 都会请求统计；pending promise 通常合并底层读取，但仍有重复聚合/IPC。
- runtime-live 和 journal-update 都使 usage cache pending 失效。活跃生成期间可能重新扫描或并行加载，属于源码风险，本次未触发活跃生成，不写成已复现。
- 之前 09:57 日志出现 Desktop application service is not ready。这是另一个就绪状态问题；本次成功复现中没有此错误，它不能解释已捕捉到的计算热点。
- 未执行整个应用全场景性能审计，没有内存泄漏结论；RSS 回落，不能把一次峰值称为泄漏。未测精确点击到绘制延迟、事件循环延迟或帧率。

## 当时建议的修复顺序（后续已按批准范围实施）

1. 区分历史批量投影和实时逐事件通知：补建/尾部重放只更新状态，按批次生成必要的最终 view，保留事务原子性与序号语义。回归覆盖旧 checkpoint、尾部追加、未完成压缩事务。
2. requestContext 的重计算只绑定实际影响上下文的输入；序号/更新时间变化与昂贵派生视图区分，不能简单丢弃水位更新。
3. 统计读取以持久化 usage index 和增量游标为主，避免为统计初始化完整上下文视图；去重请求与限定缓存失效。是否进入本轮需按修复范围评估。
4. 对相同会话与首次/再次打开路线重新测量 CPU、物理内存、事件循环阻塞和点击到结果耗时。

性能面板建议独立于 Token/费用统计，低频按需采样主进程、渲染进程和 GPU 的 CPU/内存，并展示事件循环延迟及统计加载各阶段耗时。CPU/内存总量只能显示症状，不能替代上述 profile 定位。先完成热点修复，再按需要实现面板。
