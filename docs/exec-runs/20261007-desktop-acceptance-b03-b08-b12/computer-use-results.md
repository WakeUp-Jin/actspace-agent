# B03 / B08 / B12 真实 Electron 定向复验

## 授权、版本和验证层

用户已批准三项修复与真实复验；其余统一验收范围仍只记录。本文件由 gpt-6.1-sol Computer Use 子智能体维护，不改产品代码、不使用浏览器/mock。准备阶段已读 active 修复计划与旧逐项结果、核对关键旧截图。等待主智能体通知 build ready；此前不操作应用、不退出或重启。

现有 runtime 历史身份为 Actspace Dev actspace-agent-2067 / com.actspace.desktop.dev.w2067fa05，末次 PID9196。执行前重新核对 PID、窗口与实际版本，不沿用旧坐标。真实 UI 操作用 CUA 和已授权的标准原生 AX/OS 输入；源码、journal/provider 白名单和 Git 元数据只作独立辅证，不冒充界面行为。

## 验收点

| 编号 | 前提、行为与预期 | 当前结果 |
|---|---|---|
| B03-1 | fixture 持久会话打开 Review 未提交范围，保存外部编辑前文件列表/差异基线。 | 待执行 |
| B03-2 | Review 保持打开与同范围，父智能体仅追加 fixture 唯一文本；不刷新、不切范围。界面自动出现对应文件与准确新增行。 | 待执行 |
| B03-3 | 恢复本轮追加行后，同一 Review 自动移除该差异，保留已有 fixture 变更。 | 待执行 |
| B08-1 | 记录搜索原连接状态；同一专属会话真实 web_search 一次，确认已连接智谱实际 provider 前提。 | 待执行 |
| B08-2 | 真实设置管理智谱→断开，记录 UI 未连接。会话/应用不重启，回同一会话实际新查询；工具结果/安全 provider 白名单不再出现 zhipu。只凭 UI 断开或模型自述不算通过。 | 待执行 |
| B08-3 | 断开后的查询成功使用仍连接的渠道，或给出准确未配置/失败状态；不把 provider 失败误称 IPC unknown。 | 待执行 |
| B08-4 | 正常退出后由父智能体仅恢复原 zhipu 加密条目（保留其它值），正常同 dev:log 重启，UI 确认原连接；必要时实际搜索确认恢复后的服务可用。 | 待执行 |
| B12-1 | 新建页明确选 fixture、有提交 Git、非默认起点 codex/acceptance-alt 与新建工作树；首发前标签反映选择。 | 待执行 |
| B12-2 | 首条真实请求仅做只读 pwd、git branch --show-current、git worktree list --porcelain、git rev-parse HEAD；UI 展示真实工具 cwd/输出，实际新目录在 worktree list，基于所选提交。禁止回落原目录后假通过。 | 待执行 |
| B12-3 | 持久会话 UI 显示真实工作树/分支绑定，与工具 cwd 和只读 Git/journal 元数据一致；原 fixture main 分支保持不变。 | 待执行 |
| B12-4 | 切另一安全会话/空页再返回，重开/正常重启后再次只读 pwd、branch，仍为同一工作树目录与绑定。 | 待执行 |
| RESTORE | 搜索/其他临时设置恢复；仅归档本次精确验收会话，应用保持可用。新工作树只记录明确本次资源，不删除用户既有资源。 | 待执行 |

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
