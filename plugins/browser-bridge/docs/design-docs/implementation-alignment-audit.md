# Browser Bridge 实现与设计对齐审计

## 目标

对当前仓库里已经落地的 Browser Bridge 主线实现做一次“设计规范对齐”审计，判断哪些部分已经与 `docs/design-docs/browser/agent-browser-bridge-design.md` 对齐，哪些仍需要后续真实浏览器验收或能力扩展。

## 对齐项

### 1. CLI 作为主入口

结论：已对齐。

证据：

- `apps/cli/` 已存在并可独立运行。
- `abb help` / `doctor` / `capabilities` / `backends` / `install-native-host` / browser commands 已作为命令面存在。
- CLI 通过 local RPC socket 连接 Native Messaging host，再由 host 转发给 Chrome extension。

### 2. 协议层必须存在且保持薄层

结论：已对齐。

证据：

- `packages/protocol/` 已定义协议版本、method names、payload structs、error codes、request/response envelope 和 frame helpers。
- 协议层没有承载 Agent Runtime 的产品规则、审批规则或 prompt 规则。

残余差距：

- 还没有 TypeScript 侧共享实现或 codegen；extension 当前以同名字符串契约消费协议。

### 3. extension backend 负责浏览器宿主表面

结论：已基本对齐。

证据：

- `apps/chrome-extension/src/background.js` 已实现 Native Messaging request router。
- extension 通过 `chrome.tabs` 提供 tabs、user-tabs、open-tab、claim-tab、navigate、wait-load、page-info、finalize-tabs。
- extension 通过 `chrome.history` 提供 history。

残余差距：

- `tabGroups`、downloads 和更复杂 session deliverable 语义尚未落地。

### 4. CDP/debugger 负责页面执行原语

结论：已基本对齐。

证据：

- extension 通过 `chrome.debugger` 支持基础 CDP 调用。
- 当前显式支持 `Runtime.evaluate`、`Page.navigate`、`Page.captureScreenshot`。
- `abb cdp` 与 `abb screenshot` 暴露为 CLI 命令。

残余差距：

- 当前不是完整 CDP coverage，也没有独立 CDP backend fallback。

### 5. CLI 自描述设计

结论：已对齐。

证据：

- `abb help`
- `abb help <command>`
- `abb help --json`
- `abb doctor`
- `abb capabilities --json`
- `abb backends --json`

### 6. 上层默认站在 CLI 边界

结论：已对齐。

证据：

- README 和 readiness 文档都将 CLI 作为推荐消费入口。
- 代码中没有让上层直接依赖 extension 私有实现。

### 7. Browser Bridge 仍是基础设施，不抢上层产品规则

结论：已对齐。

证据：

- 当前仓库代码主要停留在 bridge、协议、扩展与验证层。
- 未把上层任务编排、审批或产品规则混入 CLI/extension。

## 未完全对齐项

这些点与设计文档方向一致，但仍未完全实现或仍需真实环境验收：

- 真实 Chrome 环境中的最终手动验收仍需用户加载 extension、安装 native host 后统一执行。
- 跨平台 Native Messaging manifest 路径当前只按 macOS 开发环境优先实现。
- 独立 CDP backend fallback 尚未落地。
- `tabGroups`、downloads、完整事件流与多 client lifecycle 仍未覆盖。
- 上层 Agent Runtime 真实消费集成仍未接入。

## 审计结论

当前结论：

- Browser Bridge 主线代码已经从“阶段性 skeleton”推进到“完整 extension backend 代码面”。
- CLI、host、protocol、extension 的主链路已经按设计文档对齐到同一命令面。
- 最重要的剩余证明不是代码存在性，而是真实 Chrome profile 中的一次完整验收。
