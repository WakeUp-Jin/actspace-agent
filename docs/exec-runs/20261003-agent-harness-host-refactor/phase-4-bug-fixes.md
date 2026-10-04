# P4 B1–B6 修复记录（复验完成）

最新结果：第十轮 B1–B5 真实 Electron 复验通过；B6 真实进程专项 2/2 重跑通过，T7 已完成，详见 [第十轮报告](phase-4-cu-round10.md)。以下保留修复时的工程与暂停记录。

2026-10-04。用户批准修复六项缺陷，并要求修复及工程检查完成后暂停，切换 gpt-6.1-sol 再进行 Computer Use。本轮没有启动 Computer Use，没有提交或推送；T7 仍未签收。

## 修改与回归

| 问题 | 修改 | 自动化证据 |
| --- | --- | --- |
| B1 首次配对列表缺失 | App 直接订阅 Host 连接变化，和会话列表通知共用分页刷新；同时更新条目和分组，继续加载用户此前展开的页数。通知刷新串行合并，避免较早响应最后覆盖连接状态。 | 新增 `app-remote-host-refresh.test.tsx`：连接变化后直接出现远端会话，无需 renderer reload。 |
| B2 重配标签陈旧 | 列表刷新合并完整条目，包含连接元数据；不再只更新 title。 | 原 revoked 标签在定向会话通知后变为 connected；保留移除 Host 的已显示历史并标为 offline。 |
| B3 重复添加耗码 | registry 串行处理添加；只读 hello 取得 HostId，在 auth.pair 前拒绝已有身份，保留后置身份检查。 | 真实 WebSocket RPC 测试：不同地址指向同 Host、并发添加只创建一个设备；重复拒绝未消耗的码可在移除后成功配对。测试仅将 WSS URL 映射到隔离 WS，TLS/SSH 信任验证沿用已有专用测试。 |
| B4 位置误标本机 | 绑定的 Host 已移除时，在锁定选择器中保留“远端 · 未连接”选项。 | Composer 选中值仍是原 HostId，显示远端并保持禁用。 |
| B5 片段统计误当整轮 | 历史预算裁剪后，存在可保留的后续轮次时向其边界对齐；前翻游标保留被略去片段。超大单轮仍有界推进。没有用户消息的片段不显示整轮 Token、成本和 Worked 时长，内容及工具仍可查看。 | Runtime 逐页合并无遗漏、预算不超限、超大单轮推进、delta 游标不被对齐；ConversationView 对片段隐藏统计，完整轮仍显示正确统计。 |
| B6 打开失败阻断停止 | AgentService drain 等待成功创建的 manager；保留失败打开缓存，未获得所有权的 Session 不阻止清理。运行中 manager 的等待失败仍传播。 | lifecycle 证明失败 Session 不重新打开；真实 blocked Host＋活跃外部 writer-lock 组合可正常 stop，已有健康 Run/子任务 drain 用例仍通过。 |

B1 定位补充：此前“只缺 browseGroups 刷新”的描述不足以单独解释所有现象——用完整返回行模拟旧 global live 通知时，条目能出现。确定存在的缺口是 Host connection change 本身未刷新列表，以及分页分组不随该路径刷新。本次补上直接连接订阅，并用真实 React 交互单测验证该路径；最初的真实配对路线仍须下一轮 Computer Use 复验，不能把单测当成完整 UI 证据。

## 验证结果

- 修复前新用例已实际失败：重复配对消费两次码、位置 select 回落本机、片段显示整轮 usage、历史页从 turn/end 开始、失败 Session 阻断 drain，以及连接变化/定向通知不更新列表或标签。App 首次补充 Host mock 时遗漏 onUploadProgress，已修正夹具并重新在旧 handler 上验证两个目标断言失败，没有把 mock 异常算产品复现。
- Desktop 全量：138 个测试文件通过，1 文件跳过；1000 项通过、2 项跳过。之后增强片段时长断言，相关 15 项再次通过。
- Runtime：43 项通过。初次与依赖重建并行运行时 dist 被清理导致解析失败；构建完成后重跑全量通过。
- AgentService：28 项通过。
- Host 真实进程：7 项通过，覆盖新锁失败组合、健康执行/drain/子 Agent、断连继续、回执丢失恢复、审批及文件结果。新组合在旧构建上失败，重建依赖后通过。
- CLI 构建、Desktop 完整依赖/renderer/main/preload 构建、Desktop 类型检查通过。构建保留现有大 chunk 警告。
- 未修改 shared 契约、存储格式、Journal 或用户凭据。未操作并行 workbench/space-demo 与 myplan 文件。

同形检查：registry 的认证与重复检查集中于这一入口；App 的全局与定向通知统一刷新，其他用户操作继续复用 readSidebarSessions；Session dispose 原本已用 allSettled，本轮仅调整 drain 的 manager 获取，不吞掉实际 Run 等待异常；普通历史对齐不影响 afterSeq delta。子 Agent 自有工作组不依赖此历史片段，未改其计时。

## 切换模型后的验收路线

先重新启动本轮构建的 Desktop/测试 Host。旧验收进程可能仍持有上一版模块，不能用旧窗口证明修复。使用隔离数据与本地 Provider；沿用现有测试资料前确认 HostId、会话租约和运行进程，复制 Session 时不得复制活跃 writer-lock。

- 配对路线：首次配对显示会话；已有分页不收缩；撤销后重配和自动重连同步侧栏标签；重复添加不耗码，原连接仍可用。
- 移除路线：保留原会话入口、历史与草稿，远端位置正确，发送/审批/停止禁用；重新添加后恢复。
- 历史路线：两 Desktop 对比长会话首屏和加载更早消息；完整轮统计一致，超大轮片段不冒充整轮统计，前翻不漏消息。
- 回归路线：双端分别审批一轮、另一端解除；主 Desktop 完全退出时第二端完成任务，重开恢复；同 SessionId 双 Host 路由仍隔离。

B6 已由真实进程测试验证；Computer Use 可补正常维护界面状态，不声称 CLI 结果等同界面验收。按用户要求，本轮在这里暂停。
