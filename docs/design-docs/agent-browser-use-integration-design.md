# Browser Use 集成设计

## 当前状态

本文档定义 actspace-agent 接入 Browser Use 能力的集成方案。Plan 5 已完整收敛：62 条 canonical command 全部由 Go handler 实现，Agent 默认暴露 11 个分类/辅助工具，Extension 只保留 session-scoped primitive backend，真实 Chrome profile 与 approval/isolation 验收均已完成。统一入口见 `agent-browser-use-index.md`。

## 设计决策

### 选定方案：薄集成 + 长连接 Socket + Go Bridge 承担高层逻辑

```
packages/agent-core             Go command engine          Injected JS          Chrome Extension
───────────────────             ─────────────────          ───────────          ────────────────
11 个稳定工具                    62 条 canonical registry   Locator subset       Native Messaging
approval + preview              CUA / DOM CUA / Locator    DOM 状态与读写        chrome.debugger
BridgeClient                    waits / events / sessions  固定静态 asset        Chrome APIs / cursor
```

### 否决方案及理由

| 方案 | 否决理由 |
|------|----------|
| 纯 CLI bash 调用 | 无状态、无事件、高延迟、输出解析负担 |
| MCP 接入 | actspace 当前无 MCP 客户端层，只为浏览器加 MCP ROI 不足 |
| TS 完全集成（重写 browser-client.mjs） | 3000+ 行侵入 agent-core，浏览器逻辑和 Agent Runtime 边界混淆 |
| Codex 进程内插件模式 | 需要 Node REPL 沙箱环境，不适用于 actspace 的 TS 架构 |

### 核心设计原则

1. **agent-core 保持薄**：只维护工具定义、executor 入口和 socket 客户端。
2. **Go bridge 承担重逻辑**：62 条 registry、CUA、DOM CUA、Locator 注入管理、CDP 会话、导航等待和事件协调。
3. **Injected JS 只提供 DOM 语义**：它是轻量 Locator subset，不是完整 Playwright client。
4. **Chrome Extension 做原语执行**：只直接调用 `chrome.debugger` 和 Chrome APIs，维护宿主权限与光标。
5. **工具即能力边界**：不提供给模型的工具 = Agent 无法使用的能力。通过 tool registry 控制暴露面。
6. **长连接解决 CLI 缺陷**：一次连接整个 turn，支持事件通知和状态持续。

## 架构分层

### 层 1：agent-core 集成层

```
packages/agent-core/src/tools/tools/browser/
  ├── definition.ts        ← 9 个分类工具 + help + run
  ├── executor.ts          ← 通用分类/help/run executor
  ├── generated-actions.ts ← 从 Go registry 生成的 action metadata
  ├── permissions.ts       ← action/batch preflight
  ├── preview.ts           ← compact preview
  └── bridge-client.ts     ← Unix socket 长连接客户端
```

职责：
- 注册浏览器工具到 tool registry，遵守现有 approval/permission 流程
- 维护与 Go bridge 的 socket 长连接
- 发送 JSON-RPC 请求，接收响应和事件通知
- 管理连接生命周期（turn 开始时连接，turn 结束时可选断开）
- 提供 sessionId/turnId 上下文

不做：
- CDP 细节
- Locator runtime 实现与注入细节
- Tab Group 管理
- 导航等待编排

### 层 2：Go Bridge 逻辑层

```
plugins/browser-bridge/apps/cli/
  ├── main.go              ← CLI + native-host + socket server 入口
  ├── internal/commands/   ← 62 条 registry、校验和 dispatch
  ├── internal/cua/        ← 坐标操作编排
  ├── internal/domcua/     ← DOM snapshot/node_id 编排
  ├── internal/locator/    ← go:embed runtime 与 Locator 编排
  ├── internal/backend/    ← ExtensionBackend adapter
  ├── session.go           ← CDP attach 状态 + session 管理
  ├── events.go            ← 事件路由与广播
  └── internal/actionplan/ ← browser_run 批处理与 preflight
```

职责：
- 暴露 Unix socket server（`agent-core` 通过 socket 连接）
- 实现高层命令（`click`、`fill`、`navigate` 等），包含重试、等待、错误包装
- 管理 CDP attach/detach 状态
- 将 extension 推送的事件路由到正确的客户端
- 作为 Chrome Native Messaging Host 与 extension 通信
- 保持 CLI 子命令可用（向后兼容）

不做：
- 直接调用 Chrome API（那是 extension 的事）
- 工具权限判断（那是 agent-core 的事）
- 模型可见 summary 生成（那是 agent-core 的事）

### 层 3：Injected Locator runtime

职责：
- 由 Go 使用 `go:embed` 打入二进制，并通过 `Runtime.evaluate` 注入页面。
- 提供 CSS selector subset、strict match、可见/启用/可编辑状态、文本/属性读取、fill/select/check 等页面内 DOM 语义。
- 参数必须通过 JSON 编码传入，不执行模型提供的任意 JavaScript。

不做：
- 完整 Playwright selector grammar、browser/context/page 生命周期、frame/Shadow DOM 或完整 actionability。
- Chrome API、session、权限或 Agent 产品编排。

### 层 4：Chrome Extension primitive 执行层

```
plugins/browser-bridge/apps/chrome-extension/
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
- 上下文/session 业务语义（只透传 session_id）

## 通信协议

### agent-core ↔ Go bridge

传输：Native Host 暴露的稳定 Unix socket（macOS 默认 `~/Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock`）。

`agent-core` 不额外启动 `abb serve`。Chrome Extension 负责拉起 Native Host，Agent turn 内的 `BridgeClient` 直接复用该稳定 socket；测试可通过 `ABB_SOCKET` / `ABB_SUPPORT_DIR` 隔离路径。

帧格式：
```
[4 bytes: uint32 payload length, native endian]
[N bytes: JSON-RPC 2.0 payload, UTF-8]
```

请求示例：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "browser.click",
  "params": {
    "session_id": "sess_abc",
    "turn_id": "turn_123",
    "tab_id": 42,
    "selector": "button[type=submit]"
  }
}
```

响应示例：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {}
}
```

事件通知（无 id，后端主动推送）：
```json
{
  "jsonrpc": "2.0",
  "method": "browser.event.cdp",
  "params": {
    "tab_id": 42,
    "cdp_method": "Page.loadEventFired",
    "cdp_params": { "timestamp": 1720000000.123 }
  }
}
```

### Go bridge ↔ Chrome Extension

传输：Chrome Native Messaging（stdio JSON-RPC）

沿用现有 `agent_browser_bridge.*` 协议命名空间。

## 工具暴露设计

### 当前目标工具清单（11 个模型工具）

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

### 首版兼容工具（15 个，迁移期）

根据 actspace-agent 的实际使用场景，首阶段暴露以下工具：

| 工具名 | 对应底层命令 | 权限等级 |
|--------|-------------|----------|
| `browser_screenshot` | cua_get_visible_screenshot | low |
| `browser_dom_snapshot` | playwright_dom_snapshot | low |
| `browser_click` | playwright_locator_click / cua_click | medium |
| `browser_fill` | playwright_locator_fill | medium |
| `browser_select` | playwright_locator_select_option | medium |
| `browser_press_key` | playwright_locator_press / cua_keypress | medium |
| `browser_scroll` | cua_scroll / dom_cua_scroll | low |
| `browser_navigate` | navigate_tab_url | medium |
| `browser_back` | navigate_tab_back | low |
| `browser_open_tab` | create_tab + navigate | medium |
| `browser_close_tab` | close_tab | medium |
| `browser_list_tabs` | list_tabs | low |
| `browser_user_tabs` | browser_user_open_tabs | low |
| `browser_claim_tab` | browser_user_claim_tab | medium |
| `browser_finalize` | finalize_tabs | medium |

这 15 个工具不再进入新模型默认 definitions，只保留一个迁移阶段的内部 alias 和旧 session preview 兼容。

### 渐进扩展

后续根据需要逐步添加：

- Phase 2：dom_cua 命令（get_visible_dom + dom_click 等）
- Phase 3：下载/文件上传命令
- Phase 4：剪贴板命令
- Phase 5：dev_logs 调试命令
- Phase 6：完整 CUA 坐标命令面（drag、move 等）

### 历史工具定义示例

```typescript
export const browserClickDefinition: ToolDefinition = {
  name: 'browser_click',
  description: '点击页面元素。支持 CSS 选择器或坐标。',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number', description: '目标标签页 ID' },
      selector: { type: 'string', description: 'CSS 选择器（优先使用）' },
      x: { type: 'number', description: '点击 x 坐标（无选择器时使用）' },
      y: { type: 'number', description: '点击 y 坐标（无选择器时使用）' },
    },
    required: ['tab_id'],
  },
  approvalLevel: 'medium',
};
```

## 连接生命周期

### Turn 级连接管理

```
Turn 开始
  │
  ├─ 模型第一次调用浏览器工具
  │    └─ BridgeClient.connect() → 建立 socket 连接
  │       └─ 发送 browser.session.start { session_id, turn_id }
  │
  ├─ 后续浏览器工具调用
  │    └─ 复用同一连接
  │
  └─ Turn 结束
       └─ BridgeClient.dispose()
            └─ 发送 browser.session.end { session_id, turn_id }
            └─ 关闭 socket
```

### 惰性连接

不是 turn 一开始就连接，而是第一次调用浏览器工具时才建立连接。如果整个 turn 不涉及浏览器，不产生任何连接开销。

### 断线重连

如果 socket 断开（Go bridge 重启等），下次工具调用时自动重连。CDP attach 状态需要重新建立。

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

事件主要在 **Go bridge 内部** 被消费（用于编排等待逻辑），不需要全部转发给 agent-core。

只有以下场景需要通知 agent-core：
- 下载完成（agent-core 需要返回文件路径给模型）
- 严重错误（页面崩溃等需要告知模型）

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
- 每个 session 创建一个 tab group，颜色随机
- 未显式命名时 group 标题为 `ActSpace`；`name_session` 可设置更具体的会话标题
- Agent 创建/claim 的 tab 自动加入 group
- `finalize_tabs` 时：
  - `deliverable` tab → 移入 "✅ actspace" 固定分组
  - `handoff` tab → 留在 session 分组
  - 其余 → 关闭
- session 结束后，空的 session group 自动清理

### 工具预览

遵守 `agent-tool-preview-design-guidelines.md`：
- Browser preview 只展示 category/action、目标 URL/selector/坐标、文件名或 tab 数量等最小动作摘要。
- 截图的原生 image content、DOM、console、clipboard 和页面读取结果只进入当前 LLM 调用，不进入持久化 preview 正文。
- session 与运行日志中的 Browser 结果统一替换为脱敏占位符；输入文本、fill value、rich clipboard 和内部 approval token 先清洗再记录。
- finalize 在预览中只显示保留/关闭数量与安全的 tab 标识，不展开页面正文。

## 安全约束

### 权限分层

Browser 工具不再按 62 条 action 逐次弹窗，而是使用 Agent Core 内存中的 Session 授权租约：

- `browser_help` 只读取命令说明，不触发浏览器授权。
- 其余 10 个 Browser 工具第一次调用时统一请求一次“允许 ActSpace 在当前会话中使用浏览器？”。
- 用户允许后，以 `sessionId` 为键记录内存授权；当前应用运行期间该 Session 的后续 Turn 和 Browser action 自动放行。
- 用户拒绝或审批超时后，以 `sessionId + turnId` 为键拒绝当前 Turn；本轮后续 Browser 调用直接失败且不重复弹窗，下一次用户输入可以重新申请。
- 授权不写入 `session.jsonl`，应用重启后自动失效，也不会跨 Session 共享。

Go registry 的 `low / medium / high` risk 继续用于能力说明、批处理 preflight 和诊断，不再直接决定 UI 弹窗次数。

高风险 capability 仍由 Settings hard deny 控制：文件上传、下载、剪贴板写入等能力被禁用时，即使 Session 已授权也不能执行；启用后则纳入同一次 Session 授权，不逐 action 打断 Agent。

审批卡片只提供“拒绝 / 允许”两个动作。状态必须依次展示为“等待浏览器授权 → 执行中 → 完成/失败”，不得在工具开始时提前显示 `Completed`。

### 站点策略

首阶段不实现远程 site policy（Codex 的 chatgpt.com API 不适用）。但预留本地 blocklist：

```typescript
const BLOCKED_ORIGINS = [
  // 银行、支付等高风险站点
];
```

### 工具暴露控制

用户可在设置页控制哪些浏览器工具暴露给模型：

```
设置 → 工具 → 浏览器
  ☑ browser_cua / browser_dom / browser_locator
  ☑ browser_navigation / browser_tabs / browser_user
  ☑ browser_wait / browser_io / browser_debug / help / run

高风险 capability（不注册为额外模型工具）：
  ☐ 触发下载
  ☐ 文件上传
  ☐ 写剪贴板
```

`browser_capability_download`、`browser_capability_file_upload`、`browser_capability_clipboard_write` 进入现有 disabled-tools 配置；permission checker 按 registry `effect` 做 hard deny。分类工具仍可见，未被禁用的低风险 action 不受影响；batch 命中禁用 capability 时整批拒绝且不发送 `command.run`。

未勾选的工具不会出现在模型的 tool definitions 中。

### 临时结果与持久化边界

浏览器页面属于用户真实 profile，读取结果可能包含密码、cookie 派生内容、剪贴板、调试日志或未预期的私有页面文本。因此 Browser 工具采用 ephemeral-result 契约：

- executor 返回真实结果给当前 Agent loop，保证模型可以继续完成任务；
- `tool_result` session event、stream preview、assistant tool-call 日志和 state-level run log 只记录脱敏参数、状态与占位符；
- screenshot base64、structured result、raw output ref 和 Browser error details 都不能绕过该边界；
- 恢复历史会话时模型看到占位符，需要时重新调用 Browser read action 获取最新页面状态。

这个边界优先保护真实浏览器数据，不依赖每条叶子命令逐一判断“是否可能敏感”。

## 实现路线

当前执行事实以 `docs/exec-plans/completed/20260710-browser-use/plan-5-go-command-engine-convergence.md` 为准。以下 Phase 1-5 是首版实施记录；原先未完成项已在 Plan 5 的 Go command engine 中收敛，不再作为当前状态表。

### Phase 1：基础连接（已完成）

- [x] BridgeClient socket 连接和 JSON-RPC 实现
- [x] Native Host socket 支持单连接多请求
- [x] 5 个基础工具：screenshot、dom_snapshot、navigate、open_tab、list_tabs
- [x] 工具定义和 executor 注册
- [x] turn 结束时发送 session.end 并释放 socket
- [x] 正常浏览器任务使用标准 `browser_*` 工具，CLI 仅用于诊断与安装

### Phase 2：交互能力（已完成首版）

- [x] click（selector + 坐标两种模式）
- [x] fill、press_key、select
- [x] scroll
- [x] 导航等待（Plan 5 Go bridge 实现）

### Phase 3：Tab 生命周期（已完成首版）

- [x] Tab Group 管理（extension 实现）
- [x] claim_tab、finalize_tabs
- [x] 光标可视化（content script）

### Phase 4：高级能力

- [x] DOM CUA 命令（Plan 5）
- [x] 下载/文件上传（Plan 5 token/event 编排）
- [x] 剪贴板（Plan 5 text + rich representation）
- [x] dev_logs（Plan 5 bounded ring buffer）

### Phase 5：完整 CUA

- [x] 坐标级全套命令（drag、move 等，Plan 5）
- [x] element_info、element_screenshot（Plan 5）

## 与现有文档的关系

- `agent-browser-bridge-design.md`：定义浏览器桥接层本身的三层架构、协议和 CLI 设计。本文档是其消费侧补充。
- `agent-browser-use-command-surface.md`：完整命令面参考。本文档引用其中命令作为实现目标。
- `agent-browser-use-command-implementation.md`：每条命令的 CDP 调用链和实现编排。本文档定义集成架构，实现文档定义具体怎么写代码。
- `agent-tool-preview-design-guidelines.md`：工具前端预览契约。浏览器工具的预览需遵守。
- `agent-权限设计规则和原则.md`：权限分层基础。浏览器工具的 approval 需遵守。

## 维护规则

- 新增叶子命令时先更新 Go canonical registry，再通过生成检查同步工具 action 和文档状态。
- Phase 推进时更新 checklist 状态。
- 如果架构边界发生变化，先更新 `agent-browser-use-index.md`，再同步本文档。
