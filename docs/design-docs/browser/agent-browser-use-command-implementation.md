# Browser Use 命令实现设计

命令参数与行为见 [命令面](agent-browser-use-command-surface.md)，调用与权限见 [集成设计](agent-browser-use-integration-design.md)。本页维护实现职责、底层原语和代码入口，具体算法以当前 Go handler 和 Locator Runtime 为准。

### 从 CDP 原语出发

Chrome DevTools Protocol 是所有浏览器操作的最底层。页面操作主要使用以下 CDP 原语；Tabs、History、Tab Groups 等浏览器级操作通过 Chrome Extension API 执行：

| 人类行为 | CDP 原语 | 说明 |
|----------|----------|------|
| 看 | `Page.captureScreenshot` | 截取页面像素 |
| 看 | `Page.getLayoutMetrics` | 获取视口尺寸和 DPR |
| 点击 | `Input.dispatchMouseEvent` | mousePressed / mouseReleased / mouseMoved |
| 滚动 | `Input.synthesizeScrollGesture` | 模拟滚轮 |
| 打字 | `Input.insertText` | 插入文本到焦点元素 |
| 按键 | `Input.dispatchKeyEvent` | keyDown / keyUp |
| DOM 读写 | `Runtime.evaluate` | 执行 JS 代码 |
| DOM 查询 | `DOM.getDocument` / `DOM.querySelector` | DOM 结构查询 |
| 文件 | `DOM.setFileInputFiles` | 设置文件上传 |
| 导航 | `Page.navigate` | URL 跳转 |
| 导航 | `Page.reload` | 刷新 |
| 导航 | `Page.getNavigationHistory` / `Page.navigateToHistoryEntry` | 前进/后退 |
| 事件 | `Runtime.consoleAPICalled` | console 日志 |
| 事件 | `Runtime.exceptionThrown` | JS 异常 |
| 事件 | `Page.loadEventFired` / `Page.domContentEventFired` | 加载完成 |

### 三层封装原则

```
层级 3  Locator subset：声明式 + 自动等待 + 基础框架感知
        ↓ 定位元素后转换为坐标或 DOM 操作
层级 2  DOM CUA node_id：结构化快照 + 按 ID 操作
        ↓ 通过 scrollIntoView + getBoundingClientRect 转为坐标
层级 1  CUA 坐标：光标动画 + 导航感知 + 修饰键管理
        ↓ 直接发 CDP Input 事件
层级 0  CDP 原语
```

每层不是独立实现，而是在下一层基础上增加封装。实现时应尽量复用下层逻辑。

### 职责分层（在 actspace 架构中谁做什么）

| 职责 | 执行方 | 说明 |
|------|--------|------|
| CDP attach/detach | Extension | 通过 `chrome.debugger.attach/detach` |
| CDP 命令发送 | Extension | 通过 `chrome.debugger.sendCommand` |
| Locator runtime 管理 | Go Command Engine | `go:embed` 静态 runtime，通过 CDP 注入、版本校验和导航后重注入 |
| 光标动画注入 | Extension | 将 `cursor-overlay.js` 注入页面 |
| CUA / DOM CUA / Locator 编排 | Go Command Engine | 高层 command handler、重试、状态验证和错误包装 |
| 导航等待编排 | Go Command Engine | 检查 Page.navigate 错误并轮询 tab 状态，协调 timeout |
| Chrome API 调用 | Extension | `chrome.tabs` / `chrome.history` / `chrome.tabGroups` |
| Tab Group 管理 | Extension | 创建/命名/移动 tab group |
| 请求路由与 registry | Go Command Engine | 接收 socket 请求，校验和 dispatch 62 条命令，只把 primitive 调用发给 Extension |
| Session 生命周期 | Go Command Engine | 管理 session 创建/销毁、attach 状态、native host 连接和事件订阅 |
| 工具定义 | v2 Runtime | `definitions.ts` 中的参数 schema |
| 工具 executor | v2 Runtime | 调用 BridgeClient 发送请求 |
| 结构化浏览器错误 | Go Command Engine | 统一 code、phase、retryable 和脱敏 details |
| 错误呈现 | v2 Runtime | 将 bridge 错误裁剪为模型和用户可读信息 |


## 当前实现矩阵

| 分类 | 数量 | Registry | Handler 所属 |
| --- | ---: | --- | --- |
| CUA | 9 | 9/9 implemented | Go CUA + CDP primitive |
| DOM CUA | 7 | 7/7 implemented | Go DOM CUA + Locator runtime |
| Locator | 21 | 21/21 implemented | Go Locator engine + self-authored injected Runtime v5 |
| Navigation | 4 | 4/4 implemented | Go navigation/wait |
| Tabs | 6 | 6/6 implemented | Go orchestration + Extension Tabs primitive |
| User | 3 | 3/3 implemented | Go orchestration + Extension Tabs/History primitive |
| Wait | 5 | 5/5 implemented | Go polling/event token state |
| I/O | 6 | 6/6 implemented | Go validation/event coordination + CDP/Downloads primitive |
| Debug | 1 | 1/1 implemented | Go 500-entry ring buffer + CDP event forwarding |

## 源码入口

- `browser-bridge/apps/cli/internal/commands/`：canonical registry、schema 和参数校验。
- `browser-bridge/apps/cli/internal/cua/`、`internal/domcua/`：坐标操作与 DOM node 操作。
- `browser-bridge/apps/cli/internal/locator/engine.go`：Locator、Frame context 与 CDP 编排。
- `browser-bridge/apps/cli/internal/locator/runtime-src/`：accessible name、Shadow DOM、定位与页面操作语义；构建产物由 Go embed。
- `browser-bridge/apps/cli/session.go`、`events.go`：Session 状态与事件路由。
- `browser-bridge/apps/chrome-extension/src/background.js`：Chrome/CDP primitive 与 Native Messaging。
- `packages/tools/browser-tools/src/node-capability.ts`：Socket adapter、batch preflight、结果与 artifact 转换。

修改命令时先更新 Go registry，再通过 `node scripts/check-browser-command-registry.mjs` 校验 metadata 与文档标题。Registry 的 implemented 状态不等于所有真实浏览器场景已验收；当前验收缺口见 [连接体验计划](../../exec-plans/active/20260928-chrome-connect-experience.md)。
