## [2026-07-30 15:01] | Task: 设计右侧 Terminal 并拆分执行计划

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 参考 Codex 和 Cursor 的本地实现，先为 ActSpace 右侧交互式 Terminal 编写设计文档和执行计划；native PTY 技术验证通过后，再开始正式产品实现。

### 🛠 Changes Overview

**Scope:** Desktop Terminal 架构设计、右侧对象面板规范与分阶段 execution plan

**Key Actions:**

- **[Architecture decision]**: 选择 Codex-style Electron main Terminal Session Manager，并从 Cursor 吸收显式 ACK 背压和进程治理；首版不复制完整 PTY Host。
- **[Safety boundary]**: 明确用户 Terminal 与 Agent Bash 的运行时、审批、沙盒、任务注册表和输出展示必须分离。
- **[Native gate]**: 把 `node-pty`、Electron ABI、进程树清理、production deploy、nested codesign 和打包 `.app` 设为 Phase 0 Go / No-Go 硬门槛。
- **[Staged delivery]**: 将实施拆为 native spike、shared/main runtime、preload/renderer、生命周期/制品验收四个计划，规定 Phase 0 通过后仍需再次批准才进入产品实现。
- **[Right-panel sync]**: 对象启动页收敛为 `Files / Terminal / Review / Context / Kairos / Reply` 六入口，旧右侧面板计划将 Terminal 责任转交给新计划。

### 🧠 Design Intent (Why)

Terminal 同时涉及 native addon、PTY 交互、进程树、Electron IPC、renderer 大输出、会话生命周期和 macOS 签名。先用隔离 spike 验证技术和制品链路，可以在还没有将复杂度带入右侧面板前暴露 ABI、权限、签名和孤儿进程风险。

### 📁 Files Modified

- `docs/ARCHITECTURE.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/exec-plans/active/20260527-right-panel-views.md`
- `docs/exec-plans/README.md`
- `docs/exec-plans/completed/20260730-right-panel-terminal/`
- `docs/histories/2026-07/20260730-1501-right-panel-terminal-design-plan.md`

## [2026-07-30 18:30] | Task: 实现并验收右侧 Terminal

### 📥 User Query

> 开始执行计划，全部执行完。

### 🛠 Changes Overview

- **[Native PTY]**: 锁定 `node-pty@1.1.0`，新增可重复 native prepare、开发态 / 打包态 spike，验证 ANSI、中文、Ctrl+C、resize、压力输出、背压与子孙进程清理。
- **[Main runtime]**: 新增 main-owned Terminal Backend、Session Service、Shell Environment、进程树清理和窄 IPC；Terminal 只能绑定已登记会话工作区，renderer 不能指定 shell、cwd 或 env。
- **[Renderer]**: 右侧对象启动页和 `+` 菜单加入 Terminal；xterm 支持 fit / resize、输入、复制粘贴分批、ACK、主题切换、退出状态、重启和 renderer remount 恢复。
- **[Lifecycle]**: Tab close、会话归档、BrowserWindow 销毁和 App quit 都收割 Terminal；会话切换只 detach，回到会话后从有界回放恢复。
- **[Release]**: production deploy 后按当前平台 / 架构精确检查 native 产物和 executable bit，Developer ID / ad-hoc 都先签嵌套 native 文件再签外层 App。
- **[Acceptance]**: 自动化、production build、主题检查和仓库检查通过；真实打包应用验证 workspace cwd、PTY resize、深浅主题与关闭 Tab 无孤儿进程。

### 🧠 Design Intent (Why)

交互式 Terminal 是用户本机能力，不是 Agent Bash。main 持有进程和安全上下文，renderer 只负责 xterm 显示与受限输入，既保留真实 PTY 体验，也避免把通用进程启动能力暴露给前端。显式 ACK、高低水位和有界回放让大输出不会无限占用 IPC 与内存。

### 📁 Key Files

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/terminal/`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/right-panel/TerminalRenderView.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `scripts/release-package.sh`
- `scripts/terminal-native-spike/`

## [2026-07-30 23:08] | Task: 收敛终端 ANSI 配色

### 📥 User Query

> 右侧终端里的项目名、Git 状态和提交号颜色过于鲜艳，希望调整成更和谐的 ActSpace 配色。

### 🛠 Changes Overview

- **[Root cause]**: `TerminalRenderView` 原先只覆盖 xterm 的 black / brightBlack，shell prompt 使用的 bright green / cyan / blue / red 仍回落到 xterm 高饱和默认色。
- **[Theme mapping]**: 新增独立终端主题映射，把完整 ANSI 16 色角色映射到现有 neutral、operational、info、warning、danger 和低饱和 chart token。
- **[Scope boundary]**: 不修改用户 `.zshrc`、`PS1` 或系统终端配置；只改变同一 ANSI 输出在 ActSpace xterm 内的呈现。
- **[Regression coverage]**: 新增主题映射单测，锁定普通色、bright 色和缺失 token 时的可读性回退。
- **[Acceptance]**: 真实 Electron 中运行 `node -v`，确认 Light、Dark、System 三态实时更新同一个 PTY；项目名、Git 状态、提交号和提示符保持区分但不再呈现荧光色，验收后恢复用户原有浅色偏好。

### 🧠 Design Intent (Why)

ANSI 是 shell 输出的协议角色，不等于应用品牌色。由应用在 xterm 渲染边界完成语义色板翻译，可以保留 Git、错误、警告和目录颜色的区分，同时避免默认荧光色破坏 Ink & Emerald 的暖中性层级，并让 Light、Dark、System 三态自动同步。

### 📁 Key Files

- `packages/desktop/src/renderer/components/right-panel/terminal-theme.ts`
- `packages/desktop/src/renderer/components/right-panel/TerminalRenderView.tsx`
- `packages/desktop/src/renderer/test/terminal-theme.test.ts`
- `docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`
