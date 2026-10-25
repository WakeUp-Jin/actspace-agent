# ActSpace 本轮验收结算与后续未验证清单

更新：2026-10-25。**用户决定本轮验收到此为止：暂时没有时间继续，当前功能不影响主要使用；未验证部分留到后续统一对外发版时再做完整验收。** 本轮停止调度，验收未全部完成；本页是唯一维护入口，旧派发、续接与“待审核”指令全部停止。

## 最终结果

| 口径 | 结果 | 说明 |
| --- | --- | --- |
| 原验收编号 | 165 | 保留字面编号；编号可包含多个子步骤，不等于 165 个等量工作包。 |
| 历史通过 | 104 | 保留原版本与证据方法，未声称当前版本全部重新验过。 |
| 尚有未验证内容 | 61 | 包含部分覆盖、用户跳过、外部受阻、方法/结果缺口和当时未交付；均不计通过。 |
| 当前失败行 | 0 | 不代表没有未覆盖内容或没有未关闭 Bug。 |
| Bug | 52 个，51 个已关闭 | BUG-039 工程已修，系统快捷唤起用户自行验收，仍未关闭。 |
| Browser 命令子清单 | 62 条，60 通过、2 未覆盖 | B58/B60 剪贴板读取未覆盖；此表不再累加到原 165 项。 |

本轮功能范围截至 `50befa8c`；实际在 `7d3cc898` 加未提交 BUG-052 修复的源码/构建上执行，随后保存为清理前快照 `8dbc68a5e41d212377e3cfba48525cec647f32bb`。用户已验收的后台模式、后台任务管理及相关修复（`ce19e4d6`、`40320e0b`、`7d3cc898`）范围外，不重复验收；原有子对话展示/恢复和子轨迹保留。未交付功能不为验收补做，也不从历史快照推导未来版本的交付状态。

最新产品批次冻结源码 2356 条，SHA256 `e1cfe1e4a562eb90b6b030d9807e80406238238e9ea23f9c069f90209bcf9e67`；构建 2350 条，SHA256 `c6f24ceaa48990ca4e04950131eba14a35915c15cb2ac04557b3940727037c85`。这是产品源码/构建清单，不涵盖本次文档清理；完整清单见本地证据的 `frozen-build.json`，旧批证据仍只证明各自当时版本。工程、协议、受控 Provider、商业端点、浏览器、Electron 原生和 OS 证据分别有效，不能相互代签。

## 61 个未完整验证项

**当前统一安排：因暂时没有时间，本轮不再推进；未来对外发版时按发布版本重新确定验收范围和条件。** 下表保留原编号及真正未验证的子步骤，已完成部分不因延后而撤销。Host、IME、读屏、设备等条件有交叉，同一条件可能影响多个编号，61 不是 61 次人工操作。旧要求、复合子步骤及逐批证据在清理前 Git 快照的 `coverage.md` 和 `scope-50befa8c-20261024.md` 中完整保留。

| 原编号 | 仍未验证的内容、已有边界或所需条件 |
| --- | --- |
| F1-01 | 旧版系统加密凭据、退役额外 Key 的真实样本迁移；价格/用途迁移及双启动证据已有。 |
| F1-09 | Kimi/OpenRouter 管理 Key 的真实账户余额；DeepSeek、受控费用和失败重试已有证据。 |
| F4-01 | 系统快捷唤起由用户自行验收；侧栏、搜索与过滤已有证据，BUG-039 未关闭。 |
| F6-02 | 索引重建中间阶段及计数的真实观察；UR1/3/4 已有证据，UR5 最终整合未交付。 |
| F7-03 | 商业恢复长正文的同 PID 中段采样及内存收敛；CT13/14 受控路线已完成，F9/T4 最终整合未交付。 |
| F9-01 | 侧边对话最终整合版的创建、侧栏和上下文继承未验证；当时尚未交付，独立分支证据保留。 |
| F9-02 | 侧边对话最终整合版的 Plan、模型和只读隔离未验证；当时尚未交付。 |
| F9-03 | 侧边对话最终整合版的主对话加两个侧对话并行、发送与停止未验证；当时尚未交付。 |
| F9-04 | 最终整合版隐藏/重开/重启恢复及远端未验证；独立分支证据不能代签。 |
| F9-05 | 最终整合后的模型、Context、统计、侧栏、schema 与资源回归未验证；当时尚未交付。 |
| P2-D03 | 系统快捷唤起及需现场配合的原生手势；普通侧栏、分叉、归档和已验证拖动不重开。 |
| P2-D04 | 真实输入法候选组合与原生图片拖放；其他输入和附件路线已有证据。 |
| P2-D12 | F9 最终侧边对话整合；原有子对话展示/恢复及子轨迹已验证，不因同名排除。 |
| P2-D14 | Last Turn loader 当时未交付；其余已验证 Review 子步骤及 Bug 关闭保留。 |
| P2-D16 | Desktop 有效远端 Host 的添加、重连和移除界面；协议/Web 证据不能代签。 |
| P2-D18 | 语音、音频停止队列及系统快捷唤起；需要服务凭据/听读配合，通知来源当时未交付。 |
| P2-D19 | 准确的 Dock 重开路线；同 PID 激活及窗口清理已有证据。 |
| P2-D20 | 真实 VoiceOver 听读确认；主题、焦点和键盘已有证据。 |
| P2-H01 | Desktop 有效 Host 配对、在线/离线/撤销与选择器；相关系统授权子步骤用户跳过。 |
| P2-H02 | Desktop 远端发送、审批、文件/路径/凭据归属、重连及移除后历史；Host/Web 已有独立证据。 |
| P2-H03 | Desktop 远端启停、SSH、维护及恢复界面；真实隔离 SSH 与协议进程路线已验证。 |
| P2-W04 | PWA 安装、独立窗口和真实更新可见切换，以及 iPhone/Tailscale；离线冷壳与自然恢复已验证，推送未交付。 |
| P2-B01 | 首次原生安装的授权允许/拒绝及真实模型审批路线；不得用协议调用代签。 |
| P2-B02 | B58 文本剪贴板读取和 B60 富剪贴板读取；62 条子命令中其余 60 条已有证据。 |
| P2-B03 | 剪贴板读取、首次原生授权及真实模型审批；claim、隔离、上传和下载已有证据。 |
| P2-R02 | 真实旧 OS 密文迁移与 Desktop 远端附件边界；本地 canary、安全和协议证据已有。 |
| P2-R03 | 满足 macOS 执行要求的固定制品启动、资源、退出和升级历史；原未签名制品被 AMFI 拒绝，单给密码不能解决。 |
| P2-P01 | 商业恢复中段及内存收敛、最终侧边整合；受控长流、历史、查询、diff 和终端证据保留。 |
| 11-A2 | 准确 Dock 重开；普通窗口激活及壳层清理已有证据。 |
| 13-A2 | Desktop 有效 Host 从配对到重连、远端发送、引用/下载、移除的完整路线；系统授权子步骤用户跳过。 |
| 13-A3 | MiniMax 真实英文语音可听播放；缺服务测试凭据及现场听读确认。 |
| 13-A4 | 真实输入法组合；PNG 粘贴和打开预览已验证。 |
| 14-A3 | 真实本地接纳后 unknown 回执、重启查询兜底及同 ID 重发；尚无可判定且保持实例健康的受支持故障方法。 |
| 14-A4 | 真实输入法切换及自然 unknown 场景对既有输入的保护；显式拒绝恢复不能代签。 |
| 14-A5 | 堆收敛及可归因对象保留路径；2 次预热加 12 次 GC 未证明平台，公开 owner 退出不证明私有堆无保留。 |
| 14-A7 | 原有远端后台审批队列与 badge 恢复；依赖 Desktop 有效 Host，不属于已排除的新后台任务功能。 |
| 15-A1 | Desktop 远端 Host、工作区、模型与发送锁定组合。 |
| 15-A2 | 同 Host 新会话沿用上次模型的默认行为。 |
| 15-A3 | 远端两个不同模型的切换及重启恢复。 |
| 15-A4 | 远端批准/拒绝路由和 badge。 |
| 15-A5 | Host 断连、恢复、禁用原因及草稿保护。 |
| 15-A6 | host.describe 失败后的警告及自然恢复。 |
| 15-A7 | 移除 Host 后历史离线展示及审批不可操作。 |
| 16-A2 | VoiceOver 对主要控件、图片生成设置和消息菜单的实际听读。 |
| 16-A3 | 原生拖图片 A→B→A→设置→A 的连续路线；粘贴路线已有证据。 |
| 09-P1-2 | 真实输入法候选期间 Enter、方向键、Esc、Shift+Tab 不误触发。 |
| 09-P3-1 | 搜索中输入法确认后，方向键/Enter 选择模型及焦点。 |
| 09-P3-3 | 远端 Host 模型分组、不可编辑状态与实际下一请求模型。 |
| 09-P3-4 | 合法自然布局中的“上方不足、下方足够”菜单翻转；BUG-050 窄窗可达性已修复复验，不能代签翻转。 |
| 09-P3-5 | VoiceOver 与 combobox 高亮的实际听读。 |
| 09-P4-1 | 在线远端 Host/工作区首次发送、状态和 hover。 |
| 09-P4-2 | 远端运行中断连、恢复、Context — 和 Stop 禁用原因。 |
| 09-P4-3 | 480px 窄窗中的远端 Host 子菜单；本地菜单证据已有。 |
| 09-P4-5 | 至少 5 个登记 Host 的输入法搜索、焦点与过滤；不要求 5 台物理设备。 |
| 09-P5-1 | P1–P4 汇总尚缺的输入法、远端、VoiceOver 和自然翻转；不另加 F9 门槛。 |
| 09-P5-2 | 规范对照的远端、输入法、hover/VoiceOver；Creating/Created 当时未交付，键盘来源提示已修复。 |
| 09-P6-1 | 真实输入法与拖放；Slash、粘贴/预览、草稿和显式拒绝恢复已有证据。 |
| 17-A5 | 真实搜索服务清 Key 后请求不再使用、恢复后可用；启停开关已验证，缺专用测试凭据。 |
| 11-B2 | 专用可写 GitHub 验收远端的创建 PR 与系统浏览器打开；现有 gh 登录不等于该远端写入授权。 |
| R18 | 有效 Host 添加、重连、移除后的列表即时更新。 |
| R20 | 远端图片/普通文件选择与引用；本地 PNG 可选预览及 TXT 灰显禁用已验证。 |

系统授权/人工配合子步骤保留“用户跳过，未覆盖”，不提问、不等待、不反复触发弹窗。商业凭据、设备、制品、技术方法缺口和未交付分别保留原原因；不是所有剩余项都能靠系统密码或用户手动操作解决。快捷唤起继续由用户自行验收，未取得结果不关闭 BUG-039。

## 历史通过的 104 个原编号

以下仅登记历史通过编号；原要求、方法、版本、失败和复验记录可从清理前快照查回。`F8-E1–E11` 是原台账的一个字面编号，保留原复合含义，不拆成新编号。

- 第一阶段（21 个）：`F1-02`、`F1-03`、`F1-04`、`F1-05`、`F1-06`、`F1-07`、`F1-08`、`F1-10`、`F1-11`、`F1-12`、`F2-01`、`F2-02`、`F3-01`、`F3-02`、`F3-03`、`F5-01`、`F6-01`、`F6-03`、`F7-01`、`F7-02`、`F8-E1–E11`。
- 第二阶段（22 个）：`P2-D01`、`P2-D02`、`P2-D05`、`P2-D06`、`P2-D07`、`P2-D08`、`P2-D09`、`P2-D10`、`P2-D11`、`P2-D13`、`P2-D15`、`P2-D17`、`P2-D21`、`P2-W01`、`P2-W02`、`P2-W03`、`P2-C01`、`P2-C02`、`P2-S01`、`P2-S02`、`P2-R01`、`P2-E01`。
- 原历史回归（61 个）：`10-A1`、`10-A2`、`10-A3`、`11-A1`、`11-A3`、`11-A4`、`13-A1`、`13-A5`、`13-A6`、`14-A1`、`14-A2`、`14-A6`、`15-A8`、`15-A9`、`16-A1`、`16-A4`、`16-A5`、`16-A6`、`16-A6b`、`16-A6c`、`16-A7`、`09-P1-1`、`09-P1-3`、`09-P2-1`、`09-P2-2`、`09-P2-3`、`09-P3-2`、`09-P4-4`、`17-A1`、`17-A2`、`17-A3`、`17-A4`、`10-B1`、`11-B1`、`R01`、`R02`、`R03`、`R04`、`R05`、`R06`、`R07`、`R08`、`R09`、`R10`、`R11`、`R12`、`R13`、`R14`、`R15`、`R16`、`R17`、`R19`、`R21`、`R22`、`R23`、`R24`、`R25`、`V01`、`V02`、`V03`、`V04`。

## 原始材料回溯

清理前完整快照：`8dbc68a5e41d212377e3cfba48525cec647f32bb`（保留清理前全部原文的提交）。原目录 `docs/exec-runs/20261021-actspace-full-acceptance/` 的 131 份 Markdown 已全部包含其中；清理后该目录只留本页，无需再维护 130 份分散记录。下方每份原文件保留一句重点；更细的要求、修复方案、红绿结果和证据路径从快照读取。

在仓库终端读取原文，不必回退工作区：

```sh
git show 8dbc68a5:docs/exec-runs/20261021-actspace-full-acceptance/coverage.md
git show 8dbc68a5:docs/exec-runs/20261021-actspace-full-acceptance/bugs/BUG-039.md
git ls-tree -r --name-only 8dbc68a5 -- docs/exec-runs/20261021-actspace-full-acceptance/
```

本地原始截图、AX、JSON、日志、临时 profile 和驱动保持原位，**不随仓库分发、未加入此次提交**：`tmp/codex-acceptance/20261021-actspace-full-acceptance/`，相关修复材料另在 `tmp/codex-acceptance/20261022-acceptance-bugfix/`。这些文件只是可回溯原批证据，不保证在其他克隆或未来机器存在；本次不删除用户数据、不升级安装版，也不继续启动验收。

## 131 份原文件的一句话索引

以下路径均相对于原验收目录；它们表示 Git 快照中的原文件名，并非仍需维护的当前文件。

### 过程与验收记录（66 份）

| 原文件 | 核心重点 |
| --- | --- |
| <a id="source-auxiliary-usage-20261023-md"></a>`auxiliary-usage-20261023.md` | 标题、压缩、自动审核的辅助请求计量及 schema 14 副本重建已验证，BUG-045 关闭。 |
| <a id="source-browser-20261022-md"></a>`browser-20261022.md` | 真实扩展重连、claim、上传/下载和写剪贴板已取证，读取 B58/B60 保留未覆盖。 |
| <a id="source-browser-actions-md"></a>`browser-actions.md` | Browser 62 条命令记录为 60 通过、2 未覆盖，属于子清单，不叠加到原 165 项。 |
| <a id="source-cli-20261022-md"></a>`cli-20261022.md` | CLI 输入输出、导出、信号退出和父子恢复有真实进程与 Provider 分层证据。 |
| <a id="source-closeout-20261025-md"></a>`closeout-20261025.md` | 最后三条方法路线仍部分或未覆盖，原阻塞记录现由用户结束本轮的决定取代。 |
| <a id="source-context-retry-evidence-20261023-md"></a>`context-retry-evidence-20261023.md` | Context 错误、历史恢复和手动重试通过真实原生路线取证，相关旧失败保留。 |
| <a id="source-coverage-md"></a>`coverage.md` | 原 165 个字面编号含复合子步骤，最终 104 通过、61 部分或未覆盖，原要求可从快照回溯。 |
| <a id="source-ct12-controlled-evidence-20261025-md"></a>`ct12-controlled-evidence-20261025.md` | 受控长流 R1/R2 错过停止窗口，只有 R3 完整，不倒填三轮通过。 |
| <a id="source-ct13-controlled-evidence-20261025-md"></a>`ct13-controlled-evidence-20261025.md` | 同会话同 PID 的三完整受控轮及正文对账完成，内存观察触发规定确认。 |
| <a id="source-ct14-controlled-evidence-20261025-md"></a>`ct14-controlled-evidence-20261025.md` | 追加规定的一次三轮确认，12 条正文对账和原生退出完成，平台与泄漏均未证明。 |
| <a id="source-cu-electron-20261022-md"></a>`cu-electron-20261022.md` | 初轮真实 Electron Playwright/CDP 取证覆盖模型、Context、长流和历史，不能代签原生输入法或读屏。 |
| <a id="source-cu-models-20261022-md"></a>`cu-models-20261022.md` | 浏览器模型交互有基础证据，初轮原生绑定失败未算完整模型验收通过。 |
| <a id="source-cu-preflight-md"></a>`cu-preflight.md` | 预先列出界面验收点、路线和证据边界，本身不构成已执行证据。 |
| <a id="source-cu-site-20261022-md"></a>`cu-site-20261022.md` | 本地及公开站点导航、资源和移动布局有浏览器证据，旧部署不代表当前发布。 |
| <a id="source-cu-web-20261022-md"></a>`cu-web-20261022.md` | 真实 Host/Web 配对、草稿、队列、审批及失败恢复已分层取证，PWA 真机另列。 |
| <a id="source-desktop-approval-queue-20261022-md"></a>`desktop-approval-queue-20261022.md` | 审批和队列引导、撤回、编辑删除及压缩阻塞已取证，BUG-025 后续修复关闭。 |
| <a id="source-desktop-failure-queue-20261023-md"></a>`desktop-failure-queue-20261023.md` | Runtime 失败后队列暂停、显式继续且草稿保留已有证据。 |
| <a id="source-desktop-git-20261022-md"></a>`desktop-git-20261022.md` | 专用本地 Git/worktree 创建及写盘界面已验证，真实 GitHub 创建 PR 未覆盖。 |
| <a id="source-desktop-models-settings-20261022-md"></a>`desktop-models-settings-20261022.md` | 模型设置、用途、温度、提示词和重启有代表性真实证据，不覆盖所有商业服务组合。 |
| <a id="source-desktop-workbench-20261022-md"></a>`desktop-workbench-20261022.md` | 文件、Review、终端及焦点路线发现的缺陷已转 Bug 并在后续闭环。 |
| <a id="source-dispatch-md"></a>`dispatch.md` | 记录桌面串行、隔离取证和唯一编辑者的各批合同，所有续派发安排已停止。 |
| <a id="source-empty-response-evidence-20261023-md"></a>`empty-response-evidence-20261023.md` | BUG-049 的合法空响应通过真实 CLI 父子链及冷进程复验关闭，不代签子对话原生界面。 |
| <a id="source-engineering-20261022-md"></a>`engineering-20261022.md` | 类型、测试、构建和静态门禁只证明各批工程状态，不代表产品界面全覆盖。 |
| <a id="source-execution-process-md"></a>`execution-process.md` | 完整执行时间线、方法偏差和修复复验保存在 Git 快照，不再维护逐轮流水账。 |
| <a id="source-execution-summary-md"></a>`execution-summary.md` | 本文件替代分散记录，统一维护最终统计、未验证清单及原文件一句话索引。 |
| <a id="source-extensions-runtime-20261022-md"></a>`extensions-runtime-20261022.md` | Skill 优先级、目录发现、缺失读取与 Todo 等通过真实 Runtime 路线取证。 |
| <a id="source-fee-evidence-20261024-md"></a>`fee-evidence-20261024.md` | 目录价格折扣、手动价格、未知费用和冷态本地成本已有证据，商业余额另缺。 |
| <a id="source-filesystem-runtime-20261022-md"></a>`filesystem-runtime-20261022.md` | 文件读写、编辑、搜索及目录权限有 Runtime 层证据，不代签全部 Desktop/OS 路线。 |
| <a id="source-goal-unattended-20261024-md"></a>`goal-unattended-20261024.md` | 保存截至 50befa8c 的范围和无人值守 Goal 文本，用户已结束本轮，不再执行旧目标。 |
| <a id="source-handoff-20261023-md"></a>`handoff-20261023.md` | 旧续验交接和待办由本汇总替代，不再作为自动恢复指令。 |
| <a id="source-historical-image-evidence-20261024-md"></a>`historical-image-evidence-20261024.md` | BUG-051 的历史 artifact、压缩后冷启动图片预览经原生及事实保护复验关闭。 |
| <a id="source-host-20261022-md"></a>`host-20261022.md` | Host 单测、真实进程、隔离 SSH、维护与回执边界已取证，不能代签 Desktop 有效配对。 |
| <a id="source-host-desktop-20261022-md"></a>`host-desktop-20261022.md` | Web 撤销及重配对已有证据，Desktop 有效配对链仍未覆盖。 |
| <a id="source-host-git-followup-20261022-md"></a>`host-git-followup-20261022.md` | worktree 重启、队列/审批、正常退出清理和 Review 焦点等跟进证据按原范围保留。 |
| <a id="source-local-lifecycle-evidence-20261024-md"></a>`local-lifecycle-evidence-20261024.md` | 原生路径/历史 worktree 与普通生命周期已验证，准确 Dock 重开单列未覆盖。 |
| <a id="source-media-network-evidence-20261023-md"></a>`media-network-evidence-20261023.md` | 真实网络和图片 artifact 持久化、重启及原生预览通过，商业/语音边界另列。 |
| <a id="source-migration-evidence-20261024-md"></a>`migration-evidence-20261024.md` | 价格来源、停用模型用途和备份双启动已有迁移证据，缺真实旧 OS 密文样本。 |
| <a id="source-network-media-runtime-20261022-md"></a>`network-media-runtime-20261022.md` | 搜索、抓取、缓存、私网拒绝及受控图像工具有 Runtime 证据，商业端点单独判定。 |
| <a id="source-palette-evidence-20261024-md"></a>`palette-evidence-20261024.md` | BUG-050 最小窗口长草稿下搜索/返回可达性已修复复验，自然上下翻转仍未覆盖。 |
| <a id="source-pause-checkpoint-20261024-md"></a>`pause-checkpoint-20261024.md` | 记录上次用户暂停和本地提交断点，现以本次结束及清理前提交为最新结论。 |
| <a id="source-performance-context-evidence-20261024-md"></a>`performance-context-evidence-20261024.md` | Context 三类路径查询、资源和 canary 有实测，不外推全部缓存规模。 |
| <a id="source-performance-memory-evidence-20261024-md"></a>`performance-memory-evidence-20261024.md` | 两次预热加十二轮 GC 未取得明确堆平台，既不能签收敛也不能定性泄漏。 |
| <a id="source-performance-query-evidence-20261024-md"></a>`performance-query-evidence-20261024.md` | 历史/Usage 的查询和大工具样本已有代表性测量，结论保留其负载范围。 |
| <a id="source-performance-md"></a>`performance.md` | 按真实/受控、CPU/RSS/heap 和负载阶段分别记录性能证据，商业和 F9/内存缺口保留。 |
| <a id="source-purpose-cost-evidence-20261024-md"></a>`purpose-cost-evidence-20261024.md` | 看图、自动审核和压缩用途的 546 Token 与 0.001377 美元费用已分层对账。 |
| <a id="source-pwa-browser-evidence-20261024-md"></a>`pwa-browser-evidence-20261024.md` | 停服冷壳及自然恢复原会话不重发已验证，安装/独立窗口/可见更新和 iPhone 未覆盖。 |
| <a id="source-r20-filter-evidence-20261024-md"></a>`r20-filter-evidence-20261024.md` | 原生文件选择 PNG 可预览、TXT 灰显禁用通过，远端文件选择另缺。 |
| <a id="source-reliability-20261022-md"></a>`reliability-20261022.md` | Journal 副本迁移失败保护、备份和成功幂等已有证据，不等于真实旧安装版升级。 |
| <a id="source-reliability-closure-20261024-md"></a>`reliability-closure-20261024.md` | 数据重建、分页、损坏保护及 Host 同 ID 去重冷恢复通过，不代签本地 unknown 回执。 |
| <a id="source-remaining-prerequisites-md"></a>`remaining-prerequisites.md` | 逐项记录 61 个未完整验收编号的原前提，本次统一因暂时无时间延后至发版验收。 |
| <a id="source-renderer-mock-20261022-md"></a>`renderer-mock-20261022.md` | mock 场景仅支持布局/组件结论，不替代原生系统或真实 Provider。 |
| <a id="source-resume-audit-20261024-md"></a>`resume-audit-20261024.md` | 续接前检查含未提交改动的源码、构建和资源归属，未回退功能基线。 |
| <a id="source-right-panel-evidence-20261023-md"></a>`right-panel-evidence-20261023.md` | 文件、预览、Review 工作树归属和 diff 的原生路线已有证据。 |
| <a id="source-scope-50befa8c-20261024-md"></a>`scope-50befa8c-20261024.md` | 以 50befa8c 界定功能范围并排除用户已验收的新后台任务，保留原 165 项和实际构建绑定。 |
| <a id="source-security-evidence-20261024-md"></a>`security-evidence-20261024.md` | 本地敏感路径、受保护路径、symlink 和审批变化 canary 已验证，远端边界未代签。 |
| <a id="source-send-reject-evidence-20261024-md"></a>`send-reject-evidence-20261024.md` | 显式发送拒绝后的草稿/附件恢复通过真实原生路线，不能替代 unknown 结果场景。 |
| <a id="source-side-chat-20261022-md"></a>`side-chat-20261022.md` | 独立分支主对话加两个侧对话的继承、Plan、只读与停止有证据，未代表最终整合交付。 |
| <a id="source-sidebar-evidence-20261023-md"></a>`sidebar-evidence-20261023.md` | 侧栏分页、搜索、排序和归档状态有原生证据，系统快捷唤起另列。 |
| <a id="source-spec-crosscheck-20261022-md"></a>`spec-crosscheck-20261022.md` | Composer 工作区/Git 状态与规范逐项比对，Creating/Created 等未交付差异保留。 |
| <a id="source-stream-recovery-evidence-20261023-md"></a>`stream-recovery-evidence-20261023.md` | BUG-047 同 Journal 的运行中重载正文恢复经原生 R1–6 复验，相关完整原行通过。 |
| <a id="source-subagent-recovery-evidence-20261023-md"></a>`subagent-recovery-evidence-20261023.md` | 原有子对话 loading、错误重试、空态与重开经原生 FE1–3 及复合证据核对通过。 |
| <a id="source-terminal-evidence-20261023-md"></a>`terminal-evidence-20261023.md` | 双终端、大量输出、背压及关闭 PTY/新窗口清理已验证，Dock 路线单列。 |
| <a id="source-trajectory-evidence-20261023-md"></a>`trajectory-evidence-20261023.md` | 轨迹层级、请求用途和未知用量展示已验证，BUG-036 定向原生复验关闭。 |
| <a id="source-unattended-policy-20261024-md"></a>`unattended-policy-20261024.md` | 需系统授权或现场配合的子步骤按用户要求跳过且不算通过，本轮已停止调度。 |
| <a id="source-usage-rebuild-evidence-20261024-md"></a>`usage-rebuild-evidence-20261024.md` | 固定副本 101 请求、1101 动作、41 事实及双启动不变已有证据，中间阶段与最终整合仍有限制。 |
| <a id="source-workspace-evidence-20261023-md"></a>`workspace-evidence-20261023.md` | 工作区注册、worktree、持久选择、目标路由和权限转换已有原生及协议分层证据。 |

### Bug 与观察（56 份）

| 原文件 | 核心重点 |
| --- | --- |
| <a id="bug-001"></a>`bugs/BUG-001.md` | BUG-001：Markdown 分块测试阻断 Desktop 类型检查；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-002"></a>`bugs/BUG-002.md` | BUG-002：ModelPicker 原生按钮超过基线；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-003"></a>`bugs/BUG-003.md` | BUG-003：已归档前端总计划仍链接退役 Demo 目录；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-004"></a>`bugs/BUG-004.md` | BUG-004：生成的契约矩阵与当前 workspace 清单不同步；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-005"></a>`bugs/BUG-005.md` | BUG-005：Web 待审批命令刷新后丢失详情，审批按钮仍可操作；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-006"></a>`bugs/BUG-006.md` | BUG-006：Browser 验收 helper 引用仓库外的退役 Runtime 路径；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-007"></a>`bugs/BUG-007.md` | BUG-007：获取模型弹窗按 Esc 关闭后焦点落到 body；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-008"></a>`bugs/BUG-008.md` | BUG-008：Provider 错误回显的非标准格式凭据进入 CLI 输出和 Journal；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-009"></a>`bugs/BUG-009.md` | BUG-009：CLI 收到 SIGTERM 后静默工具子进程残留；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-010"></a>`bugs/BUG-010.md` | BUG-010：Browser locator 语义 Color 定位失败但 CSS 定位成功；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-011"></a>`bugs/BUG-011.md` | BUG-011：Browser 双击 action 返回成功但 fixture 计数未按预期增长；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-012"></a>`bugs/BUG-012.md` | BUG-012：Browser 跨源 iframe 点击返回成功但 frame 状态未变化；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-013"></a>`bugs/BUG-013.md` | BUG-013：Browser 键盘事件部分未触发默认编辑；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-014"></a>`bugs/BUG-014.md` | BUG-014：大文本预览反复切入及关闭响应超过一秒；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-015"></a>`bugs/BUG-015.md` | BUG-015：Review 工具栏统计覆盖范围按钮；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-016"></a>`bugs/BUG-016.md` | BUG-016：Web 产物没有可操作的预览或下载入口；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-017"></a>`bugs/BUG-017.md` | BUG-017：正式验收夹具仍使用退役模型存储 API，启动构建失败；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-018"></a>`bugs/BUG-018.md` | BUG-018：设置弹窗关闭后的第二次 Esc 未退出设置；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-019"></a>`bugs/BUG-019.md` | BUG-019：Mermaid 全屏预览按 Esc 未关闭；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-020"></a>`bugs/BUG-020.md` | BUG-020：工作区“归档全部”遗漏同组工作树会话；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-021"></a>`bugs/BUG-021.md` | BUG-021：setWorkspace 接受的 workspaceId 输入在实际处理时被忽略；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-022"></a>`bugs/BUG-022.md` | BUG-022：普通会话分叉成功落盘后不出现在侧栏；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-023"></a>`bugs/BUG-023.md` | BUG-023：工作树会话的右栏 Review 和文件树使用原工作区目录；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-024"></a>`bugs/BUG-024.md` | BUG-024：归档列表显示已归档的委派子会话；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-025"></a>`bugs/BUG-025.md` | BUG-025：撤回引导消息后回到原位置，没有回到队首；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-026"></a>`bugs/BUG-026.md` | BUG-026：看图工具内部模型调用未进入全局请求与 Token 统计；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-027"></a>`bugs/BUG-027.md` | BUG-027：Desktop 缺少现行规范承诺的目录树授权选择与 Grant 撤销入口；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-028"></a>`bugs/BUG-028.md` | BUG-028：运行中轨迹停止按钮缺少交接确认的细边框；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-029"></a>`bugs/BUG-029.md` | BUG-029：工作树来源提示无法通过键盘焦点查看；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-030"></a>`bugs/BUG-030.md` | BUG-030：成功响应未报告 usage，却持久化为供应商报告的零值；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-031"></a>`bugs/BUG-031.md` | BUG-031：工作树会话读取环境提示未注册；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-032"></a>`bugs/BUG-032.md` | BUG-032：工作树 Review 刷新丢失执行目录，且未拒绝冲突身份；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-033"></a>`bugs/BUG-033.md` | BUG-033：图像识别辅助轨迹的无障碍名称误报为压缩；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-034"></a>`bugs/BUG-034.md` | BUG-034：回复轮尾用量遗漏图像识别辅助请求；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-035"></a>`bugs/BUG-035.md` | BUG-035：Review 工具栏在 390px 右栏无法完整显示末尾控件；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-036"></a>`bugs/BUG-036.md` | BUG-036：Usage 聚合把全未知 Token 用量显示为 0；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-037"></a>`bugs/BUG-037.md` | BUG-037：升级后分叉沿用父会话的旧创建摘要；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-038"></a>`bugs/BUG-038.md` | BUG-038：看图端口缓存启动时配置，设置修改后不生效；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-039"></a>`bugs/BUG-039.md` | BUG-039：快捷唤起没有收敛窗口，也不能从设置或轨迹回到输入区；工程已修，真实 OS 快捷唤起由用户自行验收，未关闭。 |
| <a id="bug-040"></a>`bugs/BUG-040.md` | BUG-040：回复脚注引用和回链被当作外链，点击后不跳转；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-041"></a>`bugs/BUG-041.md` | BUG-041：失败的读取工具行丢失操作和路径，且没有诊断展开入口；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-042"></a>`bugs/BUG-042.md` | BUG-042：空目录的提示文本被计为一个目录项；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-043"></a>`bugs/BUG-043.md` | BUG-043：Context 明细不显示压缩摘要的短预览；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-044"></a>`bugs/BUG-044.md` | BUG-044：已打开文件被删除后仍静默显示旧快照；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-045"></a>`bugs/BUG-045.md` | BUG-045：标题生成、上下文压缩及自动审核请求漏记用量；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-046"></a>`bugs/BUG-046.md` | BUG-046：Web 下载缺失产物时只显示通用 Host 错误；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-047"></a>`bugs/BUG-047.md` | BUG-047：运行中原生重载后已接收的流式正文暂时消失；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-048"></a>`bugs/BUG-048.md` | BUG-048：Review 关闭换行时图片与变更操作位于可视区之外；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-049"></a>`bugs/BUG-049.md` | BUG-049：正常空模型响应缺少请求终态，主任务及子任务收尾失败；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-050"></a>`bugs/BUG-050.md` | BUG-050：最小窗口与多行草稿下 Skills 搜索及返回行越出屏幕；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-051"></a>`bugs/BUG-051.md` | BUG-051：压缩后冷启动无法预览历史输入图片；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="bug-052"></a>`bugs/BUG-052.md` | BUG-052：余额查询失败没有反馈或重试入口；已按原缺陷范围修复并复验关闭，原始失败与方法边界可回溯。 |
| <a id="source-bugs-obs-001-md"></a>`bugs/OBS-001.md` | 首次配置看图用途的重启差异经红测转为 BUG-038 并闭环，原观察时序保留在快照。 |
| <a id="source-bugs-obs-002-md"></a>`bugs/OBS-002.md` | 子对话等待样本缺少同阶段 RPC，后续自然流式正常，未认定为确认 Bug。 |
| <a id="source-bugs-obs-003-md"></a>`bugs/OBS-003.md` | 全未知 Usage 显示零的观察经确认转为 BUG-036 并完成修复复验。 |
| <a id="source-bugs-readme-md"></a>`bugs/README.md` | 共登记 52 个 Bug，51 个复验关闭，仅 BUG-039 保留未关闭；缺陷关闭不等于关联整行全部通过。 |

### 修复建议（9 份）

| 原文件 | 核心重点 |
| --- | --- |
| <a id="source-fix-plans-bug-002-md"></a>`fix-plans/BUG-002.md` | 将模型菜单控件按共享按钮规范收口，工程与代表性 pinned 场景已复验。 |
| <a id="source-fix-plans-bug-004-md"></a>`fix-plans/BUG-004.md` | 通过正式生成入口同步契约矩阵与 workspace 清单，相关漂移已关闭。 |
| <a id="source-fix-plans-bug-005-md"></a>`fix-plans/BUG-005.md` | 恢复刷新/重连后的待审批详情及可操作状态，真实 Web 定向复验闭环。 |
| <a id="source-fix-plans-bug-007-md"></a>`fix-plans/BUG-007.md` | 异步模型获取弹窗关闭后显式恢复入口焦点，真实键盘/慢请求路线复验闭环。 |
| <a id="source-fix-plans-bug-008-md"></a>`fix-plans/BUG-008.md` | 在错误通路收口凭据脱敏，三协议 CLI、Host 与原生持久化证据各自保留。 |
| <a id="source-fix-plans-bug-009-md"></a>`fix-plans/BUG-009.md` | CLI 信号退出清理静默工具及后代进程，真实信号与恢复不重放已复验。 |
| <a id="source-fix-plans-bug-029-md"></a>`fix-plans/BUG-029.md` | 工作树来源提示增加键盘焦点可达性并复验，hover/VoiceOver 聚合缺口未代签。 |
| <a id="source-fix-plans-readme-md"></a>`fix-plans/README.md` | 旧独立修复建议已落实或由最终 Bug 结论取代，不再作为待审核队列维护。 |
| <a id="source-fix-plans-triage-md"></a>`fix-plans/triage.md` | 原问题分组和建议导航退出执行入口，最终修复统计统一见本汇总。 |

## 一并退出维护的相关入口

两份旧 active 计划因用户明确结束本轮、不再执行而删除，没有标为“验收全部完成”，也不另建归档跳转页；重复的修复摘要并入本页。原文同样位于清理前快照：

| 原路径 | 核心重点 |
| --- | --- |
| <a id="old-acceptance-plan"></a>`docs/exec-plans/active/20261021-actspace-full-acceptance.md` | 原范围、验收方法与性能合同已经结束执行，未来发版重新立项，不自动恢复旧 Goal。 |
| <a id="old-bugfix-plan"></a>`docs/exec-plans/active/20261022-acceptance-bugfix-review.md` | 旧集中修复建议已被逐 Bug 实施和复验结论取代，最终 52 个 Bug 中 51 个关闭。 |
| <a id="old-bugfix-summary"></a>`docs/exec-runs/20261022-acceptance-bugfix/execution-summary.md` | 各批修复、工程门禁与定向真实复验的详细记录已存 Git，本页集中维护关闭状态及剩余 BUG-039。 |

## 整理时的验证

清理前本地提交检查：模型设置测试 15/15、Desktop 类型检查、前端主题/token 检查、文档检查、密钥扫描及差异空白检查通过。这些是工程检查，不新增产品验收通过项。

整理后已核对：165 个编号完整、104/61 状态不变、131 个原文件各有一句摘要且 Git 原文可逐文件读取，外部引用锚点全部存在；history/learnings 仅调整链接目标，正文未改，产品代码与清理前提交逐字一致。`pnpm check:current-docs`、`pnpm check:docs` 与 `git diff --check` 均通过；本轮验收已停止，文档整理不新增产品验收通过项，未发布或升级用户安装版。
