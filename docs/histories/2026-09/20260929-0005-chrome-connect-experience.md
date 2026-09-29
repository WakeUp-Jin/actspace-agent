# 2026-09-29 00:05 | Chrome 扩展连接体验

## 用户诉求

按照浏览器扩展方案打通顺滑的启动、连接和使用交互，只保留 Chrome 扩展链路，不做多 backend 或内嵌浏览器。

## 变更

- Desktop 能力页改为随包组件连接向导，保留折叠的源码开发入口；连接状态由 main 持久化并分层返回。
- Chrome 扩展使用持久实例 ID；Go Native Host 每实例私有 socket，Desktop 验证在线身份，多 profile 不默认抢占。
- Runtime 在所有会话空闲时重组 Browser 工具；工具调用在同 Turn 复用连接，断开、终结或取消时清理 ownership。
- Browser 写操作复用权限模式，默认需逐次批准；未知 action 拒绝；Go batch 和等待支持取消。
- Desktop 构建随包 Host 与扩展，校验 hash/版本/身份，安装更新采用 staging、备份和失败回滚。
- Browser 专题文档、执行计划和验收记录同步更新。
- 真实 Electron 验收发现开发 wrapper 误取发布资源路径，以及双 Chrome 资料时诊断默认 socket 误报离线；分别修正资源解析和按已选 socket 呈现诊断。
- 真实 Agent 验收发现 Agent `sessionId` 被误传为 CDP `sessionId`，导致认领后读取失败；协议将 CDP 目标身份独立命名为 `cdpSessionId`，并增加扩展原语回归。停止后恢复旧工具消息时可选 `toolName` 导致白屏，也补上兼容防护和回归。
- Browser 截图 artifact 经通用预览、会话持久消息和产物面板显示，用户可在对话中打开实际截图。
- 全仓测试发现 Sidebar fixture 使用逐次当前时间导致首项不稳定，已固定测试时间；CLI 三次运行/恢复用例耗时超过默认 5 秒，单用例测试预算调整到 20 秒。
- 长文件渲染和两项轨迹 UI 用例在全仓并行负载下超出默认 5 秒，定向提高测试预算；最终串行 `pnpm test` 和 `pnpm typecheck` 均通过。

## 关键文件

`apps/desktop/src/main/browser-bridge-service.ts`、`apps/desktop/src/main/runtime-v2/runtime-registry.ts`、`apps/desktop/src/renderer/components/extensions/BrowserConnectPanel.tsx`、`packages/tools/browser-tools/src/`、`browser-bridge/apps/cli/`、`browser-bridge/apps/chrome-extension/src/background.js`、`scripts/package-browser-components.mjs`。

## 验证和边界

此前 Desktop 117 文件/842 项通过；Browser Tools 12 项通过；Go race、protocol、check:browser、typecheck、root test、主题/token、check:repo 通过。新增修复后扩展 primitive contract、Go CLI/protocol、Client 9 项、Desktop 定向 30 项及 renderer build/typecheck 通过；最终 Desktop 全套 117 文件、844 项通过。最新源码重新打成本机临时签名 arm64 DMG/tar，app 签名和 Browser 组件校验通过。真实 Electron 与两个 Chrome 测试资料已验证首次自动连接、空 tabs probe、应用重启和显式目标切换。经用户授权复用既有 Provider 后，真实 Agent 对话完成查询、认领、读取、导航、截图预览；默认审批的批准/拒绝和等待中停止也已验收。并行打包期间根测试曾有长文件渲染超时；调整测试预算后，最终串行 `pnpm test` 与 `pnpm typecheck` 均通过。仍需忙碌 Runtime、断线/故障、更新、窄窗和最新包外连接等路线。`check:docs` 被另一份既有站点计划的 active/completed 状态不一致阻挡，未改动无关文件。A01–A16 逐项状态见执行摘要；正式签名和公证仍未验证。

## 学习沉淀

本次涉及跨进程实例身份、断线 ownership 清理和 Runtime 安全重组，具有可迁移模式与竞态陷阱；另见 `docs/learnings/2026-09/browser-bridge-identity-and-reconfiguration.md`。
