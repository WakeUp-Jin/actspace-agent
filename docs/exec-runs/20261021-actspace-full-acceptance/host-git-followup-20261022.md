# Host / Git 独立补批次（2026-10-22）

仅验收，不修改产品。证据根目录：`tmp/codex-acceptance/20261021-actspace-full-acceptance/host-git-followup-20261022/`。浏览器使用现有5173 renderer及共享隔离Chrome44325的新context；Electron只用固定dist和原验收目录专用profile。真实Electron/CDP属于实际renderer交互，非native AX；IPC种子不代签原生文件选择器。

验收点：

- P2-D02：实际重复目录和路径别名添加UI，列表与当前会话绑定保持一致。
- 15-A8：旧`actspace:remote-models`启动后迁移且删除，保留远端模型选择。
- 13-A6：empty新建/设置、streaming切换/队列、long-session滚动/历史、approval-pending允许/拒绝、remote-host状态/设置操作；未实现mock成员的reject按边界记录。
- 10-B1：现有browser fixture进入轨迹并检查complete深色数据及详情。

操作分组：先复用五个mock URL连续实际操作并保存关键DOM/截图；再用独立Electron profile检查目录添加及旧偏好重启迁移。已有Git路线不重复。结果以逐项终态记录为准。

## 执行记录

现有`?mock=empty`已实际加载，显示暂无会话、actspace-demo、本机及deepseek-flash；`mock-empty-initial.png`仅为入口证据，不单独判通过。

| 编号/场景 | 步骤 → 预期 → 实际/状态 | 证据 |
|---|---|---|
| 13-A6 empty | 设置→外观→深色→返回→输入草稿→新建会话；主题切换、输入和导航可用。实际发送按钮启用，未发送真实模型；通过已执行交互。 | mock-empty-settings-dark.png、mock-empty-draft-new.png |
| 13-A6 streaming | 打开运行会话→输入→加入队列→短会话→返回；实际看到运行状态、流式正文，最终出现排队输入及mock回复。通过发送/往返；未逐个验证引导/撤回/删除，不以mock代签真实队列调度。 | mock-streaming-queue-return.png |
| 13-A6 long-session | 尾部第36–40轮→滚到顶部→短会话→返回→顶部第1–5轮及代码块；通过。mock一次返回全部历史，不证明真实分页。 | mock-long-session-top.png |
| 13-A6 approval-pending | 拒绝→显示已拒绝；reload恢复待审批→设置返回→运行→显示命令已在mock执行。允许/拒绝交互通过；并未执行rm或真实工具。 | mock-approval-deny.png、mock-approval-allow.png |
| 13-A6 remote-host | GPU历史显示离线→设置列connected/offline/revoked→GPU重新连接变已连接→移除旧笔记本成功；通过mock管理交互。devbox模型等待及机器读取失败明确提示Mock bridge does not implement hosts.call，是文档边界；远端工作区/模型/文件不代签。 | mock-remote-offline.png、mock-remote-reconnect-remove.png |
| 10-B1 | 以complete/dark URL进入轨迹→6轮fixture→请求#1→选项/用量/计时→切换实际时长。真实显示Journal工具、失败/压缩/取消/缺timing/运行消息，data-theme=dark，背景rgb(24,25,22)，详情可操作；通过该fixture路线。 | trajectory-complete-entry.png、trajectory-request-detail-dark.png、trajectory-timing-tab.png、mock-final-dom.txt |

## Electron补批次终态

- 15-A8 迁移子项通过：专用profile首次启动后装配旧localStorage（fixture种子），正常关闭并重新启动固定dist。`actspace:remote-models`变null，远端会话记录保留legacy-model-session，Host新建页保留legacy-model-new，本机旧条目未迁入。证据migration-before.json/migration-after.json。这是跨进程真实renderer启动迁移；无配对Host，目录与模型UI实际远端选择仍未覆盖。源码旁证main.tsx启动调用及target/use-model-catalog.ts:72。
- P2-D02 重复目录：实际点击侧栏添加工作区，Electron主进程dialog.showOpenDialog返回值以隔离目录fixture装配；同一路径仍只有一项。该子项通过产品UI后续/真实IPC/磁盘注册，未覆盖原生目录选择手势。
- P2-D02 symlink别名：同样点击添加并返回workspace-alias（指向workspace）；UI与workspaces.json新增第二项，当前新建页选择别名，reload仍保留两项。两路径realpath相同。证据electron-duplicate-workspace.png、electron-alias-workspace.png、electron-alias-after-refresh.png、workspaces-after-alias.json。仅记录事实交主审判断，与原生目录选择器可能返回canonical路径的行为区别保留。
- 原生目录添加未覆盖：CUA的com.github.Electron存在多个运行路径；显式仓库Electron.app仍绑定另一个已有设置窗口，而不是本次PID。没有对该窗口输入或点击；自己的实例只由CDP操作。没有用IPC种子冒称native AX。

补核词法别名`workspace/../workspace`：同样UI添加后仍两项（原workspace与symlink项），没有新增第三项；`workspaces-after-lexical-alias.json`。源码workspace-registry-service.ts:264仅resolve路径，与symlink未归并的事实一致。

## Site补充与P2-E01独立探索清单

主审追加有限路线：本地官网主页Demo实际交互；媒体缩放/退出；P2-E01固定5–10分钟独立探索。点位为重复开关菜单、快速取消/返回、空搜索/长中文、两路由往返及刷新。分组：本地首页Demo→首页原图媒体→桌面mock独立探索；仅使用本次新context。

- P2-S01主页Demo子项通过：现有固定官网44318/actspace-agent/，实际点击读取文件/编辑插件，aria-pressed翻转（编辑false→true），启用数变化至6/10；点击交付文件说明tab，active状态切换。页面无video/audio播放或暂停控件，按交互Demo签收，未声称播放媒体。site-demo-plugins-on.png、site-media-closed-demo-tab.png。
- P2-S01媒体子项通过：点击第一张查看原图打开dialog，实际图片2460×3210已加载；关闭图片预览回首页，第二张查看原图→Escape退出，URL保持首页。site-media-open.png。

## P2-E01独立探索终态

实际窗口为2026-10-22 03:22:17.198Z–03:29:39.599Z，442.401秒（7分22秒），18条分组动作记录，不把前面mock验收重命名。`exploration-actions.json`含逐步时间/正文/页面异常。通过该有限探索会话：视图菜单打开/Escape四次；空查询与空格、长中文查询与无匹配查询、Escape恢复；设置→外观/模型→返回三轮；新建页工作区/运行位置菜单；700字中文草稿经设置往返保留；480px菜单取消三轮且scrollWidth=480；刷新后窄侧栏可展开，切时间分组；归档过滤及恢复默认；设置刷新返回默认会话，重新进入设置再返回。监听pageerror为0。

观察边界：radio筛选后菜单保持打开，需Escape；改视图后触发器可访问名称变为“视图选项（已改动）”，原精确定位失败；刷新mock会重新装配默认场景和应用路由。没有将这些自动化定位/内存fixture边界登记产品Bug。截图explore-long-chinese-search.png、explore-long-draft-return.png、explore-final-return.png。

## 本批次清理与剩余边界

自己的Electron11976、13239、18923均app.close正常关闭，最终ps无残留；本次独立Chrome context已关闭。未启动新的Provider/Host/Vite/Site/SSH；共享Chrome44325、renderer5173、Site44318及用户dev61739均未动。cleanup-final.json。

本批次已执行终态：15-A8字段启动迁移通过；P2-D02同路径/词法别名为chooser种子后的UI/main链通过，symlink按原始路径形成独立身份仅观察；13-A6五场景均实际交互，streaming引导/撤回/删除未逐个验，不签全部队列功能；10-B1完整深色fixture真实进入并操作通过；P2-S01 Demo和原图打开关闭子点通过；P2-E01有限独立探索通过。

外部前提仍未覆盖：原生目录选择器需能明确绑定本次Electron进程的系统UI工具；真实远端模型显示需有效配对Host（不属于本次离线迁移）；mock的hosts.call/preview/download缺实现边界不代签真实远端；无播放/暂停媒体控件。未修产品、未重建、未改用户profile、未提交或部署。源码旁证与IPC种子和真实UI明确分列，主coverage由主审回填。

## 有限收尾批次清单（追加）

验收点：P2-D03侧栏真实HTML5拖拽、持久化及时间/工作区快速切换；P2-D14专用仓库未提交修改/可撤销冲突、最近一轮及上游比较；R21提交弹窗键盘Escape回焦；P2-D15跨会话/工作区终端归属及保留shell时正常退出无孤儿；P2-D19复用正常退出/启动核对历史。分组：侧栏→Review/Git→终端与重启。只复用desktop-git专用profile与目录、固定dist，不提交产品。新增证据在同目录closeout/。源码确认HTML5 drag、Review范围/提交按钮及before-quit disposeAll入口。

### 收尾进展：侧栏、Review与协议

- P2-D03新增通过子项：真实Electron/CDP locator.dragTo走HTML5拖拽，isTrusted的dragstart/drop/dragend可观测，B/A变A/B；reload仍A/B，localStorage手动账本一致。按时间→按工作区→单列表→按工作区，组内A与另一non-git会话快速往返均可打开。closeout/sidebar-drag-grouping.json、sidebar-after-drag.png、sidebar-grouping-return.png。会话种子通过公开sessions.create，不冒称新建UI。
- R21通过该子项：真实提交或推送菜单→弹窗，自动焦点INPUT→填写但不提交→键盘Escape关闭，activeElement回提交或推送BUTTON，Enter重新打开菜单；HEAD不变。closeout/review-commit-escape.json、review-commit-escape-return.png。
- P2-D14冲突子项通过查看：仅专用Git创建临时fixture分支与提交，再merge生成UU closeout-conflict.txt；真实Review显示<<<<<<< HEAD/ours/=======/theirs/>>>>>>>，不是空diff。closeout/conflict-disk-before.json、review-conflict-real.png、review-conflict-dom.txt。随后merge --abort并切回原branch/HEAD，readme恢复，git-restored.json记录clean。没有产品提交或远端推送。
- P2-D14最近一轮入口：本次IPC种子空会话显示Last Turn is unavailable for this session及暂无变更，未代签真实修改轮次。上游入口可打开但列没有设置远程跟踪分支，结合磁盘main [origin/main]和公开API事实保留既有WB-BRANCH-01，不据初始loading签收。review-upstream-entry.png、review-branches-public.json。
- 附加workspaceId-only协议：目标ws_git_fixture_committed已注册，空闲会话cb3e6404-89b2-4b61-ae2b-23bf257f4409当前non-git；仅传id真实reject workspaceRoot is not registered，after仍non-git；显式恢复root返回ok。closeout/set-workspace-id-only.json，事实已交主审。

### 有限收尾终态：终端、重启恢复与上游比较

- P2-D03 侧栏：通过所执行子项。真实 Electron/CDP `dragTo`触发trusted HTML5 dragstart/drop/dragend；拖动会话后reload保留顺序。按时间→按工作区→单列表→按工作区连续切换，记录的列表分组与顺序随视图变化，A/B/C会话快速切换后仍可打开。不是原生AX/原生拖放验收。closeout/sidebar-drag-grouping.json、sidebar-after-drag.png、sidebar-grouping-return.png。
- P2-D14 未提交与冲突 Review：通过查看子项。真实Review的“未提交”范围显示专用Git仓库`readme.md`的修改；专用分支merge产生的`UU closeout-conflict.txt`及冲突标记也在Review显示。之后`merge --abort`、切回基线分支并恢复readme，隔离仓库回到干净状态。closeout/review-uncommitted-dom.txt、review-uncommitted-real.png、conflict-disk-before.json、review-conflict-dom.txt、review-conflict-real.png、git-restored.json。
- P2-D14 上游比较：通过专用bare origin执行的分支比较子项。只在tmp fixture从`origin/main`建`codex/acceptance-closeout-upstream`，加一条本地测试文件并提交，未推送；磁盘确认ahead 1、`origin/main...HEAD`为0/1。实际Review→审查范围→分支选该branch后显示`→ origin/main`、`+1`及`review-upstream-fixture.txt`一行差异。最后删除全部`codex/acceptance-closeout-*`临时分支，恢复原`acceptance/new-branch`及基线HEAD。closeout/review-upstream-fixture-git.json、review-upstream-current.png、review-upstream-diff-dom.txt、review-upstream-diff.png、git-final-cleanup.json。
- P2-D14 最近一轮：未覆盖真实非空轮次。Review里选择“最近一轮”时目标种子会话返回“Last Turn is unavailable for this session / 暂无变更”；before-quit fixture记录该会话messages=0。未发起模型请求、未把IPC种子称为真实轮次。closeout/review-last-turn-empty.png、lifecycle-before-quit.json。
- R21提交弹窗：通过所执行子项。真实菜单打开弹窗后焦点在输入框；输入但不提交，键盘Escape关闭并回焦“提交或推送”按钮，Enter再次打开菜单。HEAD未变化。closeout/review-commit-escape.json、review-commit-escape-return.png。
- P2-D15终端归属与无孤儿：通过所执行子项。三个不同session各创建一个shell；A/B位于专用committed workspace，C位于non-git workspace。`terminal.list(sessionId)`分别返回各自terminal id；切换会话后回到A/B，输出marker仍可读，PID/CWD分别匹配两个测试目录。保留三个shell时对Electron调用正常`app.quit()`；主进程及3个shell和Electron helper PIDs在退出后均不在ps。源码旁证`apps/desktop/src/main/index.ts:309`在before-quit流程调用`terminalSessionService.disposeAll()`、`apps/desktop/src/main/terminal/terminal-session-service.ts:118`逐个dispose。证据closeout/terminal-ownership.json、terminal-a-return.png、terminal-b-return.png、terminal-c-return.png、lifecycle-before-quit.json、lifecycle-after-normal-quit.json。
- P2-D19历史恢复：部分通过，限会话/工作树元数据恢复。正常退出后用同一隔离profile和固定dist重新启动；旧worktree session仍在侧栏，`sessions.get`保留旧session id、title、worktree branch `actspace/63390151`及专用worktree root；打开该会话后UI显示会话标题。A/B/C的terminal list在重启后均为空，确认旧shell没有跨进程残留。该旧worktree fixture有0条消息、0轮，因此对真实对话历史/消息恢复仍未覆盖。随后第二次正常退出，新Electron与helper PID均消失。closeout/lifecycle-after-restart.json、lifecycle-restored-history-ui.json、lifecycle-restored-history-ui.png、lifecycle-after-restart-quit.json。
- 附加workspaceId-only协议：仍为已执行拒绝事实。对已注册目标workspace仅传workspaceId，真实IPC返回`workspaceRoot is not registered`，after的workspaceRoot保持原non-git；显式传回原workspaceRoot后返回ok。closeout/set-workspace-id-only.json。

#### 本批清理与边界

本批创建的Electron主进程57944、96949、2546及其helpers均通过正常退出关闭；终端shell PID 76265、78415、79052随首个主进程退出；三次退出后的逐PID `ps`查询均无残留，证据为lifecycle-after-normal-quit.json、lifecycle-after-restart-quit.json、lifecycle-review-quit.json。专用Git目录恢复到`acceptance/new-branch`/基线HEAD、工作树干净且临时`codex/acceptance-closeout-*`分支已删除。仅保留验收profile和原始证据于tmp；没有停止其它进程或服务。未执行原生辅助功能/原生拖放核验、非空真实模型轮次、GitHub PR或远端推送；本地Review比较已通过fixture bare origin完成，不代表GitHub PR流程。未修改产品、未重建dist、未动coverage、未提交产品。

## 有限可执行缺口批次（2026-10-22 追加）

验收点：R22跳转/选项浮层精确回焦；09-P4-4已有worktree暂停队列恢复并正常首轮完成、状态/来源悬停；P2-D14真实非空工具轮最近一轮Review及磁盘/Journal对账；P2-D15单终端关闭重开及正常退出清理；P2-D19/11-B1本轮worktree真实消息重启恢复。路线：恢复队列→受控write_file→Review焦点/最近轮次→终端→正常退出/重启。全部为固定dist真实Electron/CDP，非nativeAX；仅loopback synthetic Provider，无商业请求。证据目录`host-git-followup-20261022/finite-gap/`。

进展：真实UI点击“继续发送”后WORKTREE_FIRST_SEND正常完成（1轮1步）；状态行actspace/63390151 · 工作树，title属性“原工作区：committed · 基于 feature-fixture”。随后UI发送FIXTURE_REVIEW_SINGLE，Provider按公开write_file schema返回工具调用，真实工具在worktree写入acceptance-last-turn.txt，第二轮正常完成（总2轮3步），source仓库仍干净；Journal已复制证据。最近一轮Review实际显示Last Turn is unavailable for this session，保留设计接线边界，未签通过。R22：跳转打开INPUT；Escape及选择文件后均回BUTTON“跳转到文件”；选项切换自动换行保持菜单；Escape及刷新关闭后均回BUTTON“审查选项”。worktree-first-complete.json、worktree-tool-complete.json、worktree-tool-journal.jsonl、review-last-turn-nonempty.png、r22-focus.json。终端及重启结果待本批后续追加。

### 有限缺口批次终态（以下取代本节进展中的待验状态）

| 原编号 / 子点 | 步骤、预期与实际 | 终态与证据（均在 finite-gap/） |
| --- | --- | --- |
| R22 跳转浮层 | 真实点击跳转→输入框获焦→Escape；再次打开并选择 focus-review.txt。预期关闭后回触发按钮；两次 activeElement 均为 aria-label=跳转到文件 的 BUTTON。 | 通过本子点。r22-focus.json、r22-focus-return.png。 |
| R22 选项浮层 | 打开选项→切换自动换行，菜单保持；Escape关闭回审查选项 BUTTON。再打开→刷新，菜单关闭并回同一按钮。 | 通过本子点；既有 BUG-015 保留，不据此签 R22 整项。r22-focus.json。 |
| 09-P4-4 worktree首轮 | 打开既有 worktree 会话 c5e4acce-434e-49cb-8a19-128122437320，UI点击继续发送恢复暂停队列 WORKTREE_FIRST_SEND；loopback Provider正常回复，完成1轮1步。 | 通过恢复后的首轮完成子点。worktree-before-resume.json、worktree-paused-before-resume.png、worktree-first-complete.json、worktree-first-complete-hover.png。 |
| 09-P4-4 状态与来源 | UI状态 actspace/63390151 · 工作树；实际分别hover分支与工作树。DOM title分别为 actspace/63390151、原工作区：committed · 基于 feature-fixture；磁盘worktree list匹配branch及root。 | 通过状态行和title属性对账；截图不冒称捕获原生title tooltip或nativeAX。worktree-first-complete.json、worktree-first-complete-hover.png、worktree-origin-hover.png。 |
| P2-D14 真实非空工具轮 | UI发送 FIXTURE_REVIEW_SINGLE；tmp合成HTTP SSE Provider按实际 write_file schema回工具调用，真实Runtime执行写文件并正常结束。磁盘worktree新增 acceptance-last-turn.txt，内容 Controlled worktree first real turn. 加换行；Journal存在 tool/call、tool/result、turn/end；总2轮3步且无activeTurn。 | 工具轮及磁盘/Journal对账通过；不是注入消息或商业模型。provider.mjs、provider-requests.jsonl、worktree-tool-complete.json/png、worktree-tool-journal.jsonl。 |
| P2-D14 最近一轮Review | 在上述非空真实轮次结束后真实选择最近一轮，仍为 Last Turn is unavailable for this session / 暂无变更。 | 未通过该验收预期；当前设计接线边界。源码 review-git-engine.ts:229在无loadLastTurn时返回unavailable，runtime-v2/desktop-shell-ipc.ts:51未注入loader，设计 core-review-change-sources.md亦明确该限制。与原验收要求的非空最近轮次仍有差异，不报功能已通过。review-last-turn-nonempty.png、review-last-turn-nonempty-dom.txt。 |
| P2-D15 单终端关闭重开 | 同一worktree会话打开终端并用UI输入printf PID/CWD；终端1 id=05f92d46-2350-471f-a44e-ef07e78d6824、shell48780。点击关闭，短暂closing后旧shell消失；重开终端2 id=dcbb41ea-438d-458b-9ee0-ba5458252536、shell51884，CWD仍为worktree root。 | 通过本子点。terminal-close-reopen.json、terminal-before-close.png、terminal-reopened.png。 |
| P2-D15 正常退出 | 保留shell51884运行时正常app.quit，不强杀；主进程/helpers及shell均消失。重启后terminal.list为空。 | 通过正常退出无孤儿子点。first-normal-quit.json、restart-real-messages.json、cleanup-final.json。 |
| P2-D19 / 11-B1 本轮真实消息恢复 | 正常退出后同profile固定dist再启动，真实点击原worktree会话；UI显示两条user消息、两条最终reply、已编辑工具卡。projection保持2完成轮/3步，原6个message id及内容、worktree root/branch不变。 | 通过本轮worktree真实消息恢复；不证明旧版数据迁移，也不替代旧版树/预览/Review完整路线。before-restart-projection.json、restart-real-messages.json/png。 |

### Review / 文件树根目录有限复核（BUG-023，主审已登记）

最短复现：打开上述worktree会话并完成write_file→右侧Review选未提交→显示原仓库临时文件focus-review.txt；关闭重开Review、切普通Closeout A后再回worktree均相同。再打开工作区文件，文件树也列出focus-review.txt。该会话状态行显示工作树且sessions.get.workspaceRoot为 `desktop-data/worktrees/63390151/committed`，预期查看当前执行worktree的 acceptance-last-turn.txt；实际Review及文件树渲染props均为原 `desktop-git-20261022/committed`。公开API显式传source root返回focus-review.txt；显式传worktree root正确返回acceptance-last-turn.txt，二者磁盘内容互不混合。

证据：review-root-proof.json（会话root、文件树实际React props、显式root的两份API snapshot）、r22-review-context.json（磁盘状态）、review-reopen-switch.json（两次UI body）、review-source-tree-worktree-session.png。实际Review组件props也读取为source root；review-store.ts:84把input.workspaceRoot传给getSnapshot。未对IPC函数注入hook，API实际root由组件props、调用源码及匹配snapshot交叉核对；显式root API调用是只读旁证。未见Review独立工作区选择入口；当前源码 WorkbenchLayout.tsx:360向RightPanel传selectedWorkspaceRoot，App.tsx:392的summary则优先worktree root。建议后续统一当前执行root解析供Review/文件树使用并定向复验；本轮不修复。

### 本批终态、限制与清理

本批全部实际UI交互为固定dist真实Electron的Playwright/CDP，非nativeAX。Provider只监听127.0.0.1:53304，synthetic credentials，共3个受控completion请求（首轮1、工具轮2），无商业请求。仅tmp新增合成Provider和验收文件。09-P4-3按指令未重复。Last Turn loader尚未接通、Review/文件树root归属差异为本批保留缺口；旧版迁移、真实Host及原生系统授权不在本批覆盖范围。

清理完成：首个Electron31270及helpers31271/31272/31338、shell51884经正常退出全部消失；关闭单终端的shell48780已先退出。重启Electron53560及helpers53561/53562/53591再正常退出，逐PID ps无残留。Provider已close，lsof确认53304无监听。仅删除本批原仓库临时focus-review.txt，source git status为空；worktree保留验收产物acceptance-last-turn.txt（仅tmp未跟踪文件）和Journal证据。cleanup-final.json记录全部结果。未动其它Electron/服务、用户数据、产品源码/dist、coverage；未提交或推送。


## 队列、标题刷新与三轮同规模GC补验（2026-10-22 12:40起）

验收点先列：09-P2-2引导绿点/下一步读取、撤回队首、停止显式继续；14-A6真实标题输入编辑后刷新及移除工作区/徽标；14-A5同实例三轮各12次新建发送归档与同条件GC；顺路终端连续输出Ctrl-C/关闭重开清理。按队列→标题刷新→三轮生命周期→终端分组。固定主仓库dist、Playwright/CDP真实Electron，非nativeAX；新隔离profile/workspace，所有模型仅127.0.0.1:63320受控HTTP。证据前缀 `tmp/codex-acceptance/20261021-actspace-full-acceptance/host-git-followup-20261022/queue-memory/`。未改产品/dist/coverage，未商业请求。

| 原编号 / 子点 | 真实步骤、预期及实际 | 结果与证据 |
| --- | --- | --- |
| 09-P2-2 引导视觉 | HOLD运行中依次UI发送FIRST/SECOND/THIRD；引导第二条。SECOND显示在steering首行、下一步读取及6px绿点，computed background rgb(8,122,75)。 | 通过该子点；queue-steering.png、queue-result.json。 |
| 09-P2-2 撤回队首 | 引导前FIRST/SECOND/THIRD→引导后SECOND(steering)、FIRST/THIRD→点击撤回，等下一步读取DOM卸载后稳定为FIRST/SECOND/THIRD。规范front-中间消息区规范.md:376要求回队首，实际回原第二位。 | 失败，BUG-025由主审登记；queue-unsteer-front.png、queue-result.json。本轮仅执行一次该序列，无中途重启；不泛称必现。App.tsx:850仅designate runId:null，未重排；建议后续撤回实现显式prepend及顺序回归验收，本轮不修。 |
| 09-P2-2 停止继续顺序 | 点击停止后显示已暂停/继续发送，HTTP仅原HOLD；点击继续发送后实际HTTP按FIRST/SECOND/THIRD各一次、托盘清空。 | 显式继续/无重复通过；按撤回回队首语义的预期顺序仍失败。queue-paused.png、queue-drained.png、requests.jsonl。 |
| 14-A6 完整标题UI刷新 | 侧栏双击标题→真实input填QM UI Anchor，Enter；UI移除空workspace-b后再次双击改标题并Enter，reload。其后发送真实BASH_PAIR，两次UI拒绝，待审批从1到0；再次UI编辑为QM UI Anchor final badges cleared并reload。 | 通过本子点：workspace-b按钮0，hidden=true；新标题存在；队列托盘0、待审批徽标0。title-refresh.json/png、badge-waiting.png、title-badges-final.json/png。会话初始锚点已有真实排队并清空，不用IPC更名代签。 |
| 14-A5 同规模三轮 | 同PID3919/renderer4021，UI每次新建→输入QM LIFECYCLE n并发送→实际HTTP短回复完成→回锚点→hover归档；36个唯一会话均archived，36个真实请求。每轮12次，基线及12/24/36后HeapProfiler.collectGarbage+Runtime.getHeapUsage，记录app.getAppMetrics。 | 生命周期与采样通过；memory-samples.json含所有ID/逐会话归档与完成轮、PID/CPU/内存，lifecycle-after12.png、lifecycle-after36.png。 |
| 14-A5 收敛 | GC后usedSize字节11,216,324→14,841,984→15,492,544→15,760,920；轮增量3,625,660 / 650,560 / 268,376。 | 未覆盖收敛结论：增量缩小但末轮仍涨；有限三轮不能断言泄漏，也不证明稳定收敛。此轮新profile，与早先12次样本不是同一PID，不能拼成48次连续曲线。 |

终端与清理终态见下表，以下为本批最终结果。

### 本批终端补点与最终清理（12:45完成）

| 原编号 / 子点 | 真实步骤与实际 | 终态 / 证据 |
| --- | --- | --- |
| P2-D15 连续输出中Ctrl-C | UI创建终端f3d0859e…，shell27902；UI输入有限python循环（上限6000条，每条约530B，sleep5ms）。运行中writer28527，屏幕已到QM_OUTPUT_002654时实际Control+c；显示KeyboardInterrupt，writer消失、shell保留；接着UI printf QM_AFTER_INTERRUPT成功。 | 通过此受限macOS子点。terminal-output-running.png、terminal-interrupted.png、terminal-proof.json。不是所有平台/完整背压签收。 |
| P2-D15 活动关闭与重开 | 关闭第一个终端后terminal.list为空且shell27902消失；重开6175a83a…、shell31084。再运行第二个有限连续输出writer32384，在仍输出时点击关闭；terminal.list为空，31084/32384均消失。再次重开8c7ca0a2…、shell33562，UI打印QM_FINAL_SHELL成功，无旧输出混入。 | PTY进程与UI终端对象回收/重开通过。terminal-active-close.png、terminal-final-reopened.png、terminal-proof.json。 |
| P2-D15 订阅回收 | 行为观察为关闭对象移除、旧进程退出、重开无旧输出；源码TerminalRenderView.tsx:171–179在unmount设disposed、unsubscribe并dispose input/terminal。 | 运行时订阅计数没有公开观测接口，本批未直接度量0订阅；源码仅旁证，保留该精确限制，不代签完整订阅/背压验收。 |
| P2-D15 正常退出 | 保留最后shell33562时正常app.quit；主3919、helpers3958/3959/4021、各shell27902/31084/33562、writer28527/32384逐PID ps均无残留；回环Provider正常close，63320无监听。 | 清理通过；cleanup-final.json。没有强杀其它Electron/共享服务。 |

本有限批次终态：09-P2-2绿点/下一步读取与停止显式继续通过，撤回队首语义失败（BUG-025，单次序列，未重启重试）；14-A6完整标题UI刷新、移除后不回流及真实审批/队列清空通过；14-A5追加36会话同PID采样完成，末轮仍小幅上涨，收敛/泄漏均不作结论；终端中断/活动关闭/重开/正常退出通过所述子点。原生AX、所有平台、完整背压与直接订阅计数未覆盖，未额外探测或扩展。全部证据保留在queue-memory；产品/dist/主coverage/F9目录均未改，本批无提交推送及商业请求。


## 输入区、Select、窄屏统计与Review有限补验（2026-10-22 12:49起）

验收点先列：F2-02累计统计480px浅深；16-A4首次Enter节点及焦点；09-P1-1自动折行后逐字删至一字/空；09-P1-3 Plan/Chat主题色；16-A5快速唤起Select鼠标/键盘改值、重开及向上展开；16-A6b推理Select单层Esc；V02加号/运行位置互斥；V03 Chat Context与批注扩展；10-A3保持Review时外部修改自动刷新。按输入与模式→设置Select→480px统计→引用及Review分组。Playwright/CDP真实Electron（非nativeAX），固定主仓库dist；新自有ui-final/profile与workspace；所有请求仅回环127.0.0.1:64011。证据统一前缀 tmp/codex-acceptance/20261021-actspace-full-acceptance/host-git-followup-20261022/ui-final/。无商业请求、产品/dist/coverage改动。

| 原编号/子点 | 实际步骤与结果 | 终态及证据 |
| --- | --- | --- |
| 16-A4 首次Enter | 新Agent首次真实输入UI_FIRST_ENTER后Enter，受控HTTP回复结束。前、立即后、结束后三次均同一textarea且焦点保持；caret14→0；MutationObserver未观察textarea移除。 | 通过节点/焦点子点；first-enter.json。不证明逐帧paint无闪动或原生IME。 |
| 09-P1-1 连续输入删除 | 无显式换行228字pressSequentially，真实Backspace逐字删227次到一字，再删空；458个输入/rAF采样均同节点、聚焦、caret=end=len，异常0。高度114→34；满文stacked，一字仍stacked，清空inline。 | 通过该连续路线；long-continuous.json、long-wrapped.png、long-one-character.png。不是原生IME/全帧渲染测量。 |
| 09-P1-3 Plan | 已开始Agent从加号进入Plan，分别UI切浅深主题；chip浅色rgb(122,80,10)/bg(247,238,219)，深色rgb(226,186,107)/bg(62,50,28)；发送箭头黄底浅(145,96,14)/深(210,161,77)。 | Plan浅深通过；mode-colors.json、plan-light.png、plan-dark.png。 |
| 09-P1-3 Chat | 合法新空会话从加号进入Chat，浅深chip分别绿字绿底；浅色发送按钮绿色。深色稳定复核chip与发送按钮均rgb(54,199,131)，chip底rgb(25,58,43)、箭头rgb(16,33,25)。首次theme切换即时采样的白底是过渡态，不作稳定结论。 | 通过浅深稳定主题；chat-light.png、chat-dark-stable.json/png、mode-colors.json。chat-dark.png为早期过渡采样保留，不用于通过依据。已开始Agent无Chat入口属于ComposerPalette设计边界。 |
| 16-A5 快速唤起 | 通用页底部原值自动选择第一个项目；鼠标改指定工作区；键盘ArrowUp/Enter恢复自动；切外观再回通用仍原值。底部打开listbox data-side=top，rect底717<触发器顶723.19<viewport760。 | 通过本Select子点，原值已恢复；quick-select.json、quick-select-up.png。Radix打开时trigger被aria隐藏，键盘发送至page而非隐去trigger。 |
| 16-A6b 推理Select Esc | 自有profile通过公开modelConnections.create准备官方DeepSeek模板、loopback URL和synthetic key，catalog deepseek-flash支持推理（不请求该模型）。实际UI展开模型→默认思考高→打开关/低/高/最高→Escape。Select关闭、值高，模型编辑仍展开且焦点回默认思考按钮。 | 通过真实启用Select单层Esc；reason-select-escape.json/png。不是LLM推理质量验收。原custom fixture-main推理禁用，未强制改DOM。 |
| F2-02 480px累计浮层 | 480×867实际viewport，在浅深分别点击累计模型用时与累计token统计；4个dialog均在viewport内、scrollWidth480，内部点击保持打开，Esc关闭。模型统计rect(8,680,300,137)，用量rect(62,653.5,300,163.5)。 | 通过4个实际浮层；stats-480.json及stats-{light,dark}-{activity,usage}.png。 |
| V02 互斥 | 加号已打开时运行位置trigger被popup遮挡，不强点；焦点定位trigger后实际Enter切运行位置，再反向Enter加号。两次aria-expanded均只一个true。 | 键盘实际触发互斥通过；overlay-mutual.json。该原地合法场景无disabled选项，禁用项导航子点不适用此场景；未代签所有位置。 |
| V03 Chat Context | Chat真实发送UI_CHAT_CONTEXT并完成，状态行显示1轮1步、120tok、Context2%；点击Context打开真实用量dialog，无Agent分支/位置/审批行。 | 通过Chat可观察部分；chat-context.json/png。 |
| V03 批注扩展 | Agent完成回复上真实鼠标拖选ixture complete→添加到对话→输入评论并Enter保存→hover 1条批注；卡片显示原选文和评论，空输入时composer保持stacked。 | 通过草稿批注可观察部分；annotation-reference.json/png。没有通过IPC注入批注，也未声称发送恢复/全部引用组合。 |

### 本有限批次终态（13:02正常清理）

| 原编号/子点 | 真实步骤、实际与范围 | 终态/证据 |
| --- | --- | --- |
| 10-A3 外部改动自动刷新 | 自有Git workspace Review保持未提交打开，初始暂无变更；外部fs写review-watch.txt新增alpha，790ms UI自动出现文件/+1/内容；不点击UI再外部改beta并增第二行，791ms UI自动显示新内容/+2；磁盘git diff对账一致。恢复baseline后无需点击自动回暂无变更，git status为空。 | 通过该真实本机Review子点；review-auto-refresh.json、review-before.png、review-auto-first.png、review-auto-second.png。不是工作树/远端/所有平台签收。 |
| V03 引用结束 | 卡片内真实点击删除第1条批注后，空输入composer由stacked返回inline。 | 草稿引用扩展/收缩可观察部分通过；annotation-reference.json/png及本记录；未发送批注，不代签其历史恢复。 |
| 09-P2-3 新增可选提示 | 本批两个会话均完成、无pending队列；收到Tab/focus-within附加请求时没有可复用队列状态。 | 该键盘子点本批未覆盖，未新增队列模型轮；可选VoiceOver不作为全部队列键盘阻塞，明确要求读屏的其它编号仍独立未覆盖。 |
| 恢复与清理 | 通用快速唤起UI重读自动选择第一个项目，磁盘general.shortcuts.quickOpen.target.kind=automatic；外观UI恢复跟随系统（未另读Chromium持久化storage）。正常app.quit，随后Provider.close；45868/45881/45890/45923逐PID ps均absent，64011无监听，专用workspace git status空。 | 清理通过；restore-before-quit.json、cleanup-final.json、request-scope.json。未创建终端；未强杀其它进程。 |

本批有限终态：F2-02、16-A4、09-P1-1、09-P1-3、16-A5、16-A6b、V02互斥、V03所述Chat/草稿引用、10-A3均完成所列实际子点；未发现需新编号的稳定故障。V02没有可用禁用项的当前场景不适用该子点；原生AX/IME、逐帧闪动、所有引用组合及发送恢复、所有平台/远端Review未覆盖。本批仅2个真实短会话与其自动标题（总4个回环请求），官方推理模型仅准备用于编辑Select，未向它发请求；无商业调用。所有自有本批进程/服务关闭，证据保留ui-final；产品/dist/主coverage与其它验收目录均未改，无提交推送。


## 09-P2-3真实队列键盘有限补验（13:07–13:12）

验收点先列：两条真实UI排队；Tab进入首行图标及两行按钮；计数/时机提示与focus-within透明度；停止/删除清空；可近复用的V03图片附件扩展/删除收缩。按HOLD→队列键盘→停止删除→附件→退出分组。沿用ui-final自有profile/workspace与固定dist，Playwright/CDP真实Electron，非nativeAX；仅回环64011，无商业请求。证据仍在本节上方ui-final目录。

| 原编号/子点 | 实际步骤、预期与实际 | 终态/证据 |
| --- | --- | --- |
| 09-P2-3 Tab队列图标 | 回环Provider HOLD，UI新建发送QUEUE_TAB_ANCHOR，等真实流式waiting；UI连续Enter发送FIRST、SECOND，DOM两行。初始焦点textarea、两行操作区opacity0.6；从侧栏新建按钮设键盘起始锚点（仅此程序focus），实际Tab23次进入首行role=img，aria-label为2条排队/当前运行结束后依次发送；首行:focus-within=true且opacity1，第二行0.6。 | 通过实际Tab到图标及计数子点；queue-tab-focus.json、queue-tab-lead.png。未向队列节点程序focus。 |
| 09-P2-3 行内按钮 | 接着真实Tab依次首行引导/删除1/更多1、第二行引导/删除2/更多2，最后textarea。焦点所在行opacity1，另一行0.6；离开两行均回0.6。每行引导/删除/更多共3按钮，均enabled。 | 通过focus-within/按钮键盘顺序子点；queue-tab-focus.json、queue-tab-second-row.png。VoiceOver按本轮指令不做，不作为此子点阻塞。 |
| 09-P2-3 初始反向尝试 | textarea上Shift+Tab12次仍留textarea、操作区0.6；随后使用侧栏键盘起始锚点成功Tab到队列。 | 保留观察，不将此反向输入行为代签通过，也不扩大为独立Bug；backwardAttempt在queue-tab-focus.json。 |
| 09-P2-3 队列清空 | 实际点击停止Agent，出现已暂停；UI删除第二条后再删除第一条，最终托盘卸载；第二条删除后的即时采样仍是更新前两行，未取得稳定1条计数，不代签中间计数。HTTP仅anchor与自动标题，FIRST/SECOND未发出。 | 通过停止/删除清空；queue-tab-end.json、queue-tab-requests.jsonl。无残留队列。 |
| V03 图片展示与收缩 | 在内存生成48×32PNG，用合成ClipboardEvent提供数据，真实Composer paste handler调用公开dialogs.importComposerImage并写自有tmp，真实渲染background-image预览与移除按钮。空输入inline→图片后stacked；hover缩略图使删除按钮可操作，实际点击删除→无附件、inline。 | 通过数据准备后的真实渲染/删除可观察子点；attachment-expand.json、attachment-expanded.png、attachment-removed.png。不是系统剪贴板、原生drag、选择器或16-A3；未发送图片。 |

本批工具边界：首次误用不存在main.cjs入口导致启动等待，未进入应用；仅自有PID90890经SIGTERM清理，后使用已确认package入口。附件截图后的未hover删除尝试等待导致node_repl超时/内核重置；重连自有Electron CDP核对附件仍在，正常hover后点击删除完成，没有force或产品改动。回环服务64011随该内核重置结束；原64922预备服务已显式close。最终通过主进程inspector安排正常app.quit，非强杀验收主实例。

清理终态：93970/93975/93976/94007以及错误启动90890逐PID absent；64011/64922均无监听，专用Git状态空；没有创建PTY。queue-tab-cleanup.json、queue-tab-normal-quit.json。保留tmp附件产物与证据，不动用户profile/其它进程、产品/dist/coverage，不提交推送。

### 最终台账精确边界补注（不新增执行）

- 14-A3 提交结果未知：真实receipt时序未构造，属于本轮未执行场景，不是设备限制。
- P2-D19 运行中/审批中正常重启：本轮未执行，应与已验证的完成消息恢复分开；Dock入口属于原生UI另未覆盖，不能将两者合并写成全环境阻塞。

本有限补批完成，不追加其它路线。


## P2-D19 运行/队列与审批正常退出重启有限补验（13:15–13:27）

验收点先列：A 真实流式回复且另有一条真实排队时正常退出，重启核对部分正文、终态、队列暂停/显式继续、消息及Task ID、HTTP重复；B 真实无害命令审批pending时正常退出，重启核对卡片/详情/徽标、命令未执行和UI拒绝是否仍有入口；14-A1复用A样本实际renderer reload逐ID/正文对账；16-A7仅现场存在流式轨迹停止hover时顺带检查。分组为A流式/队列→正常退出/启动→显式继续，B独立计数器→pending→正常退出/启动→详情，最后A reload与退出清理。

方法与依据：固定现有dist，自有ui-final/profile，新副本restart-p2d19/workspace（注册ws_restart_p2d19）；Playwright _electron.launch/CDP真实Electron，非nativeAX。仅受控HTTP 127.0.0.1:64011，无商业请求。先核对front-中间消息区规范377–378：停止后暂停、Host重启需手动继续、Reload不重复提交；agent-target-runtime-architecture44–50规定正常shutdown排空/关闭；approval-broker.ts8/41/43在abort返回deny/aborted；工具预览规范130只从历史恢复最终事实态，不猜测pending。证据根：tmp/codex-acceptance/20261021-actspace-full-acceptance/host-git-followup-20261022/ui-final/restart-p2d19/。

| 原编号/子点 | 真实步骤、预期与实际 | 终态/证据 |
| --- | --- | --- |
| P2-D19 A运行中正常退出 | UI新建会话1372d658-901d-46e6-ab11-769f8de46a1c，Enter发送P2D19_A_STREAM_ANCHOR，回环HOLD产生真实可见部分文本Fixture streaming; waiting for release；再Enter排队P2D19_A_QUEUED_ONCE。app.quit走正常before-quit并等close，再以同profile启动。原部分文本保留、显示Stopped，activeTurn/Step均null；没有后台续发。 | 通过该单次正常退出场景；a-before.json、a-stream-queued.png、a-restarted-paused.json/png。不是强杀/崩溃/Dock或所有Provider签收。 |
| P2-D19 A队列及去重 | 重启同会话，原排队项仍在，显示已暂停/继续发送。重启前后只有HTTP1自动标题/2原正文；实际UI点继续发送，仅新增HTTP3排队正文，完成后托盘卸载。排队Task 8492868c-998d-45ab-a73f-dcb13ab665ab、submission b0887703-6940-4a81-bbc4-67c90edaa961在重启前后相同；只有一次accept及恢复后一次claim，后成为同ID用户消息。原用户3103c8dc-af19-432c-83d3-f6bf594a836e保留；部分assistant 68e27fed-fd1d-46cb-990d-c69f64455c1e持久化，完成assistant acce10e9-aee9-44bb-8f57-4fab5ef236ef各一条。 | 通过暂停/显式恢复/本样本不重复；a-resumed-complete.json/png、id-counter-proof.json、requests.jsonl。 |
| P2-D19 B准备失败边界 | 初次fixture用shell重定向写计数器，硬规则直接BASH_COMMAND_DENIED，没有进入pending；计数器0。随后只改tmp合成Provider脚本，改为单命令python3 专用counter.py并要求no_sandbox，真实工具执行链转入审批。首次失败不计产品故障，也不代替pending验收。 | 准备边界已记录；b-preparation-attempt.json、provider.mjs、provider-valid-command.mjs。 |
| P2-D19 B审批中正常退出 | UI新会话4c28de25-bd59-4700-b9f4-bc7ca15de3a3发送FIXTURE_RESTART_APPROVAL_VALID，真实bash fixture-8进入等待确认，UI有拒绝/运行及侧栏待审批；request64ac4c34-f0ea-495a-8310-805a200500bf。此时正常app.quit，再同profile启动。pending由1变0、待审批徽标消失；展开Worked for25s及Denied行，命令/人工审批/aborted详情可见，工具callId仍fixture-8、run27367359-a143-4f11-8184-b8b33ef8afcc，state=denied，failure=APPROVAL_DENIED/aborted，回合Stopped。counter始终0，HTTP仍7标题/8工具，无重放执行。 | 通过当前设计的正常关闭取消及最终历史恢复/未执行子点；b-pending-before.json/png、b-after-restart.json/png、b-denied-detail.png、id-counter-proof.json。真实工具schema及审批，合成Provider不代签LLM理解。 |
| P2-D19 B重启后UI拒绝 | 原pending在正常shutdown时已按broker取消，重启没有pending卡片、拒绝按钮计数0；可查看最终Denied详情，不能再UI拒绝同一请求。未伪造旧审批或重发替代。 | 本请求的重启后UI拒绝不适用当前正常退出生命周期；不能签收“跨正常退出仍pending可拒绝”。若要求该行为须先明确恢复契约；本批不讨论/修改设计。Dock/native及强杀恢复仍分别未覆盖。 |
| 14-A1 本样本reload | A完成后两次尝试Meta+r；第二次设置文档marker核对，marker仍在，不能声称键盘重载通过；随后实际page.reload/CDP重建文档，marker消失，UI两用户/两assistant含原partial和完成正文恢复。四条messageId/content逐项完全相等，Journal seq33→33，当前Provider记录2→2（7/8），全日志仍1–8，无新请求。 | 通过真实renderer reload/本样本ID正文去重；a-cmd-r-reload.json/png（文件名沿用尝试，JSON明确最终为page.reload）。⌘R原生快捷键与所有历史规模未覆盖。 |
| 16-A7 流式轨迹停止hover | 附加请求到达时A已完成、B已正常取消，现场没有正在流式的轨迹停止入口；未新增模型轮构造。 | 未执行此hover子点；不以普通停止按钮或历史详情代签。 |

本批只执行A一次、有效B一次；另有B准备命令被硬规则拒绝一次。无产品Bug新增：当前正常退出取消审批与源码/生命周期一致。原先“P2-D19运行/审批正常重启本轮未执行”补注由本节所述原子结果更新，不能泛化全部P2-D19完成。

清理终态：三次启动均正常app.quit并等待close；最后Provider.close。逐PID核对14757/14768/14769/14800/16986/17015/17016/17027/21515/21542/21543/21663均absent，64011无监听；专用计数器仍0，未创建PTY。cleanup.json保存原始进程/端口结果。保留自有profile/副本仓库与证据，无商业调用，产品/dist/coverage未改，无提交推送。

### 14-A3真实提交结果未知：只读可行性核对（13:30；未执行新故障）

本机公开链是preload/index.ts14原样ipcRenderer.invoke → fixed-renderer-ipc.ts247–283 → runtime-registry.ts206–210 submitTask。gateway109–135只有submit异常/unknown才用同一submissionId再核对一次；App354–378激活时若任务快照已有该ID直接清记录，否则才回填草稿。当前本机没有公开receipt门控；CDP网络离线不拦Electron IPC，Provider中断已晚于Task接纳。单纯reload/renderer中断：若接纳已落盘，重启查询清记录；若未进入submit，仅是提交前中断；两者不能稳定证明真实unknown。故不随机强杀/试竞态、不hook/伪造preload、不注入localStorage，不将旧存储恢复代签。

可行安全入口（设计判断，未执行）：现有fixture.mjs102–115真实TLS/WebSocket代理可按tasks.submit JSON-RPC ID，观察Host真实接纳receipt后确定性扣留/切断回应，同时控制gateway同ID第二次核对；记录真实request/receipt/Journal并用自有暂停调度避免模型请求。现fixture只有offline/uploadError，没有该receipt gate；Desktop有效Host仍缺既有SecurityAgent可访问前提。本批未新增代理代码或服务、未请求模型。该项仍是“真实receipt时序未构造”，不是泛称设备限制；后续需专用fixture传输门控及安全有效Host才可稳定执行。14-a3-source-feasibility.json保留源码路径、限制与未执行声明。


## P2-D08 独立目录授权/撤销 UI 有限核对（2026-10-22 13:35–13:37）

验收点先列：①审批卡是否有独立 subtree 目录选择；②当前 Session Grant 是否有查看/撤销 UI；③仅在入口存在时，通过真实 UI 验证目录授权后同子树复用、树外再审批拒绝、撤销后重新审批。分组为源码入口核对→全新隔离实例真实读取审批→设置/工具页核对→拒绝与正常退出。未扩大到其它权限。

方法：固定主仓库现有 dist；Playwright _electron.launch/CDP 真实 Electron，非 native AX。全新 permission-p2d08/profile 和 workspace，只复用自有合成模型配置，唯一启用连接指向动态回环 127.0.0.1:50219，凭据为合成值。tmp Provider 按真实 tool schema 返回 read_file 调用；真实 Runtime/审批链和 renderer UI，合成回复不代签模型理解。证据根：tmp/codex-acceptance/20261021-actspace-full-acceptance/host-git-followup-20261022/ui-final/permission-p2d08/。

| 原编号/子点 | 真实步骤、预期与实际 | 终态/证据 |
| --- | --- | --- |
| P2-D08 subtree 入口 | UI textarea Enter 发送 D08_DIRECTORY_ENTRY；真实 read_file 读取 workspace 外、仍在自有验收根的 outside/subtree/probe.txt。后台 pending request 47a520d8-8ff2-4103-9a21-e4abf519dd8b 同时包含 exact 与 subtree 两个 Runtime 建议，但实际卡片只有拒绝、本会话允许、允许；本会话允许的 title=This file only，没有目录范围按钮、展开器或选择菜单。 | 当前 UI 无独立 subtree 授权入口，目录选择子点未覆盖/当前实现不支持；approval-boundary.json/png、exact-session-hover.png、requests.jsonl。不是 Runtime 无建议或工具环境限制。 |
| P2-D08 撤销入口 | 真实打开设置及工具页；导航只有通用/外观/远端 Host/模型/搜索与网页读取/工具/子 Agent/使用统计/归档/更新。工具页只有工具启停、Bash 执行前确认、浏览器高级设置和显示写入变动。源码全 renderer 搜索无产品 revokeGrant 消费者或 Session Grant 管理 UI；仅 mock handler 有 revokeGrant。 | 当前可达界面无独立撤销管理入口；settings-boundary.png、tools-settings-boundary.png、after-deny-and-settings.json、renderer-grant-search.txt。未将公开 revokeGrant IPC 调用代签 UI 撤销。 |
| P2-D08 复用/树外拒绝/撤销后再审批 | 前提要求实际 UI 选择 subtree 和撤销；本批入口均不存在，因此不通过注入 suggestionId 或伪造 DOM 绕过，不重做已验 exact/revokeGrant 协议。不签收同子树复用、树外再审批或撤销后重新审批。 | 未执行这些依赖 UI 的原子点；缺口是产品当前 UI 入口，与设备/商业凭据/Host 无关。 |
| P2-D08 安全收尾 | 实际点拒绝，pending 1→0；UI user-denied 后正常结束，HTTP 总计3（标题、工具调用、拒绝结果后的完成）。probe.txt 始终为原 canary，未签发任何 session grant、未调用 revokeGrant。 | 通过本样本拒绝清理；after-deny.png、after-deny-and-settings.json、cleanup.json。只读样本不能推广写入/删除无副作用。 |

源码与规范差异（只记录）：ApprovalParts.tsx:120–124 明确筛 exact，注释“目录树授权……不在审批卡上暴露”；:187–196 的 ApprovalActions 只渲染三按钮。ToolLogLine.tsx:31 将该 exact 建议用于文件读取；filesystem-read/src/plugin.ts:59 实际生成 subtree candidate；desktop-bridge/contract.ts:117 存在 revokeGrant 协议。相对地 agent-tool-permission-model.md:460–461 与 completed/session-scope-grants.md:239 仍描述显式展开“选择目录范围”和当前 Session Grant 查看/撤销。因此本批不把这两个 UI 承诺签收通过。建议记录为规范/当前实现待对齐，由主审确定问题归属；本批不修产品、不讨论方案。

清理终态：64571 主进程及 64579/64580/64618 子进程正常 app.quit 后逐 PID 全部 absent；Provider.close 后 50219 无监听，ps/lsof 原始输出均空（exit1）存 cleanup.json。无 PTY、无用户/其它实例操作；保留证据与专用 profile，产品/dist/coverage 未改，无商业请求、提交或推送。本有限批次结束。

补充源码边界：workbench/PermissionModeControl.tsx:7/13–83 的状态行盾牌菜单只有 default/auto-review/full-access 三种模式，调用 setPermissionMode；没有 Session Grant 列表或撤销项。此菜单本批未实际展开，不代签该交互；当前撤销入口不存在结论由全 renderer 消费者搜索与上述可达页面证据共同支持。

## 最终边界只读审计（2026-10-22；未新增验收执行）

范围：仅重读 coverage.md、原计划 §8、既有专项报告和必要源码；不启动 Electron、Browser、Provider 或其它验收服务，不产生新 UI 通过结论。下表的“下一步”只是最小未执行原子步骤，不是本批已授权执行结果，也不增加全协议/全排列的额外门槛。失败行的已知 Bug 只阻塞对应行为，不能代替其它尚可执行子步骤。

| 编号 | 真实剩余子步骤与已有证据边界 | 前提类别 | 最小下一步（本批未执行） |
| --- | --- | --- | --- |
| P2-D16 | 每页可达已有；模型连接/字段、五用途、外观/快捷键与工具保存/正常重启已有，自动审批启停行为、部分非法值/取消也已验。仍缺快速连续修改后的最终值，以及未验设置的代表性非法输入、取消与正常重启后行为。不能把“全部非法值/取消/重启组合”当无界笛卡尔积要求。BUG-018 的第二次 Esc 和 BUG-024 的归档子项不阻塞其余操作。 | **普通可安全执行、尚未逐项操作**；有效 Host 另受已记录 SecurityAgent 前提限制，不能泛化为全部设置不可测。 | 在自有 profile 选尚未验、实际存在的可编辑设置，记录原值，快速改两次，按其实际保存/取消语义与正常重启核对最终值和行为，再恢复；无输入框的页面不虚构非法值。 |
| R01 / P2-R01 | **R01 已通过**，coverage:152 是新建本机→真实发送/流式/正常结束无重复；不能与 coverage:75 的 **P2-R01 数据可靠性**混用。P2-R01 仍缺异常配置迁移后的降级 UI/原事实保护及有明确来源的旧版本历史兼容。Journal 损坏/截断副本、租约防重、旧 SQLite 重建、59 Journal 哈希与附件正常重启已验，不应重列未做。 | 异常配置：**安全副本场景尚未构造/执行**；旧历史：**需冻结的对应旧版本样本及期望映射**，当前新数据不能替代；并非所有可靠性缺工具。 | 先在独立副本构造一项当前 SettingsStore 明确支持的失败输入，核对 load error/降级及源字节；旧历史先列具体版本与样本，再做单次加载/恢复对账。 |
| P2-D11 | 时间线/筛选/参数结果 Schema、历史/子轨迹、精确 Context seq734、真实 request101 的 TTFT/生成/吞吐已有。request100 的 TTFT=1ms、吞吐“时长过短”不是“无事实”。真正缺 timing/firstToken/usage 的模型消息在 UI 如何显示仍未验。 | **已有限寻找但未取得匹配样本**；特殊数据前提尚未构造，不是 CDP/设备不可用。 | 先只读筛现有错误/中断样本是否确实缺相应事实；找到后开其详情对账。若只能用合法旧 Journal 副本或合成 fixture，必须标该方法，不冒称真实 Provider 计时。TimingFields.tsx:33–58 已有不同缺失分支，源码不能代签 UI。 |
| 09-P5-2 | coverage:142 仍列“工作树首轮状态、模式 chip”缺口，但本报告:96–97 已有真实首轮完成、状态/来源 title、磁盘 root/branch；本报告:151–153 已有逐字删除、Plan/Chat 浅深 chip/箭头；模型报告:128 已有 Chat 进入/运行/退出 placeholder，cu-electron:203 有 Plan placeholder。剩余为这些新证据的正式规范逐处对照、原规范明确而未留证的具体文案/状态/键盘，以及有效远端事实；不能继续笼统写本机子点未操作。 | 本机对照：**既有证据可只读补对照**；未验具体交互：**普通可执行未操作**；有效远端/原生读屏：**各自已记录前提限制**。 | 先用新证据补 spec-crosscheck 对照清单并列精确未验句/状态；只对剩余原子交互安排定向检查，不重跑本机工作树首轮或浅深 chip。BUG-023 仍保留失败事实。 |
| F1-01 | reliability:23–27 已证明当前构建 SettingsStore 对 v1–v4 真实文件迁移/备份/二次 load 幂等及 layers1→2 清理。尚缺完整 Electron 首启呈现、附加 Key 退役/计费规则对应字段及用途映射的 UI/启动链对账；不能把已有文件迁移重说未做。 | 大部分为**可安全准备但尚未执行的独立迁移 fixture**；真实旧 OS 加密凭据另需对应合法样本/可访问密钥服务，当前服务级测试没有验证它，也不能自动声称已被 SecurityAgent 拒绝。 | 复用测试 v1–v4 副本，加入附加 Key/用途/计费的已知旧字段，独立 profile 启动→UI/备份对账→正常二次启动；不读取用户 Key。runtime-v2-settings-migration.test.ts:103–146 可作 fixture 结构依据，不能代签实际启动。 |
| F1-10 | 台账“加载态矩阵仍缺/已添加仅 mock”已落后：模型报告:111 是真实延迟 2.5s 的正在获取、Enter/Space/Tab/Esc；:129 是真实添加后再次获取的已添加/checked/aria-disabled。仍缺**键盘完成添加**和**目录 fallback 来源 UI**，以及原规范所称不同连接类型尚未验的入口；不要求每个商业服务实连或无界全协议排列。BUG-007 的 Esc 回焦不阻塞前述子步骤。 | 键盘添加：**普通可执行未操作**；fallback：**已尝试错误分支但匹配 fixture 尚未构造**，并非外网/商业凭据阻塞。 | 使用隔离回环的成功探测但无模型列表、且有 catalogProvider 的官方模板，实际打开来源提示；另以 Tab/Space/Enter 完成一次添加并清理。model-connections-service.ts:140 明确 !ok 返回 none；:159–163 才是成功无列表时 fallback，因此 HTTP500 不是有效 fallback 构造。 |
| T1 | 已有第5篇 8,724 汉字正常完成，不能写“从未达到8k–12k”。但该达标篇的开始前/流式/结束/闲置30/120秒完整同阶段采样不齐；后批四篇最后一条已全文对账，其余最终 DOM 未逐字对账。后批第三轮开始采样还发生 evaluate promise GC 失败，改 ps 只覆盖部分阶段。 | **部分步骤已执行但采样不完整**；本机采样/对账可执行。再造真实长输出需既定可用模型服务及允许的调用预算，不能以合成短回复替代真实长负载。 | 先看已有达标篇原始时间戳能否补齐；不足时只需一条有真实目标规模的受控验收窗口，按 §8 采样，不无限凑请求。完整逐帧文本比对不是 §8 新增硬门槛。 |
| T2 | 三轮 A→B→A 与滚动已在 performance:108 通过；停止/暂停/显式继续也已有单次。仍缺**同会话连续三轮各满足长规模、各轮专项**与同阶段资源；后批 7015/6095 汉字未达目标，第一篇停止+续写是两消息，不能合成一条；第三轮开始样本缺失。36个短会话 GC 不代替此路线。 | **普通路线尚未完整执行**；真实长输出前提同 T1。不是系统权限阻塞，也不因 BUG-014 自动跳过。 | 按固定三轮清单只补缺失阶段/专项，保留每轮规模、PID、时间及停止/继续事实；不得拼接不同 PID 或把一次停止泛化三次。 |
| T3 | 100轮/1000工具、四次更早页、近期虚拟化、Context/Usage、reload与真实第101轮已有；另275明细/100路径是独立会话，不能合并称同一100轮会话。仍缺首次与重复查询的完整同阶段耗时。 | **普通只读 UI 测量尚未执行**；现有自有长历史 fixture 足够，不需要新模型调用、Host 或原生 AX。 | 重开自有固定历史，分别计时进入、早期/近期切换、Context 原文/路径与 Usage 筛选/刷新的一次冷/一次重复路径；保留终点完成判断。 |
| T4 | 独立 F9 真实 Runtime/回环三路120秒、1183/1183/1182有序片段、独立停止/收起/恢复已有。仍非主仓库最终整合 dist；该120秒批次未同时完成全部 UI 组合，结束后30/120秒未采。 | **最终整合构建前提明确不满足**，不能用 sibling/main 两版本拼签；独立实现的缺采样是**可做但未做**，不是缺设备。 | 先固定包含最终 F9 的整合构建，再做计划三路+普通会话切换/独停/收起/上限恢复与相位采样；当前只保留独立实现部分证据，不为补样本重建产品。 |
| T5 | 大文本首次/三次切回/关闭耗时、6000删+6000增 diff 可读、持续终端切 Tab/resize调用、关终端后 shell 消失和闲置回落已有。BUG-014 是大文本切回 >1s，不能掩盖仍可测的纯 diff 响应耗时与尺寸调整到稳定布局的反馈；resize API 10ms 不等于布局耗时。 | **普通可安全执行但尚未完整计时**；非所有平台/完整背压签收，既有 shell 清理不应重新列为完全未验。 | 复用专用大 diff 与终端数据，只计目标 diff 切换/关闭和 resize 到可交互布局；沿用既有进程回收证据，存在新订阅才补其生命周期观察，不增加无实现计数器门槛。 |

证据定位（行号为本次只读时）：coverage.md:9/18/50/55/75/142/152；reliability-20261022.md:23–27；desktop-models-settings-20261022.md:73–79、111、128–129、151–154；cu-electron-20261022.md:180–184、203、376、422–425；本报告:96–108、151–159及“P2-D19 运行/队列与审批正常退出重启有限补验”；performance.md:25–35、50–84、101–120；原计划:263–269。spec-crosscheck-20261022.md:15 的浅深 chip 缺口也已晚于本报告:152–153 的证据，不应继续当未执行。行号只辅助定位，段落标题/原子编号是稳定依据。

本批结论只更新上述边界记录，**没有将复合未覆盖/失败整项改判通过**。未启动任何验收进程、未操作 UI、未调用模型，故无新增 PID/端口需清理；沿用各前批 cleanup.json 的已关闭终态。不修改 coverage、主摘要、产品或 dist，无提交/推送。


## 最终有限收尾 A/B/C 终态（2026-10-22 14:04–14:08）

验收点先列：A只读对照09-P5-2新worktree首轮状态、Plan/Chat浅深chip及已有placeholder；B仅一个SettingsStore明确支持的非法JSON副本真实启动，核对错误/降级与源字节；C仅重读T1/T2原始采样，明确能补与不能补的阶段。按文档/源码→单实例启动退出→采样标签对账分组，无其它路线、无新长输出、无商业调用。

| 子点 | 实际执行与终态 | 证据/残余 |
| --- | --- | --- |
| A 09-P5-2 | 已修改spec-crosscheck对应说明：09-P1-1连续逐字删除、Plan/Chat浅深chip/发送箭头、四类已证placeholder、worktree首轮状态/来源title按两份当前规范逐处对照。没有重跑UI。 | 具体残余为安全有效Host、工作树focus显示来源、Created worktree瞬时提示、正常Runtime的Agent新建页完整placeholder及明确原生观察；不再笼统声称本机首轮/chip未操作。BUG-023不变。 |
| B P2-R01 | 单次非法JSON在真实固定dist启动链导致v2 boot failed与会话列表加载失败，阻止Runtime装配，源字节/哈希保持，正常退出。 | reliability报告新增“P2-R01异常配置真实启动链有限补验”；final-three/invalid-settings全证据。只签此异常，不代签迁移写失败/全部旧史。 |
| C T1/T2 | 逐条读取metrics.jsonl六个旧样本、T12-new-resource.json二十一个后批样本与real-five-rounds-summary.json，不调用模型。可精确补记录各时间/PID/CPU/RSS/heap方法及实际闲置间隔；没有找到缺失阶段，不能用文件名填空。 | final-three/t12-raw-phase-audit.json，见下表；原performance数值保留。 |

T1/T2范围校准（更正本报告“最终边界只读审计”T1/T2行的过严规模表述，不删除原观察）：§8 T1明确模型提前结束则记录实际规模，不要求为凑8k–12k无限新增请求；T2连续三轮“长回复”不能把8k–12k汉字门槛自动硬套每轮。后批7015/6095汉字属于实际长回复，未达T1目标规模是事实说明，**不因此将已执行三轮改为没有长负载**。每轮A→B→A/滚动已有；停止→暂停队列→显式继续专项实际一次，单次停止证据不写成三次；逐轮专项要求按本节末尾§8更正及下表判定，仍部分未覆盖。

| 原始批次 | 已有可用阶段 | 精确仍缺/不能补 |
| --- | --- | --- |
| metrics.jsonl main88356/renderer88405，六样本 | round1-stream 00:25:43.860Z、round1-complete 00:26:41.372Z；round2-stream-scroll 00:27:40.127Z；three-rounds-idle三点00:29:27.940/00:29:57.948/00:31:27.947Z。后两点相对idle锚点30.008/120.007秒。 | 第三轮实际结束00:28:36.906Z，因此idle锚点已是结束后51.034秒，后两点是81.042/171.041秒；不是精确结束0/30/120。没有同批完整开始基线/第二第三轮结束资源。8724汉字第5篇在00:35:09.438Z完成，六样本全在此前，不能挪用给达标第5篇。 |
| T12-new-resource main51004/renderer51076，21样本，均未强制GC | baseline、r1-start/stream/stopped、实际显式resume/stream/end、r2-start/stream/end、r3-stream/end（r3 CPU/RSS为ps，heap为CDP）、final-idle锚点和后续采样都有。记录PID/采样渠道可读，不以ps缺Electron metrics当完全无资源。 | r1-continue-start/stream/end三标签发生在暂停队列，排除为流式/结束样本。r3独立start资源缺失，不能从其stream倒推。final-idle30实际30.038秒；idle75=88.106秒、idle120=154.368秒，只有30点接近期望，后者只能写≥120秒实际窗口。 |

两批PID不同不能拼成同轮完整相位。没有新增原始阶段，故仍保留同阶段采样不完整；不以此否定已完成的长回复/切换/滚动/停止继续功能。F7未闭合→闭合代码/表格在cu-electron:376–377另有真实受控HTTP同消息证据，不能继续列全无过渡实测，但它也不补T1真实长文的资源阶段。

清理终态：本批唯一Electron main16830与helpers16858/16859/16871正常quit/close后逐PID均absent，cleanup.json原始ps空输出；未启动Provider/PTY/监听端口。A/C没有UI进程或模型请求。只修改spec-crosscheck对应说明及追加本报告/reliability，产品/dist/coverage/主摘要未改，无提交推送。

### T1/T2 §8逐轮要求更正（2026-10-22）

补看原计划§8后，更正上方“最终边界只读审计”T2行及本报告前述T1/T2范围校准中的专项范围表述；保留原始测量，不追加模型请求。T1允许提前结束并记录实际规模，8k–12k是目标而非必须凑足的硬门槛。T2不把T1的8k–12k目标强加给每轮；7015/6095汉字照实记录为长回复规模。但T2原文“每轮输出期间至少一次A→B→A、滚动和停止/继续专项”逐轮适用：本次三轮的A→B→A与滚动均有记录；停止/暂停/显式继续专项只在首篇实际做过一次，故该专项的三轮覆盖未完成。实际范围结果为T2部分未覆盖，不能再写成无需补足逐轮专项；同样也不自动要求每轮都重复全部专项动作之外的资源阶段或达标字符数。现有阶段样本仍有r3-start及相位资源缺口，详见上表。此校准仅按原文区分“长回复规模”与“每轮交互专项”，未新增请求。

| 后批逻辑轮次 | 实际正文规模（汉字） | A→B→A / 滚动 | 停止/继续专项 |
| --- | --- | --- | --- |
| 第1轮及其显式续写 | 4249停止；5495续写，分别两条持久消息 | 已验；续写另有切换 | 已验一次停止、暂停队列及显式继续 |
| 第2轮 | 7015，正常完成 | 已验 | 未执行该轮专项 |
| 第3轮 | 6095，正常完成 | 已验 | 未执行该轮专项 |

逐轮定位：performance.md“真实DeepSeek有限补验”及T12-new-resource.json中r1-stopped/r1-resume-*、r2-stream-switch-scroll、r3-stream-switch-scroll；原文/ID在T12 Journal-final。资源可比性仍按前表记录缺相位，未追加采样或请求。
