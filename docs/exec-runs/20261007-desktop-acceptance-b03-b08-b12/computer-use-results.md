# B03 / B08 / B12 真实 Electron 定向复验

## 授权、版本和验证层

用户已批准三项修复与真实复验；其余统一验收范围仍只记录。本文件由 gpt-6.1-sol Computer Use 子智能体维护，不改产品代码、不使用浏览器/mock。准备阶段已读 active 修复计划与旧逐项结果、核对关键旧截图。等待主智能体通知 build ready；此前不操作应用、不退出或重启。

现有 runtime 历史身份为 Actspace Dev actspace-agent-2067 / com.actspace.desktop.dev.w2067fa05，末次 PID9196。执行前重新核对 PID、窗口与实际版本，不沿用旧坐标。真实 UI 操作用 CUA 和已授权的标准原生 AX/OS 输入；输出截图主要为回复内精确命令结果，实际工具完成/cwd另由tool/result白名单佐证，不声称截图每条都为独立stdout原面板。源码、journal/provider 白名单和 Git 元数据只作独立辅证，不冒充界面行为。

## 验收点

| 编号 | 前提、行为与预期 | 当前结果 |
|---|---|---|
| B03-1 | fixture 持久会话打开 Review 未提交范围，保存外部编辑前文件列表/差异基线。 | 通过 |
| B03-2 | Review 保持打开与同范围，父智能体仅追加 fixture 唯一文本；不刷新、不切范围。界面自动出现对应文件与准确新增行。 | 通过 |
| B03-3 | 恢复本轮追加行后，同一 Review 自动移除该差异，保留已有 fixture 变更。 | 通过 |
| B08-1 | 记录搜索原连接状态；同一专属会话真实 web_search 一次，确认已连接智谱实际 provider 前提。 | 通过 |
| B08-2 | 真实设置管理智谱→断开，记录 UI 未连接。会话/应用不重启，回同一会话实际新查询；工具结果/安全 provider 白名单不再出现 zhipu。只凭 UI 断开或模型自述不算通过。 | 通过 |
| B08-3 | 断开后的查询成功使用仍连接的渠道，或给出准确未配置/失败状态；不把 provider 失败误称 IPC unknown。 | 通过 |
| B08-4 | 正常退出后由父智能体仅恢复原 zhipu 加密条目（保留其它值），正常同 dev:log 重启，UI 确认原连接；必要时实际搜索确认恢复后的服务可用。 | 通过 |
| B12-1 | 新建页明确选 fixture、有提交 Git、非默认起点 codex/acceptance-alt 与新建工作树；首发前标签反映选择。 | 通过 |
| B12-2 | 首条真实请求仅做只读 pwd、git branch --show-current、git worktree list --porcelain、git rev-parse HEAD；UI 展示真实工具 cwd/输出，实际新目录在 worktree list，基于所选提交。禁止回落原目录后假通过。 | 通过 |
| B12-3 | 持久会话 UI 显示真实工作树/分支绑定，与工具 cwd 和只读 Git/journal 元数据一致；原 fixture main 分支保持不变。 | 通过 |
| B12-4 | 切另一安全会话/空页再返回，重开/正常重启后再次只读 pwd、branch，仍为同一工作树目录与绑定。 | 通过 |
| RESTORE | 搜索/其他临时设置恢复；仅归档本次精确验收会话，应用保持可用。新工作树只记录明确本次资源，不删除用户既有资源。 | 通过 |

## 操作分组与证据

1. **正常启动与同会话 Review 路线**：收到 build ready 后正常 Quit 旧应用，由父启动同工作区 dev:log；绑定新 PID/window。复用已有登记 fixture 创建一个专属持久会话，短只读首发后打开 Review。记录编辑前状态，通知父追加唯一行，直接观察自动更新，再恢复该行观察回退。保留前后关键截图及父编辑时间/文件辅证。
2. **同会话搜索凭据路线**：在该会话先实际搜索以建立已使用智谱的同端口前提；设置搜索页记 2/4 等实际原状态，管理智谱→断开，然后回同一会话发不同查询，记录工具结果及 provider 白名单。此两次查询之间不重启、不换会话。断开后保持恢复待办；不展示/输出 Key。
3. **工作树首发与持续绑定路线**：单独新建 fixture 会话，选 codex/acceptance-alt 起点与新工作树，真实首发只读 Git 命令。记录首发前选择、工具实际目录、持久 UI 与 Git 辅证；切空页再返回。最后正常 Quit 恢复 zhipu，再同 dev:log 重启，一次核搜索恢复和工作树再次 pwd/branch 绑定。精准归档本次对象后留应用可用。

工具/服务失败按对应子项记录并继续可执行步骤；复合项缺任何关键实际行为不写全通过。若前台被用户切换，停止物理键鼠批次并刷新目标，不对其它应用发旧坐标。

## 安全基线准备

- fixture：`/var/folders/h6/wv0phjfx6pb36n57tb4d9sww0000gn/T/actspace-fe-acceptance-9omqvkkf/git-workspace`。准备时只读 status 为 `M sample.txt`、`?? sample-image.png`；worktree list 仅原 main，HEAD56a2cd385617e3fc7014a1dfe2f23cbe700b0063。不撤销这些旧变更。
- 旧私密备份目录存在，文件0600；父已准备本轮专用 `private-b03-b08-b12/secrets.json`（fixture根下，目录0700/文件0600），确认 zhipu 条目存在而不打印值。恢复仅合并本轮删除的加密条目，不整份覆盖设置或 secrets。
- 默认 deepseek-flash、tools 原[]、主题Light、快捷原⌘⇧Space/指定旧会话、English off、Thinking1/EffortHigh等是上轮已恢复事实；本轮 UI 原值仍须现场读取，未经本轮观察不冒称当前通过。
- B03 只追加/移除本轮唯一行；不覆盖 sample.txt 旧内容。B12 仅使用专属 fixture，读取与创建工作树均不作用于产品仓库。

## 旧失败依据（历史，不计新版本结果）

- B03：旧 Review 打开期间 sample.txt 外部新增未出现，切范围才读取到；[旧截图](../20261005-desktop-fe-00-overall/screenshots/computer-use/desktop/review-auto-update.png)。
- B08：旧 UI 智谱断开/1of4，真实后续 web_search Providers 仍 tavily,zhipu，父安全白名单佐证；[旧断开](../20261005-desktop-fe-00-overall/screenshots/computer-use/desktop/zhipu-disconnected.png)。
- B12：旧新建页选工作树后首发仍 main·本机；[旧终态](../20261005-desktop-fe-00-overall/screenshots/computer-use/desktop/worktree-firstsend-after.png)。

## 执行记录

准备完成。主智能体通知三个构建与定向测试通过，允许正常 Quit；退出前只读核旧PID9196已不存在、nativeAX仅root/CG无窗口，未向其它Electron发送操作。等待父确认现有实例或同dev:log新PID，重新CUA绑定。B12明确从主新建按钮进入，不能用归档工作区fallback空会话。


### B03/B08 现场建立

实际 main PID38849（38896 是 network Helper，已只读身份纠正）；window21307/bounds15,33,1440×856。CUA正常重绑一次63s，之后标准nativeAX/截图<1s。

首个系统目录选择后未核最终标签便首发，短无工具会话实际落产品目录，不能计fixture前提；没有执行工具或修改产品，其唯一标题桌面重测 B03 B08待精确归档。纠正后再次主新建→已有文件夹，系统Open返回后实际截图明确git-workspace/main/本机，才首发FIXTURE-RETEST-READY；实际持久会话Fixture B03 B08 retest位于git-workspace。

B03-1通过：Review未提交范围初态同时sample-image.png与sample.txt旧+1行，准确旧文本。证据 [初态](screenshots/review-open-initial.png)、[首发前fixture](screenshots/fixture-selected-before-send.png)。通知父追加本轮marker，保持同一面板/范围不刷新。


### B03 新增自动更新与 B08 同端口前提

- B03-2通过：父UTC14:46:49.300111仅追加22bytes标记B03-FIX-20261007-2244；期间本agent没有UI动作。真实同Review未提交范围立即准确新增第3行，sample.txt/Composer计数+1→+2，安全AX marker matched1。[自动新增](screenshots/review-auto-marker.png)。
- B03-3恢复观察：父UTC14:48:02.907364仅移除该marker107→85bytes；此间本agent误提前进设置再返回，故删除后实际+1/marker消失只能作为恢复终态，不能冒称全程同面板可见。[恢复终态](screenshots/review-before-marker-remove.png)。追加路径真实自动刷新满足B03核心失败复验，不借删除路径补虚假覆盖。
- 专属fixture会话ID3618e60e-f8b0-4435-a3b5-c6ffa7409b1e；首轮误用产品会话33f64e46-6abc-474c-b3d7-ccbf5698ddf2实际是上轮遗留空会话，本轮仅追加无工具marker，未创建/修改产品文件。精确清理时另记来源。
- B08-1通过：实际UI智谱/Tavily2of4连接，[原连接](screenshots/search-connected-baseline.png)。同会话真实web_search基线完成，[工具日志](screenshots/search-baseline-tools.png)。父仅安全journal seq74 modelOutput Providers行确认tavily,zhipu，UTC14:48:53.953，不用模型回复Provider note替准确工具结果。
- B08-2执行中：实际管理智谱→断开，UI1of4/智谱连接按钮，[已断开](screenshots/zhipu-now-disconnected.png)。仍同实例同会话，随后不同上海博物馆query真实发送，等待工具结果；未重启/未换session。


B08-2/3通过：同3618e60e…第三轮真实Web search completed for 上海博物馆 开放时间 官方 公告，Worked6s，完整回复与空闲现场正常。[完成](screenshots/search-after-disconnect-complete.png)、[展开真实结果](screenshots/search-after-disconnect-tool-output.png)。父安全journal seq381 tool/result Providers只有tavily，磁盘zhipu条目已不存在，seq386模型复述不作调用；与同端口断开前seq74 tavily,zhipu相比确认即时生效。未重启/换session。恢复仍待下一正常重启UI核。

为最新B12构建，实际Quit Electron标准菜单AXPress退出38849，fresh ps38849/38895/38896/38927全消失、nativeAX仅root。父随后只恢复zhipu原加密条目并正常同dev:log启动。本轮未改其它设置。B03删除回退期间切走，明确未完整覆盖持续观察，正向自动更新通过证据独立保留。


### B08恢复与B12真实首发/切换

父仅恢复原zhipu加密单条，同dev:log启动main62138，CUA重新绑定window21387（15,33/1440×853）；设置搜索真实2/4、智谱与Tavily已连接。[恢复](screenshots/search-zhipu-restored.png)。B08-4通过，B08整项通过。

B12-1通过：主新建按钮进入空新建页，git-workspace工作区已明确；真实选择非默认codex/acceptance-alt→运行位置“新建工作树 从 codex/acceptance-alt 创建隔离分支”。[首发前](screenshots/worktree-selected-before-send.png)。首条发送只读pwd/branch/worktree list/HEAD，实际审批卡完整命令，批准后执行成功。

B12-2/3通过：Session56149031-44dd-4907-b1fe-90e65e08af6d，实际标题B12 worktree只读命令复测；UI准确显示路径/Users/wakeup-jin/Library/Application Support/ActSpace/worktrees/41969623/git-workspace，分支actspace/41969623，两worktree均HEAD56a2cd385617e3fc7014a1dfe2f23cbe700b0063，原目录仍main。[实际首发审批与工作树](screenshots/worktree-first-send.png)、[输出](screenshots/worktree-tools-complete.png)。父journal header baseBranch=codex/acceptance-alt/baseCommit56a2cd3/cwd工作树及bash seq89 completed独立辅证。底部工作树/分支绑定一致。顶部环境弹层显示来源main/本机，单独保留[显示](screenshots/worktree-environment.png)，不据来源显示否定真实cwd。

B12-4切换子项通过：点击专属Fixture B03 B08 retest再返回B12；fresh settled截图仍同actspace/41969623·工作树、准确原输出。[切换返回](screenshots/worktree-after-switch.png)。正常Quit冷重开与再次pwd/branch仍待执行。

B03补测已再次打开3618…真实Review同未提交范围/sample.txt旧+1，保持面板待父marker追加。[补测基线](screenshots/review-repeat-baseline.png)。


### B03完整往返回退补验

父UTC15:20:28.815527仅追加B03-ROUNDTRIP-20261007，85→108bytes。保持同一Review/未提交范围，本agent完全没有UI动作，真实界面自动出现准确第三行，+1→+2。[出现](screenshots/review-roundtrip-added.png)。父UTC15:23:49.726887仅移除该行108→85bytes；本agent仍未导航/刷新/切范围，真实同面板自动移除第三行，+2→+1，原旧行/sample-image保留，nativeAX marker matched0。[回退](screenshots/review-roundtrip-restored.png)。B03-3现补通过，首次恢复未持续观察历史保留但不再是覆盖缺口；B03整项通过。

随后真实标准应用菜单Quit Electron AXPress退出62138（非信号杀进程）。等待父同dev:log最终重启，验证B12冷恢复。


### B12冷恢复、精确清理与最终结论

同工作区dev:log最终正常启动main69765/window21510（15,33/1440×856）。CUA重绑实际启动直接恢复同56149031工作树会话，底部仍actspace/41969623·工作树。再次真实发送只读pwd与git branch --show-current；审批完整两命令，批准后UI精确输出与首轮一致，exit0，完成停止按钮消失。父安全journal seq681 UTC15:31:37.831 bash completed/exit0及cwd/branch一致独立辅证。[冷恢复请求](screenshots/worktree-cold-reopen-request.png)、[完成](screenshots/worktree-cold-reopen-complete.png)。B12-4通过，B12整项通过。

随后主新建进入空页；对未选中的三个唯一标题标准AXShowMenu→归档，分别freshAX标题matched0：

- 56149031-44dd-4907-b1fe-90e65e08af6d，B12 worktree只读命令复测。
- 3618e60e-f8b0-4435-a3b5-c6ffa7409b1e，Fixture B03 B08 retest。
- 33f64e46-6abc-474c-b3d7-ccbf5698ddf2，桌面重测 B03 B08（上轮空验收对象，本轮误首发短无工具，仅归档不删除）。

设置搜索实际2/4智谱与Tavily连接、允许联网搜索仍开；默认DeepSeek、cheaprouter.cc原名、主题浅色/原字号现场确认。本轮仅改变过智谱连接，父仅恢复同加密单条，其它settings本agent未改。[搜索恢复](screenshots/final-search-restored.png)、[模型原值](screenshots/final-model-baseline.png)、[外观原值](screenshots/final-appearance-baseline.png)。关闭设置返回空新建页，main69765仍运行并可用。[最终可用](screenshots/final-available-app.png)。保留本次41969623工作树作证据，不删除、不改原main；fixture sample.txt已回原85bytes/旧变更，未清理sample-image。RESTORE通过。

**终态：B03/B08/B12三项真实Electron定向复验通过；逐项表全部已收口。** B03首轮回退未连续观察不足已由同面板完整往返补验；搜索provider精确名单来自真实tool/result安全白名单，UI完成与连接状态由实际交互支持；工作树首发/切换/正常Quit重启/实际工具目录有现场证据与独立元数据一致，不以模型自述或源码替通过。远端、浏览器/mock、其它历史未覆盖项及其它Bug不属于本轮。

版本：执行末只读main HEAD4301a0e56568c4f049bae8a2efd021d26e53a310，执行期间外部提交多次收录修复代码；结论对应实际构建/启动的工作区，非仅按HEAD推定。绑定过程的CUA完整树约61–92秒，普通AX/截图通常小于1秒；标准原生AX为真实界面动作，工具成功码仅作动作记录，全部通过依据settled现场与必要中间状态。
