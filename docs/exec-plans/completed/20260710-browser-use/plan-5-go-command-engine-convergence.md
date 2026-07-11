# Plan 5: Browser Use Go Command Engine 与完整命令面收敛

状态：7 个设计闸门已确认，M0-M6 全部完成

依赖：Plan 0-pre 至 Plan 4 的首版实现已经落地

产物消费方：后续 Browser Use 62 条命令实现、Agent 工具面、CLI 自描述能力、真实 Chrome 验收

## 目标

把当前 Browser Use 首版从“15 个 Agent 工具 + Extension 内高层交互逻辑 + 多份手写命令清单”收敛为一个长期可维护的完整架构：

1. `packages/agent-core` 只保留分类工具、审批、预览、Socket client 和 turn 生命周期，不实现浏览器操作细节。
2. Go Browser Bridge 成为 62 条 Browser Use 命令的 canonical registry、参数验证、session、等待、重试、事件协调和高层编排中心。
3. 页面 DOM/Locator 能力由一份小型 injected JavaScript runtime 提供；Go 通过 CDP `Runtime.evaluate` 管理其注入与调用，不引入完整 Playwright 依赖，也不新增大型 TypeScript browser client。
4. Chrome Extension 只负责 Chrome 权限域内的执行原语：Native Messaging、`chrome.debugger`、Tabs/History/TabGroups/Downloads、CDP event forwarding 和 cursor content script。
5. Agent 默认看到 9 个分类工具加 `browser_help`、`browser_run`，不平铺 62 个模型工具；CLI 以分类命令和机器可读 schema 暴露完整 62 条叶子能力。
6. CLI help、Agent action 列表、协议能力和设计文档状态从同一份 registry 派生，避免继续漂移。

## 执行前设计闸门

本 plan 只有在以下 7 项全部得到用户确认后才能进入实现。括号中是当前推荐默认值。

- [x] **Agent 工具面**：采用 9 个分类工具 + `browser_help` + `browser_run`，不向模型平铺 62 个工具。
- [x] **命名边界**：模型可见层使用 `browser_locator`，避免承诺完整 Playwright；底层 canonical command ID 保留 `playwright_*` 以对齐既有文档和参考命令面。
- [x] **逻辑归属**：Go 负责 CUA、DOM CUA、Locator、导航等待和事件编排；Extension 只执行 Chrome/CDP 原语；injected JS 只负责页面内 DOM 语义。
- [x] **完整命令范围**：核心目标继续使用现有 62 条命令；Codex 参考中的 `tab_content_export*` 作为未来 capability extension，不计入本轮核心 62 条。
- [x] **Raw escape hatch**：保留 `abb cdp` / CLI raw call 供诊断，但不默认暴露为 Agent 工具；需要时按高风险能力单独启用。
- [x] **批处理审批**：`browser_run` 必须先展开全部 actions，生成聚合风险摘要并完成一次 preflight；包含文件上传、剪贴板写入等 high-risk action 时不得静默批量执行。整批展示、一次明确批准；拒绝后整批不执行。
- [x] **兼容策略**：现有 15 个 `browser_*` 工具停止作为新模型默认工具面，但保留内部 alias 映射和旧 session preview 兼容一个迁移阶段。

## 范围

### 包含

- 新增 `agent-browser-use-index.md`，为 Browser Use 四份设计文档提供专题入口和状态说明。
- 同步 `agent-browser-bridge-design.md`、`agent-browser-use-integration-design.md`、`agent-browser-use-command-surface.md`、`agent-browser-use-command-implementation.md`，消除 CLI-first、Socket Tool-first、Go/Extension 职责和“完整实现”口径冲突。
- 建立 Go canonical command registry，覆盖现有 62 条核心命令。
- 建立高层命令执行协议和 Extension primitive protocol 边界。
- 在 Go 中实现 CUA、DOM CUA、Locator、导航、Tab、等待、文件/剪贴板和调试命令编排。
- 将页面内 selector/locator runtime 作为小型 JavaScript asset 由 Go `go:embed` 管理和注入。
- 将 `packages/agent-core` 的 15 个 command-specific executor 收敛为分类工具 + 通用 executor。
- 增加 `browser_help` 和结构化 `browser_run`。
- 保持 CLI 自描述能力，并让分类 CLI、schema、Agent action 列表和文档状态共享 registry。
- 补齐权限、preview、错误、输出裁剪、测试、真实 Chrome 验收、history 和 learning 文档。

### 不包含

- 不引入完整 `playwright` / `playwright-core` npm 依赖。
- 不新增 Node REPL、MCP client 或 Codex 风格进程内 JavaScript runtime。
- 不把 browser-client rewrite 复制到 `packages/agent-core`。
- 不让 renderer、Electron IPC handler 或 Agent prompt 承担浏览器命令逻辑。
- 不在本轮实现独立无插件 CDP backend；本轮仍以用户真实 Chrome + Extension backend 为验收主线，但协议必须保留未来 backend adapter 边界。
- 不实现跨浏览器统一产品抽象；Chrome route 先完成。
- 不把 raw CDP、任意 JS evaluate 或 unrestricted call 默认暴露给模型。
- 不以“代码存在”代替真实 Chrome profile 验收。

## 背景

### 当前事实

- 完整设计目标为 62 条 Browser Use 原子命令。
- 当前 Agent 默认暴露 15 个 `browser_*` 高层工具。
- 当前 `abb` 有 20 个公共 CLI 一级命令，其中包含安装、诊断和低层 escape hatch。
- 当前 protocol 已声明 34 个 method，Extension 路由 25 个 method，但不是完整 62 条命令面。
- 当前大量 click/fill/select/scroll/navigation 逻辑位于 Extension `background.js`，Go 主要承担 Socket/Native Messaging 中继，与“Go 承担重逻辑”的长期设计不一致。
- 当前 `playwright-injected.js` 是轻量 CSS Locator runtime，不是完整 Playwright。
- Codex 参考实现把完整高层逻辑放在 Node browser client，把 Extension 限制为 `executeCdp` 和 Chrome API backend；Open Browser Use 的 Go Host 当前主要是 relay，但 Go SDK 已证明导航、等待、DOM 读取和 Locator 薄封装可以在 Go 中实现。

### 相关设计文档

- `docs/design-docs/agent-browser-bridge-design.md`
- `docs/design-docs/agent-browser-use-integration-design.md`
- `docs/design-docs/agent-browser-use-command-surface.md`
- `docs/design-docs/agent-browser-use-command-implementation.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/agent-权限设计规则和原则.md`
- `docs/design-docs/agent-testing.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`

### 外部本地参考

这些路径只用于读取和对照，不允许在本 plan 中修改：

- `/Users/wakeup-jin/Desktop/code-project/back-code/open-browser-use/packages/browser-client-rewrite/browser-client.mjs`
- `/Users/wakeup-jin/Desktop/code-project/back-code/open-browser-use/docs/wiki/browser-client/`
- `/Users/wakeup-jin/Desktop/code-project/back-code/open-browser-use/apps/chrome-extension/background.js`
- `/Users/wakeup-jin/Desktop/code-project/back-code/open-browser-use/internal/host/relay.go`
- `/Users/wakeup-jin/Desktop/code-project/back-code/open-browser-use/packages/open-browser-use-go/browser.go`

## 目标架构

```text
Model
  -> 9 category tools + browser_help + browser_run
  -> packages/agent-core generic browser adapter
       - tool definitions
       - approval/preflight
       - preview/result rendering
       - BridgeClient
       - turn lifecycle
  -> Unix socket
  -> Go Browser Command Engine
       - canonical registry
       - command validation
       - category/action mapping
       - session/tab state
       - CUA orchestration
       - DOM CUA orchestration
       - Locator orchestration
       - waits/retries/events
       - structured action plan
       - CLI help/schema
       - backend adapter interface
  -> Extension primitive RPC
       - attach/detach
       - executeCdp
       - tabs/history/tabGroups/downloads
       - event forwarding
       - cursor/content script
  -> chrome.debugger / Chrome APIs
  -> user Chrome profile
```

## Agent 工具面

### 默认模型可见工具

| 工具 | 主要 actions |
| --- | --- |
| `browser_cua` | screenshot, click, double_click, move, scroll, type, keypress, drag, download_media |
| `browser_dom` | snapshot, click, double_click, scroll, type, keypress, download_media |
| `browser_locator` | click, double_click, fill, press, select_option, set_checked, inner_text, text_content, all_text_contents, read_all, get_attribute, is_visible, is_enabled, count, wait_for, screenshot, element_info, element_screenshot |
| `browser_navigation` | goto, back, forward, reload |
| `browser_tabs` | create, close, list, selected, name_session, finalize |
| `browser_user` | open_tabs, claim_tab, history |
| `browser_wait` | load_state, url, timeout, file_chooser, download |
| `browser_io` | set_file_chooser_files, download_path, clipboard_read_text, clipboard_write_text, clipboard_read, clipboard_write |
| `browser_debug` | logs |
| `browser_help` | list categories, search actions, describe one action and return schema/examples/risk/backend/status |
| `browser_run` | execute a structured action array through the same registry and permission rules |

### 通用调用结构

分类工具统一采用：

```json
{
  "action": "click",
  "tab_id": 42,
  "selector": "button[type=submit]",
  "timeout_ms": 10000
}
```

不使用无约束的嵌套 `params: {}` 作为默认模型接口；每个分类工具应提供 action-discriminated schema。如果当前 provider schema 转换链不能稳定支持 `oneOf` / discriminator，则生成 action enum + 公共字段 schema，并由 Go registry 做最终严格验证；`browser_help` 返回单 action 的精确 schema。

### `browser_run` 输入

```json
{
  "actions": [
    {
      "category": "tabs",
      "action": "create",
      "params": { "url": "https://example.com" }
    },
    {
      "category": "wait",
      "action": "load_state",
      "params": { "state": "load" }
    },
    {
      "category": "locator",
      "action": "click",
      "params": { "selector": "button[type=submit]" }
    }
  ],
  "stop_on_error": true
}
```

约束：

- 每个 action 必须单独经过 registry 参数验证。
- 执行前必须完成整批 preflight，生成将访问的 origins、读写性质、外部影响和最高风险等级。
- 批处理中任何 action 需要 hard deny 时整批拒绝。
- 用户拒绝审批时整批不执行，不允许执行前半段后再请求批准。
- 执行结果按 action 返回索引、command ID、状态、耗时和裁剪后的摘要。
- `stop_on_error=false` 只允许用于互不依赖的低风险读取操作；包含 mutation 时强制按顺序且首错停止。

## Canonical Command Registry

### 单条记录必须包含

```text
id
category
action
title
description
input schema
output schema
backend requirements
required capabilities
risk level
read-only/effect metadata
origin policy
preview kind
implementation status
handler key
legacy aliases
CLI examples
```

### 建议代码位置

```text
plugins/browser-bridge/apps/cli/internal/commands/
  registry.go
  metadata.go
  dispatcher.go
  validation.go
  aliases.go
  registry_test.go
```

约束：

- registry 中核心 command ID 必须正好覆盖 `agent-browser-use-command-surface.md` 的 62 条命令。
- command ID 唯一；`category + action` 唯一；legacy alias 不得与正式 ID 冲突。
- 每条命令必须有 handler 或明确的 `not_implemented` 状态；不能出现协议有定义但 registry 不知道的隐形能力。
- `abb commands --json`、`abb help <category> <action> --json`、`browser_help` 和文档状态表读取同一 registry metadata。
- CI 机械检查 registry 数量、分类数量、handler coverage、preview coverage 和 permission metadata coverage。

## Go Command Engine

### 建议目录

```text
plugins/browser-bridge/apps/cli/internal/
  commands/
  backend/
    backend.go
    extension.go
  cdp/
    client.go
    events.go
    navigation.go
  cua/
    mouse.go
    keyboard.go
    scroll.go
    drag.go
    screenshot.go
  domcua/
    snapshot.go
    actions.go
  locator/
    runtime.js
    runtime.go
    selector.go
    state.go
    actions.go
    wait.go
  tabs/
  downloads/
  clipboard/
  devtools/
  actionplan/
```

### Backend interface

```go
type BrowserBackend interface {
    Attach(ctx context.Context, tabID int) error
    Detach(ctx context.Context, tabID int) error
    ExecuteCDP(ctx context.Context, tabID int, method string, params map[string]any) (map[string]any, error)
    CreateTab(ctx context.Context, session SessionRef, input CreateTabInput) (TabInfo, error)
    CloseTab(ctx context.Context, session SessionRef, tabID int) error
    ListTabs(ctx context.Context, session SessionRef) ([]TabInfo, error)
    ListUserTabs(ctx context.Context) ([]TabInfo, error)
    ClaimTab(ctx context.Context, session SessionRef, tabID int) (TabInfo, error)
    SearchHistory(ctx context.Context, input HistoryInput) ([]HistoryEntry, error)
    FinalizeTabs(ctx context.Context, session SessionRef, keep []KeepTab) (FinalizeResult, error)
    NameSession(ctx context.Context, session SessionRef, name string) error
    SubscribeEvents(session SessionRef) (<-chan BrowserEvent, func(), error)
}
```

本轮只实现 `ExtensionBackend`，但高层 commands 不允许直接依赖 Native Messaging 或 Chrome 私有结构。

## Locator Runtime

### 定位

本 plan 不集成完整 Playwright。实现的是 `Playwright-compatible Locator Subset`，模型可见名称统一为 Locator。

### 代码位置

```text
plugins/browser-bridge/apps/cli/internal/locator/runtime.js
```

由 Go 使用 `go:embed` 打入 `abb` 二进制，通过 `Runtime.evaluate` 注入页面，页面全局固定为：

```text
window.__actspaceLocator
```

### V1 必须支持

- CSS selector 查询。
- strict 唯一性：单一匹配，或多个匹配中只有一个可见元素。
- visible / hidden / enabled / disabled / editable / checked / unchecked 状态。
- `scrollIntoView` 和 bounding box。
- innerText / textContent / attributes / count / batch read。
- fill：使用原生 value setter，并派发可被 React/Vue 感知的 input/change 事件。
- select option。
- checkbox/radio 状态读取；实际切换仍通过 CUA click 并在点击后验证。
- navigation 后自动判定 injected runtime 失效并重新注入。
- 所有 selector、文本和值通过 JSON 编码传入，禁止字符串拼接导致脚本注入。

### 本轮不承诺

- 完整 Playwright selector grammar。
- 完整 `getByRole` / accessibility selector engine。
- Shadow DOM 穿透。
- 多 frame locator。
- 完整 Playwright actionability（stable、receives events、trial click 等）。
- Playwright browser/context/page 生命周期。

这些能力只有在真实数据集证明需要时才进入后续 capability extension。

## Extension Primitive Boundary

### Extension 保留

- Native Messaging 连接。
- `chrome.debugger.attach/detach/sendCommand`。
- `chrome.debugger.onEvent/onDetach` 转发。
- `chrome.tabs` / `chrome.history` / `chrome.tabGroups` / `chrome.downloads`。
- File chooser 和 download 事件采集。
- Cursor overlay/content script。
- 必要的 Chrome permission/capability 报告。

### Extension 迁出到 Go

- Selector strict 定位编排。
- click/fill/select/scroll/back 等高层 command handler。
- 导航等待和 timeout 编排。
- CUA mouse/key/drag 调用序列。
- DOM CUA node_id 语义。
- Locator polling、state verification 和错误包装。
- command metadata、风险和 preview 信息。

### 建议 primitive methods

```text
agent_browser_bridge.backend.attach
agent_browser_bridge.backend.detach
agent_browser_bridge.backend.execute_cdp
agent_browser_bridge.backend.tabs.create
agent_browser_bridge.backend.tabs.close
agent_browser_bridge.backend.tabs.list
agent_browser_bridge.backend.user_tabs.list
agent_browser_bridge.backend.user_tabs.claim
agent_browser_bridge.backend.history.search
agent_browser_bridge.backend.session.name
agent_browser_bridge.backend.session.finalize
agent_browser_bridge.backend.cursor.move
```

高层 Agent/CLI 命令不得直接透传给 Extension。Go 收到高层命令后必须在本地 dispatch，再按需调用 primitive methods。

## Agent Core 收敛

### 保留

```text
packages/agent-core/src/tools/tools/browser/
  definition.ts
  executor.ts
  bridge-client.ts
  types.ts
  generated-actions.ts
  permissions.ts
  preview.ts
```

- `definition.ts`：11 个稳定工具定义。
- `executor.ts`：一个分类工具通用 executor、一个 help executor、一个 run executor。
- `generated-actions.ts`：由 Go registry metadata 生成的 category/action enum、风险和 preview 索引；禁止手工维护第二份 62 条清单。
- `permissions.ts`：按 action metadata 做 preflight 和 approval summary。
- `preview.ts`：按 action metadata 生成 compact preview。

### 删除或退役

- 15 个 command-specific executor。
- 在 TS 中手写 browser command 到 protocol method 的映射。
- 依赖模型记住 CLI 和 Agent 两套不一致名字的 prompt 文本。

### 兼容层

- 旧工具名映射到新 `category + action`，但不进入新模型工具 definitions。
- 旧 `ToolPreviewKind` 保留读取兼容，新增记录统一使用分类 preview。
- 旧 session replay 不因工具名退役而渲染失败。
- `ACTSPACE_DISABLED_TOOLS` 同时接受新工具名和迁移期 legacy alias。

## 协议收敛

### Agent Core -> Go

新增稳定高层入口：

```text
agent_browser_bridge.command.list
agent_browser_bridge.command.describe
agent_browser_bridge.command.preflight
agent_browser_bridge.command.execute
agent_browser_bridge.command.run
```

`command.execute` 参数：

```json
{
  "category": "locator",
  "action": "click",
  "params": {
    "tab_id": 42,
    "selector": "button[type=submit]"
  }
}
```

### Go -> Extension

只使用 Extension primitive methods。协议类型放在 `plugins/browser-bridge/packages/protocol/`，高层 command schema 由 registry 管理，不为每个 command 重复新增一套手写 Go struct，除非该类型被多个 handler 共享且静态类型能显著降低风险。

## 权限与安全

- Agent Core 是用户审批的最终权威；Go registry 提供 risk/effect/origin metadata，但不能自行绕过 ToolManager approval。
- 只读命令：tab/page/DOM/text/state/log 读取，默认 low；涉及用户 history、clipboard read 时至少 medium，并在 preview 中明确数据来源。
- 页面状态修改：导航、点击、输入、选择、滚动、创建/关闭/claim/finalize tab，默认 medium。
- 文件上传、剪贴板写入、下载触发、raw CDP/evaluate、提交/发送/购买类动作默认 high 或进入更细粒度站点策略。
- `browser_help` 只读且不连接目标 tab 时可自动执行。
- `browser_run` 权限检查必须展开到 action 级，不允许用“批处理工具已批准”代替具体动作审计。
- Extension 必须校验 session/tab ownership，Go 的高层校验不能替代 Extension 的最终边界检查。
- 参数和错误日志不得包含页面密码、cookie、storage、authorization header 或未裁剪的大段 DOM。
- Screenshot/base64、DOM snapshot 和 console logs 必须走现有输出裁剪/落盘策略。
- Raw `abb cdp` 仅保留 CLI 诊断面；Agent 默认工具目录不注册 raw execute。

## 错误模型

统一错误至少包含：

```text
code
message
category
action
command_id
tab_id (if safe)
retryable
phase
details (sanitized)
```

稳定错误码包括：

```text
invalid_action
invalid_params
unsupported_backend
capability_unavailable
session_not_found
tab_not_found
tab_not_in_session
debugger_attach_failed
cdp_failed
selector_not_found
selector_ambiguous
element_not_visible
element_disabled
element_not_editable
locator_timeout
navigation_blocked
navigation_timeout
file_chooser_not_found
download_failed
approval_required
extension_unavailable
```

错误必须告诉模型下一步可以做什么，例如重新获取 DOM snapshot、重新列 tabs、收窄 selector、请求用户授权或停止重试。

## 里程碑与任务

### M0：设计与文档收敛

允许修改：

- `docs/design-docs/agent-browser-use-index.md`（新增）
- `docs/design-docs/index.md`
- `docs/ARCHITECTURE.md`
- 四份 Browser Use 设计文档
- 本专题 README 和本 plan

任务：

- [x] 创建专题 index，写清阅读顺序、事实来源和当前状态。
- [x] 将 `agent-browser-bridge-design.md` 的 CLI-first v0 内容标为历史阶段，并同步当前标准工具 + Socket 长连接方向。
- [x] 将 Go/Extension/Injected JS 职责边界写成唯一架构图和职责表。
- [x] 将“完整实现”统一改为“首版接入完成；完整 62 条命令未完成”。
- [x] 明确 Locator 是 Playwright-compatible subset，不承诺完整 Playwright。
- [x] 把本 plan 的 7 个设计闸门结果写入决策记录。

验证：

```bash
rg -n 'CLI-first|不新增 browser_|完整实现|完整浏览器控制能力' docs/design-docs docs/exec-plans docs/histories
pnpm check:docs
```

预期：长期设计文档不再互相矛盾；历史文件允许保留当时口径，但必须带后续修正说明。

### M1：Canonical Registry 与代码生成地基

允许修改：

- `plugins/browser-bridge/apps/cli/internal/commands/`
- `plugins/browser-bridge/apps/cli/main.go`
- `plugins/browser-bridge/apps/cli/main_test.go`
- `plugins/browser-bridge/packages/protocol/`
- `packages/agent-core/src/tools/tools/browser/generated-actions.ts`
- `scripts/check-browser-command-registry.mjs`

任务：

- [x] 将 62 条命令录入 Go registry metadata。
- [x] 为现有 handler 标记 `implemented` / `partial` / `not_implemented`，不在本阶段伪造实现。
- [x] 新增 `abb commands [--category <name>] [--json]`。
- [x] 扩展 `abb help <category> <action> --json`。
- [x] 生成并提交 `generated-actions.ts`，包含分类 action enum、risk、readOnly、preview kind 和 legacy alias。
- [x] 增加 parity 检查：62 条数量、9 类分布、所有 action 有 schema/risk/preview/backend/status；检查同时对照命令面正文 62 个 canonical 标题。

验证：

```bash
cd plugins/browser-bridge && GOCACHE=/private/tmp/abb-go-cache go test ./packages/protocol/... ./apps/cli/...
cd plugins/browser-bridge/apps/cli && GOCACHE=/private/tmp/abb-go-cache go run . commands --json
node scripts/check-browser-command-registry.mjs
pnpm --filter @actspace/agent-core run typecheck
```

预期：registry 精确报告 62 条核心命令；生成文件与 registry 一致；现有命令行为不变。

### M2：Extension Primitive Protocol 与 Go Backend Adapter

允许修改：

- `plugins/browser-bridge/apps/cli/internal/backend/`
- `plugins/browser-bridge/apps/cli/internal/cdp/`
- `plugins/browser-bridge/apps/cli/server.go`
- `plugins/browser-bridge/apps/cli/session.go`
- `plugins/browser-bridge/apps/cli/events.go`
- `plugins/browser-bridge/apps/chrome-extension/src/background.js`
- `plugins/browser-bridge/packages/protocol/`
- 对应 Go/Node 测试

任务：

- [x] 定义 `BrowserBackend` interface 和 `ExtensionBackend`。
- [x] 将 Go server 从“未知业务 method 默认转发”改为“高层 `command.*` 本地 dispatch”；迁移期旧 method 受 `ABB_LEGACY_BROWSER_FORWARDING` 控制。
- [x] Extension 新增/稳定 primitive methods，并保留迁移期旧 method alias。
- [x] Go 接收并向长连接客户端广播 CDP、debugger detach、download、tab closed 事件。
- [x] Go 管理每个连接/session 的 attach 状态，并在 turn end 或断线时 best-effort detach；Extension 保留 ownership 复核。
- [x] 增加 fake `ExtensionBackend` 和 command router 集成测试，不启动 Chrome 即可验证 primitive method 与本地 dispatch。

验证：

```bash
cd plugins/browser-bridge && GOCACHE=/private/tmp/abb-go-cache go test ./packages/protocol/... ./apps/cli/...
node --check plugins/browser-bridge/apps/chrome-extension/src/background.js
```

预期：Go fake backend 能证明高层命令不再直接透传；Extension primitive contract 可单独测试。

回退：保留迁移期 legacy forwarding feature flag；如果真实 Chrome smoke 失败，可恢复旧 handler 路径而不回退 registry 和文档地基。

### M3：Go CUA、DOM CUA 与 Locator Engine

允许修改：

- `plugins/browser-bridge/apps/cli/internal/cua/`
- `plugins/browser-bridge/apps/cli/internal/domcua/`
- `plugins/browser-bridge/apps/cli/internal/locator/`
- `plugins/browser-bridge/apps/cli/internal/cdp/`
- `plugins/browser-bridge/apps/chrome-extension/src/playwright-injected.js`（迁移完成后删除或仅保留兼容加载）
- 对应测试和 fixture

任务顺序：

1. **CUA 基础**
   - [x] DPR-correct screenshot。
   - [x] mouse move/click/double-click/scroll/drag 的 Go CDP sequence。
   - [x] modifier/key chord 基础映射（含 ControlOrMeta）。
   - [x] click navigation classification/wait。
2. **DOM CUA**
   - [x] visible DOM snapshot 和稳定 node_id。
   - [x] node click/double-click/scroll/type/download。
   - [x] navigation 后 node snapshot 失效错误。
3. **Locator runtime**
   - [x] `go:embed runtime.js` 和 version marker。
   - [x] 每次调用前 version check；导航导致全局丢失时自动重注入。
   - [x] runtime 内完成 strict selector、state、text、attribute、count、batch read。
   - [x] 将 click/double-click/fill/press/select/check/wait 接入 Go registry handler。
   - [x] element info/screenshot。

验证：

- Go fake backend 断言准确 CDP 调用序列。
- JS runtime fixture 覆盖 0/1/N 匹配、可见/隐藏、disabled、React-like input setter、checkbox/radio。
- 导航 fixture 证明旧 injected global 不被错误复用。
- 坐标截图验证 CSS pixel 与截图像素一致。

预期：CUA、DOM CUA、Locator 的编排逻辑不再存在于 Extension `background.js`。

### M4：Agent 分类工具与权限/Preview 收敛

允许修改：

- `packages/agent-core/src/tools/tools/browser/`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/engine/streaming-preview-extractors.ts`
- `packages/shared/src/session.ts`
- `packages/desktop/src/renderer/components/settings/tool-catalog.ts`
- 对应 agent-core/desktop 测试

任务：

- [x] 注册 9 个分类工具、`browser_help`、`browser_run`。
- [x] 通用 executor 调用 `command.execute/describe/run`。
- [x] permission checker 根据生成 metadata 展开单 action 或 batch preflight。
- [x] preview 根据 category/action 呈现 URL、selector、坐标、文件、tab keep 等最小必要信息。
- [x] screenshot/image content 继续走现有 image tool result 链路。
- [x] legacy 15 工具改为内部 alias，不再默认 model-visible。
- [x] 设置页按 11 个稳定工具分类展示，不列出 62 个独立 toggle；download/file-upload/clipboard-write 作为非模型工具的 capability toggle，由 permission checker 按 effect hard deny。

验证：

```bash
pnpm --filter @actspace/agent-core exec vitest run src/tools/tools/browser/test
pnpm --filter @actspace/desktop exec vitest run src/renderer/test src/main/test
pnpm run typecheck
```

预期：模型工具列表中只有 11 个 Browser Use 工具；旧 session preview 不回归；mutation 必须进入审批。

### M5：补齐完整 62 条命令

按风险和基础依赖分批推进，每一批必须更新 registry status、设计状态表和真实验收矩阵。

#### M5.1：P0 质量补齐

- [x] 截图 DPR、viewport、crop。
- [x] click/navigation wait。
- [x] 完整 modifier/key mapping。
- [x] attach 生命周期和事件可靠性。

#### M5.2：读取、导航与等待

- [x] forward/reload/selected/name/history。
- [x] innerText/textContent/attribute/count/visible/enabled/readAll。
- [x] load/url/timeout/locator waits。

#### M5.3：完整交互

- [x] double-click/move/drag。
- [x] DOM CUA 全量。
- [x] setChecked、element info/screenshot。
- [x] media download commands。

#### M5.4：文件、下载与剪贴板

- [x] file chooser arm/event token/set files。
- [x] download arm/event token/path。
- [x] clipboard text read/write。
- [x] clipboard rich media read/write（单 representation 1 MiB 上限）。

#### M5.5：调试与持续事件

- [x] `tab_dev_logs` 持续 attach、500 条环形缓冲、level/filter/limit。
- [x] tab close/CDP/download notifications 与 Go event state。
- [x] turn end 时清理 attach；file chooser/download token 由 Native Host 生命周期持有并受 token/tab 绑定。

每批验证：

- registry 中本批命令全部从 partial/not_implemented 变为 implemented。
- fake backend/CDP sequence 单测。
- Extension contract 测试。
- 至少一个真实 Chrome smoke case。
- 对应 permission/preview 测试。

### M6：真实 Chrome 验收、文档与交付

任务：

- [x] 建立按 9 类组织的真实 Chrome acceptance checklist。
- [x] 用真实 Chrome profile 验证 list/open/claim/navigate/read/click/fill/select/wait/download/finalize。
- [x] 验证 tab group、deliverable/handoff、cursor 和 session cleanup。
- [x] 验证 Extension reload、Native Host 原子升级和断线重连。
- [x] 验证拒绝 origin、拒绝 mutation、拒绝 high-risk batch 后无部分执行。
- [x] 用自动化回归验证日志、session 和 preview 不泄露 Browser 输入文本、截图/DOM/debug/clipboard payload；真实 Chrome 仅需复核 UI 表现。
- [x] 更新四份设计文档、专题 index、`agent-current-module-map.md`、`ARCHITECTURE.md`。
- [x] 更新持续维护的 history，并生成 Go 编排 + injected runtime learning 文档。
- [x] 将完成的 plan 移到 `docs/exec-plans/completed/`，并清理 active README 状态。

最终验证：

```bash
cd plugins/browser-bridge && GOCACHE=/private/tmp/abb-go-cache go test ./packages/protocol/... ./apps/cli/...
node --check plugins/browser-bridge/apps/chrome-extension/src/background.js
node scripts/check-browser-command-registry.mjs
pnpm --filter @actspace/agent-core exec vitest run src/tools/tools/browser/test
pnpm run typecheck
pnpm run ci
```

手工验收结果必须记录：

```text
command/category
backend
tab/origin
approval result
expected behavior
actual behavior
cleanup result
evidence path
```

## 测试矩阵

| 层级 | 测试重点 |
| --- | --- |
| Registry unit | 62 条数量、唯一性、schema、risk、backend、handler、alias、preview coverage |
| Go command unit | 参数验证、CDP 序列、timeout、retry、navigation、错误包装 |
| Injected JS fixture | selector、state、fill、select、checked、DOM snapshot、navigation reset |
| Extension contract | attach/detach/executeCdp、Chrome API、event forwarding、ownership |
| Agent-core unit | 11 工具定义、通用 executor、approval、batch preflight、preview、裁剪 |
| Cross-layer integration | ToolManager -> BridgeClient -> Go engine -> fake/real Extension |
| Real Chrome smoke | 用户 profile、claim、交互、下载、finalize、断线重连 |

## 关键风险与缓解

### 1. 把 Extension 变薄时造成真实能力回归

- 缓解：先引入 Go handler 与 legacy forwarding 双路径；每类命令完成真实 smoke 后再关闭旧路径。
- 回退：feature flag 恢复旧 Extension handler；registry 和分类 Agent 工具不回退。

### 2. Native Messaging 往返导致多 CDP 调用延迟

- 缓解：Go command 在一次高层请求内复用 session/attach；减少重复 attach/detach；DOM 批量读使用单次 `Runtime.evaluate`；`browser_run` 减少 Agent/Socket 往返。
- 禁止：为追求性能把任意 action script 直接交给 Extension 执行。

### 3. Locator subset 被误认为完整 Playwright

- 缓解：模型工具名使用 `browser_locator`；文档明确支持矩阵；不暴露未实现的 role/frame/shadow 能力。
- 错误必须返回 `unsupported_selector`，不能静默降级成错误 CSS。

### 4. Registry 与生成产物漂移

- 缓解：CI 运行生成检查；生成文件带 hash/version；手工修改生成文件直接失败。

### 5. `browser_run` 绕过审批

- 缓解：执行器只能消费 permission checker 写入的 preflight token；模型传入同名字段必须剥除；token 绑定 action hash、session、turn 和过期时间。

### 6. 长期 attach 和事件监听泄漏

- 缓解：session/turn disposer、tab close cleanup、bounded buffers、超时清理、重复 detach 幂等测试。

### 7. 页面 JS 注入安全和兼容性

- 缓解：runtime 固定静态 asset；参数用 JSON 编码；不执行模型提供的任意 JS；navigation 后验证 version marker；禁止把 raw evaluate 作为默认 Agent action。

## 进度记录

- [x] 2026-07-10：完成 Codex、Open Browser Use 与当前 ActSpace 三方源码对比。
- [x] 2026-07-10：确认 Codex 不向模型平铺 60+ Browser Use tools，而是通过分层 browser client/对象 API 和内部 command handlers 执行。
- [x] 2026-07-10：形成“Go 编排 + injected JS DOM 语义 + Extension CDP/Chrome 原语 + Agent 分类工具”的推荐方案。
- [x] 2026-07-10：用户确认 7 个设计闸门，按推荐默认值执行。
- [x] 2026-07-10：M0 设计与文档收敛完成，`pnpm check:docs` 通过。
- [x] 2026-07-10：M1 canonical registry 完成；Go tests、registry parity check、agent-core typecheck 通过。
- [x] 2026-07-10：M2 Extension primitive protocol 与 Go backend adapter 完成；Go tests 与 Extension syntax check 通过。
- [x] 2026-07-10：M3 Go CUA/DOM CUA/Locator engine 完成，Extension 高层交互 handler 与旧 injected runtime 已删除。
- [x] 2026-07-10：M4 Agent 分类工具收敛完成，11 工具、action/batch approval、preview 与兼容 alias 测试通过。
- [x] 2026-07-10：M5 62 条命令全部变为 `implemented` + `go.*` handler；事件 token、clipboard、debug ring buffer 与 registry parity 通过。
- [x] 2026-07-10：补齐 AST dispatcher coverage、Extension primitive contract、backend capability gate、attach 引用计数与 event-state reset；CI 接入 Browser Bridge Go/JS 门禁。
- [x] 2026-07-10：建立 Browser ephemeral-result 边界，真实结果只供当前模型调用，tool call 参数、session、stream preview、console/run log 均经过脱敏回归测试。
- [x] 2026-07-11：M6 真实 Chrome profile、I/O、claim/handoff、deliverable、Agent approval/denial 与跨 session isolation 验收完成。

## 决策记录

- 2026-07-10：不复制 Codex 817KB browser-client bundle，也不在 agent-core 新增大型 TS browser client；ActSpace 使用 Go 承担等价高层编排角色。
- 2026-07-10：Playwright 只作为行为和 Locator API 参考，不引入完整 Playwright 依赖；页面内实现命名为 Locator runtime。
- 2026-07-10：`chrome.debugger` 的实际调用必须留在 Extension backend；Go 通过 primitive RPC 调用 CDP。
- 2026-07-10：完整 62 条命令是 Go/CLI/registry 的能力目标，不等于模型默认看到 62 个 tools。
- 2026-07-10：用户确认全部 7 个设计闸门，允许按 M0 至 M6 顺序开始执行。
