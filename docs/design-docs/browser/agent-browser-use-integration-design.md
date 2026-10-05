# Browser Use 集成设计

## 当前状态

本文档定义 Browser 工具、Go Bridge 与 Chrome Extension 的当前集成边界。62 条 canonical command 由 Go registry 管理；capability ready 时注册 11 个工具，模型可见集合由 Agent mode 白名单、registry 和调用范围共同决定。连接、启动、打包与真实 Chrome 验收见 `docs/exec-plans/active/20260928-chrome-connect-experience.md`。

## 设计决策

### 选定方案：薄集成 + 长连接 Socket + Go Bridge 承担高层逻辑

```
packages/tools/browser-tools       Go command engine          Injected JS          Chrome Extension
───────────────────             ─────────────────          ───────────          ────────────────
11 个稳定注册工具（模式过滤）    62 条 canonical registry   Locator Runtime      Native Messaging
approval + preview              CUA / DOM CUA / Locator    DOM 状态与读写        chrome.debugger
BridgeClient                    waits / events / sessions  TS 构建 + go:embed    Chrome APIs / cursor
```

### 否决方案及理由

| 方案 | 否决理由 |
|------|----------|
| 纯 CLI bash 调用 | 无状态、无事件、高延迟、输出解析负担 |
| MCP 接入 | Browser 使用专用 Host capability 与现有 Tool Runtime，无需增加一层协议转换 |
| TS 完全集成（重写 browser-client.mjs） | 3000+ 行侵入 v2 Runtime，浏览器逻辑和 Agent Runtime 边界混淆 |
| Codex 进程内插件模式 | 需要 Node REPL 沙箱环境，不适用于 actspace 的 TS 架构 |

### 核心设计原则

1. **Runtime 保持薄**：只维护工具定义、executor 入口和 socket 客户端。
2. **Go bridge 承担重逻辑**：62 条 registry、CUA、DOM CUA、Locator 注入管理、CDP 会话、导航等待和事件协调。
3. **Injected JS 只提供页面语义**：它是 ActSpace 自研 Locator Runtime，不复制 Codex、不依赖 Playwright 运行时，也不承载 session/权限或 Chrome API。
4. **Chrome Extension 做原语执行**：只直接调用 `chrome.debugger` 和 Chrome APIs，维护宿主权限与光标。
5. **注册态与调用门禁分离**：工具注册由插件持有；Agent mode 白名单与调用范围过滤可用工具，没有 Browser gateway 披露状态。
6. **长连接解决 CLI 缺陷**：一次连接整个 turn，支持事件通知和状态持续。

## 架构分层

### 层 1：Runtime 集成层

```
packages/tools/browser-tools/src/
  ├── definitions.ts       ← 9 个分类工具 + help + run
  ├── plugin.ts            ← 工具注册、permission 与 executor 入口
  ├── generated-actions.ts ← 从 Go registry 生成的 action metadata
  └── node-capability.ts   ← Unix socket、Turn 生命周期、action/batch dispatch
```

职责：
- 注册浏览器工具到 tool registry，遵守现有 approval/permission 流程
- 维护与 Go bridge 的 socket 长连接
- 发送版本化 JSON 请求，按 id 接收响应
- 管理连接生命周期（第一次调用时连接，Turn 结束时关闭）
- 提供 sessionId/turnId 上下文

不做：
- CDP 细节
- Locator runtime 实现与注入细节
- Tab Group 管理
- 导航等待编排

### 层 2：Go Bridge 逻辑层

```
browser-bridge/apps/cli/
  ├── main.go              ← CLI + native-host + socket server 入口
  ├── internal/commands/   ← 62 条 registry、校验和 dispatch
  ├── internal/cua/        ← 坐标操作编排
  ├── internal/domcua/     ← DOM snapshot/node_id 编排
  ├── internal/locator/    ← go:embed runtime 与 Locator 编排
  ├── internal/backend/    ← ExtensionBackend adapter
  ├── session.go           ← CDP attach 状态 + session 管理
  ├── events.go            ← 事件路由与广播
  └── command_router.go    ← browser_run 批处理与 preflight
```

职责：
- 暴露 Unix socket server（Runtime 通过 socket 连接）
- 实现高层命令（`click`、`fill`、`navigate` 等），包含重试、等待、错误包装
- 管理 CDP attach/detach 状态
- 将 extension 推送的事件路由到正确的客户端
- 作为 Chrome Native Messaging Host 与 extension 通信
- 保持 CLI 子命令可用（向后兼容）

不做：
- 直接调用 Chrome API（那是 extension 的事）
- 工具权限判断（那是 Runtime 的事）
- 模型可见 summary 生成（那是 Runtime 的事）

### 层 3：Injected Locator runtime

职责：
- 源码位于 `browser-bridge/apps/cli/internal/locator/runtime-src/`，TypeScript 构建产物位于相邻 `generated/runtime.js`。
- 由 Go 使用 `go:embed` 打入二进制，并通过 `Runtime.evaluate` 注入页面；用户运行时不需要 Node。
- 提供结构化 css/role/text/label/placeholder/test-id Locator、accessible name、隐式 role、open Shadow DOM、单 Frame context 内的定位和 strict match。
- 提供可见、启用、可编辑、稳定、viewport、hit-test/receives-events 检查及页面内 deadline 自动等待。
- 提供文本/属性读取、fill/select/check、DOM snapshot、clipboard 等既有页面内 DOM 语义。
- 参数必须通过 JSON 编码传入，不执行模型提供的任意 JavaScript。

不做：
- Playwright 私有 selector 字符串逐字节兼容，或 browser/context/page 生命周期。
- Frame tree、跨域/OOPIF 的 frameId/sessionId 映射与 CDP execution-context 路由；该部分由 Go/Extension primitive 边界实现，不进入页面 Runtime。
- Chrome API、session、权限或 Agent 产品编排。

### 层 4：Chrome Extension primitive 执行层

```
browser-bridge/apps/chrome-extension/
  ├── src/background.js    ← Service Worker（命令处理）
  ├── src/content-cursor.js ← Content Script（光标渲染）
  └── manifest.json
```

职责：
- 接收 Go bridge 的 primitive RPC 请求
- 调用 Chrome API（`chrome.tabs`、`chrome.debugger`、`chrome.history`、`chrome.tabGroups`、`chrome.downloads`）
- 管理 Tab Group（创建、命名、颜色、deliverable 分组）
- 渲染 Agent 光标动画（content script）
- 推送 CDP 事件和下载通知给 Go bridge

不做：
- 高层 command registry、selector 编排、导航等待和重试
- Agent 产品的 Session / 审批语义；Extension 仍按 sessionId + turnId 维护 Browser ownership 与 Tab Group，拒绝跨 Session 占用冲突。

## 通信协议

### Runtime ↔ Go bridge

传输：每个 Chrome 扩展实例启动自己的 Native Host，Host 使用独立 Unix socket，并在当前用户私有目录发布带实例 ID 与版本的记录。Desktop 验证实例、socket 和只读 probe 后绑定一个目标。旧 CLI 默认 socket 只作为无新实例时的兼容入口；多个在线实例不能隐式选择。

Runtime 不额外启动 `abb serve`。Chrome Extension 负责拉起 Native Host；同一 Session Turn 的 Browser transport 复用已验证的目标 socket。测试可通过 `ABB_SOCKET` / `ABB_SUPPORT_DIR` 隔离路径。

帧格式：
```
[4 bytes: uint32 payload length, little-endian]
[N bytes: versioned JSON payload, UTF-8]
```

请求使用 `agent_browser_bridge.*` 命名空间，例如：

```json
{
  "protocolVersion": "0.2.0",
  "id": "1",
  "method": "agent_browser_bridge.command.execute",
  "params": { "category": "tabs", "action": "list", "params": {} }
}
```

transport 连接后先发送 `agent_browser_bridge.session.start`，参数为 `sessionId` 和 `turnId`。响应按 id 关联；事件由 Go 编排层消费。TS Socket 客户端的帧上限为 16 MiB。

### Go bridge ↔ Chrome Extension

传输：Chrome Native Messaging（stdio 版本化 JSON envelope）

沿用现有 `agent_browser_bridge.*` 协议命名空间。

## 工具暴露设计

### 当前目标工具清单（11 个稳定注册工具）

| 工具名 | actions 范围 |
|--------|-------------|
| `browser_cua` | screenshot/click/double_click/move/scroll/type/keypress/drag/download_media |
| `browser_dom` | snapshot/click/double_click/scroll/type/keypress/download_media |
| `browser_locator` | click/fill/press/select/read/state/wait/screenshot/element_info 等 |
| `browser_navigation` | goto/back/forward/reload |
| `browser_tabs` | create/close/list/selected/name_session/finalize |
| `browser_user` | open_tabs/claim_tab/history |
| `browser_wait` | load_state/url/timeout/file_chooser/download |
| `browser_io` | files/download_path/clipboard read/write |
| `browser_debug` | logs |
| `browser_help` | list/search/describe action schema、risk、backend、status |
| `browser_run` | 结构化 actions 批处理，逐 action 校验并整批 preflight |

`browser_run` 的模型结果必须包含每个已执行 action 的真实返回值，而不只列 action 名称。DOM snapshot、Locator 分页列表、tabs 列表与短状态结果分别复用单 action 的格式化和输出上限；截图只返回完成摘要，不在批处理文本中展开 base64。

62 条叶子能力以 `category + action` 进入 Go registry，不平铺成 62 个模型工具。

### 可见集合与注册生命周期

`plugin.ts` 在 Browser capability ready 时注册全部 11 工具，scope dispose 时注销工具；只有 `disposeHost !== false` 时同时释放 Host capability，Desktop 默认 Harness 传入 false，由 Host 管理共享 capability。`packages/core/agent/src/agent-mode-policy.ts` 将 Browser 工具列入 Agent 模式白名单，Chat / Plan 不包含它们。`browser_help` 用于查询命令，不改变下一次请求的工具集合。

## 连接生命周期

### Turn 级连接管理

```
Turn 开始
  │
  ├─ 模型第一次调用浏览器工具
  │    └─ Socket transport connect() → 建立 socket 连接
  │       └─ 发送 agent_browser_bridge.session.start { sessionId, turnId }
  │
  ├─ 后续浏览器工具调用
  │    └─ 复用同一连接
  │
  └─ Turn 结束
       └─ Browser transport dispose()
            └─ 关闭 socket，Host 按连接清理 ownership
```

### 惰性连接

不是 turn 一开始就连接，而是第一次调用浏览器工具时才建立连接。如果整个 turn 不涉及浏览器，不产生任何连接开销。

### 断线重连

如果执行中的 socket 断开，当前 Turn 的调用返回结果未知或连接丢失，不自动重放写操作。Desktop 后台继续发现原绑定实例，并在 Runtime 安全空闲后重组；新 Turn 才使用重新验证的连接。

### 安装升级与状态探测

Chrome Native Messaging host 可能长期运行在已注册的 `abb` 路径上，因此重新编译安装不能直接覆盖该文件内容。

安装流程必须遵守：

1. 将新二进制复制到安装目录下的唯一临时路径。
2. 在临时路径执行 `abb help`，验证退出码和 CLI 标识。
3. 验证成功后通过 `rename` 原子替换正式路径，让旧 host 继续持有旧 inode，新进程读取新 inode。
4. 验证失败时删除临时文件并保留上一版可用二进制。

扩展身份必须遵守：

- unpacked extension manifest 必须包含固定公开 `key`，确保不同本机路径加载时扩展 ID 不变。
- Go CLI 的默认 extension ID 必须与 manifest key 计算结果一致，并通过测试机械校验。
- Native Messaging manifest 的 `allowed_origins` 必须包含该固定 ID；`doctor` 发现漂移时直接报告 origin mismatch。
- 从旧仓库路径迁移到主仓库路径时需要重新加载扩展并重新注册 host，但不应再产生新的随机 ID。

状态探测必须遵守：

- 同一仓库路径同一时刻最多运行一组 `doctor` / `capabilities`，并发请求复用同一个 Promise。
- renderer 必须等上一轮探测结束后再安排下一轮，不能用固定间隔制造重叠子进程。
- 探测失败后短暂退避；超时错误需要保留 PID、信号或 stderr，不能统一伪装成“二进制无效”。
- 安装或重新注册 native host 成功后，立即失效错误缓存。

## 事件处理

### 事件使用场景

| 事件 | 用途 |
|------|------|
| Page.loadEventFired | click/navigate 后等待加载完成 |
| Page.navigationBlocked | 检测安全策略拦截 |
| Runtime.consoleAPICalled | 收集页面日志 |
| Runtime.exceptionThrown | 检测页面错误 |
| onDownloadChange | 追踪下载进度 |

### 事件消费模式

事件主要在 **Go bridge 内部** 被消费（用于编排等待逻辑），不需要全部转发给 Runtime。

当前 TS Socket 客户端按请求 id 接收响应，忽略无 id 帧；下载结果和失败由 action 返回值交给 Runtime，不承诺额外推送通路。

## 用户可见性设计

### 光标可视化

Chrome Extension 的 content script 在被控制的页面上渲染虚拟光标：

- 每次 click/move 操作前，Go bridge 发 `moveMouse` 给 extension
- Extension 注入 versioned `cursor-overlay.js`，并通过 `Runtime.evaluate(awaitPromise=true)` 等待 `moveTo()` 完成
- 首次出现从 viewport 中心开始，后续操作沿用当前页面内的上次位置
- overlay 使用紧凑短尾的黑色实心箭头、半透明细白描边和柔和蓝色光晕，箭头尖端就是真实 CDP 坐标；轨迹使用距离相关时长与轻微二次贝塞尔弯曲
- 可视光标到达目标后，Go 才继续发送 `mouseMoved` / `mousePressed` / `mouseReleased`
- click 在箭头尖端显示短促反馈环；drag 的可视光标与 CDP path 点同步推进

显示规则：
- 第一次 CUA 操作时淡入，页面内后续操作保持连续位置
- 页面刷新或旧 runtime 存在时，Extension 通过 runtime version 检查重新注入
- `prefers-reduced-motion` 开启时取消轨迹动画，但仍保持坐标与点击顺序正确

### Tab Group 管理

```
Chrome 标签栏：
┌─────────────────────────────────────────────────────┐
│ [用户的 tab] [用户的 tab]                            │
│                                                     │
│ ┌─ Research - actspace (绿色) ──────────┐           │
│ │ [example.com] [docs.example.com]       │           │
│ └────────────────────────────────────────┘           │
│                                                     │
│ ┌─ ✅ actspace (蓝色) ─────────────┐                │
│ │ [Final Report]                     │                │
│ └────────────────────────────────────┘                │
└─────────────────────────────────────────────────────┘
```

规则：
- session tab group 使用固定蓝色
- 未显式命名时 group 标题为 `ActSpace`；`name_session` 可设置更具体的会话标题
- Agent 创建/claim 的 tab 自动加入 group
- `finalize_tabs` 时：
  - `deliverable` tab → 移入 "✅ actspace" 固定分组
  - `handoff` tab → 留在 session 分组
  - 其余 → 关闭
- 连接结束释放 ownership，不自动关闭或 ungroup 用户页面；页面清理由显式 finalize 负责。

### 工具预览与结果

预览遵循 [工具预览规范](../tool-system/agent-tool-preview-design-guidelines.md)，优先展示动作、目标与状态。`node-capability.ts` 将实际结果转为 `modelOutput`，文本脱敏并限制总长度 100K；DOM snapshot 单项限制 50K，命令帮助限制 20K。截图创建 Session-owned image artifact，返回 artifact 引用，不在文本中展开 base64。

这些结果会随 `packages/core/agent-loop/src/loop.ts` 的普通 `tool/result` 事件进入 Session Journal。预览简短不等于正文未持久化；当前没有 Browser 专属的 ephemeral-result 通路。

## 安全约束

### 权限分层

Browser 工具在 Tool Runtime 的 permission 阶段按 Go canonical registry 的 action 元数据判断风险：

- `browser_help` 只读取命令说明，不触发浏览器授权。
- 已知只读 action 按当前模式允许；修改页面或浏览器状态的 action 在 default 模式下交给现有 ApprovalBroker 决策，full-access 遵守该模式语义。
- 未知 action 拒绝；batch 按所有 action 的最高风险判断。Go preflight token 只绑定批次参数和 Turn，不代表用户批准。
- 设置页的“开始连接”只授权本机组件准备，不给 Session 中的写操作通用授权。

Go registry 的 `low / medium / high` risk 同时用于能力说明、批处理 preflight 与 Tool Runtime 权限判断。

Go backend capability 仍可在命令执行前拒绝不可用动作；用户审批不能绕过该能力检查。

审批卡片只提供“拒绝 / 允许”两个动作。状态必须依次展示为“等待浏览器授权 → 执行中 → 完成/失败”，不得在工具开始时提前显示 `Completed`。

### 配置与持久化边界

设置页保留 Browser 总开关、工具项和高风险 capability 偏好。当前 `browser-tools/src/plugin.ts` 的 permission evaluator 读取 action metadata 和权限模式，不读取 `browser_capability_*` 偏好；不能把这些 UI 开关描述为已接通的逐 action hard deny。工具是否进入本次请求，以实际 registry 和 Agent 调用门禁为准。

当前没有独立远程站点策略。浏览器输出经过通用脱敏后仍可能包含页面私有内容，且会持久化；文档不能承诺“历史仅含占位符”或“恢复时必须重新读取”。截图 artifact 的保留和读取遵循 Session artifact 契约。

## 与现有文档的关系

- `docs/design-docs/browser/agent-browser-bridge-design.md`：定义浏览器桥接层本身的三层架构、协议和 CLI 设计。本文档是其消费侧补充。
- `docs/design-docs/browser/agent-browser-use-command-surface.md`：完整命令面参考。本文档引用其中命令作为实现目标。
- `docs/design-docs/browser/agent-browser-use-command-implementation.md`：CDP 原语、实现职责和源码入口。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：工具前端预览契约。浏览器工具的预览需遵守。
- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`：权限分层基础。浏览器工具的 approval 需遵守。

## 维护规则

- 新增叶子命令时先更新 Go canonical registry，再通过生成检查同步工具 action 和文档状态。
- 如果架构边界发生变化，先更新 `docs/design-docs/browser/agent-browser-use-index.md`，再同步本文档。
