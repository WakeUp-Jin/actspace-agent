## 2026-10-06 00:40 | Task: Desktop 前端重构 11：安全与 IPC

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-11`。
- 状态：完成，已交给验收。
- Runtime 补充：子分支 `refactor/desktop-fe-11`，squash 回 `refactor/desktop-frontend`。Electron 检查用 CDP。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第二份是 11：统一 sender 校验、工作区访问由 main 决定、主窗口导航防护和 sandbox、IPC channel 审计脚本、关窗与退出时的生命周期清理。

### 主要改动

- 新增 `main/ipc/trusted-sender.ts`，5 个 IPC 注册点统一改用 fail-closed 的 sender 校验（没有窗口时不再放行）。
- 新增 `main/workspace-access.ts`：renderer 传来的工作区 root 必须精确等于 registry 或已有会话 root 的 realpath。文件树 list / read / stat、Git context、右键菜单、Skills 列表接入；`toInsideRoot` 改为 realpath 加 `path.relative`，修正 `..foo` 误判和 symlink 逃逸。`createSession` 只认 registry，`createWorkspaceFolder` 只认最近一次对话框选择或已登记的父目录。
- 新增 `main/platform-actions.ts`（外部打开只放行 http(s) / mailto）和 `main/window-security.ts`（显式 sandbox、禁止 webview、新窗口一律拒绝、外部顶层导航取消并交给系统浏览器）。
- 关窗时销毁该窗口的终端；退出时终止 Browser Bridge 在途子进程、停止更新轮询；主进程异常和未处理的 rejection 写日志。
- 新增 `pnpm check:ipc-channels` 审计脚本。
- CSP 按 J1 = A 只做实验：严格策略会让 srcdoc 预览和 mermaid 样式失效；`onHeadersReceived` 对 file:// 有效。
- `SECURITY.md`、技术债、01 设计文档同步；技术债新增 C1（子进程继承 Key）、CSP、Browser Bridge 源码安装、审计脚本局限。

### 设计动机

renderer 一旦被注入脚本，现在的几处 fail-open 校验、由 renderer 决定的工作区 root 和缺失的导航防护，会让它读到工作区外的文件，或者把主窗口导航到外部页面。本计划把这些入口收口到 main 侧的统一判断。

### 学习沉淀

命中「可迁移」和「有陷阱」，写了 [Electron 主文档 CSP：先查 srcdoc 继承，再谈策略](../../learnings/2026-10/20261006-electron-csp-srcdoc-inheritance.md)。

### 文件

- `apps/desktop/src/main/{index,main-lifecycle,workspace-access,platform-actions,window-security,browser-bridge-service,local-update-service,workspace-fs-service,artifact-context-menu-service}.ts`、`main/ipc/trusted-sender.ts`
- `apps/desktop/src/main/runtime-v2/{fixed-renderer-ipc,desktop-shell-ipc,english-learning-ipc}.ts`、`main/remote-hosts/ipc.ts`、`main/performance-ipc.ts`
- `apps/desktop/src/main/test/*`、`main/terminal/test/*`（新增 trusted-sender、main-lifecycle、workspace-access、platform-actions、window-security 5 个测试文件，另扩展 / 改写 11 个）、`main/test/ipc-sender-fixture.ts`
- `scripts/check-ipc-channels.mjs`、`scripts/test/ipc-channels.test.mjs`、根 `package.json`
- `docs/SECURITY.md`、`docs/exec-plans/tech-debt-tracker.md`、`docs/desktop-frontend-refactor/01-安全与IPC收口.md`、`docs/learnings/2026-10/20261006-electron-csp-srcdoc-inheritance.md`
- `docs/exec-runs/20261005-desktop-fe-11-security-ipc/`
