## [2026-10-11] | Task: 使用统计增加 SQLite 派生读模型与查询 Worker

### 用户诉求

使用统计未来可能面对百万行甚至千万行数据，需要保留可读的 Session JSONL，同时把前端筛选、搜索、聚合和分页从全量 JSON 扫描改为可重建的 SQLite 查询读模型。Agent Loop 继续从 Session 读取。

> 状态：持续实施记录，完整验收未完成；最新结果以[执行摘要](../../exec-runs/20261011-usage-sqlite-read-model/execution-summary.md)为准。早期试验保留在[执行过程](../../exec-runs/20261011-usage-sqlite-read-model/execution-process.md)。

### 主要改动

- 新增长期存活的 Usage Service 与 SQLite Worker，Electron 使用内置 `node:sqlite`、WAL、FTS5 和单写连接租约；SQLite 可以删除重建，Session Journal 仍是唯一事实源。
- JSONL Provider 自己提供 Worker 有界批读，Runtime 负责 codec 校验；Main 只转发事件批次。查询按 revision/cursor 懒同步，无变化时不重读 Journal。单会话查询只同步目标会话，历史 catalog 与 Usage 各自维护水位。
- Worker 保存精简 Usage 关联事件、activity、小时/日/全量汇总、去重搜索维度、会话标题和有长度上限的消息片段。分批读取，同一 Session 的投影和水位原子提交。
- Renderer 使用结构化查询，SQL 执行聚合与游标分页；最多返回500条明细、1MiB结果。页面增加同步进度、取消和错误状态，侧栏增加历史搜索。
- 索引失败重启并重建一次，再失败进入 Worker 内的有界 Session fallback；不以完整 JSON 全量重放掩盖错误。旧 JSON usage cache 作为兼容材料保留。
- 真实 Electron 验收发现额外的旧全量读取入口：workspace admission 改为 Provider 有界事实读取；无委派事实的父会话不再遍历所有子会话；侧栏不再为确定无待办的关闭会话恢复完整任务 snapshot。SQLite 的任务提示只用于显示层，执行和恢复仍读 Session。

### 验证与未完成门禁

- Worker/Service45项、JSONL Provider12项、Runtime相关8项、子智能体provider/lifecycle12项、workspace/browser相关10项通过。
- Desktop全量首轮1704通过、2超时、2跳过；超时文件串行复跑24项全通过。保留并发压测时的首次失败记录。
- Desktop typecheck、Electron/Renderer构建、IPC/build graph/token/theme静态检查通过；生产依赖部署的实际Electron探针验证两个Worker与FTS5可用，不等同签名安装包或真实界面通过。
- 1m合成行热查询p95：activity2.54ms、FTS20.65ms、statistics5.69ms；Main/Worker heap采样峰值37.61/22.92MiB，进程RSS198.22MiB。该组不是完整Journal链路。
- S真实Journal100k行热翻页/FTS p95为5.32/5.83ms，无变化查询事件读取为0；Main loop p95/p99为12.04/12.56ms。追加1k行838.6ms，未达到250ms目标。
- L合成与M真实Journal已完成；XL长跑已完成，L真实Journal、真实Electron界面与最新写入优化的性能签收仍在继续。不得用Worker基准替代Computer Use；锁屏期间的真实界面点保持未覆盖。
- `check:docs` 与 `check:current-docs` 仍报307个既有历史图片链接错误，本任务路径0条。

### 关键入口

- 查询协调：`apps/desktop/src/main/runtime-v2/usage-read-model.ts`
- SQLite执行：`apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`
- Provider有界读：`packages/session/jsonl/src/query-reader-worker.ts`
- 原始Journal基准：`apps/desktop/scripts/benchmark-usage-journal.mjs`
- [设计规范](../../design-docs/筛选存储改版V2-增加SQLite/README.md)
- [完整验收记录](../../exec-runs/20261011-usage-sqlite-read-model/execution-summary.md)


追加验证：稀有 model/provider 筛选新增索引，独立 201k 副本探针 p95 从 4.69s 降至 0.642ms；历史查询二次失败补齐 Worker 内有界 Session fallback，保留相同 FTS/分页并显示降级状态。40 项 Worker/Service、7 项 UI/IPC 预算回归及 Desktop typecheck 通过。长跑和真实 CU 仍未完成，不能作为整体验收通过。


Provider未变化描述符使用fresh stat避免逐个open/close，1000 Sessions检查p95由76.99ms降到7.86ms；Electron M稳定热条件p95均低于25ms，历史两页搜索p9538.2ms。12项Provider/41项Service回归通过，最新生产依赖实际Electron探针通过。S追加5k仍约1.10s不达250ms，不隐藏失败；L/XL长跑和CU继续。


Usage fallback 后续补齐标题 FTS、cursor、summary/statistics 的一致性：受控 Session 投影在请求级临时 SQLite 查询，结束释放，不依赖磁盘库可写。正常目录同步改为只写变化会话、删除时 prune，减少全目录重复写入。44项 Worker/Service 回归通过；增量性能门禁和 CU 仍未关闭。


实际发布Resources/app目录的Electron Browser进程Worker探针通过；当前发布未启用ASAR。首次探针误用打包binary而打开默认数据目录，已停止；Journal未改动，派生库、workspaces.json与Chromium缓存有写入，未声称完全回滚。已加隔离目录、入口检查和成功标记，见执行摘要。最终45项回归与IPC/build graph检查通过。


XL千万行Worker合成：冷47.3分钟；热查询p95 16–29ms；Main/Worker heap峰32.74/23.94MiB、RSS135.48MiB；loop p99 12.50ms。追加1k单次408ms未达初始250ms目标，完整计划仍未签收。


### 收尾审查补强

独立安全/架构与异常组合审查后，补齐codec变化独立重建、坏Session/缺codec逐会话隔离、可选Provider缺能力时旧目录路径、UTC时间归一化、页面解析前字节预算、诊断水位上限和恢复SQL取消。基准脚本显式目录默认保留，防止清理无关内容。54项Worker/Service回归通过，Runtime与workspace/Usage页面定向回归通过；失败→修复证据及尚未关闭门禁保留于执行摘要。未提交或推送。


解锁后继续真实CU，S取消/主题等交互可响应，但大Session替换超时及后续历史查询失败，保留失败证据。修复源隔离后的交叉查询缓存失效、Provider不支持查询的明确错误、跨workspace原始页预算；Worker等待原生退出后替换，超时不直接删除库，大删除500条一批保持事务且可取消。58项Worker/Service回归通过。M/L真实Journal长跑已完成，热查询优化有效，增量250ms和L部分热查询目标仍失败；详细数值见执行摘要。本计划仍未签收。


### 收口与后续统一验收

用户最终要求暂停验收和修复，等待其他任务完成后统一验收，并创建分支、提交一个commit、合入main。当前实现保留，已知问题没有自动关闭；[统一验收与缺陷修复计划](../../exec-plans/active/20261011-usage-sqlite-acceptance.md)已进入计划列表，原实现计划收口至completed。U-08/U-10四个普通/fallback复现确实失败，以TODO保留，未实施业务修复；S第二轮未观察最终完成，M/L本轮CU未覆盖。先前“未提交/继续验收”等描述是阶段历史，不是本次收口状态。
