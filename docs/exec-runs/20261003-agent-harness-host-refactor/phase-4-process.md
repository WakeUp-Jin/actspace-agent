# P4 执行过程

## 第十轮修复后验收完成

用户授权继续验收。委派 gpt-6.1-sol，在本轮最新构建的真实 Electron 与隔离 Host/Provider 下完成 B1–B5、双端审批、主完全退出恢复及双 Host 同 ID 隔离。B6 真实 blocked+writer-lock 进程专项 2/2 重跑通过。长轮由正常 Agent 执行 20 次工具生成，没有修改 Journal；使用透明 WSS 仅延迟前翻 17.098 秒，真实观察片段隐藏整轮统计，释放后恢复用户消息及 420 Token。详细证据见 [第十轮](phase-4-cu-round10.md)。T1–T7 已完成；本轮不改产品代码、不提交或推送。报告落盘后 check:docs、check:secrets、git diff --check 均通过。第二验收应用已正常退出，透明慢代理已停止，主桌面与隔离 Host 保留供查看。

## B1–B6 修复后等待模型切换（历史状态）

用户批准修复并明确要求工程检查结束后暂停，由其切换 gpt-6.1-sol 再验收。六项修改及红绿回归已完成，Desktop 1000、Runtime 43、AgentService 28、Host 真进程 7 项通过，构建与类型检查通过。详见 [修复记录](phase-4-bug-fixes.md)。本轮没有 Computer Use，T7 继续未签收；未提交或推送。

## 2026-10-04 第九轮修复前验收交接

缺失的双 Desktop 同步/双向审批/完全退出与恢复、双 Host 同 ID 隔离已补齐，证据见 [第九轮](phase-4-cu-round9.md)。用户要求当前仅验收，修复交给 Astra；本轮未改产品代码或测试代码、未重新构建、未提交。B1–B6 的复现、来源、证据和修复验收要求已整理到 [Bug 交接](phase-4-bug-handoff.md)。T7 仍未签收，须修复后定向复验。

用户明确批准技术方案并要求执行。基线 c7b3aea。

- 开始共同应用操作抽取和协议契约工作。保留用户 myplan.md 及 frontend/space-demo.html → space-demo-v1.html 的独立改动。
- 不创建提交、不推送；最终 Computer Use 委派 gpt-6.1-sol。

## 首轮实现与验证（进行中）

- 抽取 AgentApplication；Desktop 保留标题生成差异，Headless 与 Desktop 复用 SessionModeWriter。Node LLM/tool/artifact 适配从 CLI 移入 agent-host，CLI 保留兼容导出。
- 新增 Host Profile、Cordis application plugin、JSON-RPC 网关、配对与设备撤销、审批 broker、观察快照、持久分块上传、Host 管理目录与 CLI 命令。AgentService 增加 drain admission gate。
- 已验证：DesktopApp 11 测试；AgentService 26 测试；Headless 2 测试；CLI 13 测试；Host 第一批 9 测试。Runtime 依赖闭包构建通过。
- 独立进程测试 `node --test scripts/test/host-process.test.mjs` 通过：真实进程+WebSocket，配对、创建会话、持久接纳后断开、新设备读取 mock 模型完成结果、同 submissionId 去重、管理命令停机。
- 这些不是完整 P4 验收。Desktop 连接/UI、上传到任务的内容准备与结果访问、完整流式分页、WSS/SSH/Linux 场景、故障注入及 Computer Use 仍待完成。尚未部署云端、未使用真实 Provider、未提交。

## 第二轮后端验证

- Host 单元/实际套接字测试扩展为 14 项：增加真实 TLS 握手、未信任证书拒绝、错误 Origin 拒绝、管理目录 writer 独占、模型与凭据隔离。
- Runtime 40 项、CLI 13 项回归通过；Client 新增断线待确认和 Host 身份变化时不发送凭据测试。
- 包边界检查、Desktop 构建图检查通过；生成图已加入新依赖闭包。Desktop 全量 typecheck 通过（连接设置组件仍未开放导航，避免把未完成流程暴露成完整功能）。
- 已实现 Main 连接注册、safeStorage 凭据、WSS 与严格系统 SSH 隧道、Host IPC、结构化 SessionRef 与附件上传适配。仍需接入现有统一列表和聊天操作，以及最终验收。

## Desktop 接入与第一轮交互验收准备（2026-10-04）

- 已接入 Main 远端会话路由、创建/元数据/模式/任务/工具详情/审批、上传待确认记录、图片预览与显式结果保存。Renderer 增加设置导航、运行位置/Host 工作区与模型选择、会话标签；远端开发面板关闭。本机无远端连接时保留既有新建行为。
- 待确认记录在上传 begin 后持久保存 uploadId，重试沿用；Host 输出按块读取，结果文件固定快照并校验 Session 与 hash。新增上传 pin 恢复核对。
- Runtime 依赖闭包、Desktop typecheck、renderer/Electron 构建通过。Host 19 测试通过；真实 TLS/隔离 SSH 测试通过；独立 Host 进程断线继续测试再次通过。
- Desktop 全量第一次：981 通过、3 失败、2 跳过；3 个失败为延迟会话创建影响原本机行为，修复后两个相关文件共 44 测试通过。最终全量仍需重跑。
- 启动隔离 dataRoot 的真实 Electron 与 TLS Host，模型显式 mock；委派 gpt-6.1-sol 做第一轮 Computer Use。测试证书仅通过测试进程环境信任，不修改系统证书库。
- 未完成：完整订阅释放与离线跨重启缓存、Host 独立列表分页、大历史/任务快照帧限制、所有附件/引用与审批/维护竞态覆盖、Linux、CU 全矩阵及最终文档收口。P4 仍实施中，不能标记完成。

## 后续回归结果

- Desktop 全量复跑：134 文件通过、1 文件跳过；984 测试通过、2 跳过。真实 SSH 独立命令已另行通过，不将默认跳过写成未运行或全部通过。
- `test:harness-recovery` 真实进程 SIGKILL 三个持久化边界恢复通过。
- 包边界、构建图、文档检查通过。新增 Node 管理目录及应答拒绝 symlink 检查；status 增加正在等待的 Run、审批、子任务与后台 shell 信息。

## 第二轮修复与验收（2026-10-04，进行中）

- gpt-6.1-sol 第一轮真实 Electron 验证：配对、连续远端对话、归属锁定与标签通过；原始英文异常和无反馈 Review 按钮失败。报告见 [CU round 1](phase-4-cu-round1.md)。两项已修复，交回同一模型复验。
- 增加连接内的大 JSON 不可变分页：超过单帧限制的应答/通知通过 `host.payload` 引用和 `payloads.read` 取回；每连接暂存总预算 8 MiB、闲置 30 秒过期、断开释放，每页仍重新认证。Client 在取页期间保持通知顺序；已验证 Unicode 重组、帧限制、过期、套接字往返。超预算仍断开要求重新同步，不能宣称任意大小历史均可恢复。
- 完成 Run 后释放临时文本缓存，历史仍从 Journal 恢复；真实独立进程测试增加完成后缓存释放且历史仍含完整回复的断言，通过。
- 上传增加 `uploads.status`，重试校验原文件 hash/大小并从持久确认偏移继续；增加定时过期清理，失败进入 blocked。审批通知包含真实最终决定以清除另一客户端的等待态。
- Main 的列表/最近观察快照缓存落盘；Renderer 的远端待确认提交标识与草稿改为跨重启保存。增加 Main 重启缓存恢复和上传偏移针对性测试。
- 细粒度观察只保留打开的会话；切换后显式 unobserve，后台 Host 保留轻量摘要/审批观察。补修重启后 Composer 误向远端同步本机模型标识的问题。
- 修复凭据 fsync、连接代次异常清理边界；管理 status 在局部恢复错误时仍返回分组件诊断。
- 最新一次 Desktop 全量：986 通过、2 跳过（随后新增订阅/自动配置修复需再验证）；Host 22 测试通过。Runtime 依赖闭包、Client 与 CLI 构建通过。当前 CU 第二轮进行中，未完成全矩阵。
- 学习文档：[断线后重试与提交标识](../../learnings/2026-10/20261004-remote-submission-identity.md)。

### 真实进程维护补验

`node --test scripts/test/host-lifecycle-process.test.mjs` 通过（约 3.35 秒）：独立 Host 连接本机 OpenAI-compatible SSE 夹具，模型请求被夹具保持未完成；正常 stop 不取消请求、不领取第二条任务；释放响应后正常退出；重启保留已完成结果、第二条仍 pending 且队列 paused；手动 resume 才发第二次请求；force 在 15 秒内退出。已纳入根 `test:agent-host:process`。这不是真实 Provider 或 Linux 证据。

## 第三轮修复与跨平台验证（2026-10-04）

- CU 第二轮报告见 [round 2](phase-4-cu-round2.md)：地址/配对码中文提示、远端 Review/Terminal 入口边界、连续对话和代表位置浅深主题通过；普通文件选择入口失败；断线路线尚未覆盖。
- 已补普通文件选择、上传进度与发送期间去重、失败保留正文/附件；共同引用校验移入 shared，Node 文件引用解析移入 agent-host，Desktop/Host 复用；远端回复批注现在发送到 Host 校验所有权。
- 远端文件卡片和回复链接统一使用 Host 固定快照预览；文本（包括 HTML 文本）不作为活动网页加载，远端预览不带本机 freshness/relativePath 元数据。右键文件卡片显式保存。新增两项测试确认不会调用本机文件读取。
- 增加 `sessions.browse`，复用共同分页函数；Desktop 分组、游标和继续加载均包含 Host 身份。历史旧页不再覆盖离线最近快照。远端模型选择按会话保存；离线禁用停止/审批。
- 新增真实双客户端工具流程测试：Bash 审批一次生效、另端冲突决定拒绝、write_file 真写入、结果快照在原路径替换后内容不变。三项进程测试均通过，使用本地 SSE 夹具，不是外部 Provider。
- Desktop 最新全量：136 文件通过、1 跳过，988 测试通过、2 跳过。发送同步调用改动曾导致两项本机恢复测试失败，恢复同步调用后相关 52 项及全量均通过。Host 24 项通过；Desktop typecheck、包边界、构建图、文档和秘密检查通过。
- 修复 Linux 无 `/bin/zsh` 时的 shell 路径，Linux 使用 `/bin/bash`。打包脚本构建完整 CLI 依赖闭包，并规范化输出目录 realpath，避免 macOS `/tmp` 别名误判内部 symlink 逃逸。
- macOS managed CLI 打包、解压后的持久会话/恢复 smoke 通过。Docker Desktop 中 Node 22.23.1、Linux aarch64，容器内解压同一产物后 3 项 Host 真实进程测试全部通过（约 6.16 秒），包括 shell、文件结果、审批、断线、正常维护、强制退出及重启暂停队列。直接绑定 macOS package/repo 目录曾出现间歇文件访问错误，未计为通过；最终证据来自容器内解压。测试支持 `ACTSPACE_HOST_TEST_CLI/PACKAGE/CLIENT` 注入产物路径。
- 第三轮 CU 使用独立的新 Host 测试 dataRoot（旧数据保留）：旧夹具在开发代码变化后触发 P3 Host 指纹恢复阻断，未绕过生产校验。新增管理 status 输出 harness-recovery 原因，便于诊断。第三轮模型改为本地可控 SSE，支持真实 Bash 审批和 write_file；不声称真实模型质量验收。
- 当前仍实施中：第三轮 CU 以及完整 U1–U6 覆盖收口、异常场景矩阵和最终文档仍待核对。没有 commit/push 或部署用户云端。

### 补充故障验证

- `host-receipt-process.test.mjs`：客户端传输层丢弃真实 `tasks.submit` 成功回执并断连，随即 SIGKILL Host；遵守生产 30 秒过期租约等待后重启。同一 submissionId 查证/重试只有一条已接纳任务，不自动重新执行，变更正文重试冲突。通过（约 33 秒）。
- `host-upload-disk-full.test.mjs`：Linux 容器显式 16 MiB tmpfs 内制造真实 ENOSPC，确认已应答偏移不被失败写入推进、未完成附件不能关联任务；释放填充文件并重建上传服务后续传、finish 与 hash 验证通过。该测试要求显式隔离故障目录，不在普通工作区制造磁盘满。
- Computer Use 第三轮仍进行中；上述进程与文件系统验证不替代真实界面验收。

## 第四轮修复与固定构建验收

- 第三轮 [CU 报告](phase-4-cu-round3.md)：普通文件发送、审批、写入、文本预览/保存、离线草稿与自动重连通过。超限提示误报未确认、删除后重试未成功；取消没有命中慢请求窗口，未确认有效中断。
- 修复确定拒绝与未知回执混淆：Main 返回结构化提交失败，Renderer 仅对未知回执沿同 submissionId 核对；20 MiB 等准备错误中文提示、清理 pending 标识并保留草稿。接纳后的列表刷新失败不再恢复已发送草稿。定向测试确认确定拒绝只调用一次提交。
- Composer 异步失败只恢复原会话；添加跨会话切换和移除失败附件再发送测试。普通文件改为已有 artifact 块，Loop 通过已有 Session artifact resolver 给模型读取路径，UI 不直接展示 Host 内部提示。
- 分页缓存落盘，新增 Main 重启后恢复页及跨 Host 隔离测试。
- 真实故障测试发现固定 Harness 产物损坏发生在控制模块接管前，导致 Host 无诊断入口。将 builtin 产物发布延迟到 HarnessControl 初始化，可信 Host 合约单独读取并保留原排序；损坏后 blocked 诊断和正常 stop 的真实进程测试通过。既有测试 Host 数据恢复 ready，无 Journal 改写。
- 最新 Desktop 全量 990 项通过、2 项跳过；随后新增确定拒绝测试所在队列文件 11 项通过。Runtime 41 项、Host 26 项通过；5 项 Host 真实进程测试通过；真实 SSH 增补变化指纹及未授权密钥拒绝通过。
- 第四轮 Electron 使用固定 build，无 Vite/HMR；避免监视测试文件造成验收刷新。CU 仍由 gpt-6.1-sol 执行，复验附件失败、取消及 SSH UI。隔离 SSH 配置使用明确标记临时块，验收后精确移除；不修改用户其他 SSH 配置和系统信任库。

## 第五/六轮：本机兼容与完整交付复验

- [第四轮](phase-4-cu-round4.md) Q1–Q5 全通过：超限移除后重试、普通文件卡片、有效停止、真实 SSH 配对/工具审批和移除连接不停止 Host。
- [第五轮](phase-4-cu-round5.md) 暴露本机恢复兼容问题。新增引用校验、列表分页仅为 Host 辅助操作，不应改变持久 Harness 的 shared 根入口指纹；改用独立 shared 子入口。原选择/Journal 保留，旧数据恢复可运行，没有绕过恢复检查。新本机会话 Plan→Agent、工具审批、停止与队列继续随后通过。
- 发现首轮尚未开始的会话没有向初始 Composer 传入队列，导致已接纳任务在恢复后没有继续入口。补齐传参和行为测试；第六轮真实 UI 已确认两条旧会话分别恢复一条/两条暂停任务，手动继续后显示原消息与结果。压缩 fixture 修正为仅在请求声明工具时生成工具调用，真实 `/compact` 复验成功。
- 新增真实套接字慢客户端背压隔离、上传中途撤销/另一设备隔离测试；真实 SSH 增加已有转发端口冲突拒绝。Host 28 项通过，SSH 专项通过；Runtime 41 项、AgentService 27 项、DesktopApp 11 项、Headless 2 项、Client 18 项、CLI 13 项通过。
- 最终 CLI 重新打包。Linux ARM64 容器内解压最终产物后 5 项进程测试通过（约 53 秒），含丢回执强杀恢复、blocked 诊断、维护、审批与文件结果；16 MiB tmpfs 真实 ENOSPC 再验通过。本机 5 项 Host 进程及 P3 恢复测试通过。
- Desktop 全量曾在并行构建/容器检查期间遇到现有批注弹层关闭断言超时；该文件 64 项单独复验通过，正在以两个 worker 全量复跑，不把初次失败隐藏。
- 第六轮双客户端及维护/撤销 Computer Use 仍进行中；最终状态以覆盖矩阵与该轮报告为准。验收使用隔离 Provider/数据；无真实云部署或付费模型调用。

- Desktop 两个 worker 全量复验：136 文件通过、1 跳过，992 测试通过、2 跳过。真实 SSH 专项已独立运行通过；最终 macOS 解压 managed CLI smoke 通过。

- 补充父/子 Run 真进程维护：父任务调用 agent 工具，子任务模型流保持未结束时请求 drain；status 显示一个活动子任务，释放子回复后父任务继续消费并完成，两个 Journal 均持久完成后 Host 正常退出。macOS 和 Linux 最终产物各通过，纳入根进程命令（合计六项）。

- 第六轮主桌面完全退出后，由独立协议客户端批准原待审批任务，Host 完成；重开主桌面自动连接并显示原结果。后台会话等待审批标识通过。该证据不等于双 Desktop 界面同步。
- 第二隔离 Desktop 多次在 macOS Keychain 的 SecItemCopyMatching 主线程等待，CU 无法访问系统授权窗口；已用独立应用标识/可执行名排除默认 Electron 选择歧义，未绕过加密、读取秘密或修改钥匙串权限。双桌面 UI 保留环境门禁，已告知用户。
- 单主桌面复验发现重新订阅会清空流式工具覆盖层，后续审批事件仅查找原工具而不会重建卡片。恢复中的 Run 收到未知 toolCallId 审批事件时，重新读取 Host 当前审批事实补齐卡片；避免重放历史审批。新增测试先失败后修复通过，相关三文件 28 项通过，随后定向 CU 复验。

## 第七轮收口与剩余门禁

- 审批回访卡片定向 CU 通过；Desktop 最终全量 993 通过、2 跳过，136 文件通过、1 跳过。Desktop 构建/typecheck 与 frozen-lockfile 安装通过。
- 第七轮真实 UI：正常 drain 保留当前审批和队列；用户批准后当前任务完成、Host 正常退出。同配置重启后队列明确暂停，手动继续仅发送一次。
- 精确撤销隔离主 Desktop 的设备后，UI 立即禁用审批/停止，历史保留；连接设置明确显示“设备授权已撤销”。另一授权协议客户端批准原任务并查询到 completed，验证撤销设备不取消服务端任务。后者为协议证据，不能冒充第二 Desktop 交互。
- 双 Desktop 同时观察与审批同步仍受第二隔离应用的 macOS 钥匙串等待阻塞；未修改系统钥匙串权限、未降级明文存储。T1–T6 实现完成，T7 保持未签收。具体覆盖见 [矩阵](phase-4-acceptance-matrix.md) 与 [第七轮报告](phase-4-cu-round7.md)。

- 验收后正常 drain 关闭最终隔离 Host，确认 52060 无监听；停止夹具 Provider 和受阻的第二隔离 Desktop。主 Desktop 保留供查看（隔离主设备撤销终态），临时数据保留便于复现。此前已精确移除临时 SSH 配置块并关闭隔离 sshd，没有停用用户的 Docker Desktop。最终 docs/secrets/diff 检查通过，未 commit/push。

## T7 第八轮补验（2026-10-04）

- 用户请求验收 T7，委派 gpt-6.1-sol 进行真实 CU，不修改产品代码。6 项 Host 真进程、Host 28 项、隔离真实 SSH 1 项重新通过；包边界、构建图、文档、密钥扫描、diff 检查通过。显式 fixture 凭据下 Host check 通过；未提供环境变量的首次 check 按预期拒绝。
- 第二端首次启动和配对成功，重开再次阻塞于钥匙串 SecItemCopyMatching；同已授权应用/独立数据目录的第三端不能被当前 macOS CU API 可靠区分，限定一次路线后停止。双端同步、双向审批和第二端重开恢复仍未覆盖。
- 本轮确认四项问题：首次配对没有远端历史入口；重配后主侧栏仍离线；重复添加先消耗单次码再报重复且遗留未用设备；移除后远端会话误显示本机位置。它们不是系统授权问题，不以工程通过覆盖。
- WSS 移除后真实 UI 保留历史并禁用操作；独立授权协议客户端批准原 Run 并确认 completed，任务存续证据单列。验收报告见 [第八轮](phase-4-cu-round8.md)。T7 尚未签收，本轮只验收，不提交或修复产品代码。
