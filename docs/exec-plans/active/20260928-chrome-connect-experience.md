# Chrome 扩展连接、启动与使用体验闭环

- 日期：2026-09-28
- 状态：执行中
- 执行模式：交互模式；用户已于 2026-09-28 授权开始实施
- 下一步：完成剩余 A02–A16 实机验收，重点是忙碌 Runtime、Chrome 重启、故障/更新恢复、最新发布安装态与主题；G1 真实 Provider 使用和 G4 默认权限批准/拒绝/停止已有证据
- 交付责任：执行本计划的工程师或 Agent；不要求并行 Agent

## 1. 目标与范围

用户安装 ActSpace 后，无需源码、Go 或终端即可连接已有 Chrome。用户完成 Chrome 必须由本人进行的扩展加载和权限确认后，ActSpace 自动检查连接、接入 Runtime，并明确显示何时可以使用。再次启动、Chrome 重启、扩展晚加载、故障恢复和断开均有连续、可解释的交互。

用户已明确：只做 Chrome Extension → Native Messaging Host → Browser Tools 现有链路；不做多 backend，不做内嵌浏览器，也不为这两个方向新增抽象、配置或评估阶段。

本计划包含打包、Host 安装、Chrome 扩展、Desktop main/preload/renderer、Runtime 接入、工具授权/取消、真实验收与文档校准，预计涉及超过 8 个文件。复用 BrowserBridgeService 和现有 Runtime registry，不新增常驻系统服务或第二套 Agent Runtime。

首轮正式验收范围为 macOS 上的 Google Chrome，Host 随对应 arm64/x64 安装包构建；未经实机验证的架构不得宣称通过。一个 ActSpace 实例同时绑定一个 Chrome 扩展实例；支持用户使用非默认 Chrome profile，但不支持同时操作多个 profile。不实现 Edge、其他 Chromium 浏览器或 Windows/Linux 产品安装流程；不破坏其现有构建入口。

本轮不依赖 Web Store 上架，不提供虚构商店链接，不下载远端组件。商店发布与签名公证仍按独立发布流程处理。源码加载入口保留在高级选项，默认 Host 仍来自随包制品；从源码构建必须单独显式操作。

## 2. 输入、依据与必读文件

输入讨论稿为用户提供的《浏览器扩展接入与迭代方案（讨论稿）》。本计划吸收其连接与使用目标，并按本轮用户决定删除多 backend、内嵌浏览器和商店发布依赖；执行不得依赖 Downloads 中的原稿才能理解任务。

实施前阅读：

- `AGENTS.md`、`CLAUDE.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md`。
- `docs/CODING_BEHAVIOR.md`、`docs/PLANS_GUIDE.md`、`docs/SECURITY.md`、`docs/SUPPLY_CHAIN_SECURITY.md`。
- `docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-主题与配色规范.md`。
- `docs/design-docs/browser/agent-browser-use-index.md`、`agent-browser-use-integration-design.md`、`agent-browser-bridge-design.md`（后两份位于同目录）。
- `docs/design-docs/agent-plugin-runtime/agent-testing.md`、`docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`。

2026-09-28 源码核对基线：

| 事实 | 证据路径 | 实施含义 |
|---|---|---|
| 普通入口目前要求源码路径并执行构建 | `apps/desktop/src/renderer/components/extensions/CapabilitiesSection.tsx`、`apps/desktop/src/main/browser-bridge-service.ts` | 改为随包组件和连接向导 |
| ready 在 boot 时读取，决定 capability ceiling 和工具注册 | `apps/desktop/src/main/runtime-v2/browser-capability.ts`、`desktop-host-adapter.ts`、`packages/tools/browser-tools/src/plugin.ts` | 页面轮询不能替代 Runtime 接入 |
| 每次工具调用创建 transport 并 start/end session | `packages/tools/browser-tools/src/node-capability.ts` | 修复跨调用 ownership 与生命周期，不沿用旧文档的已实现长连接说法 |
| 默认 socket 固定，Host listen 前删除同名路径 | `browser-bridge/apps/cli/main.go` | 必须先消除多 profile 抢占路径，再自动恢复 |
| 已知 Browser action 返回 allow，batch preflight 自动签 token | `packages/tools/browser-tools/src/plugin.ts`、`node-capability.ts`、`browser-bridge/apps/cli/command_router.go` | token 不能充当用户授权，补 action-level permission |
| 专题入口的历史通过表述与 P05 宿主复核不一致 | `docs/exec-runs/actspace-v2-p05-browser-bridge-cutover-and-verification/execution-summary.md` | 本轮验收独立留证，不继承历史 PASS |

上述是静态检查结果，不是本轮运行或 Chrome 验收结果。

## 3. 选定设计

### 3.1 用户流程

设置的现有“能力”区域保留入口，主名称改为“Chrome 浏览器”，提供“连接 Chrome”。不新增独立设置体系。连接页主区域只显示当前步骤、明确状态和下一步；路径、协议、socket、版本详情折叠展示。

1. 未连接：显示用途、将安装本机组件的说明和“开始连接”。不启动时静默写入浏览器配置。
2. 开始连接：一次确认覆盖本次本机组件安装与注册；校验随包文件、安装 Host、准备扩展目录。相同操作幂等，重复点击不启动第二个安装任务。
3. 加载扩展：提供“打开 Chrome 扩展管理”“复制目录”“在 Finder 中显示”，显示 Developer Mode → Load unpacked 的简短指引。只在用户点击打开操作时启动 Chrome。
4. 扩展出现后自动检测。单一候选可直接接入；多个候选要求用户在目标 Chrome profile 点击 ActSpace 扩展按钮，完成本次连接选择。选择行为只授权连接，不授权浏览器副作用。
5. 自动验证版本、绑定目标、Runtime 工具注册、只读 tabs 查询。空 tabs 数组是有效查询结果，不自动新建或导航页面。
6. Runtime 空闲时自动重组；有活动任务则显示“浏览器已就绪，当前任务结束后即可使用”，保留其他功能。无需用户再次点击检查或重启应用。
7. 全链通过后显示“已连接，可以在对话中使用 Chrome”；显示实际扩展版本和连接目标的用户可理解标识。未验证目标时不展示猜测的 profile 名称。

重开 ActSpace 时读取既有连接意图，仅做只读检测并恢复已绑定实例；Chrome 未运行显示“打开 Chrome 后自动连接”。关闭设置页不停止已授权的恢复。用户主动断开后跨应用重启保持断开，只有“重新连接”重新启用恢复。

### 3.2 模块边界

```text
Settings / Browser 工具进度
  ↕ typed IPC（snapshot、用户 action）
Desktop BrowserBridgeService ──→ Runtime registry（空闲重组、注册结果）
  ↕ 实例发现与绑定                       ↕ Browser capability
Go Native Host / 每实例 socket ←──── Browser Tools transport
  ↕ Native Messaging
Chrome Extension / Chrome 用户 profile
```

Renderer 不读文件、不注册 Host；安装与状态权威在 main。Go 继续持有 canonical command registry 和执行编排；扩展负责 Chrome 原语。不从工具调用触发安装、注册、修复或 Profile 重组。

### 3.3 公共数据与 IPC 合同

以 `packages/shared/src/browser-bridge.ts` 为连接 DTO 唯一来源，在现有 fixed-renderer typed IPC 注册，不另建字符串协议。

- 持久化连接设置：schemaVersion、用户连接意图 enabled、来源 bundled/source、已绑定 extensionInstanceId、已选择源码目录（仅高级模式）、已安装组件版本。存 main 管理的数据目录；不继续把 renderer localStorage 当连接状态权威。
- Snapshot：revision、observedAt、connectionState、layers、selectedInstance、preparedVersions、runningVersions、runtimeRegistration、lastSuccessAt、error、allowedActions。layers 分别包含 Host 文件、registration、扩展连接、socket/protocol、Runtime、工具注册、只读 probe 的状态和时间。
- 顶层状态：disconnected、preparing、awaiting_extension、awaiting_selection、connecting、waiting_for_idle、connected、reconnecting、update_required、blocked、error。未知扩展安装状态保留 unknown，不能由握手失败推断为 disabled 或 policy_blocked。
- 用户 actions：connect、disconnect、retry、repairHost、prepareUpdate、openExtensions、revealExtensionDirectory；高级来源操作复用现有入口并加强校验。返回操作 ID 与 snapshot；失败返回稳定错误类别和允许的恢复动作。
- main 合并并发检查，使用 generation/revision 丢弃旧响应；连接向导期间每 1 秒探测，后台恢复按 1/2/5/10 秒退避，上限 10 秒并加抖动。成功后 10 秒健康检查，连接断开立即失效。退出应用清理 timer/subscription。
- “已连接”只由完整链路派生。握手成功而工具未注册、probe 未完成或版本不兼容时不能显示已连接。

### 3.4 Chrome 实例绑定与 socket

使用扩展 `chrome.storage.local` 保存随机 extensionInstanceId（新增 storage 权限），标识本 profile 中的扩展安装实例；不读取浏览历史、Cookie、密码来辨认用户。Host 在首次握手后发布独立 socket 与原子实例记录，记录仅含实例 ID、进程/启动标识、版本和心跳。

每次 Host 启动使用独立路径；socket 与实例目录分别限制为当前用户可访问的权限。Desktop 只从受管目录发现并验证 socket，握手再次核对实例 ID、Host 启动标识与版本。实例记录不是授权凭据。Host 退出只清理自己拥有的记录/socket，禁止无条件删除共享路径。

已有绑定只重连同一实例；其他 profile 即使后启动也不能接管。首次单候选可自动选定，多候选通过本次连接操作的短时 challenge 和用户在目标扩展按钮点击来确认，challenge 不写日志。没有进行中的 Connect 时，点击扩展按钮不改变绑定。更换绑定必须从连接页明确触发，并先排空旧目标调用。

复制 Chrome profile 导致 ID 重复时，按不同 Host 启动实例检测冲突，拒绝自动选择，提示在目标 profile 重新建立扩展身份；不把 PID 或文件路径当永久用户身份。短时间内同 ID 的旧 Host/new Host 重叠时，需旧实例失效后才切换。

旧 fixed socket 的 CLI 兼容入口仅在唯一可用实例时解析到该实例；多候选返回明确歧义错误，不选择最近启动者。旧版不支持身份握手的 Host 显示需更新，不作为自动绑定的候选。

### 3.5 Runtime 与工具生命周期

采用 restart-only，禁止热替换 Plugin Entry。BrowserBridgeService 的连接意图驱动 registry 排队重组；registry 用 admission gate 原子阻止新 run，覆盖所有会话、subagent、已接受但尚未开始的 Inbox 工作，不能只检查前台会话。

用户加载扩展时不强制中断活动任务；达到安全空闲点后关闭准入、flush Journal、完成工具 disposer、释放旧 Profile，再 boot 新 Profile 并恢复 Session 投影、IPC 订阅、英语学习等既有 Host 服务。最后验证 Browser tools registration 和只读 probe，再恢复准入。重组失败允许重启旧配置并显示失败；不得同时留下两个 Profile writer。

Browser transport 和 Browser session 的 ownership 统一为 Agent Session + turnId：同 Turn 多次工具调用复用连接与 tab ownership，跨 Turn 按终结事件结束。并发调用共享连接但独立 request ID；不同 Agent Session 不共享 ownership。所有正常完成、失败、取消与 Profile dispose 都执行幂等 session.end/dispose；断线后明确报告 session 丢失，不静默重放写操作。通过 Runtime 现有 live/终结事件接入清理，禁止依赖下一次工具调用清理。

Host 设置页始终可诊断。Browser plugin 准入且 Bridge 在线时，browser_help 使用 Go registry；断线返回简短诊断与设置入口，不伪报远端成功。初次未注册 Browser plugin 时由 Host UI 提供诊断，不为此新增全局工具体系。本次不重写模型工具披露策略。

### 3.6 权限、取消与使用反馈

在 Browser plugin permission 阶段消费 Go registry 生成的 action 风险信息，单条和 batch 使用一致规则。只读查询允许；存在写入、提交、上传、下载落盘、删除、剪贴板修改等副作用的动作按现有 permission mode/ApprovalBroker 决策处理，未知 action 拒绝。default 模式的需确认动作必须等待真实用户批准；full-access 遵守现有模式语义，并在测试中单独验证。连接批准不能转成 Session 的通用副作用授权。

batch action 摘要绑定 action hash、sessionId、turnId 与当前目标实例；批准后参数或目标变化使批准失效。Go preflight token 只证明批次绑定，不证明用户批准；不得据此绕过 Tool Runtime permission。

取消协议使用连接内唯一 request ID，并携带 session/turn/实例身份。Go 停止尚未调度的动作、wait 和订阅；扩展取消尚未执行队列。已经进入 Chrome API/CDP 的动作返回 completed/failed 或 outcome_unknown，不承诺撤销已发生效果。连接中断、应用退出和超时均禁止自动重放写操作。

复用现有工具进度和 BrowserApprovalBlock，显示连接中、等待批准、执行中、已停止/结果待确认及失败恢复入口。截图落到 Session artifact；Journal、诊断和进度不写 base64、认证头或敏感页面正文。只读连接 probe 仅保留成功与计数，不把用户 tabs URL/title 写日志。

### 3.7 随包安装、更新与断开

资源清单包含 Host/Extension/protocol/registry 版本、平台架构和文件 hashes。构建产物随 Desktop 安装包分发；hash 校验检测损坏，发布可信度来自应用签名/分发链，不能把同目录 hash 自称为签名。

扩展采用固定受管加载目录，版本备份单独保存。更新先完整准备并校验 staging，排空 Browser 调用，提示用户禁用扩展后切换受管文件，再提示重新启用/加载；需在真实 Chrome 验证固定路径更新生效。首轮不使用软链接或“复制到新版本目录后 reload 即自动切换”的假设。文件切换期间失败回滚旧内容；实际握手版本未更新前保持 update_required。若 Chrome 仍引用旧位置，明确引导重新 Load unpacked。

Host 原子替换并保留旧文件；旧 Native Host 进程不因文件替换自动升级，必须等待扩展重连并核对 running version。Host/Extension 支持前一随包版本的协议兼容窗口；不兼容时阻止调用并给出组件更新步骤。

手动断开立即持久化 enabled=false 并拒绝新 Browser 调用，取消本实例在途 Browser 请求、释放自身 ownership；不关闭用户 tabs、不影响其他工具任务。Runtime 移除 capability 排队到空闲点；即使扩展仍有 Native Messaging 连接，也不能接受本应用的新 Browser 请求。重新连接恢复原绑定；卸载组件独立于断开，仅删除验证归属的受管文件和本产品 manifest，Chrome 中卸载扩展由用户处理。

## 4. 实施任务与依赖

这是一个完整产品交付单元。下列任务是内部执行顺序，不声称每步单独可发布；T1–T6 与其故障测试全部通过后，才替换普通用户默认入口。现有开发者入口在此之前保持可用。

| 任务 | 文件范围与具体动作 | 验证与完成条件 |
|---|---|---|
| T1 契约与实例路由 | `packages/shared/src/browser-bridge.ts`；`browser-bridge/packages/protocol/protocol.go`；`browser-bridge/apps/cli/main.go`；扩展 `manifest.json`、`src/background.js`。实现 snapshot/identity/握手/独立 socket/绑定和冲突语义 | 两个 profile/Host 并存不抢占；重连仅同实例；旧 Host、重复 ID、坏记录、超限消息均有失败测试 |
| T2 Runtime 接入与执行合同 | `apps/desktop/src/main/runtime-v2/{runtime-registry,desktop-host-adapter,browser-capability,host-ports}.ts`；`packages/tools/browser-tools/src/{host-port,node-capability,plugin}.ts`；Go `command_router.go`。接入 idle gate、重组、Turn 连接、权限和取消 | 活动后台任务不被中断；重组无双 writer；多调用 ownership 连续；拒绝不 dispatch；stop 不执行后续 batch action；未知结果不冒充未执行 |
| T3 随包制品与安装 | `scripts/release-package.sh`、`browser-bridge/build.sh`、`apps/desktop/src/main/browser-bridge-service.ts`。新增 `scripts/package-browser-components.mjs` 产出并验证组件清单，纳入现有打包脚本；受管安装/备份/修复/更新事务 | 安装包内含匹配架构 Host 和完整扩展资源；无 Go 环境可安装；损坏 hash、权限错误、磁盘写入失败保留旧版本；不覆盖其他 Host |
| T4 IPC 与连接页面 | `packages/shared/src/runtime-v2/fixed-renderer.ts`、`packages/shared/src/ipc.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/src/main/index.ts`；现有 `CapabilitiesSection.tsx`、`browser-bridge-settings-shared.ts`，新增相邻 `BrowserConnectPanel.tsx` | main snapshot 唯一权威；重复点击、旧响应、关闭/重开面板均一致；不以 ready 单字段宣称 Agent 可用；无 preload 显示明确桌面能力提示 |
| T5 启动恢复与使用反馈 | 上述 service/registry/UI；`apps/desktop/src/renderer/components/messages/BrowserApprovalBlock.tsx` 及其实际工具进度消费者 | 扩展晚启动自动注册；应用/Chrome 重启恢复原绑定；主动断开持久化；默认权限下真实 approve/deny；截图 artifact 可查看 |
| T6 验证与文档收口 | 现有 main、renderer、Browser Tools 测试；新增组件制品测试；Browser 专题设计、Extension README、发布记录和 history | 自动化完整通过或逐项记录独立基线失败；下面 A01–A16 实机结果逐项有证据；安装包与开发态分开说明 |

依赖：T1 → T2；T1 → T3；T2+T3 → T4 → T5 → T6。执行按顺序推进，不在共享 DTO 尚未固定时平行发明合同。Go handler 与 Locator engine 不整体重写；仅调整合同必需的 request cancellation、session 生命周期和 metadata。

最小实现仍包含 T1–T6，收缩的是平台与分发通道，不削减连接后的可用性。相比只美化设置页，工作量更大，但避免把启动顺序与故障恢复继续转嫁给用户。整体按多轮跨层任务管理，不承诺未经验证的工期。

## 5. 验收点：先确定覆盖范围

所有点初始为 NOT RUN。执行记录使用 PASS / FAIL / BLOCKED / NOT RUN，区分 fixture、源码/运行时、真实 Computer Use 和推断。

- A01 首次启动：未配置时入口清楚，不白屏、不静默注册、不要求源码或 Go。
- A02 随包安装：明确用户 action 后一次准备组件，安装失败可恢复；普通用户无需 Terminal。
- A03 Chrome 引导：扩展页、复制目录、Finder 操作有效，Chrome 必需步骤与权限清楚，按钮忙碌态正确。
- A04 自动连接：用户加载扩展后无需手动检查，握手→Runtime→工具→只读 probe 自动完成；空 tabs 也可通过。
- A05 晚加载与忙碌 Runtime：应用已启动或其他会话在后台运行时连接，任务不中断，空闲后自动可用。
- A06 再次启动：应用退出重开、Chrome 先关后开，恢复已绑定实例，不重复安装或强制启动 Chrome。
- A07 多 profile：非默认 profile 可连接；两个 profile 均安装扩展时，不串 profile、不抢 socket，多候选选择明确。
- A08 使用：真实对话完成 tabs 查询、fixture 导航、截图并在 Session artifact 查看；不能只用直接 abb 调用替代。
- A09 授权：default 下副作用 approve/deny、批次变更和目标变更；拒绝时无 dispatch；full-access 另测现有语义。
- A10 停止与断线：排队动作、正在执行动作、Host crash、Chrome 关闭、service worker 重启分别有终态；未知副作用不自动重试。
- A11 分层恢复：Host 缺失、manifest origin/path 错误、扩展 disabled、协议不兼容、工具未注册、策略明确阻止，显示正确恢复动作；缺乏策略证据时显示 unknown 而非猜测。
- A12 主动断开：阻止新调用、保留用户页面、跨应用重启仍断开，重新连接可恢复。
- A13 更新回滚：固定路径旧→新扩展、Host 旧进程→新进程、更新失败回滚、运行版本滞后时不误报成功。
- A14 高级开发入口：合法源码树加载、默认预编译 Host、显式源码构建；路径失效与协议不兼容可解释，退出开发来源有明确切换步骤。
- A15 UI：浅/深/跟随系统主题，常用窗口与窄窗口，键盘焦点、禁用态、错误文案和折叠诊断；状态不抖动、不显示内部术语主文案。
- A16 制品与隐私：安装包移出源码目录后仍可连接；证据记录平台/架构/Chrome/各组件版本；日志和 Journal 无测试 secret canary、截图 base64、probe 用户 URL/title。

## 6. Computer Use 操作分组

开始前从日志确认当前 Electron appName/appId 和 fixture URL；使用独立测试 Chrome profile 和受控页面，不操作个人页面做破坏性验证。分组只减少重复操作，不替代任何验收点。

| 分组 | 进入场景与连续操作 | 覆盖 | 证据 |
|---|---|---|---|
| G1 干净安装与首次连接 | 启动安装态 ActSpace→能力→连接→组件准备→扩展管理→Load unpacked→返回等待自动成功→fixture 工具查询/导航/截图 | A01–A04、A08、A16 | 初始、待加载、已连接截图；脱敏握手/registry/probe 记录；artifact |
| G2 启动与任务连续性 | 同一测试实例断开链路→启动后台任务→晚加载扩展→等待任务结束→再用 Browser→重启应用/Chrome→主动断开再重启→重新连接 | A05、A06、A12 | waiting_for_idle 中间截图；任务前后 journal 序号；恢复与保持断开截图 |
| G3 目标选择与故障恢复 | 第二测试 profile 启用扩展→选择目标→分别查 fixture tab→注入 Host/manifest/版本/注册故障→恢复；独立策略测试环境验证 policy block | A07、A11 | 两 profile 唯一 fixture 标识；每层异常 snapshot 与恢复结果；缺环境项标 BLOCKED |
| G4 执行与停止 | fixture 写操作拒绝/批准→批次与目标变更→排队取消→执行中断线/Host crash/service worker 重启→检查副作用和终态 | A09、A10 | 审批与终态截图；fixture 计数；无 dispatch/无后续 action 证据 |
| G5 更新与开发来源 | 从旧版组件升级→确认 pending 与实际版本→模拟失败回滚→源码加载/显式构建→失效目录/不兼容→切回随包版 | A13、A14 | prepared/running 版本、固定目录、回滚结果及切换截图 |
| G6 视觉与收尾 | 复用连接页的未连接/等待/成功/错误状态，切浅深系统主题与窄窗口，键盘完成主路线；检查最终安装态和脱敏证据 | A15、A16，并补前组遗漏 | 代表状态主题截图、焦点/布局记录、制品清单与隐私扫描结果 |

主要交互在主主题完整执行，其他主题/尺寸重点检查视觉差异和相关交互。截图可关联多个验收点，但不得凭终点截图声称已检查中间状态。结果表按 A01–A16 报告，不按 G1–G6 模糊汇总。

## 7. 自动化验证与执行环境

现有命令已从 package manifests 核对；本次计划生成没有运行实现测试。实施时先运行相关测试，再执行集成门禁：

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/tools-browser-tools test
pnpm --filter @actspace/desktop test
pnpm check:browser
pnpm typecheck
pnpm build
pnpm test
pnpm check:frontend-theme
pnpm check:frontend-tokens
pnpm check:docs
pnpm check:repo
git diff --check
```

分别在 `browser-bridge/packages/protocol`、`browser-bridge/apps/cli` 中运行 `go test ./...`。新增制品测试 `scripts/test/browser-components.test.mjs`，运行 `node --test scripts/test/browser-components.test.mjs`；断言缺资源、错架构、篡改 hash 必须失败，不能以空扫描通过。

用 `pnpm dev:log` 启动开发态；从日志取本 workspace 专属 appName/appId，不能选择通用 Electron。用 `pnpm package:desktop` 构建并验证安装态资源；打包通过不等于签名/公证/真实运行通过。

自动化用例覆盖正常、重复请求、过期响应、超时、退避、断线、重组失败、后台任务竞争、安装回滚、权限拒绝、取消晚到、双 profile 和数据脱敏。测试通过后不机械重复全仓检查，只有新增变更或失败才重跑相关范围。

本机规划时确认 pnpm、Go 和 Google Chrome 存在；不代表已确认 Chrome 连接、Electron 启动或签名环境。工具链用于开发构建，不是终端用户依赖。本计划不依赖 MCP 服务或远端 API；真实 Agent 对话验收使用已有配置的模型服务，由 Host 解析凭据，缺少可用 Provider 时 A08 对话链路标 BLOCKED，直接工具测试不能替代。

无需 Web Store 账号或新 API key。正式发布签名/公证需要现有 Apple 发布凭据，未具备时仅完成本地制品验证并如实记录，不索取或打印秘密。官方依据：[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)、[扩展本地存储](https://developer.chrome.com/docs/extensions/reference/api/storage)、[Load unpacked](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)，2026-09-28 已访问。

## 8. 风险、回退与完成标准

最脆弱的假设是 Runtime 能在所有会话的安全空闲点完整 dispose/boot 并恢复 Host 服务。通过 T2 多会话/后台 run/Inbox/flush 测试证明，失败时不切换默认产品入口；不以强制重启应用或动态改 ready 作为验收替代。

Chrome profile 内部 metadata 只用于辅助提示，不作为路由与安装状态的唯一真相；无法检测 disabled/policy 的情况明确 unknown。扩展 ID/public key 不是来源签名，源码目录需显式选择且不能自动运行任意目录脚本。

回退仅涉及本产品受管组件、连接配置和代码，不删除/迁移 Sessions、Chrome profile 或用户页面。新连接配置保留 schemaVersion；回退版本遇到不认识的配置不写坏它。旧 Runtime 已被 dispose 时失败恢复使用旧配置重新 boot，不并行复活旧 writer。组件升级保留上一版至新版本实机通过，卸载仅删除归属明确的文件。

执行开始创建 `docs/exec-runs/20260928-chrome-connect-experience/execution-process.md` 与 `execution-summary.md`，记录基线、操作、决定、失败和恢复。实现同步更新 Browser 专题的当前事实，历史验收留在历史记录；不把本计划的目标写成已实现。

完成代码后写 `docs/histories/2026-09/` 记录并检查学习沉淀条件；涉及生命周期/幂等更新/取消合同达到两项条件时按 `docs/learnings/WRITING_GUIDE.md` 写学习文档。仅计划生成不冒充代码交付 history。

工程实现完成后按仓库规则移入 completed，摘要保留未完成实机门禁；只有 A01–A16 有充分 PASS 证据，才可声称本范围产品验收完成。本计划不自动授权 commit、push、发布、商店提交或删除 worktree。

## 9. 进度与决策

- [x] 收敛为单一 Chrome 扩展链路，排除多 backend 与内嵌浏览器。
- [x] 核对当前源码、仓库规范和官方机制，生成任务、合同与验收路线。
- [ ] T1 契约与实例路由。
- [ ] T2 Runtime 接入与执行合同。
- [ ] T3 随包制品与安装。
- [ ] T4 IPC 与连接页面。
- [ ] T5 启动恢复与使用反馈。
- [ ] T6 验证、文档与交付。

2026-09-28：用户要求先生成执行计划；随后授权实施。选择单一完整交付单元；普通通道使用随包组件，不等待商店审核；保留 Chrome 用户控制和现有 Runtime/Host 分层。

2026-09-29：独立真实 Electron + 两个未登录 Chrome 测试资料完成首次自动连接、应用重启恢复、主动断开持久化与双资料显式切换。本机临时签名 arm64 包移出源码目录后启动并显示首次入口。A01、A04、A07 已按真实界面与只读运行时证据通过；其余点仍有未覆盖范围，真实对话因测试版无 Provider 阻挡。开发 wrapper 资源路径和双资料 socket 诊断问题已修复。个人 Native Host 登记已核对恢复；详见执行摘要。计划保持 active。

2026-09-29：用户授权复用既有模型配置后，隔离测试版完成真实 Agent tabs 查询、认领、页面读取、导航和两次截图；Beta 截图在会话右侧面板打开。默认权限下批准认领/导航、拒绝导航及等待中停止批次均有真实界面与页面结果，A08 通过，A09/A10 部分覆盖。修复 Agent/CDP 会话身份冲突、旧消息恢复白屏及截图预览投影；增量测试通过，最新修复已重新打入本机临时签名 arm64 包，尚未做包外完整连接。测试扩展已停用、个人 Native Host 登记按 SHA-256 恢复，隔离凭据副本已删除。仍需完成 G2–G6 未覆盖矩阵，计划保持 active。
