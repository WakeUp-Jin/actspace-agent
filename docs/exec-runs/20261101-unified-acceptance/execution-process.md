# 统一验收执行过程

- 2026-11-01：用户批准按64点计划执行到全部路线结束；冻结 HEAD `1a83adcc73d946ab646fff62b2d3e00d04db859f`，仅计划与导航存在文档改动。
- 委派明确指定的 gpt-6.1-sol Computer Use 子智能体，主控执行工程检查和只读定位。
- 证据根目录：`tmp/codex-acceptance/20261101-unified-acceptance/`（本地、不随仓库分发）。

- 第一轮工程链完成：Desktop 2133通过/7跳过；文档6断链、evaluation固定20ms取消测试失败；缺依赖导致新包/runtime失败。已补齐依赖链接，未改锁文件，重建与针对性复测中。

- 工程复测完成：frozen install 后全仓 typecheck 49.75s、Desktop build 31.19s 通过；runtime 101、harness-stats 16测试通过，契约与 README 通过。锁文件/产品源码未变。构建已冻结，真实 Electron 启动中。

- H16增补独立阈值验收：12类规则33个样本，32通过/1失败；确认 UA-003 插件成本低使用提醒使用不同归属 ID 导致漏报。仅 tmp 验收驱动，无产品改动。

- G1→G2：原生CUA完成多个主/侧/分叉场景，阶段结果见本机ui/G1-progress.md。后台样本最初使用python -c被BASH_COMMAND_DENIED；只读定位为command-rules.ts原始字符硬guard拦括号，未进入执行器。不改模式或策略，使用隔离工作区审阅后的普通脚本调用继续。
- 数据快照：6份新transcript均有会话信息与正确父子链接；未发现长度>40的Journal reasoning原文泄入或重复User/Assistant锚点。分叉链指向父会话边界；压缩/失败/恢复仍待实际样本。

- G4前静态确认BrowserBridgeService的NativeHost登记/支持目录默认不随ACTSPACE_DATA_DIR迁移。要求下一次fixture启动使用ABB_SUPPORT_DIR、ABB_CHROME_MANIFEST_PATH、ABB_SOCKET指向本轮临时目录，避免启用插件时接触用户Chrome登记与既有socket；不执行连接/安装扩展。该配置只用于隔离启动器，不改产品或用户配置。

- G3图片样例引发Provider400。只读检查本轮sample.png为68字节1×1，IDAT CRC错误，属验收fixture而非已确认产品Bug；通知使用有效图片重验，避免拿被污染的请求历史误判发送调度。该真实failed轮可用于T4终态持久化。

- G3完成18格真实文件打开矩阵；宽表补充截图已确实到第12列。D3外部修改的turn-end重载通过，独立focus触发仍未覆盖。D8最初疑似串工作区，经正式设计及既有right-panel-review测试确认Review对象标签绑定原root，跨会话不改目标是约定；不列Bug，新开目标工作区标签分别验证Git/非Git。未因观察到旧diff就直接计缺陷。


- G4第1次正常重启后浏览器/英语入口启用，真实双语回复通过；语音未配置且无专用凭据，朗读子项未覆盖。侧聊Alpha/Beta内容和继承边界、后台通知历史恢复已实机复核。用途模型菜单搜索/分组/选择/返回焦点通过。开关恢复off后的第2次重启继续验证。
- 新增UA-004：真实快回复会话标题晚于turn/end，transcript标题仍Untitled；定位投影监听缺少轮后title-set触发，未修复。退出追加end-seed引起的Last activity变化不单列Bug。


- G1定向补验：连接断连最多重试2次的真实网络路径、400普通runtime/output非超时分类与两次失败后恢复均完成；Journal/HTTP次数/界面轨迹三方一致。可控Provider夹具仅在tmp，不修改产品/正式测试、不记录请求正文或key。后续将用标注方法的SSE夹具补流式难捕获状态，真实Provider与夹具证据分开。


- G5首次读模型已初始化：只读实库73请求/50轮/35工具调用；与lineage自有执行61/38/31不符，确认UA-005继承前缀被重复记账。统计页面初始主会话筛选55请求/29调用与all不同是筛选口径，不是另一Bug。
- Harness首屏补齐状态消失时仍显示runtime0，切tab后变30。只读定位首次dataVersion0→1未触发revalidate的分支；保留为待重建定向复核，暂不以“异步阶段”直接排除问题。


- G1收尾：C2/C3可控SSE实际同流状态、C6菜单Esc、C8获准隔离pwd真实环境图标均补验。E6三份旧会话副本逐一打开；非代表性抽查。C7新运行态证据确认UA-006：父卡已有实际模型，右栏直到完成才取得model。
- G5→G6：真实/compact完成并在下一轮结束后transcript逐字匹配，含压缩摘要；H11保持运行Tab未操作，轮数39→40自动更新。H1首次0→1刷新与此后正常增量分开判断。
- H15界面没有删除入口。归档禁用是当前选中会话约定，切走后可归档；归档/设置恢复已可达，但不能代签删除。正常退出后把本轮R4临时目录可逆移入同0700隔离root备份，后续worker检测缺失/统计归档与重建均标文件夹具方法；原用户会话不变。
- H14独立统计关闭实例首次因验收准备漏留secrets v2必需的providerCredentials空对象，密钥被parser拒绝；仅修临时fixture、按冻结parser验证后重启，不计产品Bug。主库独占owner租约夹具在正常退出后持有，供错误/重试路线，不锁原用户库。


- 收尾：H14统计关闭实例真实请求/会话指标通过，运行时文件0；独立空库首屏0→1漏刷新确认UA-007。H1独占租约错误与点击重试恢复均已实机完成。
- H15最终正常退出后仅备份派生SQLite，冻结构建重启从现存Journal及Harness归档重建，五类计量表行哈希与重建前完全相同。归档、离线缺源、重建和UI删除未覆盖分别记录。
- 最后恢复：主会话与两级fork实际打开，压缩分隔及子Agent完成模型保留；三个目标Journal相对重启基线新增执行事件0。未用新请求覆盖恢复结果。
- 清理：仅关闭本轮Chrome/Cursor标签，隔离Electron正常退出；owned进程0。两个0700隔离root连同0600复制凭据、旧Journal副本、测试工作区和索引备份已删除；保留脱敏tmp证据。159份文本证据凭据匹配0，产品2732及构建690文件未变，用户NativeHost/support文件哈希mtime未变。
- 最终结算：64点44通过/11失败/9未覆盖；全部编号有子项结论/证据或明确缺口，7问题分6修复组。只验收与定位，没有修复/委派修复/提交/推送。计划移入completed，后续原修复Agent按交接单处理。

- 文档终检：64点计数及分组复核一致，无重复编号/空子步骤/缺证据引用；本轮正式Markdown链接均可解析。重新执行pnpm check:docs仍仅UA-001原有6条截图断链，未新增断链；未为绿灯改旧摘要。
