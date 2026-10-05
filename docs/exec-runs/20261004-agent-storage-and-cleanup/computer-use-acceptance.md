# 存储与任务入口清理：真实 Electron Computer Use 验收

2026-10-04–05。执行者：`gpt-6.1-sol` 子智能体。本轮完成，不沿用上一轮通过结论。两个真实UI问题修复并定向复验通过；一个重开构建阻断修复后通过。CU5与下述子项保留未覆盖，不能声称完整全量通过。

## 验收点

- CU1 本地首次发送：新 Session 首次提交成功；用户消息与流式第一段可见；运行中停止按钮、终态与发送恢复正确；自动标题完成。若标题请求与手动改名竞争未真实观察，单独标未覆盖。
- CU2 队列：运行中连续排队多条；顺序可见且按所选顺序消费；上移、插入本轮、撤回草稿与删除分别检查；停止后队列暂停，点击继续后仅消费一次。
- CU3 同 Session 模式与配置：闲置时 Agent→Plan→Agent；运行中不能非法切换；下一次任务实际消费选定模式、模型与可观察配置，配置消费以 Provider/Journal 辅助证据关联真实 UI 操作。
- CU4 `/compact`：空闲短历史 skipped；足够历史 running 块与完成；running 时发送受阻；摘要错误可见与重试恢复；忙碌时进入原队列并可取消；操作不得作为普通用户提示进入模型。最后一项使用 Provider 请求辅助证据，不能仅凭截图判定。
- CU5 输入回滚：合法附件真实预览和发送；非法附件或批注提交被拒绝后草稿保留。UI 无法构造的非法数据子项保留未覆盖，不能以 IPC 注入冒充真实交互。
- CU6 Reload：已被 Host 接收的活动任务与队列恢复；不重复提交、不重复用户消息/回复；snapshot/Provider 计数为辅助证据。
- CU7 正常退出重开：Cmd+Q 正常关闭，经默认启动构建屏障重开；设置和 Session 保持；继续发送成功。
- CU8 隔离远端 Host：新建远端 Session 基本发送；审批、工具结果与文件预览；断线时发送禁止且草稿保留；自动重连后一次发送成功。

## 操作分组

1. 本地新建与队列路线：进入新 Session，首次长流式发送；在同一 running 场景连续排队、移动、插入、撤回、删除，保存关键 running 状态；release 后观察消费顺序和终态。再开始一次长任务、加入后续队列、停止并观察暂停，继续至终态。覆盖 CU1、CU2。
2. 同 Session 配置与恢复路线：利用已建立 Session，闲置切 Plan 与 Agent、模型或参数；运行中查看限制，并在受控 running 状态 Reload；观察恢复后释放，核对唯一提交/消息。正常 Cmd+Q，按相同隔离数据路径重新启动，检查设置与继续发送。覆盖 CU3、CU6、CU7。
3. Compact 与输入路线：独立短历史 Session 检查 skipped；在足够历史的本地 Session 通过摘要 hold 保留 running 状态与发送限制；释放完成，注入摘要错误并点击 UI 重试；忙碌任务下排队 compact、取消并再次排队执行；在同一路线打开合法附件预览，尝试真实 UI 能构造的拒绝输入。覆盖 CU4、CU5。
4. 远端路线：设置页配对新 fixture Host，新建远端 Session；发送工具请求→审批→结果文件预览，保存审批中间状态和结果；代理 offline 后输入草稿，检查离线，再 online 并一次发送。覆盖 CU8。

组数按真实场景决定。已确认可连续执行的操作合并调用；反馈不确定时先观察。只保存关键状态/异常，同一截图可支持多个验收点；最后结果必须逐项回到 CU1–CU8 的子项。

## 隔离环境与证据边界

- 证据根：`/tmp/actspace-storage-cleanup-cu`，截图/AX 放 `evidence/`。
- Desktop：`ACTSPACE_DATA_DIR=/tmp/actspace-storage-cleanup-cu/desktop-data`。只复制旧隔离 fixture 的 settings 与 synthetic secrets，未读取用户真实 credential 内容；禁用非 fixture provider。workspace 为该目录下 `workspace/`，不以仓库或 Downloads 为任务工作区。
- Provider：`127.0.0.1:56880`，`provider.mjs`。`/release`、`/hold-summary` 控制短状态；`/summary-error`、`/summary-ok` 控制摘要错误。只有 fixture 请求摘要进入临时日志，不输出 credential。摘要请求以 system prompt 识别，`hasCompactLiteral` 用于检查普通 `/compact` 提示污染。
- Host：`127.0.0.1:52280`，独立 `host-data/` 与 `remote-workspace/`；WSS proxy `52281`，控制 `56882`。证书仅复用旧临时自签名 fixture；不读取系统钥匙串。代理支持 offline/online 与受控故障。
- 启动：主线程稳定后使用 `start-desktop.sh` 内 `pnpm dev:log`，从 `[dev-runtime]` 读取实际 `appName`/`appId`；不能以通用 Electron 身份选窗口。启动前确认旧开发窗口属于旧隔离数据，避免误操作。
- 真实 Computer Use：原生 Electron 窗口观察、点击、输入、菜单、文件选择、Reload、退出重开以及 screenshot/AX。
- 辅助控制：shell 启停 fixture、Provider hold/release/error、代理断线、脱敏 Journal/Task/请求计数。辅助控制用于制造状态或核对持久化，不替代真实 UI 验收。
- 本轮不验证付费线上 Provider、云部署、DMG/签名或手机界面。

## 逐项结果

| 点 | 状态 | 证据与边界 |
| --- | --- | --- |
| CU1 | PASS | 隔离 workspace首次发送 `P5_STREAM_HOLD STORAGE_CU1_FIRST`，真实看到用户消息/首段/running/Stop，release后完整回复、空闲、自动标题；cu1-cu2-terminal-ax.txt。手动标题竞争未覆盖。 |
| CU2 | PASS（已验子项）/编辑未覆盖 | 三条真实排队；TWO上移→插入出现下一步读取→撤回回原队列→DELETE删除；release后 TWO/ONE顺序消费，唯一回复且tray空。再Plan长任务排队AFTER_STOP，Stop后Stopped/空闲/已暂停，移除Plan→继续发送后唯一消费。cu2-insert.*、cu2-stop-paused-ax.txt、cu2-cu3-resumed-terminal-ax.txt；编辑为草稿子项未完成。 |
| CU3 | PASS（限定配置） | 同Session idle选择Plan后发送、running移除Plan disabled；Stop后切回Agent与继续队列成功。idle真实模型菜单选择p5-alternate，下次任务终态回复与Provider请求均为p5-alternate；cu3-model-alternate-ax.txt。参数/技能配置未逐项覆盖。 |
| CU4 | PASS（已验子项） | idle足够历史compact真实running进度块与发送disabled→release持久完成；再次短历史提示skipped。busy compact原队列恢复与取消通过，Journal cancel辅助佐证。summary-error真实失败块→重试最初只入暂停队列，反馈修复后新失败→summary-ok→点击重试直接running压缩，无需继续→release完成。cu4-summary-failure-fixed-retest-ax.txt、cu4-retry-fixed-ax.txt。Provider15请求5摘要的hasCompactLiteral全0；busy操作取消后重排那次因HMR未实际提交，不声称该重排已过。 |
| CU5 | 未覆盖（真实工具限制） | 真实Composer菜单→图片→本轮临时PNG选择器已到达，点击文件文本、双击、文件行+Return均无选中反馈，未实现预览/发送；未以内置IPC或脚本替代。普通txt附件无菜单入口，非法附件/批注无法在该路线真实构造，草稿拒绝子项未覆盖。 |
| CU6 | PASS（修复后） | 初次running Plan+队列Cmd+R恢复但用户/轮次重复；cu3-cu6-reload-running-ax.txt。主线程按renderKey去重补回归。新STORAGE_CU6_FIXED_HOLD running+busy compact队列Cmd+R定向复验只有一条用户文本/一个第9轮，running/Stop与compact队列恢复；cu6-fixed-running-reload-ax.txt。Provider该输入仅一次；release后唯一回复。 |
| CU7 | PASS（设置与Session边界） | 全部任务空闲后Cmd+Q，PID86511消失；首次重开被todo-tools隐式any屏障阻断，主线程修复后同一pnpm dev:log完整通过。原Session/压缩块恢复，设置页性能off与临时systemPrompt路径保持，STORAGE_CU7_REOPEN唯一提交且终态。会话Composer临时模型选择重开回默认p5-test；未将此当作持久设置通过。 |
| CU8 | PASS | UI配对Storage CU Remote→新建页选Host和独立remote-workspace→P5_TOOL→审批运行→pwd/write_file→完整回复/Edited1file→artifact预览P5 remote result verified。offline后Host未就绪、model/send禁用、草稿可编辑保留；online自动重连恢复send→一次点击→唯一用户/完整回复/空闲，草稿清空。下方仓库证据链接。 |

发现 Bug 后记录最短复现、实际/预期、截图/AX与辅助信息，交主线程修复；只做定向复验，不自行修改产品源码。

准备进展：主线程首次发出开始通知后又发现 HarnessControl 启动依赖接线问题，要求暂缓。已通过原生 Cmd+Q 正常退出确认使用旧隔离目录的开发应用；新 Provider 56880 与代理 52281/56882 已启动，models/代理控制响应正常。未启动本轮 Desktop/Host，未执行产品验收。

正式启动：接线修复与Runtime48/48、Host7/7通过后，`pnpm dev:log`完整启动屏障成功，appId为`com.actspace.desktop.dev.w2067fa05`。Host52280 ready。通过真实文件选择器选择`/private/tmp/actspace-storage-cleanup-cu/workspace`；Journal header确认cwd。默认workspace会被Host启动归一到Downloads，因此不能仅靠预置default配置声称隔离，实际发送前已选择临时workspace。共享dist重建窗口/Renderer HMR造成AX编号失效，刷新后继续，不归为产品Bug。NativeAX每次约61秒，关键短状态均用受控hold保留。

2026-10-05 00:00后：CU5进入真实图片选择器，可见临时acceptance.png，普通文本菜单无入口。原生点击文本/双击/行+Return尚无选中反馈，准备有限尝试后保留未覆盖，不以内部注入替代。

## 已保留的仓库证据

- CU6修复前：[AX](evidence/cu3-cu6-reload-running-ax.txt)；修复后：[AX](evidence/cu6-fixed-running-reload-ax.txt)。同一活动输入分别出现两个/一个导航轮次。
- compact失败：[AX](evidence/cu4-summary-failure-ax.txt)；原重试暂停：[截图](evidence/cu4-retry-paused.png)。
- compact修复复验失败入口：[AX](evidence/cu4-summary-failure-fixed-retest-ax.txt)；点击重试直接运行：[AX](evidence/cu4-retry-fixed-ax.txt)。release后真实完成块已在后续模型终态截图观察。
- 远端：[审批](evidence/cu8-approval-ax.txt)、[结果预览](evidence/cu8-result-preview-ax.txt)、[离线草稿](evidence/cu8-offline-draft-ax.txt)、[重连发送](evidence/cu8-reconnected-ax.txt)、[重连终态](evidence/cu8-reconnected-terminal-ax.txt)。
- 正常重开发送：[AX](evidence/cu7-reopen-ax.txt)；该证据为接收后running状态，终态在离开本地Session前及后续远端完整AX中已观察为空闲。

仅复制脱敏的fixture UI证据。完整临时日志、请求和其他截图仍在`/tmp/actspace-storage-cleanup-cu`；临时文件不保证长期存在，原始请求/credential未进入仓库。

## Bug 与剩余门禁

- 已修复并真实复验：running Reload重复用户/轮次；摘要失败后重试只入暂停队列。无未修复的已确认产品Bug。
- 已修复启动问题：正常重开依赖屏障todo投影filter参数隐式any；修复后完整默认启动通过。
- 未覆盖：CU5附件预览/发送与非法附件/批注拒绝草稿保留；CU2编辑队列回草稿；CU3生成参数/技能配置逐项消费；手动标题竞争；busy compact取消后的再次排队实际执行。当前已覆盖busy compact排队、恢复、取消和idle失败/重试，不能扩写成所有组合通过。
- 非本轮门禁：线上付费Provider、云Host、DMG/签名、手机UI。fixture Provider是真实协议链路，不能当作线上Provider验收。
- 辅助计数：CU6_FIXED_HOLD、CU7_REOPEN、CU8_OFFLINE_DRAFT直发各一次，全部Provider请求的`hasCompactLiteral=0`。这是辅助请求核对，不是独立Computer Use通过。

## 收尾

2026-10-05 00:32后，远端与本地Session均真实空闲，远端草稿已消费。通过Cmd+Q正常退出本轮隔离Electron；按明确PID仅关闭本轮Host85924、proxy84451、Provider84448，未关闭用户应用/旧fixture。隔离数据与证据保留，无产品源码修改、commit或push。
