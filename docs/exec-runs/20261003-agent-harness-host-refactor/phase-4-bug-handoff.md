# P4 T7 修复前验收与 Bug 交接

后续状态：用户已批准修复，B1–B6 已完成代码与自动化检查；按最新要求暂停等待用户切换 gpt-6.1-sol 进行交互复验。下文保留修复前证据，当前状态与定位补充见 [修复记录](phase-4-bug-fixes.md)。

2026-10-04。用户要求本轮仅完成测试验收，将修复交给 Astra。本轮未修改产品代码、测试代码或构建；仅补充验收记录。未提交或推送。

## 覆盖结论

第八轮留下的双 Desktop 同会话同步、双向审批、完全退出后恢复，以及真实双 Host 相同 SessionId/工作区隔离，已由 gpt-6.1-sol 使用真实 Electron UI 在[第九轮](phase-4-cu-round9.md)补齐。

- 双端可见相同新消息、待审批状态和完成结果。
- 分别由两个 Desktop 批准一轮，另一端解除等待；Journal 辅助确认各工具执行一次。
- 主 Desktop 正常退出后，第二端完成审批与任务；主端同数据重开自动连接并恢复结果。
- 两个 Host 使用相同 SessionId 和工作区路径，消息、标题更新及历史互不串线。
- WSS 移除后的历史保留、控件禁用沿用[第八轮](phase-4-cu-round8.md)；任务不取消由独立协议客户端辅助验证。

修复前缺失场景已经执行，**不等于 T7 签收**。以下缺陷尚未修复，也没有修复后复验。测试使用隔离的本地 Provider；外部付费 Provider、真实云部署、systemd 安装和手机 Web 前端不在本轮通过结论内。

## B1：首次配对成功，但侧栏不出现远端会话组

- 来源：第八、九轮真实 UI；主端重新添加也可复现。
- 复现：启动新 Desktop 数据目录 → 配对已有会话的 Host → 设置显示已连接 → 返回会话页。侧栏只有本机工作区；正常 Cmd+R 后远端组出现。
- 预期：配对后自动显示已有远端会话，无需刷新应用。
- 代码来源：`apps/desktop/src/renderer/App.tsx:1244` 的空 Session live 通知只调用 `listSessions()`、更新 `sessions`，没有更新分页的 `browseGroups`；`readSidebarSessions()` 在约 822 行才会同步分页分组。`apps/desktop/src/main/remote-hosts/desktop-adapter.ts:61` 已在 registry 变化时发通知，不能直接归因为 Main 没有发事件。
- 证据：`/tmp/p4-cu-round9/second-first-pair-no-group.png`、同名 `.ax.txt`；第八轮 `second-no-history.png`。
- 修复验收：首次配对即出现远端组和会话；已展开的分页不丢失；无需 Cmd+R。

## B2：重配后当前会话可用，侧栏仍显示离线/撤销

- 来源：第八轮真实 UI；属于已确认的界面状态矛盾。
- 复现：撤销当前 Desktop → 移除并重新配对同 Host → 当前会话恢复完成结果、模型和可操作审批；侧栏仍显示离线，AX 中仍为 revoked。
- 预期：侧栏和当前会话采用同一最新连接状态。
- 代码来源：`App.tsx:1250` 的定向更新只合并 `title`，未合并新的连接元数据；约 2145 行 `actspaceHosts.onChanged` 刷新当前历史/队列/审批，但没有刷新侧栏列表与分组。这是源码定位依据，尚未通过修改后的回归验证。
- 证据：`/tmp/p4-cu-round8/main-pending.png`。
- 修复验收：撤销、重新配对、自动重连各自的连接标签及时一致，运行中的历史和审批不丢失。

## B3：重复添加 Host 会消耗一次性配对码，并产生额外设备

- 来源：第八轮真实 UI + Main 源码及 Host 设备登记辅助检查。
- 复现：已添加 Host → 取新码并重复添加 → 提示服务器已添加 → 移除已有条目后复用该码 → 提示配对码无效或过期；另取新码才能成功。
- 预期：拒绝重复添加时不消费配对码、不创建无用设备、不改变现有凭据。
- 代码来源：`apps/desktop/src/main/remote-hosts/registry.ts:73` 先 `authenticate()`，其内部执行 `auth.pair`；75 行才按 HostId 判断重复。34–42 行 `add()` 也在连接后判断重复。错误发生前认证写操作已完成。
- 修复验收：同地址及不同入口指向同 Host 时均在消费码前拒绝；重复失败后该码仍能在另一合法设备使用；并发添加不能创建两份设备/覆盖已有凭据。

## B4：移除远端连接后，会话位置误显示“本机 Mac”

- 来源：第八轮真实 UI。
- 复现：在远端会话中移除 WSS Host → 历史保留、控件禁用且仍有远端未就绪提示，但运行位置显示本机 Mac。
- 预期：会话继续标识为原远端，处于未连接状态。
- 代码来源：`apps/desktop/src/renderer/components/Composer.tsx:2426` 的 select 值仍是会话绑定的 HostId，2427 行 options 却只包含当前 registry 中的 Host。移除后无匹配 option，浏览器显示第一个本机 option。
- 边界：本轮发现的是展示错误，没有证据表明实际任务改投本机。
- 证据：`/tmp/p4-cu-round8/wss-removed-history.png`、`.ax.txt`。
- 修复验收：远端归属标签保留、草稿可编辑、发送/审批/停止保持正确禁用，重新添加后恢复。

## B5：历史分页首轮不完整，Worked 与 Token 看起来像整轮统计

- 来源：第九轮双 Desktop 真实 UI。
- 复现：一个 Desktop 保留完整旧轮，另一个刷新或重开加载最新历史页。主端首可见 round8 回复没有对应用户消息，显示 Worked 1s / 40 Token；第二端同轮完整历史显示 Worked 8m36s / 60 Token。另一旧轮也出现类似差异。
- 预期：同轮历史统计一致；若只加载片段，界面不能把片段统计标成整轮统计。
- 代码来源：`packages/agent-host/src/rpc.ts:74`、90 行将历史窗口设为最多 100 事件/262144 字符预算；`packages/runtime/src/runtime/session-controller.ts:109` 按事件逐条裁剪，113 行直接 slice，可从轮次中间开始。`apps/desktop/src/renderer/components/ConversationView.tsx:398` 按当前可见 workItems 计算时长，576 行显示当前投影的 usage。已定位产生片段的路径；尚未制作确定性回归或修复，不声称所有使用量统计均错误。
- 证据：`/tmp/p4-cu-round9/main-restarted-auto-history.png`、`.ax.txt`；`main-main-approved.ax.txt`、`second-main-approved.ax.txt`。
- 修复验收：有界分页尽量保留整轮边界，前翻不遗漏事实；超大单轮仍遵守预算，对不完整统计采用明确表示；两端完整加载后数值一致。

## B6：存在打开失败的会话时，Host 正常 stop 失败并继续监听

- 来源：根线程隔离夹具的真实 CLI 进程/日志检查，**不是 Computer Use 结论**。
- 复现：Host 恢复失败进入 blocked，数据中另有复制来的活跃 writer-lock 会话 → status 查询产生并缓存 Session 打开失败 → 正常 `host stop` 返回 draining → 日志输出 `Host shutdown failed: SessionError: Session … is owned by runtime …`，进程继续监听。
- 预期：正常停止等待本 Host 持有的有效 Run/资源，并能关闭 blocked Host；不应因一个从未成功取得所有权的会话而提前退出清理流程。
- 代码来源：`packages/agent-service/src/service.ts:69` 对所有缓存的 manager Promise 使用 `Promise.all`，一个打开失败就拒绝。`apps/cli/src/runtime-v2/host.ts:118` 因此无法走到 `profile.shutdown()` 和 `close()`。`dispose()` 已采用 `allSettled`，可作为对照；修复必须保留真实运行任务的 drain 语义。
- 边界：writer-lock 拒绝打开是正常保护；Bug 是它连带阻止 Host 的管理退出。此前 blocked-process 的正常停止测试通过，但没有覆盖此额外会话打开失败组合。
- 修复验收：新增此组合的真实进程回归；blocked 可正常退出，健康的运行任务仍必须等待完成/审批，不能用忽略全部错误或强杀代替。

## 环境/夹具问题，不混入产品 Bug

- 相同 SessionId 双 Host 验收最初错误复制了源 Host 活跃 `.writer-lock`。单 writer 正确拒绝写入；仅校正 peer 副本并重启 peer 后，C5 全部通过。不要为此取消租约校验或允许内存重试绕过恢复失败。
- 自定义第二 Desktop 同数据完整重开曾等待 macOS Keychain；sample 显示 `SecItemCopyMatching / SecKeychainItemCopyContent`。没有发现可操作授权窗口，本轮不改系统权限。新隔离数据保持该第二端运行，使用标准主 Desktop 完整退出/重开，已完成双端与恢复覆盖。这个自定义身份的钥匙串问题仍是环境诊断项，不能声明已修复，也未确认普通产品安装可复现。
- 旧主 Desktop 一度能读取 AX 但点击无反馈；正常退出并同数据重开恢复。本轮没有稳定复现和根因，不作为已定位产品缺陷。

## 交给 Astra 的执行边界

只修 B1–B6 及其必要回归，不扩展 P4 功能。不触碰并行的 workbench/space-demo 和 `myplan.md` 改动。修复后先跑针对性工程/进程测试，再委派 `gpt-6.1-sol` 按 B1–B6 定向复验，并回归双端审批与恢复。未完成这些门禁前保持 T7 未签收。
