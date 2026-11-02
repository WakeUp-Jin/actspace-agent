# Bug 与工程问题台账

只验收和定位，不修复。所有结论基于 `1a83adcc`，问题均已记录原因、证据与定向复验范围。

## UA-001：旧验收摘要引用未入库截图，阻断文档门禁

- 类型：文档工程缺陷；优先级 P2；影响 E5。
- 复现：运行 `pnpm check:docs` 或 `pnpm test:current-docs`。
- 实际：前者报 6 条断链，后者 7 条测试中 1 失败；引用均来自 `docs/exec-runs/20261025-compaction-display/execution-summary.md:26` 的 screenshots/1–6 PNG。
- 期望：正式文档门禁不依赖未随仓库分发的本地截图。
- 原因已确认：`git ls-tree -r --name-only HEAD -- docs/exec-runs/20261025-compaction-display` 只有三份 Markdown，没有上述截图。该引用在 HEAD 已存在，非本轮新增。
- 证据：本地 engineering/check-docs.log、test-current-docs.log；不沿用旧报告中363条的数量。
- 建议修复范围：原摘要的证据留存/引用方式；由后续修复 Agent 决定入库合规截图或改为明确本机证据说明。
- 复验：两条文档命令、根测试链能继续运行；本轮已独立执行后续所有测试，未因文档失败漏测。

## UA-002：Harness evaluation 取消测试依赖固定20ms，可能在沙箱启动前取消

- 类型：测试时序缺陷；优先级 P2；影响 E5。暂未发现据此可确认的产品取消行为错误。
- 复现：全包并发测试，以及单独 `pnpm --filter @actspace/harness-evaluation test`，均失败于 service.test.ts 的 terminates the sandbox when the caller aborts。
- 实际：返回 cancelled / cleanup=ok，但缺预期 sandbox.outcome。单包复跑同样失败。
- 原因：测试在 `evaluation.run` 后固定等待20ms便 abort；生产 service.ts 在复制 artifact/workspace、写 selection/task、获取模型环境后检查 signal。若准备超过20ms，会合法返回 `{status:cancelled,outputTail:""}`，并未创建沙箱；测试却无条件要求 sandbox.outcome 和 terminated=1。现有断言未同步“沙箱已启动”的真实阶段。
- 证据：engineering/all-package-tests.log、harness-evaluation-recheck.log；源码 `packages/harness-evolution/harness-evaluation/src/test/service.test.ts:86`、`src/service.ts` evaluate 的 aborted 分支。
- 建议修复范围：测试与 fakeSandbox 的开始同步；不以此为理由直接修改产品取消语义。
- 复验：取消前已启动/准备中取消/预先取消三种场景，以及并发全包测试。

## 环境准备记录（不计产品 Bug）

- 新 harness-stats 包初始缺 node_modules，typecheck/build ENOENT、runtime单测无法解析该包。`pnpm install --frozen-lockfile --prefer-offline` 在锁文件不变情况下补齐链接。修复环境后重测结果另记工程台账。

## UA-003：插件“占用高、使用少”规则按错误 ID 关联工具，漏报

- 类型：统计查询逻辑缺陷；P2；影响 H2/H16。独立样本复现，尚未在真实请求累计200次后触发 UI，不能冒充真实界面复现。
- 复现：执行本地 engineering/flag-probe.cjs；冻结的 Desktop 编译模块 + 内存 SQLite，33项阈值/边界样本中32通过、1失败，覆盖12类规则。
- 样本：read_file 暴露200次、定义600 token、调用1次；tool owner 为 plugin=`filesystem-read`、toolPluginId=`actspace.filesystem-read`。这两个 ID 来自真实 Host tool-owner 元数据。应同时出现工具与插件的成本低使用提醒，实际只出现工具提醒。相同 ID 的控制样本会命中插件提醒。
- 原因已确认：harness-stats-query.ts 的 plugins() 使用 owner.plugin 关联，得到插件 ID `filesystem-read`；toolAggregates() 的公开 pluginId 为 `actspace.filesystem-read`。flags() 再用 tool.pluginId === row.pluginId 筛选，找不到工具，exposures 变0，规则静默漏报。
- 源码：apps/desktop/src/main/runtime-v2/harness-stats-query.ts（toolAggregates、plugins、flags 的 pluginTools）。
- 证据：engineering/flag-probe-results.json；真实运行时文件仅摘取脱敏 tool-owner 元数据。测试驱动只在 tmp，未改产品/正式测试。
- 建议修复范围：统一查询中的插件归属映射，并补真实不同 ID 的命中/不命中/样本不足回归；复验插件表和规则跳转。

## UA-004：首轮先结束、标题后生成时，transcript 保留 Untitled session

- 类型：会话记录投影更新缺陷；P2；影响 T4（标题），不影响已核对的正文、工具摘要和权限边界。
- 真实复现：隔离非Git会话 ec6147dd-9fd6-4b95-8dcd-86b50e17efe0 完成一次短回复。Journal turn/end seq19 @13:58:32.362Z，随后异步标题生成完成，session/title-set seq22 @13:58:32.860Z；UI已有20字标题，transcript首行仍为 `# Untitled session`。正常退出重启后仍保留。
- 原因已确认：`packages/host/desktop-app/src/session-title.ts` 异步生成标题并追加 title-set；`packages/session/session-transcript/src/plugin.ts:47` 的 session/event 监听只在 turn/end 调用 render，不监听轮后 title-set。render.ts 虽支持标题事件，但没有后续触发投影重写。短回复比标题模型先结束即触发。
- 证据：本机 engineering/transcript-timing-audit.json、transcript-audit.json；CUA 非Git会话截图可对应会话。9份transcript去除Last activity行后仅该会话标题不一致，正文均一致；未输出正文或凭据。
- 不另报Last activity差异：正常退出追加session/end-seed，文件按轮结束写入，其最后活动时间与关闭事件不同不直接认定为Bug。
- 建议修复边界：标题更新后的轻量、合并式重写及生命周期测试，保持原子写盘/不阻塞追加；由原修复Agent决定实现。
- 复验：首轮快于标题生成、标题先于首轮结束、手动改标题、正常退出重启，以及T4原有正文/隐私/不重复检查。

## UA-005：分叉/侧聊继承的历史事件再次记账，汇总调用与轮数虚增

- 类型：统计投影事实归属缺陷；P2；影响H2/H4/H7/H12及U5/U6公共指标核对。新Harness与旧Usage均存在复制记录，不能以两者相等视为正确。
- 真实样本（22:31，15会话）：Journal原始副本共73次request/header、50次turn/start、35次tool/call；按非委派lineage.parentBoundarySeq剔除已继承前缀后，实际新增执行为61/38/31。SQLite Harness恰为73/50/35，重新计算了复制前缀。
- 最小样本：侧聊97e31c51实际新执行2轮/2请求/0工具，统计为7轮/7请求/1工具；分叉0e628c69实际新执行1轮/1请求/0工具，却记3/3/1。父请求891f9371在5个session重复作为Usage请求行；继承并未再次调用Provider。运行tab侧聊平均轮数6.5，实际自有轮数应为3（两侧聊4轮和2轮）。
- 原因已确认：SessionStore.fork/createSessionForkSeed把父前缀复制至子Journal；read-model-sync.ts:114仅传id/events给projectHarnessJournalBatch，投影只按该session的seq去重，没有lineage边界的记账归属。usage-journal-projection同样按新session投影完整事件，activity身份带session，未全局去重。与transcript明确跳过继承正文的路径不同。
- 证据：本机engineering/inheritance-count-audit.json、live-data-audit.json、live-query-results.json。数据库是原生CUA产生会话的真实只读库，非合成样本；统计快照数不包含后续新请求。
- 建议修复范围：会话继承的统计归属规则，保留继承事件对版本/模式等恢复状态的作用，同时避免当作新执行再记账；需处理已有读模型重建。由修复Agent决定具体方案，不直接删除历史Journal。
- 复验：主→侧聊、主→分叉、多级分叉、委派新会话；全局与按会话类型筛选；请求/重试/工具/轮数/用量及重建一致性。


## UA-006：子 Agent 运行时，右栏列表缺模型名，父卡已显示

- 类型：运行态投影缺字段；P2；影响C7右栏运行列表/详情。完成态模型、父卡live模型、用途菜单分别保留通过证据。
- 真实复现：主会话发起explore长回复，打开右栏子Agent列表。截图C7-child-running-model.png同帧显示父卡“Explore · deepseek-flash · 正在整理回复”，右栏当前项只有“运行中 · Explore · 8s”；旧完成项已有deepseek-flash。不是启动前尚未选模型。
- 元数据：子会话bc63635b的首个request/header在14:46:25.622Z已记model=deepseek-flash，直到14:46:46.155Z才在父delegation/completed写入model；delegation/requested仅有invocationId/presetId/parentCallId/childSessionId。
- 原因已确认：fixed-renderer-ipc.ts的getSubagents只读取父snapshot/Journal；client/src/sessions/chat.ts的buildIndex在requested仅建child身份，直到completed才赋model；tool-card.ts只取child.model。SubagentsPanel虽然会显示model，但运行中投影未提供。父卡另走SubagentActivity接收真实request-started，故能显示。
- 证据：本机ui/C7-child-running-model.png、engineering/subagent-model-audit.json，结合上述只读源码路径。
- 建议修复边界：统一右栏运行态的真实模型来源；避免猜测用途绑定为实际模型，保持恢复/完成态已有模型事实。由原修复Agent决定事件或查询接法。
- 复验：子Agent已开始请求后父卡、运行列表、运行详情三处一致；完成、失败/停止、重启恢复；用途绑定改变但实际模型取请求事实。


## UA-007：首次补历史从版本0到1时，页面不自动刷新，保留空指标

- 类型：前端缓存失效遗漏；P2；影响H1/H11首次同步。此后真实会话增量39→40轮可正常刷新，不能互相代替结论。
- 最小真实复现：使用独立H14空数据实例（ACTSPACE_HARNESS_STATS=0）完成一次DeepSeek对话，再打开Harness统计。首次0次请求且正在补历史；提示消失、刷新按钮启用后，不切tab、不手动刷新，等待约90秒仍0次请求/0B。主实例首次补运行时元数据也出现0插件→切tab后30的同类现象。
- 同时点只读证据：15:03:31Z新库harness_request=1、turn=1、session_meta=1、usage_activity=2、SQLite1421312字节；Journal对应7ab5eab0一次deepseek-flash请求completed，说明后台已完成，不是没有请求。关闭采集后runtime文件为0是预期，不能用runtime空本身报Bug。
- 原因已确认：use-harness-stats.ts的latestVersionRef以0作未知哨兵；noteVersion首次大于0时first=true，跳过revalidateActive。初始查询确实返回dataVersion0，后台补齐后getStatus版本1，进入这一分支后停止syncing轮询，旧0版缓存没有重新查询。UsageReadModelService的初始版本就是0，首次fingerprint变化递增至1；0是合法数据版本。
- 源码：apps/desktop/src/renderer/components/harness-stats/use-harness-stats.ts:121，apps/desktop/src/main/runtime-v2/usage-read-model.ts:76、queryHarnessStats、startHarnessSync。
- 证据：本机ui/H14-stats-off-first.ax.txt、H14-stats-off-idle-later.ax.txt/png、engineering/stats-off-audit.json；首次主实例ui/H1-first-load.png、H2-overview.png、H3-plugins.ax.txt另作重复观察。
- 建议修复边界：区分未收到版本与合法0版；同步完成后使当前summary/options/tab缓存按版本失效，避免无效重复查询或无限刷新。由原修复Agent决定实现。
- 复验：空库0→1、初始已有数据、同步中切tab、慢查询竞态、失败后重试、此后增量、停留不操作自动刷新且不会反复查。
