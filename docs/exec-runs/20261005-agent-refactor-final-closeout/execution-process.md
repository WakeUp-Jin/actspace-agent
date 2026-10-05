# 最终重构收尾执行过程

## 2026-10-05 开始

- 用户批准最终计划实施；基线提交 `e02f37f7`。
- 已记录 tracked/untracked 哈希、受保护 histories/learnings 哈希和状态；相关源码备份位于忽略的 `tmp/refactor-final-closeout/baseline/`。
- 独立工作台设计与产品概念草稿原样保留；本轮不提交、不推送。
- 按主计划 T1–T6 执行；目标 G1–G8 与 CU 子项以验证附件为准，未执行项不记通过。

## T1/T2 首批实施与验证

- Inbox 写侧收窄为后台通知，Host Task 的插入语义及旧 journal 读侧保留；core-agent-loop 6 文件、34 测试通过。
- artifacts 已整体忽略，7 个已跟踪制品取消跟踪但保留本地。矩阵 check 仅校验提交的 Markdown；隔离正负例验证无 artifacts、源码漂移、二次生成确定性。
- package cutover 排除 `.astro` 生成目录，修正 `/eval` 对 `/evaluation` 的误报；strict 和隔离负例通过。
- 三个诊断脚本归 diagnostics，terminal-native-spike 归 experiments；4 个入口根路径同步。诊断 dry-run/help 与 native prepare/run/package smoke 通过；后者是本机 adhoc 原生模块验证，不是发行签名/公证。
- 根散落讨论/素材原样迁入 docs 对应参考目录；TODO 唯一条目并入统一待办；空 output/undefined/logo-design 及已核实无占用的 target、Go/DMG/plist 生成缓存删除。嵌套仓库与 native 注册实验尚在核对，不按垃圾删除。
- D2–D4 六份重复设计已合并为 Session/storage、prompt、projection 主规范；保护区引用的旧路径保留短回溯入口。设置、工具预览和 Composer 规范继续对照源码校准。

## CLI 确定性 HTTP 验证与修复

用户确认：不改变默认 `maxAttempts=1`，不新增 CLI 产品参数；通过现有 test loader 的装配入口为真实 LLM route 配置两次尝试。Provider、Loop、Host、Journal 和进程信号全部使用真实生产路径。

实际复现并修复：

1. 默认 Loop 失败原因已持久化，但 CLI 只返回 failed；CLI 从当前 Task 的 Run 边界内读取失败诊断，填入最终 error 并输出 stderr，保留通用 value。
2. `llm/retry` 记录已失败的请求尝试，Journal 关系校验却未将其关闭，导致成功、耗尽、取消后的 step/turn 结算失败；恢复扫描亦遗漏该终态，冷启动试图重复补写 assistant 终态。两处统一语义，增加 replay/重复终态拒绝回归。
3. Headless 恢复暂停的会话时只提交任务，未显式恢复队列，进程无结果退出。显式 `--resume` 恢复保存队列后提交新输入；Desktop 的暂停语义不变。

验证：真实 HTTP CLI 进程用例 11/11 通过，含默认单次成功/400/503、json/jsonl 严格协议、两次尝试成功/耗尽、等待重试时 SIGINT 130、同 Session 新进程继续、旧任务不重跑及 writer 重新取得。Journal 12/12 通过。日志位于 `tmp/refactor-final-closeout/{cli-process,journal-test,cli-build}.log`，最终隔离快照仍需重跑，不据此签收 T4。

## 全包复核与文档、目录继续收敛

- 43 个领域包逐包执行 TypeScript 未使用符号检查，删除确认无消费者的局部函数、导入、参数、重复 Cordis 版本常量与旧契约别名；动态 manifest 入口单独核对。
- 旧 `activateBehavior` 和内置插件 `activate()` 仅有旧测试消费，生产链已使用 Cordis apply。删除重复激活入口，将测试迁移为真实 Cordis 挂载/服务释放/候选失败回收；AgentService 内部有真实调用的 activate 工厂保留。真实 Cordis 37 项全部通过；领域包回归通过。
- filesystem-write 的 diff 统计曾漏算内容以 ++/-- 开头的行，按 hunk 后内容统计修正；write/edit 两路径回归通过。删除相邻无消费者 helper。
- 设置总规范删除重复模型 JSON/阶段清单、补当前 Host 导航；工具预览修正实际投影、diff 与路径语义。两份前轮 process 的独有失败事实并入 summary 后删除副本。
- 原有 histories/learnings 哈希全部一致。Markdown/HTML/引用式链接与锚点增量扫描：基线 95 条既有问题，本轮新增 0 条；此扫描不证明所有历史源路径当前存在。
- sandbox-runtime 独立仓库迁入 tmp/reference-checkouts，文件哈希及 Git 状态一致。四个 clean-checkout 含绝对路径绑定按规则原位保留。8 个 NativeMessagingHosts 注册位置无实验配置引用，实验 manifest/空 support 迁入 tmp/browser-bridge-fixtures。
- 干净源码快照首次验证发现 typecheck 前置构建漏 client，已补 client 依赖闭包；移除旧 exports 后重新生成契约矩阵。首次失败保留日志，最终快照需刷新重跑，不能以旧结果签收。
- Computer Use 第一组通过启动/流式/停止；fixture 标题角色与 Skill 目录识别误判已修，独立新环境继续逐点验收。

## 最终检查补充

- 隔离快照的第二次 `pnpm typecheck` 与完整 `pnpm test` 成功。Desktop 有一个既有 Editor PoC IME 用例显式 skip，属于独立 PB 编辑器工作，未计为通过；其余本轮必需 Cordis/SSH 门禁通过显式环境开关执行。
- 原命令 `pnpm ci` 命中 pnpm 未实现的内建子命令，改用 `pnpm run ci` 执行仓库脚本，计划同步；未把原失败记成成功。
- 文档骨架检查发现三个迁移后短入口未登记回溯索引，已修正；Host 设置页 14 个字号类按现行设计 token 校准，交 CU 浅深主题复验。
- 原有 lint 错误与新增分开；使用 CI action 对应 markdownlint-cli2 0.22.0，修复新报告表格与新增空行，不改原样迁移材料及保护区。
- 逐路径结算覆盖 1,112 个基线记录并单列新增文件，保留项写明用途与证据限制。43 个领域包最终未用局部符号检查全部通过。

## 界面验收期间的补充

- 已清理 23 个退役工厂删除后留下的文件尾空行，并重生成契约矩阵；矩阵正负例与文档门禁通过，未在运行中触发主进程重建。
- 根 README 补齐独立 Host、客户端、统一任务与存储中立边界，CLI 构建命令包含依赖闭包；docs 总入口指向本轮最新结算。
- fixture 原 1×1 PNG 的 IDAT 校验无效，已改为有效不透明棋盘图；压缩请求包含历史 HOLD 标记导致误暂停，已分离 Run/title/summary 控制。两项归测试设施问题，不能作为产品 Bug 或预览通过的证据。
- SSH 界面测试使用独立配置 preload、真实系统 ssh/sshd；不写真实 ~/.ssh。界面仍需实际配对、连接和关闭，自动化与 no-window probe 不替代该门禁。

- 同数据重开出现 resume 后立刻 pause：Journal 93→94、97→98 证明按钮已提交，7 个 Host shared module 中 cordis-adapter 的入口指纹在重建后变化。复制 synthetic Harness 状态后，生产 `HarnessControl` 明确报 Host contract fingerprint differs，调用授权的 `recoverBuiltin` 成功启用 revision 2。此为验收中途跨构建的恢复保护；不删除选择记录绕过保护，原环境待正常退出后同样维护，再用真实界面续聊复验。

- 03 环境正常退出后完成同样的维护，revision 1→2；原 settings、secrets 和 Session journal 哈希一致，Host capability ceiling 与各 Harness entry 启用状态一致。没有执行任务或清空数据，后续重开续聊仍交真实 UI 验收。
- SSH UI 已真实进入系统 ssh/sshd，但 `/private/tmp` 祖先权限触发 StrictModes 拒绝；仅隔离回环 sshd 改用 StrictModes no 并 HUP，仍固定主机公钥和独立设备密钥。系统服务与真实 SSH 配置未变。

## CU3.3 附件拒绝分类修复

- 真实 Electron 选择有效图片与 21 MiB 图片后发送，主进程在接纳 Task 前拒绝超限附件，但 IPC 仅转换 Chat 专用校验错误，Agent/Plan 普通准备错误被 renderer 误当回执丢失，显示未知提交并重试。正文和附件仍保留，Provider 没有新请求。
- 修复局限于准备阶段 catch：返回明确 rejected 和原错误原因；正式 submitTask 调用继续位于 catch 外，接纳后的回执丢失仍按 unknown 去重核对。
- 回归先复现 3 个失败，再通过 Chat、Agent、Plan 准备错误与接纳后丢失回执用例；连同附件和 renderer 队列 18/18 通过。6.1 Sol 子智能体真实界面定向复验通过：明确超限拒绝、正文和有效附件保留，无未知提交提示；移除超限附件后的发送路径继续验证。

- 后续源码追踪确认 Agent/Plan 部分导入后失败缺少回收；复用现有 rollbackImportedAttachments，在尚未接纳时回收已成功导入的临时附件。回归先复现 Agent/Plan 两项失败，再验证回收恰好一次且不吞原拒绝原因；接纳后路径仍不回收。

- 附件修复后在隔离源码快照执行完整 Desktop 回归：1,004 项通过，原有 IME 与默认 gated SSH 两项跳过；随后 ACTSPACE_TEST_SSH=1 单独执行真实 sshd 用例通过。最终仅 IME 仍属既有未覆盖，不将默认 skip 记为通过。日志 attachment-desktop-full.log / attachment-desktop-ssh.log。

- CU 子智能体两次遭服务端 busy / stream disconnected，保留 Electron 与fixture状态后使用同一 gpt-6.1-sol 子智能体续跑。工具/模型服务中断不记为产品失败，也不把中断期间未操作的取消审批项记为通过。

## 12:28 继续验收

- Desktop main 已重建并重开，包含接纳前附件回收；未重建领域包或重启Host。
- CU7.3 复验 Run 93acf6cd 的 Journal 确认 cancelled，fixture-17 bash denied/aborted，没有后续 write_file。与真实停止后审批消失的界面证据一致。第一次审批因验收服务中断而过期，bash 被拒绝；fixture 随后按脚本选择独立 write_file，不把该首次超时场景作为取消验收。
- CU7.4 原 hold 因主线程等待过久已超时 failed，本次重开不作为运行中恢复通过；以新的 hold 场景重新验证，保持此前证据。

- 新 CU7.4 已实际重连到同一运行，Provider 19 唯一，但随后叠加队列操作过长；Journal 12:31:46 请求至 12:36:46 terminated，约 5 分钟无流量。记录为 fixture hold 空闲等待超时的证据，不能笼统称 10 分钟 Run 预算，也不签 release 完成。后续缩短每个 hold 路线，重连观察后立即 release；队列分新场景覆盖。

## 慢速 CU 的 fixture 保活与续跑

- 两次短 hold 仍因原生观测耗时超过约 5 分钟无字节期限而 terminated，保留失败事实，不签完整重连通过。测试 Provider 新增每 20 秒 SSE 注释心跳，不产生模型内容，不改变产品执行预算。
- 增加 fixture resume：必须先停止，沿用端口、设置、证书、Host身份及数据，不重新 seed；控制instanceId更新，请求ID连续。首次 smoke 发现零请求时日志不存在，已修并复验。独立 fresh/start→stop→resume 保持配置内容，只有 writer owner 变化；HTTP保活与原11项CLI进程合计12/12通过。
- 03桌面正常退出后原地续跑，Host因旧shared构建指纹触发blocked；复制状态probe明确 Host contract fingerprint differs，通过生产recoverBuiltin后仅synthetic Host维护revision2。原证书、配置、认证不变，Journal追加正常shutdown end-seed，未清空；维护前后证据在fixture03-resume与host-maintenance日志。该维护不作为Host持续运行验收。
- 新supervisor/Host以原端口ready；新的CU7.4从该稳定环境开始，随后期间仅退出/重开Desktop。

- 保活后的 CU7.4 完整通过：真实 Cmd+Q→同数据重开同第8轮running→release→完整回复/空闲，Provider id22唯一。该场景期间Host未重启；此前维护和超时尝试单独记录，不混为通过。

- CU4.1/4.2撤回分支/4.4/4.5/4.6及CU6.2已合并界面与Journal证据签收：同Task B move/designate/clear，release按B/A唯一消费；停止后pending暂停、手动继续唯一消费；Reload无重复。带附件批注的编辑分支仍待覆盖。
- CU5.3/5.4通过：摘要失败可直接重试；旧compact取消（250accept/251cancel），新compact接纳252、258start、263finish compacted:true，未永久暂停。

- 执行期间并行前端设计继续更新 space-demo.html 并重命名/归类 assets；记录首次观察哈希及后续差异，本轮不回退这些独立变化。保护承诺为不修改其工作，不能把最早六项WIP哈希检查扩写为当前全部文件仍不变；histories/learnings保护单独复核。

### CU 上传失败与批注保留闭环

gpt-6.1-sol 通过真实回复选区创建批注、编辑评论、输入正文并用原生选择器附加 visible.png。注入上传失败后，界面明确显示 Fixture temporary upload failure，正文、图片、批注原文与评论都保留。失败时 Provider 最后编号仍为 35，远端 Journal 截至 308 没有该内容的 Task 接纳。恢复上传后，真实点击一次发送；Provider 36 含图片且唯一，Journal 309 唯一接纳、312 用户消息、316 请求上下文，界面第 15 轮内容与回复各一份，草稿清空。CU3.4/CU7.7 按中间态和终态共同签收，辅助证据保存在 tmp/refactor-final-closeout/cu-upload-failure-evidence.json。

### CU4.3 远端队列编辑附件丢失修复

真实队列条目编辑回填后正文与批注仍在，visible.png 消失。Journal 331 的原任务保留 original.uploadIds 和 prepared artifact；renderer 只读取 original.attachments，故队列和回填都丢失图片。旧 Task 在 337 被取消，不能给该现场重新手工添加图片后宣称修复通过。

修复从 Host 持久任务重建带会话归属的附件引用，同时用于队列和恢复中的用户消息。编辑时按认证 artifact 读取图片预览，重发时在 Main 读取远端字节后重新上传，保留原上传 hash/offset 校验和稳定 submissionId；不依赖本机文件、不改变 Host 持久格式、不允许跨 Host/Session 引用。预览失败保留附件，编辑前先完成预览读取与 revision 检查，切会话时把回填放入所属会话草稿。

10 项队列、上传与提交回执测试通过；新增覆盖 Reload 后附件投影、批注保留、跨会话/Host 拒绝、重发上传丢回执后续传。Desktop typecheck/build:electron 通过；隔离快照完整 Desktop 1,006 项通过、2 个既有 skip（SSH 已在本轮显式运行，IME 保留未覆盖）。主表以 gpt-6.1-sol 的修后真实复验为准。开发时 Vite HMR 造成当前界面刷新，该阶段的元素失效不记为产品 Bug。

修后 CU4.3 已由 gpt-6.1-sol 真实复验：新三要素 Task 入队、Reload 后仍显示文件与引用、编辑回填蓝黄 PNG 缩略图和批注评论（没有重新选本机文件）。原 Task 82cbd607 在 Journal 339 撤回且无 claim；编辑后 Task 1ad52aa5 在 340 唯一接纳、341 resume、343 claim、353 completed；Provider 38 唯一、含图片与 edited 正文，界面消息和回复唯一且草稿清空。辅助证据 cu-queue-edit-evidence.json。

### 最终签收前补核

- 当前 32/35 项界面验收通过，剩余自动标题竞争与双主题代表状态。Skill 已验证选中请求和干净会话取消对照，另外补原会话移除后的请求，排除会话配置滞留。
- 重新核对原有 817 个 histories/learnings，路径与哈希均一致；本轮范围无新增断链，并行前端动态 HTML 的两条扫描结果单列。artifacts 已无 Git 跟踪文件，原地制品保留；output、target、undefined、logo-design、.agent-tmp 均已按计划退役。
- 标题前三次 CU 尝试未成功保存手动名称，不能算竞争通过或产品缺陷。自绘会话菜单不支持方向键选择，改为先实操完成普通改名，再在 30 秒标题请求期限内形成竞争。完整结果以逐项报告和 Journal 时序为准。

- 原 Skill 会话补核完成：Provider 49 对应 same session removed；原会话 Journal request/context seq11 含 Skill 正文，seq24 保留旧聊天历史但不再含正文标记，catalog 仍正常存在。移除选择后没有会话配置残留。
- 刷新逐模块结算表，把后续 Desktop 缺陷修复计入修改数量；测试路径统计补含 tests/ 与 .spec.，文件数不换算为通过用例数。当前清单 1,112 条基线及新增/迁入/独立工作保护行已重新生成。

- CU 坐标辅助核对只读取窗口元数据：截图为 2048×1226，实际窗口逻辑尺寸为 1440×862 且存在原点偏移；交给子智能体先在普通改名场景验证转换，不在产品中放宽 30 秒标题期限。普通 AX 改名本身成功，自动标题竞争仍须单独实际形成。

- CU8.1/CU8.2 浅深主题代表状态通过：Composer、队列、审批/菜单、Host 设置、焦点与禁用区分均真实观察；不宣称遍历所有页面。深色切回时原审批已过期，另建新待审批场景补齐截图后主动停止，未把超时当视觉问题。当前 34/35，仅标题竞争未覆盖。

- CU6.1 第四轮菜单 AX 读取仍耗时 63 秒，超过真实 30 秒标题期限；保留未覆盖。单次显式 emit:true 曾约 2 秒，但无法稳定复现。普通改名成功、自动化竞争通过，均不替代本次真实竞争。Computer Use 工具规则要求用户明确授权才可使用 AppleScript/System Events，已发异步问题，待答复前不执行替代交互；应用与 fixture 保留。

## 最终签收与归档

用户在 System Events 特定授权说明后回复继续，由原 gpt-6.1-sol 仅对隔离测试应用执行原生菜单 AXPress；正文输入、发送、改名输入与观察保持 Computer Use。System Events 常规引用遍历曾漏掉菜单，逐项解引用/AXChildren 能可靠找到；菜单点击约 0.89 秒。最终 Session 940fe0b5 task accept 10:08:37.796Z，唯一手动 title-set 10:08:56.820Z，差 19.024 秒，小于 30 秒；标题请求 57 与正文请求 58 分开核对，release 后无自动覆盖，页首/侧栏均保留手动名。35/35 项完成。

额外 Reload 遇 chrome-error，主线程核对 5173 无监听和 ERR_CONNECTION_REFUSED；重启同源码 Vite 后 HTTP 200。该开发进程中断不回写成标题产品缺陷，补充观察另见 CU 报告。最终计划从 active 移入 completed，更新目标、清理审计、TODO、技术债与旧阶段结算入口。未提交、未推送。

- Vite 恢复后真实 Reload 补核通过：相同 Session 页首/侧栏手动标题、正文与回复完整，Composer 为空。子智能体正常 CmdQ 退出，主线程停止03 Provider/Host及本轮 renderer；先前 SSH fixture 进程已退出，全部保留文件不删除。归档后 ci/check:docs 通过，新增 lint 0，817 份保护文件仍一致；独立前端动态模板扫描结果继续单列。

- 最终隔离源码快照刷新后，ci/docs 首次因刷新器保留空的旧 active 计划目录而拒绝；核实目录内无文件后删除该快照空壳，重新运行 ci/docs/matrix 均通过。主工作区已正确迁移，无此残留；失败日志保留以区分脚手架与产品问题。
