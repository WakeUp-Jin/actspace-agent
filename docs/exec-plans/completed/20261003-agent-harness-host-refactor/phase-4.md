# P4：独立 Agent Host 与 Desktop 远端连接

状态：P4 首版获批范围已实现并验收；T1–T7 完成。B1–B5 经第十轮 gpt-6.1-sol 真实 Electron 定向复验通过，B6 真实进程专项重跑 2/2 通过。外部付费 Provider、用户云部署、systemd 安装和手机前端不属于本轮交付，详见 [验收矩阵](../../../exec-runs/20261003-agent-harness-host-refactor/phase-4-acceptance-matrix.md)。基线 P3 `c7b3aea`；尚未提交。

## 1. 目标与范围

交付可独立启动的 Host；Desktop 使用 WSS 或系统 SSH 隧道操作远端会话，客户端离线或退出不取消任务。复用 P2 任务服务和 P3 Harness 控制，不复制 Agent 内核。正常本机 Desktop/CLI 继续可用。

首版包括会话列表/创建/历史/分叉/模式、提交/队列/停止/审批/压缩、附件上传、受认证结果访问、设备配对与撤销、重连和维护。Host 配置工作区、Provider/密钥及模型，客户端只选择。统一展示本地和远端会话，以服务器标签区分；没有全局 Host 页面切换。新建会话选择位置，创建后归属固定。

不包括手机前端、远程交互式终端、完整 Git Review、本机浏览器转发、目录同步、通用远程文件管理器、远程配置编辑器、客户端重启服务器按钮、本机 daemon 自动安装、自进化工作流。云端 shell/文件工具在范围内。CLI 保留内嵌 run，并提供 Host 管理命令；通用远程 CLI 聊天产品入口不作为本阶段验收要求。

## 2. 必读与当前依据

开始实施读 AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、PLANS_GUIDE、CODING_BEHAVIOR、SECURITY、HISTORY_GUIDE、QUALITY_SCORE、FRONTEND_VERIFICATION；涉及样式先读主题配色规范。设计以 [已确认决策](../../../design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md) 为准。

当前源码核对（非运行验收）：

| 现有位置 | 复用与迁移 |
| --- | --- |
| packages/agent-service/src/{service,run-manager}.ts | 唯一任务接纳/调度入口；保留 submissionId、审批预算、队列恢复语义，补维护闸门 |
| packages/desktop-app/src/service.ts | 仍拥有共同会话操作、模式切换和标题逻辑；提取共同操作，Desktop 保留可选标题策略等宿主适配，不复制整个类 |
| packages/headless/src/runner.ts | 仍直接准备会话和写标题/模式事件；改用共同会话操作，保留一次性等待/导出/退出职责 |
| apps/desktop/src/main/runtime-v2/{runtime-registry,fixed-renderer-ipc,projection-ipc,approval-broker}.ts | 分离共同会话准备与 Electron IPC/投影适配；禁止整体导入独立 Host |
| apps/cli/src/runtime-v2/{host-adapter,tool-host-services,llm-adapter,artifact-store}.ts | 复用无 Electron 的能力装配；提取共同 Node Host 能力，CLI 不成为服务端依赖 |
| packages/client/src/sessions/ | 保留投影与展示状态；增加薄 transport/client 子入口，不放运行调度 |
| apps/desktop/src/main/{composer-attachment-service, runtime-v2/artifact-store}.ts | 复用格式、所有权、完整性与 realpath 检查，远端上传不得传本机绝对路径 |
| packages/runtime/src/startup/boot.ts、src/profiles/ | 一个进程一个 Cordis root；增加独立 Host 组合，不在 Desktop 内为每台服务器 boot Runtime |

本阶段涉及超过 8 个文件并增加一个 Host 接入服务，属于跨包架构改造。模块数由职责决定；不把网络、认证、调度和界面合进一个总管理器。

## 3. 模块与依赖

```text
Desktop Renderer -> Electron IPC -> Host connection registry
                                      | local direct adapter -> embedded Runtime
                                      | remote thin client -> WS / SSH tunnel
                                                               |
CLI host commands -> standalone launcher -> authenticated Host gateway
                                              |
                                     common application operations
                                              |
                              session/plugins + AgentService + HarnessControl
```

- 新增 `packages/agent-host`（`@actspace/agent-host`）：Node 宿主能力装配、配置、接入协议、认证、订阅、文件传输与生命周期，内部按职责分文件。导出 Cordis gateway plugin，入口在 app-owned launcher；关闭单个连接只释放订阅。
- 共同会话应用操作放入现有 `packages/agent-service/src/application.ts`，依赖领域契约，所需 Session/模型/审批端口注入；任务仍由原 service/run-manager 唯一持有。DesktopAppService/HeadlessRunner 消费该入口，迁走的方法不留下另一份实现。
- 共享 wire DTO/验证器放 `packages/shared/src/host-protocol/`，纯 JSON，无 Electron/Node 专属对象、绝对本机附件路径、AbortSignal 或函数。
- `packages/client/src/host/` 提供类型化请求、连接与订阅；注入 socket 和凭据获取接口，浏览器可消费。Electron Main 保存凭据、管理 SSH；renderer 不直接联网或读取密钥。
- Runtime 增加 standalone Host kind/profile、共同服务注入与 Node 能力端口；网络 gateway 不成为 Loop 的依赖。继续固定 Cordis 版本。

## 4. 应用协议与标识

应用协议命名 `actspace-host/1`，与 Harness revision 无关。握手返回稳定 hostId、此次启动 epoch、协议支持范围、功能能力、上传限制和维护状态；不兼容拒绝业务操作并提示升级，不猜测兼容。hostId 在 dataRoot 初次持久生成，重启不变；连接目标 hostId 意外变化要求重新确认并配对。

远端 SessionRef 为 `{hostId, sessionId}`。Desktop 以此作为缓存、草稿、订阅、审批、停止、附件和 React key 的归属依据；本机会话使用固定 local 标记兼容原存储，不重写已有 Journal。不同 Host 相同 sessionId/workspacePath 必须互不影响。显示分组可沿用工作区，但内部键包含 hostId，远端服务器标签常驻。

JSON-RPC 2.0 请求承载操作，通知只承载事件。mutation 必须有请求 id；id 仅用于应答关联，不代替 submissionId。定义白名单方法：

- `host.hello`、`auth.pair`、`auth.resume`；认证前仅允许这三项。
- `host.describe`：模型、能力、工作区清单与维护状态，剔除凭据。
- `sessions.list/browse/create/fork/update/page/observe/unobserve`：update 仅 title/pinned/archived/permissionMode/agentMode/workspaceId 的明确联合类型，复用既有运行中模式限制及 revision。
- `tasks.submit/lookup/command`：复用 P2 TaskReceipt/TaskCommand/TaskSnapshot；lookup 按 sessionId+submissionId 返回存在或不存在，正文不一致的重试冲突。
- `approvals.list/decide`、`sessions.compact`、`files.reference`、`uploads.begin/status/write/finish/abort`、`artifacts.describe/read`。
- `host.observe/unobserve`：会话列表、待审批数量、连接维护提示；细粒度输出仅订阅打开的会话。

错误沿用标准 JSON-RPC 错误码；业务错误使用 -32000、`data.kind`（UNAUTHENTICATED、REVOKED、INCOMPATIBLE_PROTOCOL、CONFLICT、MAINTENANCE、NOT_FOUND、LIMIT_EXCEEDED、RECOVERY_BLOCKED、FORBIDDEN）、retryable 及必要最新 revision；不发堆栈或密钥。批请求按规范处理，最多 16 项，每项独立校验；客户端 mutation 不使用 notification。

提交前内容/附件持久化完成才接纳，网络断开不传递为 Run abort。客户端已尝试发送的 submissionId 与内容持久保留为“待确认提交”，重启也以同一标识查证；这不是允许新建离线发送队列。已确定不存在的提交在恢复后按原发送意图重试；业务失败明确呈现，草稿不自动另起 submissionId。

## 5. 配对、凭据与传输默认值

- 一次性配对码使用 128-bit 随机值，10 分钟有效；服务端仅存 hash，成功交换原子消费。失败限每来源每分钟 5 次、全局每分钟 30 次；配对码不进入 URL、日志或 Journal。管理命令在服务器生成，默认不暴露网络管理方法。
- 每设备 256-bit 随机 bearer token，仅 Host 保存 hash；设备名、deviceId、创建时间和最近使用时间持久化。首版不自动过期，以撤销/重新配对处理；协议保留明确 REVOKED 状态，不静默无限重试。
- Desktop token 只在 Main 通过 Electron safeStorage 加密落盘；加密不可用则拒绝持久保存，不能退化明文。独立 Host provider key 仅从显式环境变量或受保护凭据文件读取；配置模板只填 env 名，不读仓库 .env。
- 浏览器原生 WebSocket 无任意认证头，因此统一在受保护连接首个认证 RPC 提交凭据；认证超时 5 秒关闭。后续 Web 页面凭据持久化策略属于其计划，本轮用浏览器兼容协议测试验证服务，不声称已交付浏览器登录存储。
- Origin 存在时精确匹配配置 allowedOrigins，不用通配符；无 Origin 的 Desktop 仍必须认证。每个请求、订阅发送和下载分块都校验设备有效性；撤销落盘后关闭该设备连接，不取消其既有任务。
- 默认监听 `127.0.0.1:4317`；原生 TLS 配置 cert/key 时提供 WSS。无 TLS 的公网绑定拒绝。可使用同机反向代理终止 TLS，但内部入口仍回环、Host 仍独立认证，不相信转发头授予权限。
- Desktop WSS 强制系统证书验证，无“忽略证书”开关；测试使用受信测试 CA。SSH 只允许系统配置别名及有效端口，argv 传参不拼 shell，固定远端目标 127.0.0.1。使用 BatchMode、StrictHostKeyChecking=yes、ExitOnForwardFailure、ServerAliveInterval；禁 agent 转发及共享控制连接。未知指纹提示用户在终端校验后登记，应用不自动接受。
- 本地转发绑定回环且使用独立端口，失败有限重试，清理只终止自己创建的 SSH 进程。重连退避 1/2/4/8/16/30 秒并加抖动，凭据撤销/版本错误停止重试。没有新增云账户、Relay、MCP 或收费 API 依赖。

## 6. 快照与实时订阅

Host 建立共同 observation 服务，复用 Session 投影与 live overlay。每次启动新 epoch，事件递增序号；Session 历史仍以 Journal seq 为事实，观察序号不充当持久接纳证明。

`observe` 在串行 observation 通道登记订阅并取得一致的投影、任务、审批、当前 Run 输出快照，返回 epoch+cursor；期间变化先缓冲，快照应答入发送队列后再推送 cursor 之后的事件。状态变更与 cursor 发布同通道，客户端按 epoch/cursor 去重；不能采用“先读快照，再注册监听”。

重连直接请求最新快照，不承诺离线 delta 无限回放。历史分页；当前 Run 的文字流采用可分页块，快照返回块引用与版本，客户端在完成快照替换前缓冲新事件，禁止截掉内容却标成同步成功。连接待发缓冲上限 8 MiB，超限断开该慢客户端并要求重新取快照，不拖住 Run。单个大 JSON 应答/通知可通过连接内 `host.payload` 引用和 `payloads.read` 分页重组：暂存总量受同一 8 MiB 预算约束，闲置 30 秒过期，最后一页或断开释放，每页重新认证；这不是持久离线事件日志。业务 JSON 帧上限 1 MiB，心跳 20 秒、60 秒无响应断连；服务器也限制客户端并发请求 32 个。

当前 Host 断线只影响其会话：历史/已显示内容保留、草稿可编辑、发送/停止/审批不可用。统一列表保留该 Host 上次结果并标离线；不能把查询失败当空列表删除会话。多个 Host 列表按既有置顶与更新时间合并、以 Host 独立分页。后台每个已连接 Host 保持轻量会话摘要订阅，待审批直接显示对应会话。

## 7. 附件与结果

发送前只在本机保留附件，点击发送后上传目标 Host；全部 finish 验证成功才提交。每文件 20 MiB、每消息最多 10 个文件且合计 50 MiB，Host 可降低限制并在 hello 公布。支持既有 JPEG/PNG/WebP 及普通文件附件；普通文件作为受管输入材料供文件工具读取，不承诺所有格式都能转成模型原生内容。图片继续校验文件签名和现有 provider 能力。

为避免引入第二种传输协议，首版通过 WS RPC 的 256 KiB 二进制数据对应 base64 分块传输；每块带 offset，服务端确认连续偏移，相同 offset/内容重试幂等，内容不同拒绝。begin 返回 uploadId，绑定 deviceId/sessionId/大小/hash；finish 校验总大小和 SHA256，fsync 后生成不透明 artifactId。未完成上传不可作为 task 引用。1 MiB 帧限制包含 base64 开销。

上传状态及已确认偏移持久化；`uploads.status` 按设备和会话返回确认偏移，断线重试从确认偏移继续，崩溃时丢弃未确认尾部。未关联任务的上传/完成产物保留 24 小时、每设备最多 200 MiB，清理只针对已到期 staging，不能删除已被持久任务引用的文件；引用与清理使用同一锁，关联任务前持久 pin，崩溃残留 pin 通过任务日志核对回收。任务取消不删除历史附件。

下载按 sessionId+artifactId 校验所有权，分块返回并校验 hash；浏览器或 Desktop 可消费同一接口。普通文件只下载，图片/文本在大小限制内安全预览；HTML/SVG 不作为有脚本权限的活动页面打开。工作区结果只允许注册工作区内的普通文件，realpath 校验并拒绝 symlink 逃逸/设备/目录；创建结果引用时固定文件快照，不能稍后读到同路径替换内容。下载到 Mac 使用显式保存位置，不自动覆盖。

## 8. Host 配置、命令与维护

复用 `actspace-agent` CLI 增加 `host init/check/serve/status/pair/devices/revoke/stop` 子命令，通过 runtime loader 加载 ESM Host。配置文件 `host.json` 包含 schemaVersion、dataRoot、listen、TLS、allowedOrigins、workspaces(id/name/path)、providers(id/type/baseUrl/keyEnv/models)、defaultModel；严格校验未知字段，启动不自动创建用户工作区。相对路径以配置目录为基准。

`host init --config PATH` 创建无秘密模板且不覆盖已有文件；`check --config PATH` 校验配置、目录权限、模型引用、凭据存在和 TLS/端口条件，不输出凭据也不默认发付费模型请求。`serve --config PATH` 前台运行，systemd 示例承担服务重启；示例不得启用崩溃任务自动继续。

管理命令通过 dataRoot 内 0700 目录/0600 请求文件进入 Host 管理队列，原子写入+nonce+应答文件；仅同 OS 所有者可操作，不新增网络管理 API/Unix socket 协议。请求清理有界；检查同一 dataRoot 的进程独占锁，不能以 PID 存在就认定身份。Host 未运行时 pair/revoke 要求先启动，避免多 writer 修改设备状态。

正常 `stop`/SIGTERM 进入 draining：拒绝新任务与配置修改、停止领取队列，但允许现有查询/停止/审批及活动父 Run 所需的子 Run收尾；不调用会立即取消的 Runtime shutdown，等 Run/子 Run/审批/后台 shell 资源空闲后才关闭。无自动取消期限，状态显示等待原因。

`stop --force` 显式请求取消，最多 15 秒清理，随后进程退出；不能正常结束的任务按恢复规则标中断/结果未知。下次启动暂停队列、重新校验 P3 选择，不恢复 Loop 内存。配置变更通过 stop→serve 生效；不做自更新器。Host blocked 仍提供认证后的诊断与管理，不能因 capability 查询失败销毁维护入口。

## 9. 文件级任务与交付顺序

以下为一个 P4 总交付的内部依赖顺序，每步均须保持既有本机路径可用；新增远端入口在完整可用前不默认展示。不是声称仅接口落地就完成独立 Host。

- [x] T1 共同应用契约：新增 shared/host-protocol/{types,methods,validation,index}.ts、agent-service/application.ts 及测试；迁移 DesktopAppService/HeadlessRunner 共同会话操作、内容准备与审批端口。测试同一操作经本机/序列化适配结果一致；固定模型读取时点和历史兼容。
- [x] T2 Node Host：新增 agent-host 包及 src/{config,node-ports,application,plugin,manifest,index}.ts；提取 CLI/Desktop 无 Electron 的重复 tool/LLM/artifact 适配，保留宿主差异；新增 runtime profiles/host.bundle.ts 和 host kind。修改 workspace manifests、exports、tsconfig、lockfile、构建图与包边界脚本允许项。
- [x] T3 接入与设备：agent-host/src/{server,rpc,auth,device-store,admin}.ts；CLI args/types/cli 及 runtime-v2/host.ts；实现 TLS/SSH配对协议、撤销、数据目录独占与管理命令，默认 deny；真实网络和双进程负向测试。
- [x] T4 状态与传输：agent-host/src/{observation,uploads,artifacts,lifecycle}.ts，client/src/host/{client,connection,subscription,index}.ts；AgentService 维护闸门与待确认提交存储。验证快照边界插入事件、慢消费者、断线/重启/落盘故障、上传清理竞争。
- [x] T5 Desktop Main：新增 main/remote-hosts/{registry,credentials,ssh,session-router,ipc}.ts；修改 fixed-renderer-ipc/projection-ipc/desktop-shell-ipc、preload 与 shared IPC DTO。每个入口验证 SessionRef；remote 不可穿透本机 terminal/review/openPath/credential API。既有本机会话无重写可读。
- [x] T6 Desktop UI：修改 App.tsx、Composer.tsx、Sidebar.tsx、设置导航与新增 HostConnectionsSettings.tsx；统一列表、服务器标签、新会话位置、目标工作区/模型、离线草稿、接纳确认、上传进度和下载。禁止全局 Host 页面切换；保留主题 token，测试同 ID 跨 Host、缓存/草稿/审批隔离及本机交互回归。
- [x] T7 集成和文档：新增 scripts/test/host-process.test.mjs、host-lifecycle-process.test.mjs、host-tools-process.test.mjs 与 TLS/SSH fixtures，根 test:agent-host:process/test:agent-host:protocol；新增 docs/agent-host/README.md 与配置/systemd 示例；更新架构/安全/TaskRun设计、执行记录、history，按学习指南沉淀经验。部署命令先在隔离 fixture 验证，不擅自安装本机系统服务或部署用户云服务器。

实现路径说明：实际按职责合并/细分了计划中的占位文件，Node 能力位于 `agent-host/src/node-ports/`，共同应用位于 `agent-service/src/application.ts`，独立 Host 生命周期编排位于 CLI launcher `runtime-v2/host.ts`，Profile 使用现有 composition 入口；没有另外创建同名空壳。T1–T7 已完成；第九轮补齐双 Desktop 同步/审批/退出恢复，第十轮完成六项缺陷复验及双 Host 同 ID 隔离回归。逐项事实见 [覆盖矩阵](../../../exec-runs/20261003-agent-harness-host-refactor/phase-4-acceptance-matrix.md)。

## 10. 验收矩阵

| 编号 | 自动化与实际进程证据 |
| --- | --- |
| A1 | 同一服务本机/远端契约一致；默认 Desktop、CLI 内嵌回归；未创建第二套调度器 |
| A2 | 真实独立进程接纳后关闭客户端，Host 完成；新客户端可查同一结果；断线不触发 abort |
| A3 | 过期/重复配对、限流、无认证、错误Origin、撤销已连接设备、另一设备不受影响、token不进日志 |
| A4 | 本地 TLS 真握手及证书错误拒绝；真实隔离 sshd 隧道、未知/变化指纹、认证失败、端口冲突、关闭隧道Host存活 |
| A5 | 接纳落盘后回执前断线/杀进程，同submissionId不重复；不一致内容冲突；离线草稿不发送 |
| A6 | 快照前后并发流式事件不丢不重；epoch切换；慢客户端断开不阻塞其他端；大输出分页不截断 |
| A7 | 两端审批 first valid wins；取消/过期审批不能复活Run；旧revision操作返回当前状态 |
| A8 | 上传中断/重启/重复块/错hash/超限/撤销/跨session引用/路径逃逸/磁盘满；多附件缺一不提交；结果下载hash一致 |
| A9 | 正常维护停止领取但当前父子Run完成；审批阻塞可见；force有界；Host重启队列暂停、P3恢复/blocked仍成立 |
| A10 | 两Host相同sessionId与目录互不污染；模型/凭据不串；离线Host不隐藏历史；远端入口无法操作本机资源 |
| A11 | Node Linux 独立Host打包启动（无Electron），显式本地mock完成任务；平台与真实Provider验证边界单独记录 |

工程命令：`pnpm install --frozen-lockfile`、`pnpm --filter @actspace/agent-host... build`、`pnpm --filter @actspace/runtime... build`；agent-host、agent-service、client、runtime、desktop-app、headless、agent-cli、desktop 的 test；Desktop typecheck/build；根新增进程/协议测试；check:packages、check:desktop-build-graph、check:docs、check:secrets、git diff --check。将新增包检查接入根入口，不只手工跑。P3真实恢复进程测试仍须通过。

Computer Use 默认委派 gpt-6.1-sol，主智能体开发修复；先列点再分组，逐点报告：

- U1 本地旧会话、模式/队列/审批/压缩回归；统一列表与远端标签、浅深主题。
- U2 WSS添加/配对/错误/重连/移除；新会话目标工作区模型、归属锁定，已有会话自动连接。
- U3 SSH添加与真实隧道；失败提示，不接受未知指纹；远端shell工具正常而桌面终端/Review不误连本机。
- U4 两客户端同会话任务/审批；断网编辑草稿、待确认提交、后台提示、关闭Desktop后任务继续与重开恢复。
- U5 附件上传成功/失败/重试、不完整禁止提交、结果预览/保存；目标标签正确。
- U6 Host维护/重启后历史与暂停队列、手动继续；撤销连接及时失效、不取消任务。

分组按本地→添加WSS→远端任务/文件→第二客户端竞态/断线→SSH→维护重启路线执行，复用已配对状态。主题复验重点是视觉差异，不机械重复整条路线。多端协议自动化不能替代Desktop真实交互；手机页面不纳入本轮。

## 11. 依赖、风险和回退

已核对官方 JSON-RPC、ws、OpenSSH、Electron safeStorage 文档。建议直接依赖 lockfile 已有的 ws 8.21.0，由包管理器生成直接依赖变更，不升级 Cordis。Node 22 与本机 /usr/bin/ssh 已存在；真实 sshd、Linux执行环境和测试CA属于验收依赖，实施前检查。不可用时明确记未覆盖，不用mock冒充真实隧道/Linux通过；不安装系统服务或索取真实云密钥来绕过。

不依赖云账户开展开发；真实云部署需要用户后续提供目标并授权。WSS生产需要有效证书/域名或已有可信TLS入口，SSH需要已验证服务器指纹与用户已有密钥；Provider真实调用需要服务器显式凭据，工程验收使用隔离本地模型并标明边界。

最脆弱假设是已有 Desktop 共同操作能彻底脱离 Electron。若发现方法必须依赖窗口/本机文件，则拆成注入端口并保留本机适配，不能让独立Host依赖Electron或把本机路径当远端路径。大文件采用有界分块；慢消费者不增加Run背压；共享配置不热改。

回退产品代码不重写P2/P3 Journal，不删除服务器session/artifacts/harness-state/auth；Desktop旧版本只读取原本机数据，新增连接配置单独文件，回退后远端入口不可见但Host仍可独立运行。停用Host前显式drain，保留数据副本；不把降级当作继续支持已启用的新Harness。整个P4不自动commit/push，不清理myplan.md或tmp用户资料。

审阅重点：共同操作迁移边界、配对/凭据默认值、快照衔接与跨Host身份、上传上限与维护行为。用户批准此技术方案后实施；P5仍另行制定。

## 参考

- [JSON-RPC 2.0](https://www.jsonrpc.org/specification)：请求/应答/通知及错误语义，不提供任务去重。
- [ws 官方仓库](https://github.com/websockets/ws)：upgrade认证、心跳及服务器实现；浏览器使用原生WebSocket。
- [OpenSSH 配置手册](https://man.openbsd.org/ssh_config)：严格Host key校验、BatchMode与转发失败处理。
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)：Main端操作系统支持的秘密加密；不可用时不静默明文降级。
