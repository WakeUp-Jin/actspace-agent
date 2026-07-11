# Browser Use 完整实现

| key | value |
|-----|-------|
| date | 2026-07-10 |
| scope | plugins/browser-bridge, packages/agent-core, packages/shared |
| status | Plan 5 M0-M6 completed |

## 概要

执行了 Browser Use 集成的全部 6 个计划，从仓库合并到 Tab Group + 光标可视化，实现了完整的浏览器控制能力。

## 变更清单

### Plan 0-pre: 仓库合并
- 将 `actspace-plugins` 仓库中的 `browser-bridge` 和 `fs-watch` 合并到主仓库的 `plugins/` 目录
- 更新 `.gitignore`、`AGENTS.md`、`ARCHITECTURE.md` 反映新结构

### Plan 0: 协议契约扩展
- `plugins/browser-bridge/packages/protocol/protocol.go`：协议版本升级到 0.2.0，新增 20+ 个 method 常量、交互命令类型定义（Click/Fill/PressKey/SelectOption/Scroll/DomCUA/CUA 等）
- 新增 `events.go`：定义 CDP/Download/TabClosed/Navigated 4 种推送事件类型

### Plan 1: Go Socket Server
- 新增 `server.go`：Unix socket 监听、连接管理、idle timeout 自动退出
- 新增 `session.go`：会话生命周期、Native Messaging 中继、请求转发
- 新增 `events.go` (CLI)：EventBus 发布-订阅模式
- 新增 `native_conn.go`：Native Host 子进程管理
- 新增 `cmd_serve.go`：`abb serve --socket <path>` 子命令入口

### Plan 2: agent-core BridgeClient + 基础工具注册
- 新增 `packages/agent-core/src/tools/tools/browser/bridge-client.ts`：TypeScript Unix socket 客户端，length-prefixed JSON framing
- 新增 `definition.ts`：15 个浏览器工具定义（screenshot/dom_snapshot/navigate/open_tab/list_tabs/click/fill/press_key/select/scroll/back/close_tab/user_tabs/claim_tab/finalize）
- 新增 `executor.ts`：15 个工具执行器
- 更新 `packages/shared/src/session.ts`：扩展 ToolPreviewKind 联合类型
- 更新 `packages/agent-core/src/engine/streaming-preview-extractors.ts`：注册 browser previewKind

### Plan 3: 交互命令 + Playwright 注入
- 新增 `playwright-injected.js`：页面注入的轻量选择器引擎（locateStrict/isVisible/fill/selectOptions/getVisibleDom）
- 扩展 `background.js`：新增 domSnapshot/closeTab/clickElement/fillElement/pressKey/selectOption/scrollPage/navigateBack 等命令处理
- 扩展 SUPPORTED_CDP_METHODS：添加 Input.*/Page.getNavigationHistory 等

### Plan 4: Tab Group + 光标可视化
- 新增 `cursor-overlay.js`：Agent 光标 overlay content script，含点击涟漪动画
- 新增 Tab Group 管理：自动将 Agent 创建的标签页分组，session name 作为 group title
- 更新 `manifest.json`：添加 `tabGroups`/`downloads` 权限，web_accessible_resources

## 验证

- Go: `go build` + `go test` 全部通过
- TypeScript: `tsc --noEmit --skipLibCheck` shared/agent-core/desktop 三个包全部通过
- Chrome Extension: manifest.json 格式正确，背景脚本语法正确

## 依赖关系

无新的外部依赖引入。所有实现基于 Node.js 标准库（net）、Chrome Extension API、CDP 和 Go 标准库。

## 2026-07-10 接入闭环修正

后续真实会话验收发现，上述实现虽然新增了 browser definitions/executors，但没有注册到 `createToolManager()`，运行时提示和托管 Skill 仍要求通过 Bash 调用 `abb`，executor 默认 socket 也与 Native Host 不一致。因此此前“完整实现”只代表代码骨架与两端能力存在，不代表模型运行时已完成接入。

本轮补齐：

- 将 15 个 `browser_*` 工具按插件可用性注册到主 Agent ToolManager。
- 使用真实 session/turn ID 创建每 turn 的 `BridgeClient`，结束或异常时统一 dispose。
- 复用 Native Host 稳定 socket，不创建额外 `abb serve` 进程。
- Native Host socket 支持同一连接连续处理 `session.start`、业务请求和 `session.end`。
- 正常浏览器任务使用标准工具；`abb` CLI 与托管 Skill 仅保留诊断和安装职责。
- 只读工具自动执行，改变真实浏览器状态的工具接入现有审批网关。
- 用真实 Chrome 标签页完成 `ToolManager -> browser_user_tabs -> BridgeClient -> Native Host -> Extension` smoke。

运行环境复查还发现旧版重叠状态轮询遗留了大量父进程已退出的 `abb doctor --json`。这些进程收到终止信号后仍处于 macOS `UE`（不可中断等待且正在退出）状态，无法由应用立即回收；新实现通过 main-process single-flight、renderer 串行轮询和错误退避阻止继续新增，遗留项需等待内核调用返回，必要时通过系统重启彻底清理。正常 Browser Use 运行时只有 Chrome 拉起的 Native Host，不启动 `abb serve`。

## 2026-07-10 Plan 5 Go Command Engine 收敛

此前 15 个工具和 Extension 高层 handler 仍只是首版替代面。本轮按已确认的 7 个设计闸门完成长期架构收敛：

- 建立 62 条 Go canonical registry，并由同一份 metadata 驱动 CLI help、Agent action enum、risk、preview、legacy alias 与文档 parity 检查。
- Agent 默认工具面从 15 个叶子工具改为 9 个分类工具、`browser_help`、`browser_run`；旧工具名只保留迁移期 alias 和历史 preview 兼容。
- `browser_run` 先完成整批参数验证与风险 preflight，再使用绑定 action hash、session、turn 和过期时间的 HMAC token 执行；mutation 强制顺序首错停止。
- Go 新增 CUA、DOM CUA、Locator subset、导航、Tabs、History、Wait、File/Download token、Clipboard 和 Debug Log 编排；62/62 registry commands 全部为 `implemented` + `go.*` handler。
- Go 使用 `go:embed` 管理 `window.__actspaceLocator`，覆盖 strict CSS、状态/文本/属性读取、原生 setter fill、select、checked verification、DOM node snapshot/stale、media 和 clipboard。
- Extension 删除旧 `playwright-injected.js` 与 click/fill/select/scroll/back 等高层编排，只保留 Native Messaging、CDP primitive、Chrome APIs、事件 forwarding 和 cursor；primitive 增加 session tab ownership 复核与 debugger attach 引用计数。
- Native Host 新二进制已按临时文件 + hash 校验 + rename 原子部署。由于 Browser automation 安全策略禁止进入 `chrome://extensions`，真实 Chrome M6 需要用户手工重载一次 unpacked Extension 后继续。

验证已通过：Go tests、62 条 registry parity、Locator JS fixture、Agent Core/desktop typecheck、Browser Socket integration 和设置页/运行时上下文测试。真实 Chrome 分类 smoke 记录在 `docs/exec-plans/completed/20260710-browser-use/plan-5-real-chrome-acceptance.md`。

### M6 自动化审计补强

- 新增 AST dispatcher coverage，机械确认 62 条 registry handler 都存在 Go switch case，避免只把 status 改成 `implemented`。
- 新增 Extension primitive contract fixture，验证 tab ownership、claim、attach/CDP、close 拒绝、legacy 高层 method 退役与 manifest 资源边界。
- backend capability report 在执行 Go handler 前校验；每个 socket connection 持有独立 event state，断线时清理 logs、chooser/download token 和 capability cache。
- debugger attach 从集合改为引用计数，避免 debug/file chooser 的持久 attach 被 CUA/Locator 临时 detach 提前释放。
- Browser 工具结果改为 ephemeral：当前模型仍获得真实截图、DOM、debug 或 clipboard 结果，session、stream preview、console/run log 只保存脱敏参数、动作摘要和占位符。
- CI workspace checks 加入固定 SHA 的 Go setup、`pnpm check:browser` 与 Browser Bridge Go tests。

新增验证包括：Go handler/capability/token/lifecycle tests、Extension contract、Locator fixture、Agent 56 项 Browser/bridge/preview tests、Desktop Browser Bridge tests、typecheck、docs 与 Action pinning。该阶段仍等待 Extension 手工重载，后续 M6 已完成并记录在本文末尾与 completed acceptance 中。

### 2026-07-11 真实 Chrome M6 开始

用户手工重载 Extension 后，沙盒外 `doctor/ping/info` 确认 Native Host、Local RPC 与 Extension 连接正常，全部 backend capability 为可用。通过 Agent Core `BridgeClient` 直接调用 canonical `command.execute`，真实验证了 tabs、navigation、wait、Locator read、DOM snapshot、CUA screenshot、debug attach/log read、user tabs/history 与 finalize cleanup。

真实 smoke 捕获了一个单测未覆盖的 URL 规范化缺陷：Chrome 把根 URL `https://example.org` 返回为 `https://example.org/`，而 `wait.url` exact match 当前按原始字符串比较，导致无尾斜杠的 expected URL 超时。使用规范化 URL 时 goto/back/forward/reload 与 URL wait 均通过；该缺陷修复和 Agent 审批/preview、I/O 手工验收完成前，M6 保持未完成。

该缺陷随后按最小语义修复：exact URL 只把空根路径与 `/` 视为等价，query、普通 path 保持精确，原有 `*` prefix match 不变；新增表驱动单测覆盖双向根路径、query 相同/不同、普通 path 和 wildcard。Go 全量测试通过，新 Native Host 已按 SHA-256 `a242c58b1a76576e4293c46143f2df38030b33d7231d98ae2eba722cb2d584f0` 原子部署，待 Extension 重载后执行真实回归。

用户重载 Extension 后，新 Native Host 成功连接。真实 Chrome 再次创建 example.com 标签页、导航到 example.org，并分别以无尾 `/` 的 `https://example.org`、back 后的 `https://example.com` 执行 `wait.url`，两项都在 1ms 内通过；临时标签页由 finalize 正常关闭，确认修复已进入真实运行路径。

### 2026-07-11 本地确定性 fixture 与 M6 加固

为避免真实验收依赖外部网站，新增离线 Browser Bridge acceptance fixture，覆盖稳定 selector、表单、文件选择、下载、console、导航、拖拽和长页面滚动，并提供可复跑的 canonical command smoke。真实 Chrome 已通过 Locator fill/select/check/read、DOM CUA click、坐标 CUA click/screenshot、debug event、file chooser、scroll、navigation 与 finalize cleanup。

拖拽验收暴露出 DOM CUA `visible_dom` 把视口外元素也返回的问题：CSS display/visibility 和非零尺寸只能证明元素参与布局，不代表其当前坐标可供 CUA 操作。runtime v2 因此只在 DOM CUA snapshot 中增加 viewport intersection 过滤，并加入原生 `[draggable=true]`；Locator `is_visible` 继续保持 Playwright-compatible 的 CSS 可见语义。JS fixture 新增 draggable 收录和 offscreen 排除回归，等待 Extension 重载后完成真实拖拽复测。

I/O smoke 随后确认 download event/token/path 链路可用，同时发现 injected download helper 新建 anchor 时丢失原元素的 `download` filename，导致 `browser-bridge-sample.txt` 被保存为 URL basename `sample.txt`。runtime v3 改为继承原始 `download` 属性，并增加 fixture 回归；失败发生在 clipboard 步骤前，因此没有修改系统剪贴板。新版 Native Host 已原子安装，等待同一次 Extension reload 后复测下载与剪贴板 roundtrip。

同时审计发现 Desktop 安装已使用临时文件 + probe + rename，但 `abb install-native-host` 的开发安装仍直接覆盖固定二进制。CLI 安装现已改为同目录唯一临时文件构建、执行 `help` 探测、chmod 后原子 rename；构建或探测失败时旧二进制保持不变，单测覆盖失败保留、成功替换、执行权限和临时文件清理。

M6 的 claim/handoff 审计还发现 Extension 与设计文档不一致：claim 只记录单个 ID、没有加入 session group，finalize 也未实现 deliverable group。Extension 现使用 claimed-tab set 保持多个显式 claim，claim 自动加入 session group，`name_session` 更新组标题，deliverable 移入 `✅ actspace` 并退出 session ownership，handoff 留在 session group，未 keep 的 session tab 才关闭；group 被用户移除时同步清理缓存 ID。primitive contract 覆盖这条完整状态转换。Extension `info.version` 也改为读取 manifest，避免 manifest `0.2.1` 与 runtime 硬编码 `0.2.0` 漂移。

首次加载 runtime v3 后，真实 Locator 调用暴露 Go `RuntimeVersion` 仍停留在 `1`：JS 注入成功，但 Go 随后的版本握手固定失败并返回 `locator runtime injection failed`。常量已同步为 `3`，并新增从 embedded JS 提取 VERSION 与 Go 常量做精确 parity 的测试，防止只升级 asset 而遗漏宿主校验。修正版 Native Host 已原子安装，需再次 reload Extension 切换正在运行的旧 host inode。

runtime v3 reload 后，完整 fixture 和 I/O smoke 已真实通过；claim/handoff 流程继续暴露 nested casing 缺陷：canonical command 使用 `keep[].tab_id`，但 Go router 直接反序列化到 backend 的 `FinalizeTabKeep{json:"tabId"}`，导致 Extension 收到 `tabId=0`。router 现先解码 snake_case canonical input，再显式转换成 camelCase backend DTO，并新增跨层 primitive forwarding 测试。该缺陷发生在 claim 和读取成功之后、finalize 之前，因此没有关闭用户标签页；修正版 Native Host 已原子安装。

分发 CLI 复核又发现 `abb user-tabs` 等既有公共命令仍发送旧 high-level wire method，在默认关闭 `ABB_LEGACY_BROWSER_FORWARDING` 后会直接失败。这与 Plan 5 的 CLI 向后兼容约束冲突。Go router 现为 tabs/user-tabs/history/open/claim/navigate/back/wait/page-info/finalize/screenshot/close/name 等公共 CLI method 提供 compatibility adapter：输入转换成 canonical category/action，由 Go engine 执行并把结果还原为旧 CLI 输出形状；未列入公共 CLI 的旧 click/fill 等 wire method 仍保持默认拒绝，只有显式 feature flag 才允许 Extension legacy forwarding。新增测试证明 user-tabs/finalize 只调用 primitive backend。

真实 handoff 后继续运行另一个 Agent smoke 时，后者的 `finalize keep=[]` 关闭了前一 session 的 handoff tab，暴露 Extension ownership 仍是全局集合。Native Host 现在为每个 `backend.*` primitive 注入连接当前的 `sessionId/turnId`（无 session 的公共 CLI 使用稳定 `cli` session）；Extension 将 owned/claimed tabs、session group 和名称按 sessionId 分桶，deliverable group 保持全局。claim 会拒绝抢占其他活动 session 的 tab，finalize 只遍历当前 session，tab/group removal 事件则清理所有相关桶。Go 测试覆盖 metadata 注入，Extension contract 覆盖 session A finalize 不影响 session B。重构期间还修复了 `tabs.map(normalizeTab)` 把数组索引误传为 session 参数的 JavaScript 回调 arity 陷阱。

最终真实 A/B smoke 证明 Session A 的 handoff 能跨 Session B cleanup 保留，B 只关闭自身 tab，最后 A/B 分别清理成功。Agent Core 真实 approval smoke 同时证明批准 mutation 生效，拒绝包含 clipboard write 的 high-risk batch 后页面和剪贴板都无部分执行，审批摘要包含 origin 且不泄露输入文本。Plan 5 M0-M6 至此完成并归档。
