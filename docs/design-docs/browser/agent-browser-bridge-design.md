# Agent Browser Bridge 设计

Browser Bridge 的主线实现位于仓库顶层 `browser-bridge/`，属于 Host capability。当前产品路径只有 Chrome Extension → Native Messaging Host → Browser Tools；不提供独立 CDP backend 或 IAB fallback。

## 职责边界

```text
Agent → packages/tools/browser-tools → Unix socket
      → Go command engine → Extension primitive RPC
      → chrome.debugger / Chrome APIs → 用户真实 Chrome
```

- Browser Tools 负责工具定义、权限、结果转换和 Turn transport；Runtime Core 不承载 CDP 逻辑。
- Desktop main 负责组件准备、安装注册、实例发现、只读 probe、目标绑定与状态展示。
- Go 单二进制同时提供 CLI、Native Messaging Host 和 command engine，管理 registry、Session ownership、等待、事件和批处理。
- Chrome Extension 负责真实浏览器宿主权限、Tabs/History/TabGroups/Downloads 和 `chrome.debugger` 原语。
- Locator Runtime 负责页面内 DOM 语义，由 Go 构建嵌入并注入，不依赖用户机器上的 Node 或 Playwright。

CDP 是 Extension 路线内部的页面执行协议，不代表另有一个可以脱离扩展运行的产品 backend。用户浏览器表面与页面操作共享这条连接链。

## 连接与生命周期

Chrome Extension 通过 Native Messaging 拉起 Host，Desktop 不常驻 spawn 第二个服务。每个扩展实例拥有独立 socket，并在用户私有目录发布实例记录。Desktop 验证记录、socket 和只读 probe 后绑定目标；多个在线实例需要明确选择。

Browser transport 按 `sessionId + turnId` 懒创建。首次调用建立连接并发送 Session start，后续 action 复用该连接，Turn 结束关闭。Go 按连接维护 ownership；执行中断线可能已经产生副作用，因此不自动重放写操作。

连接授权仅允许准备本机组件和绑定 Chrome；Agent 写操作仍走 Tool Runtime 的 action 权限流程。模型默认工具面与审批契约见 [集成设计](agent-browser-use-integration-design.md)。

## 协议

- Runtime 与 Host 使用 Unix socket，版本化 JSON envelope 加 4 字节 little-endian 长度头。
- Host 与 Extension 使用 Chrome Native Messaging 的 stdio 传输。
- Envelope 使用 `protocolVersion: "0.2.0"`，请求含 id/method/params，响应含 id/ok/result 或 error；它不是 JSON-RPC 2.0。
- 应用方法使用 `agent_browser_bridge.*` 命名空间；command execute、describe、list、preflight 和 run 共用 Go registry。
- 协议保持为仓库内明确契约，不让 renderer 直接操作 Extension 私有接口或拼接 Bash 浏览器命令。

## 安装、升级与诊断

安装包资源、开发期构建、Native Host 注册和固定扩展身份由 Desktop Browser Bridge 服务负责。Native Host 的 `allowed_origins` 必须与 Extension manifest 的固定 key 对应 ID 一致。

更新正在使用的 Host 二进制时，先复制到唯一临时文件，执行 `abb help` 验证，再 rename 原子替换。失败保留旧二进制；当前运行的进程继续持有旧 inode，新进程读取新文件。扩展或 Host 更新后的真实连接必须重新验证。

CLI 保留 `help`、`doctor`、`capabilities` 和人工命令入口，供安装、诊断与机器可读 schema 查询使用。Agent 正常调用通过专用 Browser 工具，不经 CLI。命令语义和参数见 [命令面](agent-browser-use-command-surface.md)。

状态探测应复用进行中的请求，避免重叠子进程；失败保留可诊断错误并退避，安装成功后使旧错误状态失效。绑定目标失效时不能静默切换到另一个 Chrome 实例。

## 维护与验收

- 整体职责见 [Browser Use 入口](agent-browser-use-index.md)。
- Desktop 绑定与 Runtime adapter：`apps/desktop/src/main/runtime-v2/browser-capability.ts`。
- Go 命令与页面执行：[实现导航](agent-browser-use-command-implementation.md)。
- 当前 [连接体验执行计划](../../exec-plans/active/20260928-chrome-connect-experience.md) 跟踪首次连接、打包安装、多实例、断线恢复和真实 Chrome 验收。静态检查和旧版本 smoke 不能关闭这些验收项。
