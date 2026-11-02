# 逐点复验台账

本轮23点：20通过、0失败、3未覆盖（均有已通过子项，未覆盖部分逐一保留）。原生界面由明确指定的gpt-6.1-sol通过CUA操作真实隔离Electron；主控负责工程命令及只读Journal/transcript/SQLite核对。分组只用于操作路线，不缩减验收点。旧轮64点中其他未覆盖不因此自动关闭。

先定义验收点，再按工程构建、主/子会话与标题、统计首载与规则、继承与迁移、重启与清理5条路线执行。以下“证据”均为本机证据文件名文字；前缀目录是 `tmp/codex-acceptance/20261102-unified-reacceptance/`，不把不入库截图链接写成仓库附件。完整逐点步骤/期望/实际/方法在本机 `ui/coverage.json`；工程数据见 [工程证据](engineering.md)。

| 点 | 检查操作及预期 | 结果与方法 | 主要证据 |
| --- | --- | --- | --- |
| A1 | 两条文档门禁，摘要没有缺失截图引用 | 通过：真实CLI均exit0，最后再次复跑 | engineering/check-docs.log、test-current-docs.log |
| A2 | 沙箱启动后/准备阶段/预先取消；完整测试与typecheck | 通过：本轮全仓测试3793通过/0失败/22跳过，三时机通过；非原生UI取消 | engineering/pnpm-test.log、typecheck.log |
| B1 | 插件行、工具所属列对应同一loader ID | 通过：原生UI两处均filesystem-read；合成统计+真实inventory | ui/B1-hit-plugin-id、B1-hit-tool-id |
| B2 | 规则命中、不命中、样本不足 | 通过：合成200/1命中，199/0及200/2不命中；原生UI逐模型scope检查，非200次真实请求 | ui/B2-hit-overview-correct、B2-undersample-overview、B2-used-overview |
| B3 | 点击插件和工具规则跳对应页面/行 | 通过：两次原生点击，跳转及ID一致 | ui/B3-plugin-rule-jump、B3-tool-rule-jump |
| C1 | 快回复、慢自动标题；不发新轮也更新记录 | 通过：受控Provider正文即返，晚4.906秒标题到达；UI与落盘都更新、正文一次 | ui/C1-body-before-title、C1-late-title-arrived；engineering/late-title-audit.json |
| C2 | 标题先于轮末到达，正常写入记录 | 通过：真实DeepSeek title seq13早于end146 | engineering/title-timing.json；ui/F1-auto |
| C3 | 空闲手动改名，不发新轮 | 通过：原生重命名后transcript立即更新 | ui/C3-idle-title；engineering/idle-title-audit.json |
| C4 | 运行中改名，当前轮不提前重写、轮末带新标题 | 未覆盖：原生改名和轮末正确已通过；未抓到运行期间即时文件旧标题。对应不提前写行为的lifecycle回归测试本轮通过，不能代称原生捕获 | ui/C4-running-title、C4-second-running-title；engineering/running-title-after-audit.json |
| C5 | 重启恢复标题/正文、去重和隐私 | 通过：原生重启恢复主会话及晚标题会话；只读审计正文一致、无重复章节、reasoning或凭据泄漏 | ui/C5-restart-late-title-body；engineering/transcript-audit.json、privacy-and-exit-audit.json |
| D1 | main→side，main→fork→fork2，各做新增执行 | 通过：真实DeepSeek链路；各继承会话只计自有1请求/1轮/0工具，9会话自有总量逐项匹配 | ui/D1-fork2-own、D1-side-own-stat；engineering/own-counts-beforemigration.json |
| D2 | 排除继承计数但恢复版本、模式 | 通过：原生runtime视图与只读Journal/SQLite；side=plan、fork=agent、revision main@1 | ui/D2-runtime-before-restart；engineering/own-counts-aftermigration.json |
| D3 | Harness全局/类型筛选与Usage独立正确 | 通过：原生筛选与独立Journal对照；Harness22主请求、Usage23请求含辅助请求，Usage338452token，不能要求两个口径机械相等 | ui/D3-all-stat、D3-usage-before-restart；engineering/usage-beforemigration.json |
| D4 | 旧重复计数库升级重建后数字正确 | 通过：合成旧语义schema15库由真实worker迁移16；现存9会话四表与正确备份逐行一致；后续重启未再全重建 | ui/D4-D5-migrated-all35；engineering/migration-audit.json、health-finalrestart.json |
| D5 | 删除/归档边界与旧归档限制 | 未覆盖：合成已删除分叉归档保留10请求/5轮/6工具已确认，属于已知限制；原生用户点击删除/恢复未执行 | ui/D4-D5-migrated-all35；engineering/schema15-prepared.json、migration-audit.json |
| E1 | 子Agent运行时父卡、列表、详情模型一致 | 通过：真实DeepSeek子Agent运行中三处均deepseek-flash | ui/E1-running-parent-list、E1-running-detail |
| E2 | 已完成子Agent模型保留 | 通过：真实完成态列表/详情显示deepseek-flash | ui/E2-completed-detail |
| E3 | 停止与失败子Agent保留真实模型 | 通过：真实DeepSeek stop→aborted；真实父调用explore子连接受控本机400→failed，列表/详情保留acceptance-1102。该失败样本不带usage | ui/E3-before-stop、E3-stopped-detail、E3-failure-fixture-detail；engineering/failed-child-audit.json |
| E4 | 重启后模型事实不被当前用途绑定覆盖 | 通过：用途绑定改成本机acceptance-1102，旧子仍deepseek-flash，包含已停止详情 | ui/E4-restart-list-binding-diff、E4-restart-stopped-detail |
| F1 | 空库首次补历史，停留当前页面自动出结果 | 通过：真实UI0插件/0请求→30插件/1请求，不切tab不刷新；内存精确0→1另由本轮hook回归测试证明 | ui/F1-initial、F1-auto |
| F2 | 补齐后idle不反复加载/查询 | 通过：有限原生停留稳定无重复loading；精确query次数由本轮hook测试独立断言，UI截图不证明调用次数 | ui/F2-final-stable-start、F2-final-stable-idle；engineering/pnpm-test.log |
| F3 | 后续正常增量自动刷新 | 通过：真实新增会话/请求后重入自动补齐，随后统计与Journal一致 | ui/F3-incremental-sync；engineering/own-counts-finalstable.json |
| F4 | 失败重试、切tab与慢查询完成竞争 | 未覆盖：租约夹具错误、释放后切tab恢复、原tab原生点击Retry均已通过；慢查询结束与快速切tab竞态未执行 | ui/F4-lease-error、F4-error-tab-switch、F4-retry-click-result、F4-retry-stable |

C4、D5、F4的局部未覆盖不是新增产品Bug，也不被各组核心通过结论覆盖。已结束子会话缓存的每秒读取次数未插桩测量；长期性能、带Token失败样本、旧轮其他未覆盖边界均不额外宣称通过。

命名纠正：`B2-hit-overview` 实际是工具页，采用 `B2-hit-overview-correct`。`E3-failure-fixture-running` 保存时已失败，不能用该文件证明运行全过程；E1真实运行态有独立截图，受控失败前短暂模型状态仅以当时CUA观察记录支持。
