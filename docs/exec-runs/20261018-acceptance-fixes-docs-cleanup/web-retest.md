# WA01 / WA02 定向复验

日期：2026-10-18。执行模型：gpt-6.1-sol。产品源码和正式测试未由本复验修改；用户已批准主侧修复。本记录验证当前修改后的 Web，不能倒改此前验收事实。

## 先列验收点与预期

| 编号 | 检查点与预期 | 结果 / 方法 |
| --- | --- | --- |
| WR01 | 真实 Host 运行时停止，保留部分正文并显示队列暂停和继续入口 | 通过，浏览器工程交互 |
| WR02 | 暂停后提交新消息进入队列，不自行解除暂停、不产生新模型请求 | 通过，浏览器工程交互 + Provider 请求记录 |
| WR03 | 暂停队列的消息可以撤回，刷新后仍为撤回后的内容 | 通过，浏览器工程交互 |
| WR04 | 刷新保留暂停；显式继续才执行一次剩余消息，完成后空闲 | 通过，浏览器工程交互 + 真实 Host 持久化 |
| WR05 | Provider 失败后显示暂停；换正常模型并提交，显式继续能够完成 | 通过，受控 HTTP Provider + 真实 Host |
| WR06 | 维护通知、连接断开时继续按钮禁用；恢复连接时重新可用 | 通过，浏览器工程交互 + 自持 Host 停启 |
| WR07 | revision 冲突刷新快照后仅重试一次；重复冲突向用户反馈 | 未覆盖真实界面冲突；已读源码实现，主侧单测另报 |
| WR08 | 390px 浅色审批两按钮触控区域至少 44×44px，运行能实际执行 | 通过，DOM 几何 + 真实 Host 审批交互 |
| WR09 | 390px 深色审批两按钮触控区域至少 44×44px，拒绝与允许能提交 | 通过，DOM 几何 + 真实 Host 审批交互；截图有过渡态，不能用于签收全部视觉细节 |
| WR10 | 三按钮及换行布局尺寸、点击正确 | 未覆盖（部分已验证）：真实 ApprovalCard 隔离组件三按钮均高44px，session/once回调成功；没有实际 Host 三按钮及换行证据 |
| WR11 | 原生 Chrome 操作产品 Web 完成上述路线 | 未覆盖；浏览器接口认证失败，App 通道可用但多窗口绑定不稳定，本轮产品 Web 实际操作为工程浏览器 |
| WR12 | Web 使用已有真实 Provider 完成停止恢复 | 未覆盖；没有现成安全 keyEnv 注入配置，未提取、迁移桌面凭据。受控 Provider 不等同真实模型成功 |

共12点：8通过、0失败、4未覆盖（其中WR10部分验证）。本次未发现新的产品缺陷。WA01/WA02已修复的关键工程路径通过；原生浏览器、真机和真实模型边界保留。

## 再按操作路线分组

1. **队列路线 WR01–WR07**：独立浏览器配对隔离 Host；创建 held 流式会话→排队→停止→提交→撤回→刷新→继续；随后切失败模型→换正常模型→继续。最后停止自持 Host 观察维护和突断禁用，恢复连接。保留暂停、刷新、稳定完成和断线证据。
2. **审批路线 WR08–WR10**：390×844 新会话发受控工具请求，浅色测量→设置深色→返回审批→测量与运行；另会话拒绝。现成 Host fixture 没有给出 grantSuggestions，补真实组件与假客户端的三按钮几何和点击回调，明确工程层级。
3. **能力边界 WR11–WR12**：尝试原生 Chrome 专用窗口，报告认证/绑定限制；核对真实 Provider 注入条件，不输出或复制用户 Key。桌面备份预览在用户明确取消后停止，不列为验收阻塞。

## 实际步骤和证据

证据保留于本机 `tmp/codex-acceptance/20261018-web-retest/`，属于 ignored 验收产物，不随仓库分发。以下文件均为本轮实际保存；关键图已打开看图，文件名不代表未验证状态已经通过。

**环境**：当前 Web 源码独立 `vite build --outDir .../web-build` 成功（不修改共享 dist），CLI Host 使用现成 dist。服务仅监听127.0.0.1:49625；数据、工作区、浏览器状态与用户业务隔离。Provider 为仓库 `startAgentProvider` 的 success / terminal-error；正常61924、失败61925。后续仅为尝试前缀使用临时HTTP代理61926将fixture的printf命令换成git status，此路线仍没有会话前缀按钮，没有据此宣称授权成功。工作区只在本轮 ignored tmp 建立。

**WR01–WR04**：会话 `757de269-cccd-469f-8dc8-33688badbf5a` 首发 `FIXTURE_HOLD WA01-STOP` 得到部分正文；再发排队文本、点停止，出现“队列已暂停 / 继续发送”。继续提交 `WA01-NEW-WHILE-PAUSED` 时正常 Provider 非标题/摘要请求仍只有1次。撤回一条后刷新，队列仅保留 NEW-WHILE-PAUSED；点击继续后请求数变2、正文完成，最终空闲并保留停止轮。证据：`wa01-paused.png`、`wa01-refreshed-paused.png`、`wa01-resumed-stable.png`，原始请求在`provider.jsonl`。撤回前后工具观察存在异步过渡，以刷新后的队列为最终依据。

**WR05**：切fixture-error发送 `WA01-FAILURE`，出现400错误和暂停；切回fixture-main提交 `WA01-AFTER-FAILURE` 后显式继续，最终正文完成、队列消失；正常请求数变3，失败请求1次。`wa01-failure-paused.png`、`wa01-failure-recovered-stable.png`；后者已实际看图，错误轮和恢复正文同时可见。`wa01-failure-recovered.png`为中间态，不作为最终完成证据。

**WR06**：另发held请求并停止，队列已暂停；向自持Host发SIGTERM时UI“服务器维护中”、继续disabled；重启后曾观察恢复可用。随后仅对自持Host SIGKILL，UI“连接中 / 已断开，正在重连…”且继续disabled。证据：`wa01-disconnected-disabled.png`、`wa01-abrupt-disconnected-disabled.png`。后续重启的session-owner租约导致服务装配失败，因此审批续验换新隔离dataRoot；不把这次失败重启写成恢复成功，也不修改锁文件来规避。维护/断线禁用本身已实际成立。

**WR08–WR09**：390×844，受控 `FIXTURE_TOOL WA02` 触发真实Host审批pwd。浅色拒绝/运行分别50×44（x262/316，y243.9375），深色同为50×44；此前旧版为50×30。点运行后工具完成、写入result.txt并得到最终回复；另一 `FIXTURE_BASH_PAIR WA02-THREE` 会话点拒绝后工具显示Denied/未执行。该fixture可能继续提出下一工具，未把拒绝单次等同结束整轮。证据：`wa02-light-390.png`、`wa02-dark-390.png`、`wa02-denied.png`。深色图片实际处于界面过渡，尺寸来自点击前DOM测量，不能由该图推断完整稳态视觉。

**WR10工程组件**：临时fixture直接import产品ApprovalCard、现有FakeConnectionStore/helper和正式CSS；没有修改产品内部状态，也没有将假客户端回调当成Host授权。390px三按钮测得拒绝50×44、本会话允许pnpm122.8125×44、运行50×44；x分别103.1875/157.1875/284，y165.6875。浅色点击session、深色点击once回调有返回。`wa02-component-three-light-390.png`、`wa02-component-three-dark-wrap-390.png`已实际看图。后者文件名含wrap，但最终几何和图没有证明换行，**换行保持未覆盖**；不以文件名代替结果。临时工具代码仅留ignored tmp。

**WR07源码检查**：`ComposerController.#revisionCommand`支持CONFLICT / REVISION_CONFLICT，取snapshot后重试一次；`resumePending`阻止重复提交，断线/维护时resume提前返回。此次没有通过真实并发制造冲突，不能把源码或主侧单测改记成UI通过。

## 清理与限制

自持工程浏览器已关闭。隔离Host/fixture/临时代理与Vite、备份静态服务已停止；未知8765未操作。Native Chrome曾创建两个本轮专用无痕窗口。Desktop退出释放前台后，仅打开Chrome的“窗口”菜单定位清理目标：菜单只列用户既有窗口，没有本轮Context Panel Demo条目，因此无法精确定位这两个窗口；取消菜单后停止操作，没有发送关闭窗口或退出Chrome命令。不能声称已逐窗关闭，也不因工具绑定限制关闭用户其他窗口；不再重试、不重开或检查备份页面。工程浏览器退出与上述原生窗口状态分开记录。没有修改产品代码、正式测试、旧DOCS，没有提交、推送或修复缺陷。

原生Chrome browser API仍报 `unsupported Codex auth method: apikey`；App入口后来成功读取独立无痕页面，但此前AX锚定旧窗、截图不可用，不能将此尝试记作本轮Web原生CU通过。真实Provider由Desktop另一子智能体复验；本报告只证明受控Provider的产品Host/队列与审批行为。iPhone、Tailscale和系统安装行为不在本次定向修复复验范围。
