# 上下文压缩与消息队列：Computer Use 验收结果

2026-09-30 后续修复：**B01/B02 已修复并定向复验通过**，见[修复报告](../20260930-compaction-duration-utility-fix/execution-summary.md)。下文保留修复前验收快照，原未覆盖项仍需补验，不能据此整体签收。

日期：2026-09-30。修复前结论：**本轮验收执行已收尾，两项功能尚不能整体签收。** 核心发送链路有真实 Electron 证据，但存在两处确认缺陷，且部分必需子项没有覆盖。

按最初计划的 24 个验收点严格统计：**5 点通过、2 点失败、17 点未覆盖完整**。后一类包含已经通过的子项，不表示整点没有执行；不能把它们计为通过。所有点逐项列在下表。

## 环境与证据边界

- 实际基线为 `main@b5900608a93b8cbbde6cb7c2f06e6ac6f8f38a32` 加开始验收时已有的工作目录修改。计划编写时的 `9b70765` 不是实际执行基线。
- 使用真实 Electron 39.8.10，应用身份 `com.actspace.desktop.dev.w2067fa05`，从当前工作区执行 `pnpm dev:log`。正常退出后重新运行同一启动命令，完成了真实进程重启。
- **CU**：原生 Computer Use 的点击、输入、菜单、截图、AX 状态。**RT**：[脱敏运行证据](runtime-evidence.json)核对本轮专用会话的回合、Inbox、压缩事务、用量和模型路由。源码分析仅解释原因，不代替界面验收。
- 本轮没有使用 fixture/mock 冒充真实通过，没有伪造 usage、改写 Journal 或直接调用内部压缩入口。未重跑单测套件；启动依赖和 Electron 编译成功，watcher 报 0 个类型错误。
- [基线](baseline.json)与[收尾环境](final-environment.json)核对了 38 个功能相关源码文件，SHA-256 全部一致。本轮只新增／更新验收记录，没有修改产品代码。
- 窗口状态读取通常耗时约 60 秒，截图是工具返回的当次状态；`cu-observations.json` 的时间是返回后记录时间，不能据此测定 3 秒提示或插入读取的精确延迟。截图文件名是场景标签，判定以画面、AX 和相邻观测为准。

## 逐项结果

| 验收点 | 结果 | 已实际验证的状态与行为 | 证据 | 未覆盖／失败子项 |
| --- | --- | --- | --- | --- |
| C01 手动压缩进行中 | 未覆盖完整 | `/compact` 出现正在压缩、0s、不确定进度条；可以继续排队，空输入时停止禁用。 | [进行中](C01-Q09-manual-compaction-queued.png) | 未捕捉连续计时增长；禁用停止的悬停提示与点击不终止未完整验证。 |
| C02 完成与历史保留 | **失败** | 成功分隔线出现条数；running 块退场，旧用户／回复保留，后续消息正常，摘要没有成为额外用户消息。 | [完成与继续发送](C01-C02-Q02-compaction-next-state.png)、[工具后压缩](Q04-Q09-tool-steer-command-completed.png)、RT | **B01：持久完成耗时遗漏模型总结阶段，显示 0s。** 旧工具条目保留，但压缩后逐一展开工具详情未覆盖。 |
| C03 摘要操作 | 未覆盖完整 | 展开／收起、复制并粘贴到草稿；短摘要正文一致。真实 587 字摘要显示列表、嵌套列表、行内代码，重启后键盘操作复制成功。 | [短摘要复制](C03-copy-to-draft.png)、[多格式摘要](C03-auto-summary-content.png)、[键盘复制](C03-V03-keyboard-copy-restored-summary.png) | Markdown 标题与围栏代码未得到真实总结样本；完成事件抵达但 durable 摘要尚未加载的短窗口未捕捉。 |
| C04 无需压缩 | 未覆盖完整 | 新会话输入 `/compact`，原始 CU 观测显示“对话还很短，暂时不需要压缩”；下一次状态提示已消失，无成功／失败分隔线。 | 原始 CU 工具记录；[观测记录](cu-observations.json)中 `C04-notice-cleared` | 约 3 秒消失的精确时长未验证；不能用约 60 秒后的观测证明 3 秒。 |
| C05 自动压缩成功 | **失败** | Chat 模式阈值临时降至 50%，真实请求 input=73,663、output=109、cacheRead=768；达到 128,000×50%−16,000=48,000 的触发依据，回复后自动压缩，原回复保留，后续队列自动发送。 | [触发请求与队列](C05-Q09-auto-trigger-attempt.png)、[自动完成](C05-auto-compaction-followup.png)、RT | **B01：自动完成分隔线也错误显示 0s。** 自动压缩进行中外观和禁止插入的短暂状态未捕捉。 |
| C06 压缩失败与重试 | 未覆盖完整 | 主模型地址临时指向本机不可达端口，手动压缩显示 Connection error、失败和重试；恢复默认地址后重试成功。 | [手动失败](C06-manual-failure-retry-visible.png)、[恢复后重试](C06-retry-running-dark-Q01-click.png) | 自动压缩失败、其重试、已完成回复不变失败未覆盖。隔离辅助模型故障的尝试反而发现 B02，不能写成自动失败通过。 |
| C07 压缩历史恢复 | **通过** | 切换会话再返回可展开摘要；正常重启后同一分隔线保留 5 条、0s 和相同 587 字摘要，旧消息仍在。0s 的准确性属于 B01，恢复一致性通过。 | [切换后摘要](C07-summary-before-restart.png)、[重启后摘要](C07-restarted-summary-expanded.png)、RT | 失败块重启恢复不是当前承诺，本轮不据源码推断其实际消失。 |
| Q01 运行中发送入口 | **通过** | Enter 和点击分别成功加入队列，正文进入托盘，输入清空、数量正确；空输入显示停止；Shift+Enter 保留两行草稿且不发送。 | [点击加入](C06-retry-running-dark-Q01-click.png)、[换行草稿](Q01-V03-shift-enter-draft.png)、CU 原始记录 | — |
| Q02 顺序自动发送 | **通过** | 两条消息分别在前一回合结束后开启新回合，正确顺序、各一次，托盘清空。压缩后的两条队列及窄窗口的四条队列也顺序完成。所检查链路没有重复、遗漏或 SESSION_BUSY。 | [插入与普通队列完成](Q05-Q02-steer-and-queued-completed.png)、[压缩后发送](C01-C02-Q02-compaction-next-state.png)、[四条发送完成](Q12-queued-quote-send-progress.png)、RT | 结论限本轮检查的消息，不声称所有竞争窗口均通过。 |
| Q03 删除、编辑与上移 | 未覆盖完整 | 非队首上移；队首上移禁用；编辑恢复正文并移出队列、聚焦输入；有草稿时编辑禁用，显示先清空输入框；图片与引用编辑恢复。上移后的消息按界面顺序发出。 | CU 原始菜单记录；[图片恢复](Q12-image-edit-restored.png)、[引用恢复](Q12-queued-quote-edit-restored.png)、RT | 未执行删除项。Computer Use 文档要求图形删除在动作前单独确认；本轮没有该动作时确认，保留未覆盖。没有把编辑移出队列算作删除验收。 |
| Q04 工具期间插入 | 未覆盖完整 | 真实 Bash 等待期间点击插入，显示下一步读取；RT 确认 next-step claim；原回合后续 ACK，没有另开普通回合重复处理。 | [工具期间待插入](Q04-tool-running-steered-and-command.png)、[结果](Q04-Q09-tool-steer-command-completed.png)、RT | 未捕捉“已读取用户消息实时显示、但当前回合尚未结束”的中间画面。终点和 Journal 不能替代此项。 |
| Q05 最终回复期间插入 | **通过** | 无后续工具的长回复约第 260 行时插入，下一步读取期间原回复继续到约第 297 行；原回合增加一步，回复 CU_QUEUE_01_ACK；普通队列 CU_QUEUE_02_ACK 随后另起回合，均一次。 | [最终回复中插入](Q05-final-reply-steer-pending.png)、[回复继续](Q05-steer-current-turn-result.png)、[完成](Q05-Q02-steer-and-queued-completed.png)、RT | — |
| Q06 撤回与竞争 | 未覆盖完整 | 下一步读取期间撤回，条目返回普通队列；RT 先 discard `steer-cancelled`，原回合不 claim 该插入，随后作为新回合收到 ACK。 | [撤回前](Q06-unread-steer-before-withdraw.png)、[撤回后](Q06-withdraw-result.png)、RT | 已读与撤回竞争、回合结束与撤回竞争未覆盖。 |
| Q07 插入后立即停止 | 未覆盖完整 | 两条未读插入后立即停止；RT 按插入顺序 discard `turn-aborted`；停止完成后两条按原序回队列且暂停；继续后各发一次。 | [停止中](Q07-stop-unread-restored-paused.png)、[停止完成](Q07-stop-settled.png)、[后台发送结果](Q11-return-A-after-background-drain.png)、RT | 已读取项恰在停止前被消费的分支未覆盖。第一张截图仍处于停止中，不能单独证明恢复完成。 |
| Q08 停止、失败与恢复 | 未覆盖完整 | 用户停止后队列暂停，不自动发送；继续发送后顺序恢复。窄窗口也验证四条暂停、恢复并清空。 | [暂停](Q07-stop-settled.png)、[窄窗口暂停](V02-Q08-narrow-stop-settled.png)、[恢复结果](Q12-queued-quote-send-progress.png) | 普通失败时确有剩余队列、手动压缩失败时确有剩余队列、暂停后手动发送新消息恢复、自动压缩失败继续发送未覆盖。早期错误请求结束太快，消息在失败后才发出，不构成该场景证据。 |
| Q09 压缩联动与命令排队 | 未覆盖完整 | 手动压缩中可以排普通消息，插入禁用，完成后自动发送；普通运行中 `/compact` 标为命令且无插入，之后普通项按序发送。自动压缩前排队的消息在压缩后发出。 | [手动压缩中排队](C01-Q09-manual-compaction-queued.png)、[命令队列](Q10-Q09-approval-blocked-command-queue.png)、[命令结果](Q04-Q09-tool-steer-command-completed.png) | 实际自动压缩“进行中”再加入消息未捕捉；手动／自动禁止插入的原因 tooltip 未完整验证。自动压缩前排队不等于压缩中排队。 |
| Q10 等待审批 | 未覆盖完整 | 真实工具审批期间允许排队，所有普通项插入禁用；批准后工具运行，插入和队列按最终结果处理。第二次场景出现审批超时及模型重试，随后主动停止并恢复队列。 | [审批](Q10-current-tool-state.png)、[审批时队列](Q10-Q09-approval-blocked-command-queue.png)、[含引用四条队列](Q12-Q10-V02-four-queued-with-quote.png) | 禁用原因 tooltip、主动点击拒绝后的最终状态未覆盖。审批超时不是点击拒绝，不能计为拒绝通过。 |
| Q11 会话隔离与后台发送 | 未覆盖完整 | A 留队列后切 B，B 不显示 A 队列；A 后台继续发送两条并清空，侧栏状态随运行改变；返回 A 顺序和 ACK 正确。B 可正常发起 Chat 请求。 | [A 后台与 B](Q11-background-A-new-B-entry.png)、[返回 A](Q11-return-A-after-background-drain.png) | A、B 同时保留不同非空草稿的隔离与 B 草稿不受后台发送影响未完整覆盖。 |
| Q12 附件与回复批注 | 未覆盖完整 | 正式图片入口添加公开品牌图，排队显示 1 文件；编辑恢复正文与图，手动发送后识别 ActSpace 并保留历史。回复引用排队显示 1 引用，编辑恢复后重新排到尾部，自动发送后模型确认引用并回复 ACK。批注评论编辑保存及带评论的普通请求已执行。 | [图片排队](Q12-image-queued-stop.png)、[图片恢复](Q12-image-edit-restored.png)、[图片响应](Q12-image-response-result.png)、[引用恢复](Q12-queued-quote-edit-restored.png)、[引用实际发送](Q12-queued-quote-send-progress.png) | 图片队列自动发送、图片及回复引用的 Steer、带评论引用编辑回队列的完整保留与模型响应未覆盖；带评论的普通请求最后被停止。正式文件 mention 未覆盖；未以 PoC 宣称正式入口。 |
| Q13 校验失败恢复 | 未覆盖 | 未进入真实 attachment/reference preflight 拒绝状态。附件入库缓存后，删除来源文件不等于破坏待发 artifact。 | 源码检查，仅作场景分析 | 自动发送校验拒绝后的原因、草稿恢复与暂停；插入拒绝回队列及重新操作，均未覆盖。不破坏用户 artifact store，也不改 Journal 制造状态。 |
| V01 双主题 | 未覆盖完整 | 已实际展示浅色完成摘要、队列、未读插入／暂停；深色手动失败、重试与队列。检查到的画面文字和禁用态可辨。 | 各链路截图；[深色失败／重试](C06-retry-running-dark-Q01-click.png)、[浅色暂停](V01-paused-queue-light.png) | 每种主题的 running／完成／失败／插入／暂停／菜单完整矩阵未走齐，不能由代表位置宣称所有状态均通过。 |
| V02 窗口与滚动 | 未覆盖完整 | 常用尺寸和约 726 CSS 像素窄窗口中，多条长文本省略，侧栏折叠，四条队列、按钮和 Composer 仍可见；窄窗口更多菜单可打开，暂停／继续正常。 | [窄窗口四条](V02-narrow-four-queued.png)、[菜单](V02-narrow-queue-menu.png)、[暂停](V02-Q08-narrow-stop-settled.png) | 未确认达到应用最小宽度限制；超过托盘最大高度时的内部滚动、窄窗口摘要及全部边缘 tooltip 未覆盖。 |
| V03 键盘、焦点与浮层 | 未覆盖完整 | 队列菜单用 Enter 编辑、Escape 关闭；编辑后输入聚焦；压缩按钮 Space 收起／展开，Tab 到复制并 Enter 激活，复制后粘贴正文；Shift+Enter 不发送。 | [引用编辑焦点](Q12-queued-quote-edit-restored.png)、[摘要键盘复制](C03-V03-keyboard-copy-restored-summary.png)、[输入换行](Q01-V03-shift-enter-draft.png) | 完整 Tab 顺序、点击外部关闭后的焦点恢复、关闭后不会延迟再开的观察未覆盖。 |
| V04 队列生命周期 | **通过** | 切换会话时内存队列保留，后台发送正常。重启前专用运行已结束，A 尚留 1 条暂停队列；正常重启后托盘清空；已读工具 Steer 正文与 ACK、已发送历史仍可见。 | [重启前暂停](V04-restart-paused-settled.png)、[重启后清空](V04-after-restart-queue-cleared.png)、[已读插入恢复](V04-restarted-consumed-steer-history.png)、RT | 草稿持久化不是当前承诺；本轮没有据此提出丢消息缺陷。 |

## 确认缺陷与复现指引

### B01：完成分隔线的耗时遗漏模型总结阶段（已修复）

优先级建议 P2。手动与自动压缩都显示成功，但完成时间经常为 0s。第一次自动压缩：前一回合在 `15:38:38.859`（北京时间）结束，压缩事务 start 在 `15:38:47.746`，end 在 `15:38:47.762`，事务差只有 **16ms**。CU 完成分隔线显示 0s，重启后仍显示 0s。

源码解释：`packages/compaction/src/plugin.ts:84` 先等待 summarizer，再创建并追加压缩事务；`packages/client/src/sessions/chat.ts:175` 用事务 start/end 计算 durable 耗时。模型总结阶段约在前一回合结束与事务写入之间，未包含在持久时间里。该区间 8.887 秒也可能包含调度，不能直接声称等于精确模型耗时；确定的是总结发生在所计事务之前。Agent loop 的 live 计时包含总结，durable 投影又用短事务时间覆盖，因此显示口径不一致。

复验：在真实长会话手动压缩，并触发一次 Chat 自动压缩；对照开始／结束的实际等待与完成时间；切换和重启后仍应保留包含总结阶段的同一耗时。证据：[自动完成](C05-auto-compaction-followup.png)、[重启后](C07-restarted-summary-expanded.png)、RT。

### B02：上下文压缩没有采用设置中的轻量任务模型（已修复）

优先级建议 P2。通用设置明确说明轻量任务模型用于“标题、工具摘要和上下文压缩”。本轮把轻量任务模型改为 Kimi K2.6，仅把 Moonshot 地址改为本机不可达地址，保持主会话 DeepSeek 可用，真实自动压缩仍成功。

RT 进一步确认第三次压缩摘要 metadata 为 **`routeId: default`、`model: deepseek-flash`**，不是所选辅助模型。因此不是简单的“故障未触发”推测。源码 `packages/compaction/src/plugin.ts:40` 默认取第一条 route；Desktop Host 第一条是 `default`，第二条才是 `utility`，runtime composition 没有为 compaction 指定 utility route。

复验：保持主模型 A 可用，在设置中选不同辅助模型 B，触发压缩；核对实际路由／模型为 B。再只让 B 的连接不可达，应进入自动压缩失败流程，同时保留 A 已完成的回复并依约处理队列。证据：[辅助模型选择](C06-utility-model-options.png)、[隔离故障结果](C06-auto-isolated-failure-result.png)、RT 中 `surface/replaced` seq 3202。

### 附带观察，未归因于这两项新功能

- 普通模型请求失败时，对话仅显示 `Worked`、没有可见错误说明。RT 确有 `Connection error.` 和一次 `terminated`；相关画面见 [恢复继续时](resume-window-current.png)、[重启后历史](V04-after-restart-queue-cleared.png)。需要另检查错误展示和折叠执行详情；不据此宣称失败时队列行为有缺陷。
- 一次手动压缩摘要仅为 `CU_QUEUE_02_ACK`（15 字），未真正概括前文；另一自动摘要保留了项目、版本和任务。属于总结质量线索，需另用不含大量“只回复 ACK”指令的对话复验。摘要没有最新回复是压缩区域排除末条 assistant 的结果，不能据此判定历史丢失。
- 某些 Computer Use `paste` 的最终值与拟输入值不一致，重启前未发队列实际为 `CU_QUEUE_02_ACK`，不是拟输入的 restart 标记。生命周期判定只使用实际可见条目；未把该工具输入异常归为产品队列改正文。

## 收尾与补验建议

原轻量任务模型、主模型、Chat 阈值 80%、DeepSeek／Moonshot 默认地址均已恢复，浅色主题恢复；没有操作 API Key。窗口恢复大尺寸、侧栏展开，两条专用测试会话保留供复验，队列清空，开发应用保持运行。最后一次核对见 [收尾环境](final-environment.json)。

B01／B02 已由用户确认后修复（见顶部修复报告）；下一轮补 C06、Q08、Q09 的自动失败／压缩中排队链路，以及 Q04、Q06、Q07 的读取与竞争中间状态；其次补删除、附件 Steer、校验失败、双主题和最小窗口完整矩阵。下文记录的原验收阶段未修改产品代码；后续修复阶段已获用户确认并完成定向验证。

本报告所列未覆盖均保留在原范围内，没有以操作分组或源码／历史测试缩减验收范围。它们是后续补验清单，当前结论保留为**不签收**。
