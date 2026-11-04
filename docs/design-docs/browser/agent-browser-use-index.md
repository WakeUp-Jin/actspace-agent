# Browser Use 设计专题入口

> 插件状态：默认不加载，在 扩展 › 插件 中开启后重启生效。

Browser Use 接入用户真实 Chrome。当前实现是 11 个模型工具通过 Unix socket 调用 Go command engine，再由 Chrome Extension 执行 Chrome API / CDP 原语。命令 registry 是命令 ID、schema、风险和实现状态的机器事实来源。

## 当前职责

| 层 | 负责 |
| --- | --- |
| `packages/browser/tool-browser` | 工具定义与注册、action 风险判断、结果脱敏与裁剪、Turn transport |
| Desktop Host | 组件准备、实例发现与验证、绑定 socket、向 Runtime 提供 Browser capability |
| Go command engine | 62 条 canonical command、参数校验、Session/tab ownership、CUA/DOM CUA/Locator、等待与批处理 |
| Injected Locator runtime | 页面内定位、accessible name、open Shadow DOM、actionability、文本与表单语义 |
| Chrome Extension | Native Messaging、`chrome.debugger`、Tabs/History/TabGroups/Downloads、事件转发与光标 |

当前只有 Chrome Extension 路线。CLI 保留安装、诊断、人工调用和机器可读帮助；Agent 正常调用不经过 Bash CLI。

## 模型工具面与权限

Browser capability ready 后注册 9 个分类工具和 `browser_help`、`browser_run`。Agent 模式允许完整 11 工具；Chat / Plan 的白名单不包含 Browser 工具。实际工具集合还受当前 registry 和调用范围限制。`browser_help` 查询 schema，不承担调用后才解锁其他工具的职责。

分类工具为 `browser_cua`、`browser_dom`、`browser_locator`、`browser_navigation`、`browser_tabs`、`browser_user`、`browser_wait`、`browser_io`、`browser_debug`。62 条叶子能力通过 category/action 调用，不平铺为 62 个模型工具。

- `browser_help` 允许读取命令说明；未知 action 拒绝。
- 已知只读 action 允许；写 action 在 `default` 权限模式请求审批，`full-access` 按其权限语义允许。
- 批处理按全部 action 判断风险，并由 Go preflight 签发绑定 action 参数和 Turn 的 token；该 token 不等于用户批准。
- Desktop 的连接授权不授予 Session 内所有写操作通用权限。
- Browser 文本经过脱敏和裁剪后进入普通 `tool/result` 持久化；截图存为 Session artifact。不能承诺读取结果仅临时存在。

## 生命周期

每个 Chrome 扩展实例启动自己的 Native Host，并发布独立 socket。Desktop 绑定已验证实例；多个实例不能隐式选定。Browser transport 按 `sessionId + turnId` 懒创建并复用，Turn 结束后关闭。执行中断线不会自动重放写操作，恢复连接后由新的 Turn 使用重新验证的 capability。

页面 Locator 源码为 TypeScript，构建为 JavaScript 后由 Go `go:embed` 打入二进制，经 CDP 注入页面。产品运行时不需要 Node 或 Playwright。模型使用 `browser_locator`；canonical ID 的 `playwright_*` 前缀仅为兼容命名。

## Bridge：Host、协议与安装

Bridge 主线实现位于仓库顶层 `browser-bridge/`，属于 Host capability。当前产品路径只有 Chrome Extension → Native Messaging Host → Browser Tools；不提供独立 CDP backend 或 IAB fallback。

### 调用链与职责边界

```text
Agent → packages/browser/tool-browser → Unix socket
      → Go command engine → Extension primitive RPC
      → chrome.debugger / Chrome APIs → 用户真实 Chrome
```

- Browser Tools 负责工具定义、权限、结果转换和 Turn transport；Runtime Core 不承载 CDP 逻辑。
- Desktop main 负责组件准备、安装注册、实例发现、只读 probe、目标绑定与状态展示。
- Go 单二进制同时提供 CLI、Native Messaging Host 和 command engine，管理 registry、Session ownership、等待、事件和批处理。
- Chrome Extension 负责真实浏览器宿主权限、Tabs/History/TabGroups/Downloads 和 `chrome.debugger` 原语。
- Locator Runtime 负责页面内 DOM 语义，由 Go 构建嵌入并注入，不依赖用户机器上的 Node 或 Playwright。

CDP 是 Extension 路线内部的页面执行协议，不代表另有一个可以脱离扩展运行的产品 backend。用户浏览器表面与页面操作共享这条连接链。

### 连接细节

Chrome Extension 通过 Native Messaging 拉起 Host，Desktop 不常驻 spawn 第二个服务。每个扩展实例在用户私有目录发布实例记录；Desktop 验证记录、socket 和只读 probe 后绑定目标。Go 按连接维护 ownership。连接授权仅允许准备本机组件和绑定 Chrome；Agent 写操作仍走 Tool Runtime 的 action 权限流程。

### 协议

- Runtime 与 Host 使用 Unix socket，版本化 JSON envelope 加 4 字节 little-endian 长度头。
- Host 与 Extension 使用 Chrome Native Messaging 的 stdio 传输。
- Envelope 使用 `protocolVersion: "0.2.0"`，请求含 id/method/params，响应含 id/ok/result 或 error；它不是 JSON-RPC 2.0。
- 应用方法使用 `agent_browser_bridge.*` 命名空间；command execute、describe、list、preflight 和 run 共用 Go registry。
- 协议保持为仓库内明确契约，不让 renderer 直接操作 Extension 私有接口或拼接 Bash 浏览器命令。

### 安装、升级与诊断

安装包资源、开发期构建、Native Host 注册和固定扩展身份由 Desktop Browser Bridge 服务负责。Native Host 的 `allowed_origins` 必须与 Extension manifest 的固定 key 对应 ID 一致。

更新正在使用的 Host 二进制时，先复制到唯一临时文件，执行 `abb help` 验证，再 rename 原子替换。失败保留旧二进制；当前运行的进程继续持有旧 inode，新进程读取新文件。扩展或 Host 更新后的真实连接必须重新验证。

CLI 保留 `help`、`doctor`、`capabilities` 和人工命令入口，供安装、诊断与机器可读 schema 查询使用。Agent 正常调用通过专用 Browser 工具，不经 CLI。命令语义和参数见 [命令面](agent-browser-use-command-surface.md)。

状态探测应复用进行中的请求，避免重叠子进程；失败保留可诊断错误并退避，安装成功后使旧错误状态失效。绑定目标失效时不能静默切换到另一个 Chrome 实例。

Desktop 绑定与 Runtime adapter：`apps/desktop/src/main/runtime-v2/browser-capability.ts`。

## 阅读与维护

1. [集成设计](agent-browser-use-integration-design.md)：工具、传输、权限和输出边界。
2. [命令面](agent-browser-use-command-surface.md)：62 条命令参数与行为。
3. [命令实现](agent-browser-use-command-implementation.md)：实现分层、CDP 原语与源码导航。
4. 本文「Bridge：Host、协议与安装」：Host、安装、实例路由与宿主边界。
5. [连接体验执行计划](../../exec-plans/completed/20260928-chrome-connect-experience.md)：首次连接、安装打包与真实 Chrome 验收的跟踪（计划已暂停，验收项未关闭）。

源码入口：`packages/browser/tool-browser/src/plugin.ts`、`node-capability.ts`，`packages/core/agent/src/agent-mode-policy.ts`，`browser-bridge/apps/cli/internal/commands/registry.go`。命令变化先更新 Go registry，再运行 `node scripts/check-browser-command-registry.mjs`。该检查验证生成 metadata 和文档标题 parity，不替代真实 Chrome 验收。
