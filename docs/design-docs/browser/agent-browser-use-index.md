# Browser Use 设计专题入口

Browser Use 接入用户真实 Chrome。当前实现是 11 个模型工具通过 Unix socket 调用 Go command engine，再由 Chrome Extension 执行 Chrome API / CDP 原语。命令 registry 是命令 ID、schema、风险和实现状态的机器事实来源。

## 当前职责

| 层 | 负责 |
| --- | --- |
| `packages/tools/browser-tools` | 工具定义与注册、action 风险判断、结果脱敏与裁剪、Turn transport |
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

## 阅读与维护

1. [集成设计](agent-browser-use-integration-design.md)：工具、传输、权限和输出边界。
2. [命令面](agent-browser-use-command-surface.md)：62 条命令参数与行为。
3. [命令实现](agent-browser-use-command-implementation.md)：实现分层、CDP 原语与源码导航。
4. [Bridge 设计](agent-browser-bridge-design.md)：Host、安装、实例路由与宿主边界。
5. [当前连接体验执行计划](../../exec-plans/active/20260928-chrome-connect-experience.md)：首次连接、安装打包与真实 Chrome 的未完成验收。

源码入口：`packages/tools/browser-tools/src/plugin.ts`、`node-capability.ts`，`packages/core/agent/src/agent-mode-policy.ts`，`browser-bridge/apps/cli/internal/commands/registry.go`。命令变化先更新 Go registry，再运行 `node scripts/check-browser-command-registry.mjs`。该检查验证生成 metadata 和文档标题 parity，不替代真实 Chrome 验收。
