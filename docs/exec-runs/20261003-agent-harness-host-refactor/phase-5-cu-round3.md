# P5 Computer Use 第三轮：修复定向复验

2026-10-04，`gpt-6.1-sol` 子智能体执行真实 Electron Computer Use。**R1–R3 通过，无新增产品 Bug。** 原 U1–U9 逐子项覆盖沿用第一、第二轮，不在本轮重新宣称全套执行。没有产品代码修改、commit 或 push。

## 验收点与操作分组

- R1：本机凭据存储失败提示明确指向钥匙串/密钥环，保留名称、地址与安全输入，不误报网络。
- R2：真实远端长任务强停后的 Stopped、离线、禁发与恢复；真实读取断线后的用户文案、重试和恢复，无 IPC/internal/mutation 文案。
- R3：ready 与 blocked Host 发布不同工作区名称、路径与模型时，切换显示目标配置、保留草稿并禁发。

按两组执行：远端任务→强停→重连→读取故障→重试→不同 Host 切换；设置→fresh 隔离 Peer→一次配对存储失败。执行前已向用户列出验收点与分组，现场因 R1 单独身份启动调整路线，不缩减范围。

## 环境与证据边界

主 Desktop 正常 Cmd+Q 后以 `ACTSPACE_DATA_DIR=/tmp/actspace-p5-cu/desktop-data`、本轮 CA 经 `pnpm dev:log` 构建屏障重启。`logs/dev-round3.log` 记录构建成功、0 errors、`com.actspace.desktop.dev.w2067fa05`；真实窗口 renderer 为 5173。Peer 使用原失败身份 `com.actspace.p5.peer` 与全新 `/tmp/actspace-p5-cu/r1-round3-data`，同轮 main/preload 与 renderer。未操作用户真实设置/凭据，未修改钥匙串，未关闭 TLS 或加密保护。

所有证据前缀 `/tmp/actspace-p5-cu/`；临时目录不保证长期保留。CU 原生 AX/截图调用约 61 秒，截图取样可能早于 AX，因而错误 banner 明确以 AX 为证，不能把较早截图当 banner 截图。

## 逐项结果

| 点 | 结果 | 实际操作与证据 |
| --- | --- | --- |
| R1 本机存储错误 | PASS，真实 CU+日志辅助 | fresh Peer→设置/远端 Host→有效本机 WSS 与新配对码→一次点击配对。自然出现 `System credential encryption is unavailable`/`errKCAuthFailed -25293`（日志辅助）；真实 AX 和截图明确“本机凭据存储不可用…检查系统钥匙串或密钥环…若配对码已被使用，请重新生成”。名称 P5 R1 Storage、地址与安全输入保留。`r1-round3-pair.png`、`r1-round3-pair-ax.txt`；`logs/r1-round3-peer.log`。本轮只验证自然出现的加密不可用；其他加密/解密异常仍为组件自动化覆盖。 |
| R2 自然强停安全状态 | PASS，真实 CU+CLI辅助 | UI 提交 `P5_HOLD P5_R2_ROUND3`，已有 paused 队列先点继续发送，真实 running/Stop 出现后 CLI force Host。真实 UI Stopped、离线、Host 未就绪、模型/发送 disabled。`r2-round3-offline.png`、`r2-round3-offline-ax.txt`；`logs/r2-round3-force.log`。此自然强停没有复现原错误 banner，不能据此单独证明文案转换。 |
| R2 读取断线用户文案 | PASS，真实 CU，故障代理辅助 | 单纯离线切换/刷新走缓存，无 banner。仅改 `/tmp` 代理新增 one-shot `/drop-read`：在真实 `sessions.page` 请求时关闭 WebSocket并暂时阻止重连，未注入 renderer 函数或伪造页面。UI 从本地切回远端后 AX 显示“远端连接已断开，暂时无法加载会话。连接恢复后将自动刷新，也可点击重试。”与重试按钮，无内部名。`r2-round3-injected-read-error-ax.txt` 支持文案；同名 png 取样较早不支持 banner 可视证据。`proxy-events.jsonl` 的 dropRead 与 main 日志为辅助。 |
| R2 手动重试与恢复 | PASS，真实 CU | 离线点重试后返回已缓存历史、banner 清除；online 与同数据 Host ready 后连接自动恢复。后续运行位置选择显示 P5 Remote、原工作区路径与 p5-test。新强停任务唯一 user、Stopped 恢复，没有重新提交或重复任务。离线刷新期间旧缓存暂时缺新终态，连接恢复后重新同步；未误报数据丢失。 |
| R3 不同 Host 校准 | PASS，真实 CU+配置辅助 | 临时 blocked Host 配置改为工作区 `P5 Blocked Distinct`、独立 `/tmp/actspace-p5-cu/blocked-workspace`、默认 `fixture/p5-alternate`；同 dataRoot 重启报告 blocked。新建页先选 ready Host，真实显示 P5 Remote/原路径/p5-test；输入草稿再选 P5 Blocked，真实显示 Distinct/独立 canonical path/p5-alternate、草稿 `P5_R3_DISTINCT_DRAFT` 完整，Host 未就绪且发送 disabled。`r3-round3-distinct-blocked.png`、`r3-round3-distinct-blocked-ax.txt`、`logs/blocked-round3.log`。原 B3 撤回结论保持。 |

## 收尾与范围

原 U1–U9 已有覆盖，没有开发遗漏由本轮 CU 新增发现。B1 的自然本机加密不可用、B2 的真实传输读取断线与 retry 均已实机确认修复；R3 补充区别配置，校准原夹具误报。无新产品 Bug。

没有真实外部 Provider、云部署、手机 Web、新旧 Harness 升级恢复或 UI 同时双点击竞态验证；这些不是本轮新增通过项，沿用既有范围边界。第二轮结果访问共享 canonical path 的限制也未被本轮改写。

主 Desktop 保留不同 blocked Host 的未提交草稿；主 Host ready，blocked Host blocked，代理 online 且一次读取故障已消费。R1 Peer 完成后正常退出；其 fresh 数据仅位于本轮临时目录。本轮不改计划签收状态，由主线程结合计划门禁维护。
