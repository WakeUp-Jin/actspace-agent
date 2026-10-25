# 验收问题集中修复执行记录

当前执行状态（2026-10-24，本会话续验）：**用户已要求继续，Goal为active；恢复无人值守调度。** 上次暂停及本地保存已结束，实查分支fix/settings-model-select、HEAD `7d3cc898d2bd0a1ade049db3af02ec02835f8c64`，恢复前工作区干净。本轮不暂存、提交、推送或发布；系统授权/人工配合子步骤仍用户跳过、结论未覆盖。先核对制品与资源，再领取有新信息的独立工作，详情见[恢复审计](../20261021-actspace-full-acceptance/resume-audit-20261024.md)。此前暂停记录保留为历史，不代表当前调度。

- 2026-10-23 最新增量：BUG-047当前固定构建真实原生R47-1–6通过，设计/history和Web共享消费者检查已补，已关闭；F7-02/14-A1按完整子步骤通过。Web另批WN01–04真实补验通过，P2-W02通过。当前165项101通过/0失败/64部分或未覆盖，49条Bug中48关闭，仅BUG-039待真实OS派发。原工程红绿与Client41/Desktop62证据保留，新增Web124测试/typecheck通过；不提交、不推送，Goal active。详见[流式恢复审查](../20261021-actspace-full-acceptance/stream-recovery-evidence-20261023.md)。

- 计划：[已批准方案](../../exec-plans/active/20261022-acceptance-bugfix-review.md)。
- 范围：先完成已批准的 A–H 共26条；继续全项目验收并修复新发现问题。BUG-016 按当前全部 Bug 授权实施最小下载修复，3条已关闭问题按影响回归。
- 基线：主仓库 `fix/settings-model-select`，HEAD `00d6b7630907deefcf07bdb60b88d58b0db00b2a`；原有187个改动/未跟踪文件的快照和哈希保存在 `tmp/codex-acceptance/20261022-acceptance-bugfix/baseline/`。
- 纪律：不提交、不推送；代码修复、自动测试、真实交互复验分别记录，未复验不关闭Bug。

## 批次进度

- [x] A：008、009（CLI/Host/Desktop 脱敏真实链路、原始/后台/恢复终止路线均复验关闭）
- [x] B：004、017、002（均已按各自范围复验关闭；pinned无产品非空调用入口的边界仍保留）
- [x] C：020、021、022、023、024（普通/工作树分叉归档、文件/Review归属，以及公开工作区IPC输入/授权生命周期均复验关闭）
- [x] D：005、027（Web审批恢复和Desktop目录授权/管理撤销/隔离/重启及480px浅深长路径均复验关闭）
- [x] E：030、026（两者均已按Bug范围完成真实链路复验并关闭；新增聚合未知问题BUG-036也已修复并完成六项真实Electron验收。完整复合验收点的其他缺口继续保留）
- [x] F：025（红绿顺序回归、真实RunManager/JSONL/终态及原生撤回后消费顺序通过，原缺陷关闭）
- [x] G：010、011、012、013（均已修复并经真实扩展链路复验关闭；Browser B-58/B-60读取仍未覆盖，专项未整体完成）
- [x] H：007、018、019、014、015、028、029（各自原缺陷定向复验均关闭；015精确 +6002/-6001已补，复合点的独立缺口继续按原编号追踪）

## A：根因与验证

BUG-008：`PreparedLlmCall.dispatch`已有本次credential，但未在返回流和异常出口执行请求级脱敏。格式匹配遗漏非标准凭据，原始cause及异步错误也能流出。计划用请求级脱敏边界覆盖所有adapter及取消回调，白名单保留failure字段。

请求级脱敏现已实现；5 项新增回归从失败转通过，service 共 27 项测试与构建通过。CLI 中断引入 130/143 状态、5 秒强制退出与本进程拥有的 shell 进程组清理；5 项真实进程回归、13 项单元测试和原有 12 项进程测试通过。证据见 `tmp/codex-acceptance/20261022-acceptance-bugfix/` 的 A 批日志；最终关闭前仍补进程边界矩阵。

## B、C：已实现，按证据继续复验

- B：同步 auto-review manifest/契约矩阵；共享 Button 用于 pinned 模型；隔离 fixture 通过 Settings/Model/Connections/Network 服务播种，两项 fixture 安全/幂等测试通过。Computer Use 已在隔离 Electron 中完成 fixture-main 与 fixture-alternate 的真实请求和可见回复。pinned 入口当前产品没有调用者，仍需代表场景验证，不能以普通模型菜单代签。
- C：delegation 与普通 fork 使用明确来源区分，归档过滤在分页前执行，派生索引升级 11 并同时重建行和游标；工作区参数按 registry 解析；归档候选复用侧栏显示分组；文件、Review、缓存与新终端按实际执行目标绑定。自动化结果：身份/分组 32 项、文件目标 17 项、SQLite 69 项通过，Desktop typecheck 与 Electron 构建通过。真实工作树、跨目标迟到响应与分页路线继续验证。

## D：根因与进行中的修复

005 的完整命令仍在持久 Journal 中；普通聊天投影未恢复运行中工具展示，导致刷新后的审批卡缺少命令。已补投影，并通过现有 session-owned `sessions.tool` 恢复缺失详情；允许操作在恢复前禁用，拒绝和重试可用，过期审批刷新。client 27 项测试与构建通过，Web 定向回归进行中。

027 的 Runtime 已提供 exact/subtree 建议及 grant 生命周期；缺口在目录建议选择、授权管理 UI 与远端 revoke RPC。按批准的现有授权语义补齐，renderer 只提交 suggestionId/grantId。

## F：持久队列顺序

旧的取消 target / Run finish / recovery 只清除引导目标，没有改变 queue 顺序。新增 required `queue-return` 事实，保存返回任务的原队列顺序并放到队首；Run 结束和恢复时与原事件一起持久化，flush 成功前不发布状态。旧 Journal 的旧事件解释保持原状；不识别新 required codec 的旧读者转为 browse-only。

新增6项顺序回归在修复前失败，见 `f-red.log`；修后45项测试通过，见 `f-tests.log`。实际RunManager顺序为 INITIAL → SECOND → FIRST → THIRD；覆盖四种终态、撤回与claim竞争、JSONL重开、旧事件重放、伪造事实拒绝及终态flush失败。真实UI中原SECOND→THIRD，将THIRD引导后撤回，队列变为THIRD→SECOND；release后实际完成顺序为FIXTURE_HOLD→THIRD→SECOND，队列清空。证据见 `cua-bc/REPORT.md` 及 `f025-*`；其他终态与重启UI路线未补齐，尚不关闭 BUG-025。

## 继续验收发现的问题

- [BUG-031](../20261021-actspace-full-acceptance/bugs/BUG-031.md)：真实工作树会话读取环境错误地走了只接受 registry 的写操作边界。读取改用已有 registry / 本地会话 root 授权检查，保留 realpath 和无关目录拒绝；修前 IPC 测试失败，修后 workspace picker / access 共 21 项通过，证据 `c-environment-red.log` / `c-environment-green.log`。真实 UI 需重建后复验。
- 同形入口核对：会话创建/切换及 Git 写操作仍必须保留 registry 准入；这次只修环境只读入口，不扩大目录写权限。`openInTool` 保留原注册工作区约束，工作树外部编辑器入口另按实际验收判断，不凭推断宣称通过。

## 恢复执行约定

Goal 已包含“修复 → 回归测试/规范 → 继续验收 → 修复新问题 → 定向复验”。清单完成后打勾；代码已改、自动化通过和真实交互通过分别记录。原基线为165项中的103项已有结论（70通过、33失败）。2026-10-23 BUG-019真实 Electron R1–R4补验后，当时为103/165已有结论；随后更新的当前状态为102/165已有结论（61.8%），其中72通过、30失败、63未覆盖或部分完成；全通过比例43.6%（72/165）。BUG-012修复后P2-B02由失败转部分完成，其剩余读取等子项仍未覆盖。Browser 62项另计，不混入此分母。修复条数不替代覆盖率。

### 2026-10-23 A/B 回归复跑

- `pnpm test:agent-cli:process`：17/17通过，含合成凭据脱敏、SIGINT/SIGTERM、重复信号及静默子进程/孙进程回收。日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-a-verification/process-retest.log`。
- `pnpm --filter @actspace/agent-cli test`：6个文件、13项通过，含CLI终止协调器与结果投影。日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-a-verification/cli-unit-retest.log`。
- `pnpm test:contract-matrix`：4/4通过。日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-a-verification/contract-matrix-retest.log`。
- A批仍未关闭：上述自动进程测试使用管道模式；2026-10-23追加原脚本的真实PTY Ctrl-C、输出与静默SIGTERM复验均通过，详见下方原始路线补验。当前run入口不提供交互input，等待人工审批的中断没有可达场景；后台工具等扩展边界仍待补齐。没有新增产品或测试代码。
- B批仍未关闭：BUG-004门禁复跑通过，BUG-017双模型真实请求已有证据；BUG-002的pinned模型入口鼠标/键盘实测仍未覆盖，不能以普通模型菜单代签。

## 2026-10-23 接续证据

- E030：初始22项修前失败，补查Responses失败终态另1项修前失败；修后99项通过（含37项真实SDK/SSE用量测试）。三协议保留字段存在性，失败/取消已知字段不丢失。独立890包离线frozen安装与补丁检查通过。真实隔离Electron中，缺usage请求在HTTP→Journal→轨迹/Usage请求日志链路显示未知，明确零请求显示0，主请求计数1→2；BUG-030按该范围关闭。聚合卡片对全未知请求显示0记作OBS-003；完整P2-D11仍失败，BUG-026用途调用链路继续待复验。报告：[BUG-030真实复验](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/bug030-ui-retest/report.md)。
- C 新增 BUG-032：Review 刷新完整目标和 ID/root 一致性；真实 Git/IPC 修前2失败、修后29项通过。A/B diff 内容已正确，首次 B 暂态 snapshot 警告仍需定位。
- H014 相同5.25MB样本旧构建冷开3778.2ms、warm2163–8827ms；新构建冷开191.7ms，5次warm141.9–163.6ms，关闭147ms；口径为真实点击到DOM静默100ms再2帧。DOM约4万降至约500；长任务仍需按点击区间归因。两种全选复制与2MiB预览原文完全一致；Unicode 全文140117字节逐字相同，组合重音双击复制通过；整窗480 CSS px已只读核实，浅深主题及实际首中尾滚动通过。证据在 `cua-bc/h014-*`；持续按住鼠标跨屏拖选因现有原生接口限制未覆盖，拖选后滚动加Shift扩展不能代签该手势。
- H007 手动与新连接自动获取模型→Esc 均回到“获取可用模型”按钮；H018 Select 首次Esc仅关浮层、第二次Esc退出设置回输入框，连接详情Esc也回输入框。其他关闭方式/嵌套路线仍需补齐，未提前关闭Bug或代签整项。
- BUG-031 A/B 环境显示各自工作树分支且无错误；AX未展示绝对root，仍保留未覆盖，不以分支正确代签路径可见性。
- C023：真实UI分别新建A/B终端，pwd、分支和互斥canary均指向各自工作树；切A后原B终端仍绑定B。C022自然fork入口在已完成空闲会话仍disabled，未覆盖，待定位前提。
- E026：辅助请求持久生命周期、Usage/client/轨迹与历史窗口已实现；真实JSONL生产读模型回归7主+2辅助=9请求／1080Token，SQLite71项、轨迹86项（另5项跳过）、image-inspection16项、Runtime composition/evolution4项通过。缓存与历史缺失场景均有实际修前失败证据。Runtime闭包构建、契约矩阵4项及文档检查通过；新构建真实HTTP／Journal／UI与CLI／远端复验仍待完成，详见[BUG-026](../20261021-actspace-full-acceptance/bugs/BUG-026.md)。
- BUG-028：`trajectory-render-view.test.tsx` 11/11 通过；真实 Electron/CDP 浅/深主题普通/hover、尺寸及实际停止全部通过，证据 `tmp/codex-acceptance/20261021-actspace-full-acceptance/bug-028-retest/REPORT.md`。16-A7 其它子步骤原有证据合并后已通过；窄窗、键盘焦点及原生系统主题切换未声称覆盖。
- BUG-029：Composer 状态行工作树来源现可 Tab 聚焦，focus/hover 共用完整来源 Tooltip，保留非按钮语义并提供可见焦点环。新增回归在旧实现下失败、修后通过；Composer 109/109、Desktop typecheck 通过。真实原生 CUA 已通过键盘可达性、来源提示、焦点、Escape、浅/深主题 480 CSS px 窄窗定向复验；hover-only 与 VoiceOver 实际朗读未覆盖。BUG-029 的核心键盘缺陷已关闭，09-P5-2 仍未完成，不能由本次定向复验代签整项。

### G013 修复与定向复验

BUG-013 已在 `browser-bridge/apps/cli/internal/cua/engine.go` 修复，并新增 Go 回归测试；overlay 红测对旧实现失败，修后 `go test ./... -count=1` 全包通过。隔离真实 Chrome → 扩展 → NativeHost → Runtime Bridge 复验覆盖全选、textarea/contenteditable Enter 与编辑删除回归矩阵，有效场景51/51通过，报告见 `tmp/codex-acceptance/20261022-acceptance-bugfix/g013-retest/report.md`。随后补验剪贴板 B-58–B-61：B-59/B-61写入通过，B-58/B-60读取超时并未覆盖；OS剪贴板仅写入本轮固定测试标记，按类型/字节/哈希快照恢复空态。完整证据见 `tmp/codex-acceptance/20261021-actspace-full-acceptance/browser-clipboard-20261023/report.md`。Browser 62 action汇总现为59通过、1失败、2未覆盖；剩余失败为跨源 iframe BUG-012，读取动作未覆盖，原生 Computer Use 与其他桌面平台仍未覆盖。BUG-013已关闭，但P2-B02继续失败，不能据此签收整个Browser验收点。

### 2026-10-23 全量回归与 BUG-002 定向复验

- `pnpm test` 在 `test:frontend-tokens` 失败：20 项中19项通过。扫描器把 `SettingsPage.tsx` 中用于检测打开对话框的 CSS 选择器 `[role="dialog"]` 当作业务组件直接声明 dialog role，报告误拦。建议将检测目标改为明确的模态属性，并补测试覆盖“打开 Dialog 时 Settings 页面不抢焦点”；按仓库 `AGENTS.md` 的先方案后代码约定，该条原待批准；2026-10-23 用户已统一授权，下一步补测试并修复。原始日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-full-pnpm-test.log`。
- `pnpm -r --if-present test` 覆盖58/59个 workspace 项目，Desktop 汇总246个测试文件通过、2个失败、2个跳过；测试为1951通过、2失败、7跳过。其余已执行项目通过。之后单独运行 `pnpm --filter @actspace/desktop test`，结果仍是相同的2项失败、246个文件通过、2个跳过；完整日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-workspace-tests.log`、`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-desktop-isolated-suite.log`。
- `app-streaming-user-message.test.tsx` 的“运行中会话在查看五个以上历史后仍驻留”在 workspace 全量运行和 Desktop 单包全量运行时均超过 Vitest 默认5秒；单项单独运行通过，用时约1.1秒。证据支持测试在并行 worker 负载下超时，不能据此记为产品功能 Bug。定向日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-targeted-retests/app-streaming-resident.log`。建议只给该场景设10秒局部 timeout，保留全部行为断言；现已获统一授权，可改测试并复跑完整 Desktop 套件。
- `file-diff-block.test.tsx` 的“仅提交精确 Runtime suggestion id”仍验证了提交 `suggestionId: "exact-1"`，但其 tooltip 断言沿用旧文案 `This file only`。当前 UI 展示 `精确路径 · 写入 · /Users/me/.agents/vocab.md · 本会话`，符合已实现的目录/授权范围说明。没有发现产品交互失败；建议只更新该测试的 tooltip 预期，保留精确 suggestion id 断言。该修正已纳入2026-10-23统一修复授权。定向日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-targeted-retests/file-diff-scope.log`。
- BUG-002 Computer Use 复验确认 Composer 没有非空 `pinned` 的产品调用路径；可到达的普通模型菜单和自动审批 PurposePicker 都不属于受影响分支。B002-01–05 继续标记未覆盖/阻塞，不代签通过。逐项证据：`tmp/codex-acceptance/20261022-acceptance-bugfix/bug002-retest/report.md`。
- BUG-031 Computer Use 定向复验完成真实 A → B → A 路线：三个状态的环境面板分支均与会话 canary 一致，旧 `workspaceRoot is not registered` 错误未再出现；分支绑定验收点通过。面板未显示工作树绝对 root，任意 workspace ID / 无关 root 没有真实 UI 输入入口，二者仍未覆盖；本次运行实例也早于后续全仓构建，不代表最新制品验收。逐项证据、截图与 AX：`tmp/codex-acceptance/20261022-acceptance-bugfix/bug031-retest/report.md`。

### 2026-10-23 BUG-019 局部修复

- 根因收敛到 Mermaid dialog 的初始焦点关闭按钮：按钮焦点显示的 Tooltip 位于 dialog 之上的 dismissible layer，第一次 Escape 被 Tooltip 消费；旧回归测试曾固定“两次 Escape 才关闭”的行为。
- Mermaid 关闭按钮现在禁用这处 Tooltip、保留 `aria-label`，由原 Dialog 处理单次 Escape。未修改共享 Dialog，不加全局键盘监听；图标按钮规范记录了这一窄范围例外。
- 新增单次 Escape 关闭且焦点返回触发器的回归测试，修复前失败、修复后通过；Markdown renderer 定向测试9/9、Desktop typecheck、renderer build 均通过。build 有既存 CSS `::highlight()` 与 chunk 体积提示。
- 首轮真实 Electron 定向复验由 `gpt-6.1-sol` 执行，但隔离窗口现有5个会话都没有 Mermaid/flowchart 回复，因此R1–R4未覆盖；未发Provider请求或改写数据，见 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug019-retest/report.md`。随后通过只读复用的隔离历史 Mermaid 回复完成真实 Electron R1–R4：渲染与放大、关闭按钮初始焦点、单次 Escape 关闭并回焦、指针关闭并回焦全部通过；Journal源/副本hash未变化，未发Provider请求。报告及截图/AX/版本/清理证据见 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug019-retest-followup/report.md`。BUG-019 已复验关闭，R23已通过；P2-D06因代码系统复制和链接系统打开未覆盖仍失败。

### 2026-10-23 BUG-015 定向复验与新增 BUG-035

- `gpt-6.1-sol` 在真实 Electron 中复验 BUG-015：390px右栏下普通指针多次打开范围菜单、六种scope（含commit/branch子菜单）、Enter/Escape焦点恢复、无统计空态，以及480px整窗菜单均通过；按钮与统计间隔4px。当前fixture为`+6001/-6000`，与原始`+6002/-6001`相差一行，因此原始精确数据未覆盖，BUG-015不关闭。完整步骤、bounding box、AX和截图见 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug015-retest/report.md`。
- 390px右栏工具栏`scrollWidth=470`、`clientWidth=389`；Tab到“提交或推送”后控件仍超出viewport约70.7px。原生水平滚动输入没有观察到位移，但接收情况不确定，故登记独立[BUG-035](../20261021-actspace-full-acceptance/bugs/BUG-035.md)，不把不确定的滚动输入本身写成已确认根因。2026-10-23隔离真实Electron补验R35-1/2/5再次确认末尾裁切，480px整窗浅/深主题已测焦点路线通过；R35-3代表性反向Tab/菜单Esc回焦通过；R35-4水平输入接收未覆盖，精确865px也未覆盖。逐项测量和构建哈希见`tmp/codex-acceptance/20261022-acceptance-bugfix/bug035-retest-followup/report.md`。D14/D20/R22仍未签收。尚无代码修改。

### BUG-036 Usage 未知 Token 聚合修复

- 用户批准按记录中的方案修复 BUG-036。shared IPC 增加逐字段未知 Token 请求数，read-model SQL 分离已知 Token 小计与未知 LLM 请求计数，工具行不计入未知数；renderer 区分未知、明确零和混合样本，并在输入/缓存读取依据不完整时隐藏缓存命中率。schema 升到13，旧派生索引从 Journal 重建；staging copy 明确排除 SQLite 生成列。
- `node --test apps/desktop/scripts/test-usage-read-model.mjs`：72/72通过，包含全未知、明确零、混合、工具行、范围、搜索、回建及重启回归；`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/usage-statistics-page.test.tsx`：9/9通过。Electron main/preload 构建、Desktop typecheck 与 renderer 生产构建通过；renderer 生产构建有既存 CSS `::highlight()` 和大 chunk 提示。
- 自动回归日志：`tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-usage-aggregate/usage-read-model-green.log`（72/72）和 `tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-usage-aggregate/usage-renderer-green.log`（9/9）；修前红测仍保存在同目录。
- `gpt-6.1-sol` 完成真实 Electron 原生 Computer Use 六项定向复验，6/6通过、0失败、0未覆盖；使用独立 app/profile、合成 Journal、正式 main/preload/IPC/SQLite/Usage Worker 和当前源码的隔离 Vite renderer，没有读写用户主 profile或触发真实 Provider 请求。逐项结果、14张截图、构建指纹与限制见 `tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-usage-aggregate/ui-report.md`。早期合成 fixture 的会话投影错误在最终自有 fixture 中补齐 Step 生命周期后消失，最终日志无 session projection 异常。
- BUG-036 已复验关闭；完整 P2-D11 仍失败，因其他协议、失败/取消、缓存、恢复和关联计量范围尚未全部完成。该定向结果不代签 P2-D11。

### 2026-10-23 BUG-009 原始路线补验

- 当前源码闭包重新构建成功；原 probe.py 只替换输出根目录，历史证据未覆盖。有输出 SIGINT、真实 PTY Ctrl-C、有输出 SIGTERM、静默 SIGTERM 均为相应130/143及aborted，工具一秒后不存活，无需补清理；原脚本计时包含退出后的1秒存活核对，总耗时约1.03–1.67秒。PTY缺输入仍为2/Missing input/stdout空。
- 已更新BUG记录、单项方案、CLI报告与P2-C02说明，避免继续标成“未修复”。其余扩展边界保留未覆盖，不增加已关闭数或覆盖率。证据：[原始路线报告](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-cli-original-retest/report.md)。

### 2026-10-23：全部 Bug 直接修复授权

用户明确要求后续所有 Bug 均可在验收过程中直接修复，不再逐项反问。已同步两阶段总计划、集中修复计划、Bug 索引及方案入口，撤销仅限局部修复、跨模块暂缓和验收结束后再讨论的限制。仍先定位并记录方案，补有效回归测试、同步必要规范，修后实际复验再关闭。BUG-035 原两文件局部方案和三个已定位的工程回归问题均可直接推进；未实现能力、外部前提和 Git/发布/数据保护边界继续明确记录。

## 2026-10-23 BUG-004、012、035闭环及工程回归

- BUG-004：契约矩阵4/4修后通过，原两项工程失败保留；已关闭。
- BUG-012：确认叶节点滚动会使预先累计的祖先frame偏移过期。改为滚动后只读测量，4个Go新回归及runtime断言红→绿，Go全包及Browser检查通过。真实Runtime→Go→扩展→Chrome链路两次reload均frame-idle→frame-clicked，已关闭；Browser当前60/0/2，P2-B02部分完成。
- BUG-035：局部焦点显露、portal包含关系保护及方向取整；20项回归、类型检查/构建通过。gpt-6.1-sol确认最终构建390px浅深及480px浅深键盘路线通过，已关闭。精确865px和水平设备输入未覆盖；D14/D20/R22其他要求未代签。
- 工程测试：已修正模态焦点选择器的扫描误拦、文件提示断言、流式等待状态时钟控制；全量回归仅剩工作树创建用例在并行负载下5秒超时，单独2/2通过。该用例已改用用户粘贴长文本，保持发送与会话选择断言，定向2/2通过；完整套件复跑记录于 `tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-full-tests-paste.log`。完整复跑已退出0：Desktop 249个测试文件通过、2个跳过，1975项测试通过、7项跳过；全仓 `pnpm test` 通过。`pnpm check:docs` 同轮通过。
- 上述末节为当前状态，前文带日期的失败和旧授权保留作历史，不构成待审批或当前未修结论。

## 2026-10-23 分叉、混合归档与安全矩阵

- BUG-020/022/024/037：六个原生 Electron 验收点通过，四项关闭。普通及工作树分叉、普通分叉切换/搜索/同 profile 重启、七条混合历史批量归档、其他分组保留、受控归档子过滤与普通分叉恢复均有逐项证据。工作树分叉恢复未单测，受控样本不冒称 UI 自然生成。报告：[原生复验](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/bug037-native/report.md)。
- BUG-008：三种协议×两类随机合成凭据×HTTP400/401/429/500/503，30项真实 CLI/HTTP/Runtime 错误链路全部通过。每项扫描44个输出/持久化文件，原值及URL编码值均未泄露，诊断保留。默认只请求一次，重试与 Desktop/Host 展示仍待补，不关闭。证据：`tmp/codex-acceptance/20261022-acceptance-bugfix/bug008-matrix/report.json`。
- BUG-002：新增显式隔离 pinned 代表场景，不接 Provider/IPC、不写持久配置；Desktop 类型检查、主题与 token 门禁通过。真实组件交互复验正在执行，产品无现行非空 pinned 调用入口的边界继续明确保留。
- 最新165项为74通过、23失败、68未覆盖或部分完成；37条 Bug 中26关闭、11未关闭。状态校准不等于验收完成，C批其他问题继续推进。

### 2026-10-23 BUG-002 代表场景补齐

使用当前 ModelPickerMenu、共享 Button 和语义主题 token 的独立夹具，经 gpt-6.1-sol 原生 Chrome 鼠标与键盘验收 B002-02–05 全部通过；两种 pinned 选择、Tab/Enter、搜索后 Esc 回焦/重开清空、浅深主题均有逐项证据，表单误提交0。原工程缺陷关闭；B002-01 无现行产品非空 pinned 调用入口，未覆盖。报告：`tmp/codex-acceptance/20261022-acceptance-bugfix/bug002-pinned-preview/report.md`。


### 2026-10-23 BUG-008 真实重试补验

两次尝试测试路由下，三协议×两种无效凭据格式×HTTP429/500/503共18项真实 CLI/HTTP/Runtime 重试均通过，每项实际请求2次；输出、Journal、Trace、result和专用目录无原值或URL编码值，诊断保留。追加 AgentLoop 三次尝试的最终成功/最终失败两项集成回归，全包49/49及类型检查通过。证据见 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug008-retry-matrix/report.json` 与 `20261023-agent-loop-retry-tests.log`。Desktop/Host错误展示仍未覆盖，不关闭 BUG-008，不提高整体验收覆盖率。

### 2026-10-23 BUG-008 Host 延迟绑定补修

Host修前6项中仅3项通过；非标准格式凭据进入实时事件、投影和3份Journal。根因是Host/Desktop后续模型路由才绑定实际凭据，PreparedLlmCall早期resolver为空。PiAiAdapter现按最终credential包裹两种引擎的错误流与异常，正常回复不变；9项新增回归修前全失败、修后全通过，适配器全包108/108、service27/27及两包构建通过。修后Host6/6，扫描47个数据文件及6份Journal均无原值或URL编码值，诊断保留，自有进程已停止。修前/后报告分别为`bug008-host-matrix/report.json`与`bug008-host-matrix-green/report.json`；Desktop原生错误展示仍待补，Bug保持未关闭。

### 2026-10-23 Web审批与CLI终止闭环

BUG-005：当前构建真实 Web 刷新、迟到观察者、客户端TCP断线/自动重连、批准/拒绝和390px浅深主题通过；Journal核实同一请求与拒绝不执行。维护排空与真实断线明确分开。write_file自动允许、长命令和Desktop远端仍未覆盖。原缺陷关闭，报告 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug005-web-retest/report.md`；自有服务/标签已清理。

BUG-009：新增真实后台/孙进程SIGINT及SIGTERM终止后恢复、不重放两项回归通过，完整进程19/19及CLI单元13/13通过；5秒期限为单元可控时钟证据，原始真实PTY/静默路线另有实测。原缺陷关闭，日志 `tmp/codex-acceptance/20261022-acceptance-bugfix/20261023-cli-process-19.log`。P2-W02/C02尚有原列缺口，改为部分完成；165项为74通过、21失败、70未覆盖，37条Bug为29关闭、8未关闭，不代签完整验收。

## 2026-10-23 BUG-014/023 关闭及 BUG-027 窄窗修复

- BUG-014 已按同一 5.25MB 样本性能、复制、Unicode、首中尾和整窗 480px 浅深主题原生证据关闭；持续按住鼠标跨屏手势受原生接口限制，仍未覆盖。BUG-023 已按工作树 A/B 文件、Review、刷新及独立终端实际目录原生证据关闭；旧 header 迁移等保留为综合项缺口。各 Bug 文档关联报告。
- BUG-027 原生复验发现 480px 授权范围菜单按长路径撑开，路径后缀和“本会话”越界。根因是只约束触发器，没有约束 Radix 弹层宽度与选项文本。新增 Select 可选 wrapOptions，授权范围组件设置弹层随触发器宽度且不超过可用宽度，全文换行；其他 Select 默认行为保持。
- 新增真实 Chromium 布局回归 `test:file-grant-scope-layout`。修前 480px 浅色弹层右界 1929.3125px、文字右界 1916px，红测失败；修后 480/1280px 浅深四场景菜单/全文边界、键盘选择、Esc 和选择后回焦通过。证据 `20261023-grant-scope-layout-red.log` / `20261023-grant-scope-layout-green.log`。相关 53 项组件测试、renderer/Electron 构建及 Desktop 类型检查通过；真实 Electron 定向复验正在补充，未经其通过不关闭 BUG-027。
- 同类检查：七处 Select 调用中仅授权范围启用新选项换行，默认值保持其他调用原样；不以此声称所有调用的任意长文本均已实测。前端验证文档新增长路径菜单边界及可选真实布局测试说明。

## 2026-10-23 BUG-008/015/021/025/027 关闭

- BUG-008：原生错误/手动重发/正常恢复通过，Session数据12文件7份Journal无原值/编码合成凭据，结合CLI/Host矩阵关闭。
- BUG-015：精确 +6002/-6001 的390px右栏及实际480×865整窗，普通指针、Enter/Esc与末尾Tab通过，原遮挡关闭。
- BUG-021：真实公开preload八项输入全通过；真实工具三类授权切workspaceId仅撤销command_prefix，Journal撤销seq85→目录设置seq86，运行中拒绝且不变，通过关闭。
- BUG-025：原生撤回THIRD后队首、释放HOLD实际按HOLD/THIRD/SECOND各一次，HTTP/Journal领取对账相同；结合45项持久化/终态回归关闭。
- BUG-027：原生目录读写/复用/撤销/隔离/exact重启及修后480px浅深长路径全部通过；Chromium布局红绿、53组件测试、类型检查和构建已记录。当前构建和真实尺寸补证见 `bug027-native-retest/fixed-build-window-facts.json`。

A–H原缺陷批次均已关闭。当前共37条 Bug、36关闭，BUG-016保留现行能力范围待确认；165验收点79通过、1失败、85部分完成/未覆盖。完整验收继续，批次勾选不代签未执行复合步骤。
### 2026-10-23 OBS-001 配置生命周期复核方案

首次配置看图用途后，同一进程仍返回未配置，而正常重启恢复；已有真实 Electron 时序表明设置有效视图和工具端口不同步。按最新统一授权继续定位：先在同一个 Desktop 工具端口记录模型解析时机，补首次配置、清除、替换与同/新会话回归，观察修前失败。若确认启动时捕获配置为根因，仅把 Desktop `inspect_image` 的模型解析移到每次工具调用入口，保留 artifact 所有权、辅助请求记录器、凭据引用和 Host 边界；静态 CLI/远端 Host 配置不改。修后检查现有搜索/生成同类端口，补规范及真实 Electron 同进程配置变更复验。观察在确认前不计新增 Bug，通过后再关闭。


### 2026-10-23 BUG-038 修复与自动化验证

OBS-001 现已确认转为 BUG-038。Desktop inspect_image 工具端口闭包缓存创建时配置，三项修前回归全部失败；按调用解析后，首次保存、替换、停用/恢复及同/新会话均通过。关联4文件16项通过，Desktop 类型检查及 Electron 构建通过；首次误用 package test 参数导致全套执行，249文件1975项通过，仅新增3项预期失败、2文件7项跳过，日志保留。设计规范已补充调用边界、在途身份和跟随回退语义，静态 Node Host 未改变。真实原生复验由 gpt-6.1-sol 在独立 BUG038 实例执行，完成前保持待复验，构建与证据位于 bug038-native/。


### 2026-10-23 BUG-038 原生关闭与 CLI 签收

BUG-038 的真实原生 V1–V5 全部通过，同会话原图首次看图、用途替换、移除全部视觉模型后拒绝、添加图片能力恢复、正常退出重启均有 HTTP/Journal 与原生证据；准确记录不存在 enabled 开关，初始公开 IPC 数据前置与原生操作分开。两个应用 PID 正常退出，报告位于 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug038-native/report.md`。

CLI C01/C02 最后缺口已补：真实 JSONL/三导出/同 Session 第二轮一致；实际 explore 子 Runtime 活动时 SIGINT/SIGTERM 分别130/143、父子各唯一 aborted、子连接关闭、恢复新输入且无旧任务重放。结合既有真实模型、PTY、权限和包外制品证据，两点均勾选通过，详见 CLI 报告末节。当前165项82通过/1失败/82部分或未覆盖；已有结论50.3%，全部通过49.7%。38条 Bug 中37关闭，BUG-016保留产品范围。继续其余验收，不将缺口降为通过。

## 2026-10-23 BUG-039 / BUG-040 红绿回归

BUG-039 修前窗口几何和Settings/Trajectory回Chat共5项失败，修后窗口3项、注册控制器4项、App上下文4项通过。BUG-040 修前fragment外链和重复脚注ID三项失败；修后Markdown12项/分块7项通过，包含两回复隔离、流式稳定ID和无障碍描述。合并4文件26项通过（不包含前述已单测的控制器4项），Desktop main/renderer类型检查及两项构建通过。证据为 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug039-040-*.log`，原红绿日志同目录。

两项均已修复待真实原生复验；系统快捷键派发需实际OS回调证据，不能用测试IPC或窗口bounds测试代签。已同步工作台与Markdown规范，脚注作用域学习速记见history链接。


## 2026-10-23 脚注关闭及系统主题 / Finder 补齐

BUG-040 原生 R40-1–3 通过：两个脚注与回链定位/焦点、系统 Chrome HTTPS、正常退出重开及浅深主题均有证据；结合红绿回归关闭，F7-01 全部列明子步骤补齐勾选。BUG-039 设置保存与快捷键注册/撤销可核实，但实际原生按键没有产生 quickOpenRequested 派发事件，窗口唤起、全屏/最小化、草稿回焦仍未覆盖；不以注册成功代签行为，不提前关闭。

V04 的 System 随真实 macOS Light→Dark→Light 及原值恢复通过；初次浅色滞留来自 Playwright Electron 默认媒体模拟，撤销工具覆盖后重新原生操作通过，未登记产品 Bug。R10 经真实 OpenInApp→Finder，原生 AX 精确文件 URL、选中状态和129字节与自有目标对账通过。报告为 `tmp/codex-acceptance/20261021-actspace-full-acceptance/system-finder-native-20261023/report.md`，脚注报告为 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug039-040-native/report.md`。

当前165项85通过、1失败、79部分或未覆盖；已有结论86/165（52.1%），全部通过85/165（51.5%）。40条 Bug 中38关闭，BUG-039 待原生行为复验、BUG-016 保留能力范围。继续 P2-D06 错误/空结果等可执行项，整体验收未完成，未提交或推送。

## 2026-10-23 工具错误与空态

真实原生 E1/E2 分别确认 BUG-041 失败 read 丢失动作/路径/详情入口、BUG-042 空目录计为一项；E3 非法 Mermaid 局部错误及完整源码、E4 空 Chat 隔离通过。按全部 Bug 直接修复授权，先登记根因与方案并新增红测，再修复工具身份/失败诊断展示及空目录计数。Renderer 修前 9 失败，修后相关 33 项通过；client 新增修前 4 失败，修后全包 38 项通过。Desktop 类型检查、client/renderer/Electron 构建、主题检查通过。gpt-6.1-sol 正在同 profile 正常重启后的真实原生定向复验，未提前关闭。

当前 165 项85通过、2失败、78未覆盖或部分完成，42条 Bug 中38关闭；P2-D06 实际失败单独记录，不将工程绿测代签 UI。证据见 bugs/BUG-041.md、bugs/BUG-042.md 和 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug041-*`、`bug042-*`。

## 2026-10-23 BUG-041/042 原生闭环

`gpt-6.1-sol` 在当前构建完成历史及真实新运行、失败诊断收放与禁止文件打开、空目录0项/空文件、Worked/空Chat往返、浅深代表及两次正常重开，R41-1/2、R42-1/2、R41-V全部通过。原URL/System恢复、草稿为空；未用源码或Journal旁证代签原生交互。报告：`tmp/codex-acceptance/20261022-acceptance-bugfix/bug041-042-native/report.md`。BUG-041/042关闭，P2-D06按原范围勾选通过。

当前165项86通过、1失败、78部分或未覆盖；已有结论87/165（52.7%），全部通过86/165（52.1%）；42条Bug中40关闭。继续真实IME、原生附件选择/粘贴和拖放路线，完整目标尚未完成。未提交或推送。


## 2026-10-23 原生生命周期及自动压缩补验

原生生命周期报告完成：真实终端 shell 在 Cmd-W 关闭窗口后退出，应用进程仍存活；按验收应用 bundle 激活后，同 PID 重开且历史、设置及 Composer 可用。Dock 两次绑定超时，系统快捷唤起未产生实际 OS 派发，分别保留未覆盖；不能把 bundle 激活等同点击 Dock。证据：`tmp/codex-acceptance/20261021-actspace-full-acceptance/native-lifecycle-remaining-20261023/report.md`。

Context 真实 Composer 连续五次 read_file，自然达到 64K 容量约48K阈值，自动压缩7消息、生成203字摘要并继续完成第五次读取；HTTP、Journal 和当前投影互相核实。局部 Token 估算下降与 Provider 固定 usage 分开，不据此声称商业计费下降。摘要明细无短预览确认为 BUG-043；先补两项修前失败回归，拆开摘要短预览和全文权限后，context-engine 全包27/27、类型检查及构建通过。规范继续只允许摘要短预览，不开放摘要全文。

首轮修后原生复验仍失败，核实是 Runtime Default Harness 制品保留旧实现：单独 engine 构建未更新 `packages/runtime/dist/default-harness/`。保留该运行证据，重建 Runtime Harness 并正常重启后再复验；BUG-043 不提前关闭。当前165点89通过、2失败、74部分或未覆盖，43条Bug中40关闭；P2-D10真实错误重试等原子步骤仍未覆盖。

## 2026-10-23 BUG-043 正确 Runtime Harness 原生复验关闭

重建 Runtime 闭包并正常重开同隔离 profile 后，`gpt-6.1-sol` 在真实新会话完成自然自动压缩、Context 摘要短预览及普通工具跳轨迹，R43-1–3 通过；原 endpoint、utility 和空 Composer 已恢复。保留首次旧 Harness 失败证据，不将其混同修后逻辑结果。[逐点报告](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/bug043-native/report.md)。BUG-043 关闭，P2-D10 回到部分完成，真实错误重试仍未覆盖。当前165项89通过、1失败、75部分或未覆盖；43条 Bug 中41关闭。继续文件删除提示和栏宽持久化等可执行缺口。


## 2026-10-23 BUG-044 删除文件失效提示

真实 Electron RP-2 确认已打开文件被删除后仍静默显示旧快照，无重新加载入口。根因为 `useFileFreshness` 忽略明确的 stat 错误；已改为过期提示，保持原快照和显式重读，临时 IPC 异常仍留待下次检查。修前3红/1绿，修后相关11/11、Desktop类型检查通过；尚未构建和原生定向复验，Bug不关闭，P2-D13记失败。当前44条Bug中41关闭；165项89通过、2失败、74部分或未覆盖，已有结论55.2%，全部通过53.9%。见[Bug记录](../20261021-actspace-full-acceptance/bugs/BUG-044.md)。

## 2026-10-23 BUG-044 闭环与 P2-D13 勾选

首轮真实重新加载发现旧 Tab 覆盖新读取结果；补2项修前失败的实际RightPanel集成回归，修后相关13/13、Desktop双端类型检查及renderer构建通过。当前构建第二轮gpt-6.1-sol原生R44-1–4全部通过：明确旧内容提示、显式重读不存在、恢复原68字节/SHA后树重开正常，浅深代表、System及390px和本批Tab清理均完成。保留首次失败，不将工程结果代签原生。BUG-044关闭。

按[原要求证据复核](../20261021-actspace-full-acceptance/right-panel-evidence-20261023.md)，P2-D13原列的文件格式/源码预览、Tab与尺寸持久化、系统打开/外链、跨面板/工作区隔离已分别补齐，现勾选通过。当前165项90通过、1失败、74未覆盖或部分完成；已有结论55.2%，全部通过54.5%；44条Bug中42关闭。终端终点与工作区原生目录操作继续执行。


## 2026-10-23 BUG-045 辅助请求计量工程修复

标题、压缩、自动审核三个实际请求入口补齐持久化辅助请求记录；真实请求开始落盘后才派发，结束落盘后才返回，业务解析失败仍保留已发生用量，缺usage与真实0分开。标题只归属Session，压缩可关联实际Turn，工具审核必须绑定实际Run/Turn/Step/call；不伪造后台Run。审核并发检查只排除本次审核自身的计量事实，其他变化仍拒绝。补齐插件依赖、实际Prepared请求ID、Journal/Usage与轨迹用途及压缩条目关联。

SQLite新增3项修前失败回归，修复单条触发器、批量写入、删除和时间范围统计的后台Run多算；请求/Token/费用保持计入。schema14使旧行及游标失效后从Journal重建，持久事实不改写。最终LLM service34、Journal36、自动审核12、压缩18、Desktop app14、Runtime相关20、Client相关7、轨迹相关26及数据库76项通过，套件有重叠不累加。Runtime依赖闭包、Client、Electron、Renderer构建与Desktop双端类型检查通过。

当前构建正常重开后，gpt-6.1-sol按R45-1–5进行真实原生标题、压缩、自动审核、Usage对账和重启复验；尚未关闭BUG-045。同步两份模型/Context计量规范，并新增[计量与业务结果学习速记](../../learnings/2026-10/20261023-transport-usage-vs-business-result.md)。未提交或推送。

## 2026-10-23 BUG-045 闭环与全量回归

当前构建真实原生标题、手动压缩、自动审核、Usage、双主题及正常重开通过。7次HTTP模型请求共546 Token（451输入、95输出），只计3个真实Run，辅助请求未混入Chat/Context；重开无新增请求、无重复统计。另在隔离副本将schema标为13，由当前生产应用触发schema14清空索引/游标及按需重建，再核对7模型请求、1工具、546 Token和3 Run全部一致。这不是实际旧版本升级，相关全项目缺口保留。详见[分方法证据](../20261021-actspace-full-acceptance/auxiliary-usage-20261023.md)。BUG-045关闭、F1-07勾选通过。

全workspace类型检查通过。首次根测试发现生成的契约矩阵过期，按生成器更新后，第二次根检查链全部通过；默认并行包测试遇到pi-ai 5秒超时，该包独立重跑108/108通过。逐包串行测试继续通过Desktop以前的所有包，Desktop默认worker下出现首个超时及React act连锁失败；三文件单独重跑82/82通过，Desktop完整套件以`--maxWorkers=2`重跑253文件通过、2文件跳过，2005测试通过、7跳过。未更改产品逻辑、测试超时或配置来规避失败；默认`pnpm test`本次退出非零，负载限制与重跑结果分别保留。日志在`tmp/codex-acceptance/20261022-acceptance-bugfix/bug045-auxiliary-usage/`的`test-workspace*.log`、`test-pi-ai-recheck.log`、`test-desktop-recheck.log`及`test-desktop-bounded.log`。

当前165项96通过、1失败、68部分或未覆盖；已有结论97/165（58.8%），全部通过96/165（58.2%）；45条Bug中43关闭。BUG-039仍待原生系统快捷派发，BUG-016仍属未交付Web能力范围。继续侧栏分页与多会话状态等可执行缺口；未提交或推送。

## 2026-10-23 BUG-016 Web 下载消费者

取消原范围待确认门槛，按最新授权实施原 §4 最小下载方案。修前 3 条场景因缺少入口红测，其余 104 条 Web 测试通过；实现 structured output 汇总、点击时 Host 快照、大小/分块/整文件校验与取消，新增 20 条定向测试已通过。Host 权限回归、完整 Web 构建和真实浏览器下载复验继续，尚未关闭 Bug。


## 2026-10-23 下载闭环与原生重载补验

165项中96通过、2失败、67未覆盖或部分完成；已有结论98/165（59.4%），全部通过96/165（58.2%）。47条Bug中45条复验关闭；BUG-016/046真实Chrome下载与错误恢复已关闭，P2-W03勾选通过；原生CmdR补验发现运行中正文暂时消失，登记BUG-047，F7-02/14-A1改为失败继续修复。BUG-039工程修复完成，系统快捷键实际派发仍未覆盖。

BUG-046源文件异常映射红绿回归、Host58项与构建通过，真实Chrome缺失/恢复/旧件对账通过；BUG-016证据为本轮bug016-web-retest报告。原生重载证据为native-reload-stream-20261023报告，运行中丢显示不等于永久丢数据。此前时点的计数与失败保留，最新状态见覆盖台账。未提交或推送；继续定位BUG-047。

## 2026-10-23 Goal批次：流式恢复闭环与Review布局修复

BUG-047设计/history、共享Client对Web检查及当前构建真实Electron R47-1–6已补齐，完整父项复核后F7-02/14-A1通过；Web真实WN01–04及124项工程测试/typecheck通过，P2-W02适用范围通过。BUG-039仍缺系统级快捷键派发证据，不因注册成功关闭。

NATIVE-REVIEW发现BUG-048：长代码画布让图片、文件/hunk操作移出可视区。主智能体串行改为在共享定位层中按viewport宽度横向粘附非代码行；宽度观察更新布局状态，避免纵向虚拟range不变时漏更新。新增回归修前1失败/原3通过，修后4/4；完整Desktop2007通过/7跳过、双端类型检查、token/theme/renderer-bridge及文档检查通过，renderer构建成功。源码d83f4fc0，514文件制品d1922158；原生N48-1–6尚在执行，不提前关闭。Review discard旧失败观察另行排除驱动dialog自动处理，尚未登记新Bug。

当前165项99通过/1失败/65部分或未覆盖，48Bug中46关闭。所有原生操作由gpt-6.1-sol独占桌面；主侧只读审计及证据核对并行，制品冻结，不提交或推送。


## 2026-10-23 BUG-048 原生闭环

主智能体审查NATIVE-048报告、截图与只读几何，N48-1～6全部通过；514文件制品d1922158及296源码条目均无漂移，System、1440窗口、390关闭右栏、左栏260及旧R14空草稿已恢复。BUG-048关闭；Review整项仍有Last Turn/复制命令等原有缺口，P2-D14恢复未覆盖而非通过。当前165项99通过/0失败/66部分或未覆盖，48Bug中47关闭，仅BUG-039未关闭，Goal active。

下一批NATIVE-DISCARD仅对专用small文件做真实Cancel/OK；持续observer-only listener已记录，原先无监听时的Playwright默认处理仍只是待排除因素，旧失败观察不直接算新产品Bug。Browser实际读取尚未执行，不签通过。


## 最新复核：BUG-049关闭与F3恢复复验（2026-10-23）

BUG-049已按[空响应证据闭环](../20261021-actspace-full-acceptance/empty-response-evidence-20261023.md)关闭：有效红绿回归、Core51/Runtime6/CLI进程19、类型检查/构建和58包边界检查通过；真实生产CLI经合成HTTP Provider完成父子空结果链路，独立冷Node进程再次空主轮完成且旧父子事实不变，固定Harness消费版本已完整核对。P2-C02恢复通过；165项现为99通过、0失败、66部分或未覆盖，49条Bug中48关闭，仅BUG-039未关闭。测试、真实CLI、原生和商业端点证据分列。

F3-02 FE1健康与FE2停机隔离header-only故障的真实加载→耗尽无摘要空态已通过，原字节已恢复，当前PID69929执行FE3原生恢复复验。实际配置gpt-6.1-sol/high的f3_restore_high独占桌面，f3_high_audit独立审查完整复合范围；尚不提前勾选F3。原CLI42文件、父记录和2721冻结条目核对未变；故障副本不称自然零事件。Browser B-58/B-60专用Chrome的两次原生绑定均超时，未执行读取或触及剪贴板；专用Chrome/Host及driver均结束，仍未覆盖，不降级CDP交互。后续已授权验收持续执行，Goal active，不提交或推送。


## 最新状态：F3-02通过，Context成功重试续验（2026-10-23）

[子记录恢复完整证据](../20261021-actspace-full-acceptance/subagent-recovery-evidence-20261023.md)已主审通过：FE3 High原生任务全文/API全等/原字节与冻结构建保护/初始UI恢复通过，旧ENOENT、Markdown及换子错误隔离按其原Electron/CDP方法和版本保留。F3-02勾选；当前165项100通过、0失败、65部分或未覆盖，全部通过100/165＝60.6%；49条Bug中48关闭，仅BUG-039未关闭。

PID69929已正常关闭并确认应用退出后停止driver。下一批Context使用同冻结构建、独立自有旧profile新PID76528/CDP54838；controller78103仅操作自有终态Journal，未施加故障。旧280871字节前缀完全一致，正常关机只追加seq100 session/end-seed；新基线281221字节/SHAfd01a50822fa82d435861716dbe4ec09c5c7fa2ea3e73770f8a3f7aa73ec8fb4。将按真实原生失败重试→夹具恢复→立即成功重试及轮询时序取证，不以轮询自行恢复代签点击因果。Goal继续active。


## 最新状态：Context原行签收（2026-10-23）

[Context原生失败/成功手动重试证据](../20261021-actspace-full-acceptance/context-retry-evidence-20261023.md)CR1–4已主审通过，独立只读审查核对当前P2-D10原行及引用范围后支持聚合签收。A完成→原源恢复→原生B→1485ms内内容恢复，排除5000ms轮询及pending；U时历史尚同步中，完整统计在后续往返核对，不混写时点。第一观察器缺陷中止窗口保留且排除；原事实/8请求/2721冻结条目保持，UI恢复，controller及应用正常退出后driver结束。

当前165项101通过、0失败、64部分或未覆盖（61.2%），49条Bug中48关闭，仅BUG-039未关闭。Goal继续active；下一批沿剩余项可执行性审计选择本机有限补验，不重新输出启动指令、不提交或推送。


## 2026-10-24 BUG-050主审关闭与原生方法门

[原生R50及版本主审](../20261021-actspace-full-acceptance/palette-evidence-20261024.md)关闭BUG-050：296源码/2342制品/112原文件无漂移、无Session/Journal/模型请求，原生搜索返回/滚动/末项/过滤/回焦和浅深宽窄代表通过。旧build摘要按manifest保存顺序计算，元数据差异已明确、原清单不改。09-P3-4条件翻转仍未覆盖，当前165项103通过、0失败、62部分或未覆盖，50Bug中49关闭，仅039未关闭。

新Sol/high原生方法门确认无新增系统输入、hover、叠层/音频或Mac窗口ID入口，未重复旧失败；精确owned81736原生CmdQ、code0退出，main/renderer消失并释放桌面。下一批独立SECURITY-NATIVE：自有6canary、7次read_file、最多20本地HTTP，覆盖P2-R02本机边界子项，不代签旧凭据或远端附件。准备脚本和制品已固定，尚未开始业务。Goal继续active，无暂存、提交或推送。


## 2026-10-24 快捷唤起按用户要求跳过

用户明确要求“快捷键先不用验收啦，我自己手动验收，跳过吧，文档里面标注跳过”，取代此前可配合人工触发的安排。系统全局快捷唤起及BUG-039的R39-1–4调度为“用户跳过（自行验收）”；不启动实例、不派发子智能体、不再请求逐步人工按键。R39-5原值恢复及已有录制/设置/工程回归证据保留，本次没有新增真实验收或产品改动。

F4-01、P2-D03、P2-D18仅相关快捷唤起子步骤标注跳过，其他范围不免验。验收结论仍未覆盖，BUG-039工程已修复、待用户复验且未关闭；104通过/0失败/61部分或未覆盖、51Bug中50关闭的计数不变。跳过不作为通过、不适用或全面验收完成。其余最小条件见剩余前提，未重复已无信息的受阻路线；等待用户实际结果与版本后据实回填。

## 2026-10-24 最新用户调整：无人值守，不等待系统授权或现场配合

用户明确将需要系统级授权的验收改为跳过，并说明可能五六小时不在场。此前“可以配合系统授权”的安排被取代。主智能体取消人工Host授权批次（未启动业务服务），同步正式计划、coverage、dispatch、前提、交接和Bug索引；凡需系统密码、人工授权或现场操作/听读确认的子步骤直接用户跳过，不提问、不等待、不反复触发弹窗，其他独立可执行工作继续。

系统凭据授权直接影响22个原编号，另2个汇总项；同一配对前提复用，不代表22次密码。其他OS人工子步骤单列；只改调度，验收结论仍未覆盖，原范围、编号、子步骤、历史证据和165分母均保留。104通过/0失败/61部分或未覆盖、51Bug中50关闭不变，039工程已修复、用户跳过真实复验且未关闭。非授权的设备/交付/专用凭据/状态及性能缺口保留各自原因，不改写为通过或不适用。

当前Goal工具无法修改objective；Sol/high子智能体尝试只读取得Codex应用以检查公开编辑入口时，Computer Use以安全原因明确拒绝，未进行UI编辑。完整替换文本已准备，应用保存的原Goal文本尚未改写；当前聊天和仓库最新规则已生效，不要求用户重新开启Goal。详情、影响清单和工具原始报告见[无人值守规则](../20261021-actspace-full-acceptance/unattended-policy-20261024.md)，完整文本见[Goal替换文本](../20261021-actspace-full-acceptance/goal-unattended-20261024.md)。本次仅同步流程文档，无产品修改或新增验收通过。
