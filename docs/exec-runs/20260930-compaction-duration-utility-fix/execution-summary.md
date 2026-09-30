# 压缩耗时与辅助模型路由：修复验收结果

2026-09-30：B01/B02 已修复，自动化和真实 Electron 定向复验通过。验收当时，代码保留在当前工作区、尚未提交。原功能完整验收的其他未覆盖项仍保留，不因本次定向验证宣称整体签收。

2026-10-01 提交整理：单独提交两项修复、回归测试与本轮记录；已有压缩 UI、消息队列及其他任务改动保留在工作区。下述 98 项与 Electron 验收针对包含这些功能的工作区状态，提交内容另以暂存快照复查。

## 变更

压缩开始时计时，摘要成功后把 durationMs 放入完成事件，再提交原有整条事务；失败不写半条事务。客户端优先读取完成事件耗时，旧事件仍按 start/end 差值回放。压缩优先显式路由，其次 utility，缺少 utility 时回退首条路由。Desktop 每次 prepare 解析当前辅助模型设置，不缓存初始选择。

## 逐项验收

| 点 | 结果与验证方式 | 证据与边界 |
| --- | --- | --- |
| F01 手动耗时与恢复 | 通过（CU + RT + 自动化）。第一次手动 831ms→1s；Kimi 重试 34,816ms→35s。切换返回与正常重启后保留。 | [手动进行中](F01-manual-started.png)、[手动完成](F01-manual-completed.png)、[Kimi 完成](F01-F04-kimi-completed.png)、[重启](F01-F02-restarted-durations.png)。捕捉到进行中 1s；未验证连续多秒增长精度。 |
| F02 自动耗时 | 通过（CU + RT）。Chat 阈值临时 50%，真实请求 input=73,580、output=11、cacheRead=1,152，达到策略触发线 48,000；回复后自动压缩 1,383ms→1s。后续回复与重启记录正常。 | [输入](F02-large-input-before-send.png)、[自动完成与后续发送](F02-auto-completed-followup.png)、[切换后](F01-F02-after-session-switch.png)、重启 AX 同时包含 35s/1s。自动 running 的短暂状态未捕捉，不声称验证该状态外观。 |
| F03 辅助故障与恢复 | 通过（CU + RT + 自动化）。主模型 DeepSeek 正常回复；Kimi 地址指向本机不可达端口，手动压缩 Connection error，零新压缩事务。恢复默认地址后点击重试成功。 | [失败](F03-utility-compaction-failure.png)、[重试](F03-kimi-retry-started.png)、[完成](F01-F04-kimi-completed.png)、[运行证据](runtime-evidence.json)。本次是手动故障，原自动故障与压缩中队列项仍未完整覆盖。 |
| F04 模型设置热更新 | 通过（CU + RT + 自动化）。同一进程从 DeepSeek 辅助模型切为 Kimi K2.6，下一次成功压缩 metadata 为 utility/kimi-k2.6；切回后自动压缩为 utility/deepseek-flash。 | [选择模型](F04-utility-selector.png)、Kimi 完成与运行证据。 |
| F05 旧格式、显式路由、CLI 回退 | 通过（自动化）；真实旧分隔线仍能显示。新字段优先（包括 0）、负数/字符串回退，旧字段缺失兼容；显式 routeId 优先，default-only 与 fixture 首条回退通过。 | client/compaction 回归；没有执行真实 CLI 场景，不将其写成 CU 验收。 |

## 自动化与构建

98 项通过：journal 11、compaction 14、client 15、桌面定向 50、agent-loop 定向 8。桌面定向包含辅助模型 prepare 热更新、durable projection、压缩块与消息队列回归。

命令：`pnpm --filter @actspace/session-journal test`、`pnpm --filter @actspace/compaction test`、`pnpm --filter @actspace/client test`；桌面 vitest 覆盖 thinking-options、fixed-renderer-projection、steer-ipc、compact-command-block、app-message-queue；loop 覆盖 auto-compaction、steer。

`pnpm --filter @actspace/desktop build:deps:dev`、desktop/compaction/client typecheck 均通过；两次 `pnpm dev:log` 完成 Electron main/preload 编译、watch 0 errors。首次桌面类型检查缺少本地已声明编辑器依赖，`pnpm install --offline --frozen-lockfile` 使用现有缓存补齐后通过，锁文件未修改。

## 提交范围独立验证

从暂存区导出的独立快照，journal 11、compaction 14、client 15、桌面辅助模型 7，共 47 项通过；client/compaction 类型检查、current-docs 链接检查、密钥扫描通过。旧格式回放所需的 start.time 辅助函数一并纳入修复，未纳入旧消息保留、摘要展开、Observer 或消息队列实现。

快照的完整 check:docs 因 HEAD 原有 `20260926-site-homepage-redesign.md` 的 active 状态措辞失败；该文件已有工作区修正，本次保留在其他任务范围。当前完整工作区 check:docs 通过。

## 环境恢复与证据说明

已核对 [原设置](initial-settings.json) 与 [最终设置](final-settings.json)：utility=DeepSeek、Chat 阈值 80%、Moonshot/DeepSeek 默认地址均恢复。API Key 未读取或更改。正常 quit 后新进程启动，真实 Electron 留在专用验收会话运行。误点新建留下一个空白会话，未删除用户数据。

CU 截图与 AX 来自真实窗口；RT 仅读取 journal，不改写事件、不注入 usage、不调用内部压缩入口。工具返回有约 60 秒延迟，AX 与截图可能相邻状态不同；判定优先实际内容，不以文件名作为完成证据。[CU 记录](cu-observations.json) 与运行证据独立于原验收保存。

## 人工复核路线

打开 CU_AUTO_BASE_1_ACK 会话，查 35s 与 1s 分隔线，切换返回或正常重启后应相同。选不同轻量模型后压缩应使用所选模型；临时坏辅助连接应显示压缩失败，恢复后重试成功。旧 0s 记录无法补算当时漏存的摘要耗时，保持原兼容显示。
