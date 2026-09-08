# ActSpace v2 P09：内置工具迁移与 Browser Bridge 适配 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-09-built-in-tools-and-browser.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 21:06
- **当前状态**：v2 executor/parity、Browser Go/protocol 与 Bash shutdown 已完成；真实 Chrome/Extension gate 待 P15

## 执行时间线

### 步骤 1：建立 Core Tools plugin manifest 与 registration

- **操作**：实现 `actspace.core-tools` manifest、14 个现有工具名的 namespaced definition、Host capability effects、敏感参数路径和统一 `ToolRuntime.register()` 注册入口。
- **决定**：读取/搜索工具声明 read-only；文件写入、删除、Bash 和生成图片声明 exclusive；所有工具仍经过 P06 prepared execution、policy、approval 和 checkpoint。
- **验证**：稳定 toolId、数量、重复冲突和 unavailable handler 通过。

### 步骤 2：建立 Browser Tools Host capability adapter

- **操作**：实现 `actspace.browser-tools` manifest、6 个 Browser tool definitions、`BrowserCapability` port、command executor 和 redaction helper。
- **决定**：Go CLI、Chrome Extension、socket 和 locator runtime 仍由外部 Browser Bridge 所有；Cordis plugin 只消费 Host readiness/command port。
- **验证**：Browser capability 不可用时不执行 command，仍返回 generic structured failure；工具 id 与 manifest 一致。

### 步骤 3：迁移具体 executor 与 attachment 保护

- **操作**：实现 `NodeCoreToolPorts` 的文件、搜索、Bash、Web、Image executor；Bash 大输出写入 Session-owned artifact；`inspect_image` 只接受 Session-owned artifact 并检查 media magic/大小/owner；Browser socket transport 保持 session/turn identity、frame bound、abort、timeout 和 redaction。
- **验证**：14 个 core tool node-port tests、11 个 Browser/canonical action tests、25-tool parity ledger 和 image authorization fixtures 通过；v2 plugin source 不导入 `@actspace/agent-core`。

## 遇到的问题

- **问题**：旧 Desktop/CLI 正式入口仍保留 v1 wiring，不能在 P09 私自切换。
  - **应对**：v2 executor 已独立于旧包完成；Host wiring 和最终删除集中留给 P13/P14/P15。
- **问题**：Browser 真实 Chrome acceptance 依赖已加载 Extension 与在线 native-host socket；当前 `abb doctor --json` 显示 manifest 正常，但 socket offline。
  - **应对**：Go/protocol、command registry、locator、cursor、extension primitive、Browser client abort/timeout/shutdown 已自动化通过；保留 `BrowserCapability` 作为真实 Chrome 验收唯一入口，不把 offline 冒充通过。

## 跳过或推迟的事项

- 真实 Chrome/Extension acceptance 与 Web/Image live provider wiring 仍由 P15 acceptance 完成。
- `agent`、`explore`、Todo 和 main Loop 不在 P09 实现。
