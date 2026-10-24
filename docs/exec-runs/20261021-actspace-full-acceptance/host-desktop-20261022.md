# Desktop Host 与 Web 缺口补验（2026-10-22）

终态报告。HEAD `00d6b763` + 当前 dirty worktree，复用固定 dist，没有重建或修改产品源码、用户设置、真实 SSH 配置。仅改本报告与 tmp 测试装配。真实 Electron/Chrome 经 Playwright CDP 操作，非 native AX；唯一 native AX 尝试为读取系统 SecurityAgent，被工具明确禁止。Provider 是真实 HTTP 受控响应，不代表商业 Provider。

原始证据根：`tmp/codex-acceptance/20261021-actspace-full-acceptance/host-desktop-20261022/`，下文图片路径相对此根。Web 会话 `6dbe894d-7c4e-4cbc-aa8a-4c523384a4f6`。

## 验收点与分组

先列验收点：H01 配对/认证、Host状态/工作区/模型；H02 消息/审批/文件、断连/草稿/移除历史；H03 SSH/启停与恢复；W01 token失效/重连；W02终止错误后的队列；W03下载、离线、390px深色及横屏审批；W04真实设备/PWA；D07隔离文件删除批准/拒绝。

实际按四条路线执行：设置配对→远端选择；任务→排队→审批→文件；撤销→重新配对→Host停止/恢复；390px深色→844×390横屏。Desktop有效配对阻塞后继续Web和SSH，不以浏览器代签Desktop。

## Desktop 与旧编号逐项结果

| 编号 | 状态 | 步骤、预期、实际及证据 / 未覆盖前提 |
|---|---|---|
| P2-H01 认证失败 | 通过 | 新隔离Electron启动，设置→远端Host→WSS填本次49695/rpc→000000→配对。预期拒绝；实际显示“配对码无效或已过期，请在服务器生成新的配对码后重试”。`runtime/desktop-invalid-pair.png`。 |
| P2-H01 有效配对/在线状态/模型 | 未覆盖 | 同表单换新配对码后系统SecurityAgent出现，Electron主线程/CDP阻塞；CU明确拒绝访问`com.apple.SecurityAgent`。没有替换safeStorage或注入明文token。外部前提为可由用户完成的系统凭据授权，随后复验真实Desktop。不能计作Host认证失败。 |
| P2-H02 Desktop任务/文件/离线/删除 | 未覆盖 | 被有效配对系统提示前提阻塞。Web独立结果见下，不代签Desktop。 |
| P2-H03 | 未覆盖 | 隔离sshd成功启动50256；`ssh -F <本次ssh_config> -o BatchMode=yes -o ConnectTimeout=3 closeout-fixture true`退出0，`ssh/sshd.log`为Accepted publickey后正常disconnect。不动真实~/.ssh。Desktop SSH仍受同一系统凭据提示阻塞；生命周期7项既有证据不重复。主审补跑真实SSH函数路线见`ssh-real-optin-20261022.log`，本报告不冒充UI覆盖。 |
| 13-A2 | 未覆盖 | 无效配对已过；有效配对→重连→会话→引用→预览下载→移除均需先完成上述系统授权。 |
| 14-A7 | 未覆盖 | 未进入Desktop远端会话；后台徽标/审批队列断连恢复不得由Web替代。 |
| 15-A1 | 未覆盖 | Desktop真实Host工作区/模型发送依赖有效配对。 |
| 15-A2 | 未覆盖 | Desktop远端默认模型记忆依赖有效配对及首个选择。 |
| 15-A3 | 未覆盖 | Desktop两模型独立及重启保持依赖有效配对与两会话。 |
| 15-A4 | 未覆盖 | Desktop远端允许/拒绝路由未进入；Web批准/拒绝有实际证据，见W02/D07。 |
| 15-A5 | 未覆盖 | Desktop离线草稿/禁用原因需有效配对；Web离线另列。 |
| 15-A6 | 未覆盖 | 需已连接Desktop及可控host.describe失败，当前fixture仅有断连控制，无该RPC专用故障。 |
| 15-A7 | 未覆盖 | Desktop移除历史/待审批标记需已建立远端会话。 |
| 15-A8 | 未覆盖 | 需独立旧remote-models profile迁移fixture；本轮未构造旧版profile，不用新默认profile代签。 |
| 09-P3-3 | 未覆盖 | Desktop远端模型按钮/无编辑/下一条模型请求依赖有效配对。 |
| 09-P4-1 | 未覆盖 | Desktop在线Host工作区及状态悬停依赖有效配对。 |
| 09-P4-2 | 未覆盖 | Desktop运行中断连Context/停止禁用/恢复依赖有效配对与运行。 |
| R18 | 未覆盖 | 设置Host添加表单、错误配对反馈已执行；有效添加、重连、移除即时列表更新受系统提示阻塞。 |
| R20 | 未覆盖 | 真实native文件选择器与Desktop远端引用尚无有效连接；不使用IPC注入代签。 |

## Web 补测逐项结果

Web连接本次HTTPS49694真实Host，独立Chrome context，fixture证书受控，仅本次浏览器context信任；补入本origin allowedOrigins后正常配对。未操作用户Chrome已有页面。

| 编号/子项 | 状态 | 步骤 / 预期 / 实际 / 证据 |
|---|---|---|
| P2-W01 token失效 | 通过 | CLI仅撤销本次Chrome设备；在线页立即返回配对页，显示“这台设备已在服务器上被移除，请重新配对”。刷新仍要求配对，不继续旧token。`runtime/web-token-revoked.png`。 |
| P2-W01 重新配对/历史 | 通过 | 生成新一次性码→Web连接→打开原会话；原历史完整可读。`runtime/web-repaired-history.png`。凭据不写报告。 |
| P2-W01 / W03 断连恢复 | 通过（子项） | 原会话草稿offline-draft-preserved→停止本次Host→显示“已断开，正在重连…”且textarea原值保留→恢复同端口Host→自动在线，草稿仍在；`runtime/web-offline-draft.png`。恢复后按Enter因横屏输入策略插入换行，随后用发送按钮恢复后任务可运行；不声称Enter已发送该草稿。 |
| P2-W02 停止/队列 | 通过 | FIXTURE_HOLD真实流式→第二条queue-after-error入队→点停止→部分正文保留、已停止、队列已暂停→点继续发送→仅待发消息完成。`runtime/web-stop-paused.png`、`runtime/provider-requests.jsonl`。 |
| P2-W02 终止错误后队列 | 通过 | 临时受控Provider增加terminal-error控制（不改产品）；hold运行加入queue-terminal-error→release并令下一任务HTTP400→显示invalid-request与错误，队列已暂停；新增after-terminal-error-paused仍排队不运行；reload暂停和消息均保留；terminal-ok后显式继续，新增消息只完成一份。`runtime/web-terminal-error.png`、`runtime/provider-requests.jsonl`及`runtime/host-data/sessions-v2/6dbe894d-7c4e-4cbc-aa8a-4c523384a4f6/`会话Journal。 |
| P2-W02 审批允许 | 通过 | FIXTURE_TOOL真实bash pwd审批→运行→真实工具结果和result.txt文件改动出现，轮结束。`runtime/web-dark-approval-390.png`及Journal。 |
| P2-W02 审批详情恢复 | 失败（既有BUG-005复现） | 初次卡含pwd/$ pwd，移动导航切设置再返回后卡仅剩“运行命令”和workspace，命令摘要消失；允许仍能执行。截图dark-approval-390显示丢失后的状态；不另起冲突编号。 |
| P2-W03 390px深色审批 | 通过 | 真待审批→返回列表→设置radio深色→回原会话；拒绝与运行DOM实测各50×44px。`runtime/web-dark-approval-390.png`。 |
| P2-W03 横屏审批 | 通过 | 同一真实待审批会话改844×390，按钮可见、页面documentElement.scrollWidth不大于innerWidth；`runtime/web-dark-approval-landscape.png`。仅桌面响应式，不是iPhone。 |
| P2-W03 文件下载 | 失败（BUG-016，本版范围待核对） | FIXTURE_TOOL生成result.txt，正文查看结果仅文本，role link数量0；点击result.txt改动行不打开预览/下载，页面无下载按钮。`runtime/web-download-no-entry.png`。源码apps/web/src/pages/session/blocks/GenericToolRow.tsx仅把present显示为ToolLine，apps/web/src无download/files.preview消费者。未以磁盘文件存在代签浏览器下载。建议按Web产品范围决定补正式文件/产物入口，再执行实际下载；不是等待外部设备即可通过。 |
| P2-W03 文件权限反馈 | 未覆盖 | 当前无可操作文件预览/下载入口，不能走权限拒绝路线。 |
| P2-W04 | 未覆盖 | 本机无可用iPhone Safari/Tailscale真机、PWA安装/更新独立窗口/系统通知授权路线；桌面响应式与测试证书不代签。 |
| P2-D07 delete_file拒绝 | 通过 | 只在隔离workspace写delete-target.txt→受控Provider请求delete_file→真实高风险审批→点拒绝→文件内容仍为isolated deletion fixture。`runtime/web-delete-approval.png`及Journal。 |
| P2-D07 delete_file允许 | 通过 | 再发FIXTURE_DELETE allow→新审批点删除→真实文件不存在，轮完成。`runtime/web-delete-allowed.png`及Journal。 |
| P2-D07 delete_directory | 不适用/未提供 | 源码搜索无delete_directory工具；delete_file明确只支持regular file且拒绝directory。不能伪造目录删除批准路线；若该能力仍是验收要求，需要先确认实现范围。 |

## 问题事实与建议（不修产品）

1. 正式验收夹具失配：`scripts/acceptance/agent-refactor/seed-settings.ts:2`导入不存在的`../../../packages/shared/src/custom-model-input`，fixture.mjs start esbuild错误Could not resolve。原日志为根`fixture.log`。建议将种子迁到当前model-layers/连接存储API并增加fixture启动canary；属于验收设施工程问题，不是产品Host故障。本轮适配只写tmp，未提交。
2. 系统凭据授权为Desktop实际外部门槛：SecurityAgent访问被CU禁止。未绕过加密，不据此认定产品配对Bug。
3. Web产物下载入口目前缺失；保留上述事实与建议，等全验收结束统一讨论。既有BUG-005仍复现，不重复编号。

## 清理终态

- Desktop本次无效初始profile Electron24565正常close；有效配对实例28480因SecurityAgent同步阻塞，TERM无响应后仅该PID KILL，现已退出。未触碰用户dev PID61739或其他agent Electron。
- fixture supervisor/Host历次23051/23058、40325/40326、60990/60991、64077/64098均经fixture stop关闭；最终fixture.json stopped=true。HTTPS49694、WSS49695、provider49693、control49696均随本次fixture关闭。
- SSH supervisor36079收到TERM并关闭Host36080、sshd36111；复查上述PID全部不存在。隔离SSH50255/50256退出，独立known_hosts/key/config保留。
- 本次Chrome独立context关闭；未关闭共享隔离Chrome44325和他人标签。最终`ps`查询上述PID为空、`lsof`查询六个测试端口无监听，`fixture.json`为stopped=true；检查记录`cleanup-final.json`。原始证据/脱敏报告保留。

本报告不把任何Web通过项计为Desktop旧编号通过；Desktop复合项、W03下载、W04仍有明确未覆盖门槛。没有源码修复、提交、合并、部署或用户安装版升级。
