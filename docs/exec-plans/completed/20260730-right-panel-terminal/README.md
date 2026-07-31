# 2026-07-30 右侧 Terminal 总执行计划

## 目标

在不破坏 Agent Bash 安全模型和现有右侧对象面板的前提下，为每个普通聊天会话提供绑定真实 workspace / worktree 的交互式 Terminal。实施先通过 native PTY 与打包签名技术验证，再分层实现 shared 契约、Electron main Session Service、preload、renderer xterm 视图和发布验收。

## 事实来源

- 长期设计：`docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`
- 右侧对象面板：`docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- 工作台布局：`docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- Agent Bash 边界：`docs/design-docs/execution-safety/agent-bash工具设计文档.md`
- 前端验收：`docs/FRONTEND_VERIFICATION.md`

设计文档回答为什么做、模块边界和行为契约；本计划回答修改哪些文件、执行顺序、验证证据和失败回退。两者冲突时以设计文档为准。

## 范围

### 包含

- native `node-pty` 的 Electron 39 / macOS arm64 / 发布制品可行性验证。
- Terminal shared IPC 契约和错误语义。
- Electron main 内的 Backend 抽象、Session Service、Shell Environment 和进程树清理。
- xterm renderer、右侧 Tab / 对象启动页、多 Terminal 会话和紧凑布局。
- 输出批处理、ACK 背压、有界回放和 renderer attach / detach。
- 原生模块 rebuild、deploy、可执行权限、签名和 DMG 验收。
- 自动化、Electron 真实验收、设计文档、history 和必要的 learning 收尾。

### 不包含

- Agent 自动输入用户 Terminal。
- 把 Agent Bash 输出接入交互式 Terminal Session。
- 独立 PTY Host、Remote Terminal、SSH、shell integration 和跨 App 重启持久化。
- 底部 IDE Terminal region、Tab 拖动 docking 或多编辑区布局。
- 终端内容落盘、录屏、模型分析或使用统计。

## 计划拆分

| 计划 | 产物 | 依赖 | 当前状态 |
| --- | --- | --- | --- |
| `plan-0-native-pty-spike.md` | native addon、PTY 行为、清理、deploy 和签名 Go / No-Go 报告 | 无 | 已完成：Go |
| `plan-1-terminal-contracts-and-main-runtime.md` | shared 契约、Terminal Backend、Session Service、Shell Environment | Plan 0 Go | 已完成 |
| `plan-2-preload-and-right-panel-renderer.md` | preload API、xterm 视图、右侧入口、Tab 和响应式交互 | Plan 1 | 已完成 |
| `plan-3-lifecycle-packaging-and-acceptance.md` | 完整生命周期、打包签名、DMG 和文档收尾 | Plan 2 | 已完成 |

## 硬门禁

1. Plan 0 必须输出可审查的 Go / No-Go 证据，不能以“开发态能打开 shell”代替打包与孤儿进程验收。
2. Plan 1 到 Plan 3 不得绕过 Agent Bash 已有审批 / 沙盒 / 后台任务注册表，也不得复用其 taskId 或输出文件作为交互式 Terminal Session。
3. 原“Plan 0 后再次停下确认”的门禁已由用户在 2026-07-30 明确要求“开始执行计划，全部执行完”所替代；实施仍按阶段验证，但无需再次等待聊天批准。

## 全局风险

- 原生 ABI 或签名错误只在打包制品中暴露。
  - 缓解：Plan 0 在任何 UI 实现前验证真实 `.app`。
- 大量输出导致 IPC 风暴、renderer 卡死或内存无界增长。
  - 缓解：批处理 + ACK + 高低水位 + 有界回放同时落地。
- 关闭 Tab 或 App 后遗留 dev server。
  - 缓解：以进程组 / 子孙进程为验收对象，不只检查 PTY 根 PID。
- Finder 启动的 PATH 与开发终端不一致。
  - 缓解：独立 ShellEnvironmentService，不依赖被应用设置污染的 `process.env`。
- renderer 获得通用本机进程启动能力。
  - 缓解：IPC 只接受 `sessionId`、terminalId、输入和尺寸，main 决定 shell / cwd / env。
- 右侧终端与 Agent Bash 在用户心智中混淆。
  - 缓解：不显示 Agent 审批、沙盒标识或 Bash taskId；未来 Agent 输出只能是独立只读对象。

## 全局验收

- 工程：`pnpm typecheck`、`pnpm build`、相关 package Vitest、`pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:repo`。
- native：Electron ABI、架构、addon 加载、`spawn-helper` 权限、nested codesign 和外层 App 签名。
- 运行：真实 Electron 窗口和真实 `.app` / DMG，不以浏览器 mock 或 `pnpm dev` 代替。
- 进程：Ctrl+C、Tab close、session archive、renderer reload 和 App quit 的进程树行为。
- 前端：480 / 820 / 1120 / 1440px，浅色 / 深色 / system-light / system-dark。

## 进度记录

- [x] 2026-07-30：完成 Codex Desktop、Cursor 和 Codex 开源 PTY 的本地调研与方案收敛。
- [x] 2026-07-30：完成长期设计文档和分阶段执行计划。
- [x] 用户批准完整执行计划。
- [x] 执行 Plan 0 并记录 Go 证据。
- [x] 完成 Plan 1 到 Plan 3。
- [x] 完成自动化、正式 `.app` / DMG 和真实 Electron 分层验收。

## 决策记录

- 2026-07-30：采用 Codex-style Electron main Session Manager，不在首版复制 Cursor / VS Code 的独立 PTY Host。
- 2026-07-30：首版从 Cursor 吸收显式 ACK 背压，不等出现卡死后再补。
- 2026-07-30：用户 Terminal 与 Agent Bash 是两个独立执行边界，只共享“App 退出不留孤儿进程”的治理原则。
- 2026-07-30：Phase 0 只证明技术可行性，不自动解锁产品实现。
- 2026-07-30：用户随后明确批准全部计划，Phase 0 Go 后继续正式实现。
- 2026-07-30：xterm 仅依赖 FitAddon；WebLinksAddon 不进入 V1，直到 main 提供窄化且可审计的外部 URL 打开 IPC，避免 renderer 直接导航。
