# 近期功能统一验收过程

日期：2026-10-18。基线：`main a13f8a1ee10eed387da575d80ac000cc844f2bff`，开始时工作区干净。

## 任务边界

用户要求在当前聊天完成两项工作：近期功能验收，输出验收文档和供后续统一修复的 Bug 文档；DOCS 只检查并提出更新/清理/桌面备份计划。主智能体和子智能体均不得修复产品 Bug、修改正式测试、删除或迁移既有 DOCS、提交或推送。

验收范围取 2026-10-11 至 18 日合入 main 的 Context/SQLite、审批与前缀授权、侧栏与默认工作区、轨迹与流式、统计/用量、交付卡、模型设置、搜索抓取、Web/PWA、官网 V4，并保留相关旧验收边界。

## 规划与执行

1. 读取仓库协作、架构、核心理念、前端验证与计划/执行记录约定；检查当前 HEAD、状态、近期合并、设计规范与旧验收。旧结果仅用于确定范围，没有直接记为本轮通过。
2. 按 AGENTS 模型要求，分别委派 `gpt-6.1-sol` 负责 Desktop 与 Web/官网交互验收；先逐项列验收点与预期，再列复用状态的场景路线。主智能体负责工程门禁、DOCS 检查及汇总。
3. 原生 Computer Use 创建 Chrome 标签返回 `unsupported Codex auth method: apikey`。已向用户说明浏览器认证限制；Web/官网改用独立 Playwright 浏览器做工程 UI 验证，不能记为原生 CU 通过。Desktop 按本轮 appId 定向获取成功，已观察真实 Electron 和隔离工作区，继续原生 Computer Use。原生 AX/截图调用约一分钟的耗时属于工具成本，不当作产品响应延迟。
4. 运行 Desktop 依赖闭包、renderer、Electron、CLI 构建。Web 首次构建因本地 `node_modules` 缺失无法启动 tsc；用 `pnpm install --frozen-lockfile` 恢复依赖，manifest 与 lockfile未改；随后 Web 与 Site 构建成功（Site 46 页）。依赖准备失败与产品缺陷分开。
5. 使用仓库现成 `scripts/acceptance/agent-refactor/fixture.mjs` 创建全新隔离 Desktop 数据/工作区和 synthetic Provider，启动 `pnpm dev:log`。实际 app 身份来自本轮 `[dev-runtime]`，不使用用户已有数据。Web 子智能体自行创建独立回环 HTTP Host、Provider 与浏览器 context。
6. Desktop 全量测试 1,928 通过、7 跳过；Web 95、Site 23、Client 26、Host 55、Web tools 19、Tools runtime 38、Shell tools 75 通过。主题/token/bridge/IPC 门禁通过；Desktop typecheck 和 Site check（51 文件，0 errors/warnings/hints）通过。补充 Context/Runtime/调度与 Host 进程级检查后，去重总计 2,454 通过、1 失败、7 跳过，详见验收汇总；失败独立重跑，不重复计数。
7. DOCS 使用 NUL 分隔 Git 清单检查全部 41 个 HTML，区分 33 个 Demo 与 8 个学习/工具 HTML；运行 `pnpm check:docs` 发现 17 处失效引用。输出独立清理计划，本轮不执行。
8. Web 工程 UI 复现停止/失败后同会话新消息停滞，合并 WA01；只读追到队列暂停和 Web 缺恢复入口的链路。Runtime 补充测试 55 通过、1 项 tool-composition 超时，独立重跑仍超时，登记 ENG01。Host 进程 7、Agent service 33、Tools approval 1 通过。
9. Desktop 原生开发服务器模式 AX 观察约一分钟，子智能体引用历史线索建议切固定构建。通过原生正常退出本轮隔离 app 后，停止拥有的 dev runner，以相同 data/workspace/CA、相同 appId 启动现有 `scripts/run-electron-dev.mjs apps/desktop/dist-electron/main/index.js`，不设置 Vite URL；源码和构建内容未修改。后续原生验收继续。
10. 固定构建的原生读取恢复约0.27秒。原生观察停止后暂停队列且有“继续发送”，据生命周期契约不报 Bug；Web 缺恢复入口仍记 WA01。前端规范说普通发送即恢复与当前后端契约冲突，补 DOC13。使用统计首读0条经只读核对为缺一次性 USD 清空标记时自动设置当前基线，非子智能体误点重置；对应产品政策在模型费用规范117行，保留边界并检查新请求。
11. Desktop 在首次用量基线后新增真实受控请求，原生 Usage 显示 1 请求、120 Token（输入100、输出20、费用未知），分类、搜索清空和24小时刷新一致。Web 工程 UI 观察两种暂停故障、隔离 Host 断线重连和离线外壳；第二生产构建更新后最终稳定在线，历史、工作区、草稿保留。官网五块截图的15个聚焦态和多断点按独立台账记录，不作为 Desktop 业务路径通过。
12. Web/官网49点按完整验收点记18通过、3失败、28未覆盖（其中26点有部分实测证据），原生浏览器CU另记49点受工具认证阻断。Web窄屏审批按钮测得50×30px，低于规范44×44且无扩展命中区，登记WA02；Desktop约482px支持窗口内Composer/Context左侧越界，关闭重开可重复，登记DA01。两者均未修复。
13. Web子智能体关闭本轮独立Chrome、HostClient、Provider、Host和Site preview；最终端口49615/8768/49592/49593无监听，清理记录在本地 `tmp/codex-acceptance/20261018-web-site/cleanup.json`。未触碰未知8765进程。DOCS候选31个原件再次核对SHA-256全部一致，拟桌面备份目录仍不存在。
14. Desktop子智能体原生CmdQ退出隔离app，主PID44933消失；固定构建runner会话10145退出码0。主智能体使用既有fixture stop命令关闭本轮Host/Provider/代理，fixture.json的stopped=true，端口49493/49494/49496/49497均无监听，保留日志和隔离数据。随后仅补既定官网键盘与动画残项，使用独立preview，不重启Desktop或Web Host。
15. 最终台账复核发现若干既定子项仍可通过当前环境直接执行，因此继续补齐，不改变验收范围：官网键盘/滚动锁/锚点时序；Desktop空Context、侧栏5条边界/拖拽、审批跨会话、模型开关/返回及一次进程重开状态。Desktop通过既有resume恢复同一fixture，supervisor52786/Host52787；同数据和固定构建启动runner64930。前段清理记录保留为阶段事实，不代表此时已无验收进程；最终清理另记。
16. 官网指定残项全部补齐，未新增Bug：五块截图分别键盘聚焦暂停/离开恢复；五原图背景滚动锁定与按钮退出；分类键盘及排序完整组合；锚点高亮时序/reduced-motion；代表目录44px与表格页无溢出。最终官网23通过、2未覆盖，Web/官网合计30通过、3失败、16未覆盖。补验preview父51817/监听51828及独立Chrome均关闭，端口再次无监听。
17. Desktop补齐空Context、7条会话的5条折叠边界/展开、待审批跨会话、模型开关/编辑返回与键盘、搜索清空/折叠。正常退出PID52836后runner64930退出码0，再以同隔离数据启动runner12378：停止部分正文重开后单份保留且可输入，全权限/自动模式会话隔离保持，归档与手动排序设置保持。原生拖拽未观察插入反馈或排序变化，仅保留未覆盖，不无证据报Bug。
18. 补验结束原生CmdQ退出，runner12378退出码0；主智能体再次执行既有fixture stop。最终fixture.stopped=true，Desktop及Web/Site本轮8个测试端口均无监听。清理记录追加于 `tmp/codex-acceptance/20261018-recent/engineering/cleanup.json`，证据不删除。
19. 最终Desktop37点为14通过、1失败、22未覆盖；与Web/官网按各自方法合计86点为44通过、4失败、38未覆盖，其中28点含部分证据。逐点行数与汇总交叉核对一致。最终 `pnpm check:docs` 仍为17处既有失效引用，没有本轮报告错误，原始输出在 `engineering/docs-final-check.log`；新增报告链接和尾随空白检查、`git diff --check`通过。HEAD未变、跟踪文件diff为空、Git仅新增本轮7份Markdown，31个Demo原件哈希不变、桌面备份目录未创建。
20. 用户随后授权使用已有真实Key，通过Computer Use补验。先列R01–R08和5条路线；指定`gpt-6.1-sol`原生检查发现旧安装包0.1.0缺近期搜索项且无commit可核对，未在旧包发送请求。正常退出旧包，主智能体启动当前HEAD固定构建，沿用应用管理的真实连接，专用临时工作区与业务代码分开；没有读取、解密、复制原始Key。
21. 实际默认模型为`deepseek-flash`。只在3个新测试会话发送真实请求，完成Thinking OFF/ON、正文/轨迹/Context/数值对账、安全Bash单次决策/前缀复用及隔离、文本文件交付、真实TextEdit/Finder。合法`/tmp`别名工作区两轮漏改动卡记DA02；另建物理路径测试工作区继续单/多文件卡和第N轮Review，不以对照通过抵消原失败。
22. 原生临时启用DeepSeek搜索/抓取并隔离原来源，工具返回真实IANA结果与Example Domain；恢复原智谱/Tavily组合再查询，来源标签和返回结果可见。设置全部恢复并经CmdR核对。真实有限长输出已观察13→47行增长，但停止点击墙钟未保存、native调用耗时38.30秒；白名单日志显示自然completed，不能判断停止有效或失败，R07保留部分未覆盖。短恢复消息自然执行一次、刷新历史无重复。
23. ON轮历史轨迹的思考/正文/模型/Token正确，但首Token/生成/TPS均不可用，登记DA03。只对本次测试journal比较当前compiled历史精简和源码轨迹builder：完整日志可得前两轮924/527ms TTFT，精简历史丢已定稿chunk后为null；属于只读工程复现，未修复。真实补验最终4通过、2失败、2未覆盖，累计5个产品Bug。初轮86点历史数字保留，不机械提升重叠整点。
24. 原生Chrome `getApp`一次成功读取既有页面，但无已建立的本轮真实Provider Web Host路线，未操作旧标签或转存桌面Key，R08未覆盖；tab API原认证限制与native可用性区分。原生CmdQ退出本轮dev，应用清单确认退出，runner52129退出码0。测试文本与证据保留，未修改既有业务会话、产品源码、正式测试或既有DOCS。
25. 最终复核：`pnpm check:docs`仍为同17处既有失效引用，没有新增报告错误，输出保留于`engineering/docs-real-final-check.log`。8份新增Markdown的本地链接全部存在、无尾随空白，`git diff --check`通过；HEAD仍为验收基线，跟踪文件及暂存区diff均空。31个候选Demo原件哈希全部一致，桌面备份目录未创建。初轮8个测试端口再次确认无监听。仅对白名单3个新测试会话复核32次模型请求及正常end-seed，数值摘要保留于`engineering/real-provider-final-facts.json`，未导出旧消息或凭据。
26. 为补齐仍可执行的R07，再启动同HEAD固定构建runner19669，仅在canonical测试会话发一次有限长请求并记录真实停止点击区间`05:22:06.953–05:22:12.905Z`。后台`05:22:13.004Z`queue/pause、`05:22:13.430Z`turn/end aborted、`05:22:13.628Z`run/finish cancelled。新短请求先进入已暂停队列，显式resume后只执行一次，已知用量16864Token（含16640cache、8output），停止轮usage未知，未伪造为0。刷新后prompt/部分正文/恢复回复均单份。原生AX曾与截图不一致，重新绑定后恢复一致；无证据归为产品卡死，不新增Bug。R07通过，最终补验修订为5通过、2失败、1未覆盖；累计产品Bug仍5个。
27. 本次定向补验未改Thinking或全局设置，原Thinking on再核对后原生CmdQ，runner19669退出码0。最终3个测试会话共34次模型请求（含取消轮），各有正常end-seed；已知应用预估费用合计约USD0.020408，不包含取消轮未知费用，也不等同服务商账单。脱敏数值摘要更新于`engineering/real-provider-final-facts.json`，停止/恢复时间线位于`engineering/real-stop-timed-audit.json`。此前32次和4/2/2属于阶段事实，以此处及最终逐点表为准。

## 交付位置

- `desktop-acceptance.md`：Desktop 逐项验收、方法与局部证据。
- `web-site-acceptance.md`：Web/PWA 与官网逐项验收。
- `real-provider-acceptance.md`：已有真实Key授权后的原生CU补验，单独统计8点。
- `acceptance.md`：汇总台账及工程验证结果。
- `bugs.md`：后续统一修复文档；记录复现与复验条件，不执行修复。
- `../20261018-docs-audit/cleanup-plan.md`：DOCS 漂移、Demo 清单、old → new 映射及备份/验证计划。

截图与临时工程证据仅在本地保留，不随仓库分发。初轮受控模型只用于验证UI/IPC/工具路径；后续真实Provider成功以补验实际证据为准，应用费用估算仍不等同实际账单。
