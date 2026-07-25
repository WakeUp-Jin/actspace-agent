## [2026-07-09 17:39] | Task: expose Browser Bridge to the main Agent

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户发现 Browser Bridge 已连接后，新 Agent 仍回答没有浏览器工具，并尝试 AppleScript，要求确认系统提示词是否说明了 `abb` 工具并补上接入。

### 🛠 Changes Overview

**Scope:** desktop main process / Agent runtime context / browser-bridge plugin service

**Key Actions:**

- **Runtime hint**: 主 Agent runtime context 在已安装 `abb` 时注入 `browser_bridge_cli` segment，明确浏览器任务优先通过 bash 调用 `abb`，并先查看 `help`、`doctor --json`、`capabilities --json`。
- **Managed Skill**: `BrowserBridgeService.installFromFile` 成功安装 `abb` 后生成 `<userData>/skills/browser-bridge/SKILL.md`，让 Skill catalog 能发现 Browser Bridge。
- **Main wiring**: `agent:run-turn`、`context:compact`、`context:describe` 的 runtime context loader 都传入 Browser Bridge `abb` 路径。
- **Tests**: 增加 runtime context 与 BrowserBridgeService 测试，锁定动态提示和托管 Skill 生成行为。
- **Design sync**: 更新 Browser Bridge 设计文档，明确 CLI-first 仍是主线，托管 Skill 只作为薄入口，不复制完整命令手册。

### 🧠 Design Intent (Why)

设置页安装插件只完成了系统层连接，主 Agent 还需要在模型上下文中知道 `abb` 的存在。用动态 runtime hint 解决已安装场景的即时可见性，用托管 Skill 解决 Skill catalog 的可发现性，同时避免把完整浏览器命令面硬编码进基础系统提示词。

### 📁 Files Modified

- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/plugins/browser-bridge-service.ts`
- `packages/desktop/src/main/test/agent-runtime-context.test.ts`
- `packages/desktop/src/main/test/browser-bridge-service.test.ts`
- `docs/design-docs/browser/agent-browser-bridge-design.md`
- `docs/histories/2026-07/20260709-1739-browser-bridge-agent-context.md`

### Superseded on 2026-07-10

该方案记录的是当时的 CLI-first 过渡接入。actspace-agent 现已改为直接向模型注册标准 `browser_*` 工具，并通过稳定 Native Host socket 长连接执行；`abb` runtime hint 和托管 Skill 仅保留诊断/安装用途。详见 `20260710-0130-browser-use-full-implementation.md` 的“接入闭环修正”。
