# Web / PWA 与官网 V4 独立验收

## 本轮结论与方法

- 日期：2026-10-18；目标：`main` / `a13f8a1ee10eed387da575d80ac000cc844f2bff`，本轮核对 HEAD 一致。执行者为 AGENTS 指定的 `gpt-6.1-sol` 子智能体，只验收、记录，不修复。
- **原生浏览器 Computer Use：49 点全部未覆盖（CU-B01）**。正确初始化 `mcp__cua_repl` 后，创建具名 Chrome 标签返回 `unsupported Codex auth method: apikey`。此为工具认证阻断，不是产品 Bug。首次选择 IAB 没有导航或操作既有 8765。
- 主智能体已向用户报告限制，并明确授权使用仓库现有 Playwright/Node REPL 进行工程替代。本轮实际启动独立 headless Chrome、独立 context 和页面，使用正式 Host/CLI 与现成 HTTP Provider fixture；根据页面反馈交互、截图并看图。**下表“通过”仅指这一工程方法，不能转写为原生 Computer Use / 真机通过。**
- 工程结果按完整验收点判定：Web 24 点为 7 通过、3 失败、14 未覆盖（其中12点已验证部分子项）；官网 25 点为 23 通过、0 失败、2 未覆盖（均已验证部分子项）。合计 30 通过、3 失败、16 未覆盖，其中14点有部分实测证据。失败点关联 **WA01（W13/W14）与 WA02（W20）**，不是三个独立 Bug。没有确认 SAxx。
- 官网当前设计明确 **light-only**（`apps/site/DESIGN.md`、BaseLayout）。本轮按浅色纸本风格验三尺寸，并验深色 OS 偏好仍保持 light；不把不存在的官网三主题开关当缺陷。
- 本轮仅新增此验收文档及本次本地忽略证据；未改源码、正式测试、既有 DOCS，未 commit/push。未知 8765 未停止、未依赖。无用户 token / Provider 凭据读取。

## 环境与证据索引

已读 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-web-pwa客户端规范.md`、`docs/exec-plans/completed/20261017-web-pwa-client.md`、两个 20261017 执行摘要、`apps/site/DESIGN.md` / `SCREENSHOTS.md`。旧验收仅用于找入口，没有计为本轮证据。

| 项 | 本轮隔离环境 |
| --- | --- |
| Web | 正式 `apps/cli/dist/cli.js host serve --config <isolated>/host.json`；回环 HTTP `127.0.0.1:49615`，同源托管当前 `apps/web/dist`，升级时改用 tmp 内独立发布目录 |
| Host | hostId `b72fbd02-feac-4124-940c-1158d44fd0aa`；独立 dataRoot、workspace；不复用用户配置；synthetic key 环境变量 |
| Provider | 原有 `scripts/test/fixtures/agent-provider.mjs` 的 `startAgentProvider`；49592 成功/hold/tool，49593 `terminal-error`；不是实际模型服务 |
| Site | 本轮构建的 Astro preview，`127.0.0.1:8768/actspace-agent/`，独立进程 |
| Browser | 独立 Chrome 进程 / context；1440×900、1100×900、390×844；clipboard-read/write 仅此测试 context；无用户 Chrome CDP / localStorage |
| PWA 第二构建 | 现有 `vite build --outDir <tmp>/web-build-b --emptyOutDir`；未改共享 dist 或源码；同源临时发布目录切换 |
| 归档数据准备 | 现有 HostClient 经正式 `sessions.create/update` RPC 在隔离 Host 预置一条 archived 会话；列表展开/进入由页面操作。没有改 journal 或伪造前端 store |

本地证据根：`tmp/codex-acceptance/20261018-web-site/`（以下简称 E）。`E/engineering-results.json` 保存逐次页面文字、请求摘要、几何与操作结果；`provider-requests.jsonl` / `error-provider-requests.jsonl` 为不含认证头的 fixture 请求记录；`hero-samples.json` 为首屏 1 秒间隔时序；`post-restart-task-snapshots.json` 为正式 RPC 只读任务快照；`cleanup.json` 为进程清理记录。

截图位于本目录 `screenshots/`，仅本地证据、不随仓库分发。下表文件名均相对此目录。阶段过渡截图不能证明终态；使用 `*-stable*`、`web-pwa-update-final-stable.png` 等稳定证据。已实际查看首屏、布局、15 个聚焦稳定帧、Web 关键状态拼图及原尺寸审批图；补验11张键盘/锚点/表格截图也已看图。不能从官网 mock 截图推断 Desktop 业务正确。

## 验收点与预期（先于执行确定）

| 点 | 验收内容及预期 |
| --- | --- |
| W01–W05 | 首次连接默认 origin；空字段/无效地址/错码/不可达有明确反馈；正式配对后刷新恢复；移除先确认、取消不影响连接、确认清本浏览器凭据 |
| W06–W09 | 空态与时间/需处理分组正确；归档可单独展开；新建选择工作区及三模式；切换草稿隔离、历史可分页 |
| W10–W12 | 宽 Enter 发送/Shift+Enter 换行，窄 Enter 换行/按钮发送；队列可撤回、保留项按序执行；回复增长与完成过程一致 |
| W13–W14 | 停止/失败保留输出并可理解状态；按正式后端契约任务进入暂停，Web 应显示暂停并提供明确继续入口；不要求 `tasks.submit` 自动解除暂停 |
| W15–W17 | 支持的过程、Bash/diff/Markdown/用量可查看；模式模型选择作用于实际请求；审批允许/拒绝有效，前缀只在合法建议存在时验 |
| W18–W20 | 断线禁发、保留草稿、自动重连；维护/吊销有反馈；390/1440、深浅主题无溢出，触控区域满足规范 44×44 |
| W21–W24 | 生产 SW/manifest/离线外壳/主动升级；系统安装终态单列；iPhone/Tailscale/真实模型必须具备对应现场，不能由模拟代替 |
| S01–S04 | 首屏插件按任务依次点亮，关闭编辑/终端改变演示；未用项不重跑；离屏/后台暂停，返回重播 |
| S05–S10 | 五块截图逐块全貌及三要点；聚焦对应，悬停/键盘停留、点选固定/解锁、原图退出与焦点恢复 |
| S11–S13 | Harness 六阶段示意与未上线标签；八能力卡/方向/产品理念/快速开始/更新/GitHub 实际落点；移动菜单可退出 |
| S14–S16 | 文档目录/TOC三断点合理；页面/代码实际剪贴板正确；正文图片原图与关闭行为 |
| S17–S20 | 博客分类 OR、搜索 AND、空结果；排序不清条件、键盘操作；网格列表保留条件、文章信息正确 |
| S21–S25 | roadmap统计/筛选/分页；更新锚点；404返回；当前light-only三尺寸及dark OS可读；reduced-motion减少自动运动 |

## 实际操作分组

分组仅复用状态，结果仍逐点列出，未以代表性检查声称所有特殊状态通过。

1. 官网宽屏首页：完整任务时序→编辑/终端/Browser Use开关→离屏返回→五块截图全部要点、跨周期暂停/点选、原图→Harness六阶段→逐一点击主页能力卡/方向/文档/更新/外链。
2. 官网内容：docs目录/TOC/页面和代码复制/正文原图→blog分类组合/搜索/空态/排序/视图/文章分享/原图→roadmap筛选分页→updates→404。
3. 官网视觉：六类页面分别在390/1100/1440拍图并核对scrollWidth；dark OS和reduced-motion复用首页/聚焦/Harness/排序路线。
4. Web连接与列表：空字段/错码/配对/刷新→三模式新建→列表状态/归档→切换草稿/历史分页→设置主题与移除确认。
5. Web执行：hold流式→排队/撤回/按序执行→模型切换/用量→允许/拒绝/刷新审批→停止/失败复现WA01；继续用新的可运行会话验其他点，未RPC解锁失败会话。
6. Web生命周期：双主题宽窄布局→Host退出重启和网络中断→离线刷新→同源第二构建waiting/用户刷新/稳定接管→移除/重新配对/吊销。最后通过正式RPC准备归档记录及只读核对paused快照。

7. 官网既定残项补验：仅重启Site preview与独立Chrome，连续Tab进入插件/五截图、原图滚轮与按钮关闭、分类及排序键盘、锚点高亮时序/reduced-motion、代表目录行几何和既有表格页；未重启Web/Host/Provider，未重复18布局。

## Web / PWA 逐点结果

以下方法均为**工程 UI**；附注“源码”仅用于定位或说明边界。原生 CU 对每点均为 CU-B01 未覆盖。

| 点 | 状态 | 已执行步骤、结果及证据 | 未覆盖子项 |
| --- | --- | --- | --- |
| W01 | 通过 | 无本任务保存凭据打开49615；连接页地址为当前origin，设备名可编辑。E记录W01 | 无原生CU |
| W02 | 未覆盖（部分已验证） | 空地址提示“请填写服务器地址”；空码提示“请填写配对码”；其他字段保持；输入无效URL后没有产生连接请求；原生URL校验气泡未留证，未将此子项判通过。E W02 / `web-invalid-pair.png` | 无效URL原生校验气泡未单独留证，不将无文字变化推断为产品错误提示通过 |
| W03 | 未覆盖（部分已验证） | 错码提示“无效或已过期，请在服务器重新生成”；49619不可达明确显示地址/Host/HTTPS/allowedOrigins依据。`web-invalid-pair.png`、`web-unreachable-host.png` | 真正等待过期10分钟的码未测；HTTPS证书和跨源配置未测 |
| W04 | 通过 | CLI生成新码，UI配对Isolated Web Acceptance；列表出现；刷新后在线且继续正常请求；同一Host身份。E W04及后续Provider请求 | 无原生CU |
| W05 | 通过 | 设置→断开并移除→取消仍在线；再次确认返回连接页；本context保存Host凭据项被清。`web-remove-confirm.png`、`web-disconnected-removed.png`；E W05-cancel/removed | 无原生CU |
| W06 | 未覆盖（部分已验证） | 空Host初始列表；运行、待审批、今天分组；刷新待审批“需要处理1”；重配对后的未读“需要处理4”。`web-archived-collapsed.png`；E W17-refresh | 昨天/跨月/跨年时间分组没有自然数据，不改时间戳伪造 |
| W07 | 通过 | 正式RPC准备一条归档记录；UI折叠显示“已归档1”，展开才显示独立记录，点击进入Archived Acceptance Seed。`web-archived-collapsed.png` / `expanded.png`；E W07-archived | 归档动作本身非Web能力，数据准备方法单列 |
| W08 | 未覆盖（部分已验证） | 工作区Web Acceptance；新建Agent、Chat、Plan首条消息均建立并完成；对应模式chip、fixture请求正确。`web-new-390-light.png` / `dark.png`；E W08-Chat/Plan | 创建失败/进度长态未具备可控fixture；不以模型请求失败替代创建失败 |
| W09 | 通过 | 第三会话写draft，切入首会话草稿为空；点击“加载更早的消息”看最初轮次；回第三会话draft恢复，URL一致。`web-first-session-history.png`；E W09-switch-history | 仅本轮数据分页，无海量历史性能结论 |
| W10 | 未覆盖（部分已验证） | 宽Enter实际发送；Shift+Enter只添加换行且Provider计数不变；390 Enter只换行，按钮实际发送新审批任务。E W10-shiftEnter/narrow、W20-approval-visible | 空白/IME组字完整组合未测；真机键盘归W23 |
| W11 | 通过 | hold运行中排队；撤回后队列稳定移除且请求未执行；另一次两条稳定排队，release后Provider请求12→13→14依序为hold、alpha、beta，界面各一次完成。`web-queue-two-stable.png`；E W11-two-stable/completed | 当前UI只撤回，未虚报编辑/排序 |
| W12 | 未覆盖（部分已验证） | hold先“Fixture streaming; waiting for release”，release追加完成正文，同一轮完成尾栏120tok；计时和停止入口出现。E W12、W11执行日志 | 现成fixture无thinking delta，不计思考流式通过；无真实长回复 |
| W13 | **失败 WA01** | hold→停止，正文保留“已停止”；随后新输入进入队列但不请求Provider，>2分钟及刷新仍如此；Web无已暂停/继续入口。`web-after-stop-queued-idle.png` / `reload.png`；快照paused:true | 后端暂停是契约；失败在Web缺少恢复操作，未调用RPC resume解锁 |
| W14 | **失败 WA01** | 新会话选择fixture-error，实际HTTP400及invalid-request红色反馈；切回fixture-main再发仍只排队，普通Provider计数不增。`web-provider-error.png`、`web-after-failure-queued.png`；快照paused:true | 工具失败分支未全面覆盖；模型错误显示通过、可恢复交互失败 |
| W15 | 未覆盖（部分已验证） | FIXTURE_TOOL真实运行pwd并write_file；result.txt内容Fixture result；Worked过程、改动卡+1/-0及用量360tok正确；源码另确认相对“查看结果”不放行href；该安全规则未完整交互验。E W15/W17 | read/search/todo/explore/HTML/安全外链/代码复制无对应fixture响应；不能以官网复制代替Web |
| W16 | 未覆盖（部分已验证） | 选择Plan/Agent/Chat；模型fixture-main→alternate，Provider实际model变更；用量显示input100/output20/费用未知；Esc退出模式弹层。`web-mode-390-dark.png`；E W16及W08 | fixture模型不提供可选推理档位；不能伪造推理能力 |
| W17 | 未覆盖（部分已验证） | pwd待审批，允许后真正执行；连续Bash拒绝显示Denied/未执行并聚焦输入；审批刷新卡仍在、允许继续完成。`web-approval-390-dark-visible.png`；E W17-refresh | fixture未产生command_prefix建议，前缀授权/重复免审未覆盖；按钮处理失败/竞态未覆盖 |
| W18 | 未覆盖（部分已验证） | 自有Host37632退出→“已断开正在重连”、输入disabled且草稿保留；原数据46741重启自动在线、输入启用。另网络offline期间release完成，恢复后结果一次完整呈现。`web-reconnect-before.png` / `offline.png` / `after.png`；E W18 | Host进程退出时是idle；运行中验证的是网络中断，不混写为运行中进程恢复 |
| W19 | 未覆盖（部分已验证） | CLI吊销本次Revoke Acceptance Only设备，UI立即回连接页提示重新配对；刷新仍连接页。`web-device-revoked.png`；E W19 | maintenance / RECOVERY_BLOCKED无合法可控现场，不伪造Host状态 |
| W20 | **失败 WA02** | 1440/390浅深查看列表、详情、新建、设置；模式菜单390深色；审批宽浅/窄深；页面scrollWidth=clientWidth。截图`web-session-*` / `web-new-*` / `web-settings-*`；390运行按钮50×30，低于规范44×44 | 非所有状态做完整四格交叉；系统字体/真机安全区未测；小目标不推断真机误触发生 |
| W21 | 未覆盖（部分已验证） | 生产SW activated/controller有效；manifest standalone及四图标HTTP200；offline刷新外壳可开并显示断开，缓存只有5静态资源+根HTML，无会话/RPC。`web-pwa-offline-shell.png`；E W21 | headless无系统安装入口/安装终态，standalone启动未覆盖 |
| W22 | 通过 | 临时第二构建sw等待installed；提示“有新版本”，草稿仍在；用户点刷新后新缓存接管、旧缓存移除；最终在线/工作区/历史/草稿稳定。`web-pwa-update-ready.png`、`web-pwa-update-final-stable.png`；E W22-before/after/final-stable | 用真实SW registration.update()促发检查，非伪造产品store；不据中间after截图判通过；未验OS安装应用升级 |
| W23 | 未覆盖 | 无iPhone Safari/Tailscale/有效公网证书现场 | 主屏幕/安全区/软键盘/锁屏1分钟/真机重连全保留 |
| W24 | 未覆盖 | 未使用用户真实模型凭据 | fixture成功不能代表真实Provider成功 |

## 官网 V4 逐点结果

同样仅为**工程 UI**。三主题请求经当前设计核对，S24按light-only执行；不存在的深色切换不当失败。

| 点 | 状态 | 已执行步骤、结果及证据 | 未覆盖子项 |
| --- | --- | --- | --- |
| S01 | 通过 | reload后1秒间隔记录16帧：读/Skill/子Agent/编辑/审批/测试/压缩/面板依次点亮，终态9/10，Browser Use未使用；实际看图。`site-hero-t0/t4/t8/t12/t15.png`，E hero-samples.json | 只证明官网演示 |
| S02 | 通过 | hover编辑说明；关编辑→8/10、无改动、3测试失败文案；恢复后正常。补验从页面连续Tab进入编辑插件，`:focus-visible=true`且说明“编辑·直接修改文件，改动进入Review”可见。`site-edit-off-complete.png`、`site-plugin-keyboard-tooltip.png`；E S02-keyboard-tooltip | 无原生CU |
| S03 | 通过 | 关终端后无运行测试且明确“终端已关闭”；恢复；未用Browser Use切关前后feed不重置。`site-terminal-off.png`；E S03-unused-toggle | 无原生CU |
| S04 | 未覆盖（部分已验证） | scroll离开首屏后feed稳定停止；返回重新从读取开始，无串帧。E S04-off-stable/return-restart | headless后台页visibility无真实系统前后台现场；未伪造document.hidden |
| S05 | 通过 | deliverables全貌→三点自动出现；hover跨周期暂停，点击固定/解锁；三点稳定图框对应改动/交付/用量。补验连续Tab进入首要点，4.1秒保持on；Tab离开到文档链接后恢复全貌再开始第1点。`site-deliverables-stable0/1/2.png`、`site-keyboard-deliverables.png`；E S05-S09-keyboard-deliverables | 无原生CU |
| S06 | 通过 | trajectory三点准确聚焦时间线/调用结果/失败停止，自动/hover/pin。补验Tab首要点4.1秒保持，Tab离开后全貌→第1点恢复。`site-trajectory-stable0/1/2.png`、`site-keyboard-trajectory.png`；E S05-S09-keyboard-trajectory | 无原生CU |
| S07 | 通过 | approvals审批卡/前缀/权限菜单三点准确，自动/hover/pin。补验Tab首要点4.1秒保持，Tab离开后恢复全貌及轮播。`site-approvals-stable0/1/2.png`、`site-keyboard-approvals.png`；E S05-S09-keyboard-approvals | 官网资产，不证明Web前缀成功 |
| S08 | 通过 | context明细/趋势/事件三点准确，portrait框可见，自动/hover/pin。补验Tab首要点4.1秒保持，Tab离开后恢复全貌及轮播。`site-context-stable0/1/2.png`、`site-keyboard-context.png`；E S05-S09-keyboard-context | 无原生CU |
| S09 | 通过 | space名册/分派/留下Actor三点准确，自动/hover/pin。补验Tab首要点4.1秒保持，Tab离开后恢复全貌及轮播。`site-space-stable0/1/2.png`、`site-keyboard-space.png`；E S05-S09-keyboard-space | 示例不证明Space运行时 |
| S10 | 通过 | 五块分别原图decode、Esc退出且焦点恢复，尺寸依次2460×3210、2820×2280、2280×1410、1320×3426、3180×2400。补验五块逐一打开后在背景位置实际wheel650，scrollY各自保持1646/2462/3152/4366/5879；关闭按钮均退出并恢复触发焦点。`site-*-original-loaded.png`；E S10-scroll-lock-close | 无原生CU |
| S11 | 通过 | Harness实际观察0→1→2→3→4→5，标签“示意·尚未上线”；工具文档落“让Agent新增工具”。`site-harness-1/3/6.png`；E S11-harness-full / internal-links | 不把示意当已上线 |
| S12 | 通过 | 八能力卡、快速开始/产品理念、三个方向、上下文/轨迹/工具文档/更新17个去重内部href逐一点击；标题匹配、hash目标存在；GitHub新标签加载目标仓库title。E S11-S12-S22-internal-links / S12-external-final | 非站内每个链接全站扫描 |
| S13 | 通过 | 390菜单展开→文档导航后收起；再次展开Esc关闭，焦点回“菜单”。`site-mobile-menu.png`；E S12-mobile-menu / S13-Escape | 无原生CU |
| S14 | 通过 | 1440左目录/右TOC，1100复制迁移，390折叠目录；TOC稳定落点与当前项正确。补验390“模式与输入”代表目录行342×44；该页4行三模式表格390宽342、1440宽856，页面均无横溢，已看图。`site-docs-navigation-390.png`、`site-docs-table-390.png` / `1440.png`；E S14-representative-row/table | 代表性目录行及一个既有表格页；不声称全站逐页、每个目录行/表格均检查 |
| S15 | 未覆盖（部分已验证） | 文档复制页面后真实clipboard1452字符、正文起止正确；命令行第一个代码块复制3行精确内容且独立“已复制”。E S15-copy-page/代码复制 | clipboard拒绝/不可用错误分支未触发 |
| S16 | 通过 | 代表性正文图片：docs首页2880×1800、blog首图2053×1109，原图decode，关闭按钮退出且焦点恢复；更新页本轮无img/video。`site-prose-original-docs.png` / `blog.png`；E S16-prose-image | 仅声明两个代表位置，不声称全部正文图片逐张验 |
| S17 | 通过 | 分类OR及清空11篇已验；补验分类summary折叠后checkbox不可见、展开恢复；Tab进入上下文工程复选框，Space选中结果1篇，再Space取消恢复11篇。E S17-collapse/expand/keyboard-check/uncheck | 仅代表一个复选框验证键盘共性 |
| S18 | 通过 | 两分类+搜索Bash为2篇AND；zzzz-no-match为0且明确空态；清空后恢复。E S18-AND/empty | 无原生CU |
| S19 | 通过 | 筛选Bash保持时日期升降排序，Home/End/Esc已验。补验trigger ArrowDown展开，选项ArrowDown到最早/ArrowUp到最新，再Enter选择最早并关闭；ArrowUp重开后Tab关闭并到分类summary；再打开点击外部搜索框关闭，选值保留。E S19-arrows-enter/tab/outside；`site-blog-filter-sort-list.png` | 无原生CU |
| S20 | 通过 | 带分类/关键词切列表，2篇与最早排序保持，列表有摘要；回网格恢复；实际点文章、标题/元信息无重叠；复制分享clipboard为当前URL。`site-blog-article-1440.png`及三尺寸布局图；E S20/S21-share | 封面视觉仅代表当前显示卡片 |
| S21 | 通过 | roadmap三方向状态、6未完成/22完成；切完成初始6，加载更多12且还10；390/1100/1440布局可读。`site-roadmap-1440.png`及layout；E roadmap-complete/more（日志名S22） | 未反复加载全部22条，但当前分页增量正确 |
| S22 | 通过 | 首页真实跳`updates/#release-2026-10-18`；补验锚点约16ms显示release-target运行且底色alpha0.7，约1367ms淡出alpha0.546，2.6秒后透明且无活动动画；稳定y84。`site-release-highlight-start.png` / `end.png`；E S22-highlight-timing | 当前更新页没有img/video，不推断视频能力 |
| S23 | 通过 | 不存在路径显示产品404，点返回ActSpace首页成功。`site-404.png`；E S23-404及后续导航 | 无原生CU |
| S24 | 通过 | 首页/docs-cli/blog/文章/roadmap/updates各390/1100/1440共18布局截图已看图，scrollWidth均=clientWidth；dark OS首页仍theme/light、color-scheme light、纸色rgb242,241,237且可读。`site-layout-*.png`、`site-system-dark-reduced-motion.png`；E S24-layouts/S24-S25 | 官网不提供三主题开关；未声称暗OS六页逐张复验；1100高度实际900 |
| S25 | 通过 | reduced-motion首页终态、五截图still全貌、Harness phase5、博客排序动画集合为空；补验更新锚点初始及400ms后animation:none、动画集合为空、透明背景、位置直接y84且scroll-behavior:auto。`site-release-reduced-motion.png`；E S25-release-reduced | 仅浏览器媒体偏好模拟，无OS设置交互 |

## Bug 记录

### WA01 / P1 — Web 没有暂停提示和继续入口，停止或失败后只能继续排队

**实测事实**：停止会话`2b1967e2-087f-4312-909d-42eab602b5cd`在hold流中点击停止；原正文保留并显示已停止。再发送`after stop normal`后只有队列，没有新的Provider请求，等待超过2分钟、release、刷新均不启动。独立失败会话`2361da85-9ecf-4c3c-a2fc-dcd46939ea35`实际HTTP400，切回正常模型后`normal after failure`同样排队。正式`tasks.command snapshot`只读结果两者均`paused:true`且各一个queue task；没有通过RPC resume恢复。

**影响**：在Web停止或遭遇模型失败后，用户看不到暂停状态及继续控制，正常输入也无法让该会话继续工作。新会话正常，故不是Host/Provider整体不可用。

**契约与源码定位**：当前`docs/design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md:23`明确“发送新输入不解除暂停”。`packages/agent-service/src/run-manager.ts:79`停止先pause，`:121` paused时kick返回；`task-projection.ts:68`非completed finish也pause。Web `use-composer.ts`只有tasks.submit，未接入paused/continue。这些用于支持定位，不把后端暂停本身当Bug。主智能体确认Desktop有已暂停/继续发送对照，但不列作本子任务原生证据。

**证据**：`web-after-stop-queued-idle.png`、`web-after-stop-reload.png`、`web-after-failure-queued.png`；E `WA01-observed`、`WA01-after-reload`、失败后记录、`post-restart-task-snapshots.json`。具体修复方案仅为推断：Web需要消费paused并提供与正式resume契约一致的用户入口；本轮未实现。

### WA02 / P2 — 窄屏审批按钮点击区域小于触控规范

**步骤/事实**：390×844、深色，正常Agent发送`FIXTURE_TOOL approval visible narrow`，待审批后滚动使卡可见；“运行”button实际DOM边界`x316,y616.1875,width50,height30`。规范`front-web-pwa客户端规范.md:289`要求可点区域≥44×44。功能点击成功，不属于审批请求失效。

**定位**：`apps/web/src/pages/session/ApprovalCard.tsx:62–64`的拒绝/允许直接使用`PillButton`；`apps/web/src/styles/web.css:155–168`默认height30，xs26；`PillButton.tsx`为直接button+onClick，没有扩展hitbox。源码与浏览器几何共同确认，未推断真机已发生误触。

**影响/证据**：手机场景审批目标偏小，违背本项目明确触控要求。`web-approval-390-dark-visible.png`、E `W20-approval-visible`。其他小按钮可能共用样式，但未据此扩报全部位置。

## 未覆盖边界与清理

- 原生Chrome Computer Use：全部49点CU-B01，不能将工程结果改称原生验收通过。
- 没有iPhone/Tailscale/有效证书/系统PWA安装现场，没有真实模型凭据；W23/W24未覆盖。SW/manifest/离线/更新的工程证据不替代主屏幕安装、锁屏或系统独立窗口。
- Web前缀建议、推理档位、Markdown复杂工具组件、maintenance、创建失败等未具备现成可控fixture，逐点明确保留。源码存在不能替代交互。
- 官网补齐本次指定可执行残项后，只保留S04真实后台visibility、S15 clipboard拒绝/不可用分支未覆盖；部分子项已有证据的点仍计未覆盖。S14为一个代表目录行与一个既有表格页，未声称全站逐页验证。
- 未修复或委派修复任何产品问题；正式测试汇总由主智能体报告，本分报告不将单测数量当UI覆盖。

| 自有资源 | 处置 |
| --- | --- |
| Host | 原37632、重启46741、临时发布47117均为本任务CLI；结束停止；最终lsof确认49615/8768/49592/49593无监听，E cleanup.json已记录 |
| Site | 初次pnpm父37633 / Astro监听38080已停止；补验父51817 / 监听51828结束后停止，最终8768无监听 |
| Provider | 49592 / 49593调用各自close，释放hold及连接 |
| Browser / RPC | 独立Chrome调用close；正式HostClient关闭；未创建成功原生Chrome标签 |
| 8765 | 未停止、未复用、未操作 |
| 文件 | 仅本报告；本次tmp与screenshots保留为本地忽略证据，不清理/移动其他目录；无源码/测试/旧DOCS改动 |
