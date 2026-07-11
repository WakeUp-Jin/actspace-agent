# Browser Use 设计专题入口

本文档是 ActSpace Browser Use 设计的专题导航和架构口径入口。详细命令参数、实现草图和阶段计划仍分别维护在相邻文档中；当这些文档的历史阶段描述与本文冲突时，以本文和当前 active execution plan 为准。

## 当前结论

Browser Use Plan 5 已完成：62/62 canonical commands 全部由 Go handler 实现，Agent 默认只暴露 9 个分类工具、`browser_help` 和 `browser_run`，真实 Chrome profile、Agent approval/denial 和跨 session isolation 均已验收。完整证据见 `docs/exec-plans/completed/20260710-browser-use/plan-5-go-command-engine-convergence.md`。

- Agent Core 保持薄，只负责工具定义、审批、预览、Socket client 和 turn 生命周期。
- Go Browser Bridge 是 62 条命令的 canonical registry 和高层 command engine，负责参数验证、session、CUA、DOM CUA、Locator、等待、重试、事件和批处理编排。
- 页面内 DOM 语义由 Go 使用 `go:embed` 管理的一份轻量 injected JavaScript Locator runtime 提供。
- Chrome Extension 只保留 Chrome 权限域内的原语：Native Messaging、`chrome.debugger`、Tabs、History、Tab Groups、Downloads、事件转发和 cursor content script。
- 模型默认看到 9 个分类工具，加 `browser_help`、`browser_run`；62 条叶子命令不会平铺成 62 个模型工具。
- CLI 保留安装、诊断、人工调用和机器可读帮助能力，但不再是 Agent 正常执行 Browser Use 的主接入面。

## 目标架构

```text
Model
  -> 9 category tools + browser_help + browser_run
  -> packages/agent-core browser adapter
       - definitions / approval / preview
       - BridgeClient / turn lifecycle
  -> Unix socket
  -> Go Browser Command Engine
       - canonical registry for 62 commands
       - validation / session / CUA / DOM CUA / Locator
       - waits / retries / events / action plan
       - CLI help and schema generation
  -> Extension primitive RPC
       - attach / detach / executeCdp
       - tabs / history / tabGroups / downloads
       - event forwarding / cursor
  -> chrome.debugger / Chrome APIs
  -> user's Chrome profile
```

## 唯一职责表

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| Agent Core | 11 个模型工具、schema 暴露、用户审批、preview、输出裁剪、Socket 生命周期 | CDP 序列、selector 实现、导航等待、Chrome API |
| Go Command Engine | 62 条 registry、严格参数验证、高层 handler、session/tab 状态、CUA/DOM CUA/Locator、等待/重试/事件、批处理 preflight | 用户审批最终决定、直接调用浏览器扩展 API |
| Injected Locator runtime | CSS selector subset、可见性与状态判断、文本/属性读取、fill/select 等页面内 DOM 语义 | 完整 Playwright、任意模型 JS、Chrome API、产品权限 |
| Chrome Extension | Native Messaging、`chrome.debugger`、Chrome Tabs/History/TabGroups/Downloads、事件与 cursor 原语 | 高层 command registry、selector 编排、Agent 工具与权限 |

## Agent 工具面

默认模型可见工具：

1. `browser_cua`
2. `browser_dom`
3. `browser_locator`
4. `browser_navigation`
5. `browser_tabs`
6. `browser_user`
7. `browser_wait`
8. `browser_io`
9. `browser_debug`
10. `browser_help`
11. `browser_run`

既有 15 个 `browser_*` 首版工具只保留迁移期 alias 和旧 session preview 兼容，不再作为新模型默认工具面。

## Playwright 命名边界

本项目不引入完整 `playwright` 或 `playwright-core` 依赖，也不复制 Codex 的大型 Node browser client。

- 模型可见名称使用 `browser_locator`。
- 既有 62 条 canonical command ID 暂时保留 `playwright_*` 前缀，作为命令兼容 ID。
- 这些命令只承诺 Playwright-compatible Locator subset：首版以 CSS selector、strict match、可见/启用/可编辑状态、文本/属性读取、fill/select/check/wait 为主。
- 完整 selector grammar、role engine、frame、Shadow DOM 和完整 actionability 不属于当前承诺。

## 阅读顺序

1. `agent-browser-use-index.md`：当前架构和状态入口。
2. `agent-browser-use-integration-design.md`：Agent、Go、Extension 的集成方式和模型工具面。
3. `agent-browser-use-command-surface.md`：62 条 canonical command 的参数和行为语义。
4. `agent-browser-use-command-implementation.md`：每条命令的 CDP 原语和实现草图。
5. `agent-browser-bridge-design.md`：Browser Bridge 的宿主、传输、安装和 backend 边界；其中 CLI-first v0 章节只作历史记录。
6. `docs/exec-plans/completed/20260710-browser-use/plan-5-go-command-engine-convergence.md`：已完成的执行顺序、验证和回退策略。

## 事实来源

| 主题 | 事实来源 |
| --- | --- |
| 当前架构边界 | 本文档 |
| 模型工具面与集成生命周期 | `agent-browser-use-integration-design.md` |
| 62 条命令 ID、参数、返回语义 | `agent-browser-use-command-surface.md` |
| CDP 调用链与实现状态 | `agent-browser-use-command-implementation.md` 和未来 Go registry |
| 安装、Native Messaging、Extension/CDP backend 边界 | `agent-browser-bridge-design.md` |
| 当前实施进度 | Plan 5 与 Go canonical registry |

命令数量、分类、schema、risk、preview、backend 和 implementation status 以 Go registry 为机器事实来源；`scripts/check-browser-command-registry.mjs` 同步生成 Agent action metadata，并检查 62 条文档标题 parity。

## 2026-07-10 实现状态

- Go registry：62/62 `implemented`，且全部使用 `go.*` handler。
- Agent Core：11 个模型工具；旧 15 工具仅保留 alias 与 preview 读取兼容。
- Extension：旧 `playwright-injected.js` 和 click/fill/select/scroll 等高层 handler 已删除，只保留 primitive backend、Chrome APIs、事件转发与 cursor。
- 测试：Go、registry parity、Locator fixture、Agent Core Socket integration、desktop typecheck 已通过。
- 真实环境：Extension 0.2.1、runtime v3 与原子部署 Native Host 已完成多轮 reload/重连验收；确定性 fixture、I/O、claim/handoff、deliverable、Agent approval/denial 和 A/B session isolation smoke 均通过。

## 已确认设计闸门

2026-07-10 用户确认：

- 采用 9 个分类工具 + `browser_help` + `browser_run`，不平铺 62 个工具。
- 模型层使用 `browser_locator`，canonical command ID 保留 `playwright_*`。
- Go 负责 CUA、DOM CUA、Locator、导航等待和事件编排；Extension 只执行 Chrome/CDP 原语；injected JS 只负责页面内 DOM 语义。
- 当前核心范围为既有 62 条命令，`tab_content_export*` 留作未来 capability extension。
- raw CDP 只保留 CLI 诊断入口，不默认暴露给 Agent。
- `browser_run` 整批 preflight、整批展示并一次明确审批；拒绝后整批不执行。
- 旧 15 个工具保留一个迁移阶段的 alias 与旧会话兼容。

## 维护规则

- 架构职责变化时先更新本文档，再更新其他专题文档。
- 命令 ID、schema 或实现状态变化时先更新 Go registry，再运行生成与一致性检查。
- 不新增 Browser Use 专题子目录；继续使用 `agent-browser-use-*` 稳定前缀。
