# Plan 3：生命周期、打包与最终验收

## 目标

完成 Terminal 的会话切换、renderer reload、会话归档、BrowserWindow 销毁和 App 退出治理，把 native rebuild / deploy / nested signing 固化到 ActSpace 发布链路，并在真实 Electron 和 `.app` / DMG 中完成最终验收。

## 准入条件

- Plan 2 工程验证、前端主题检查和 Electron 基础验收通过。
- 右侧 Terminal 已能在开发态进行基础输入、输出和 resize，本计划不再扩展产品范围。
- 开始前读取 `docs/RELIABILITY.md`、`docs/SUPPLY_CHAIN_SECURITY.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/HISTORY_GUIDE.md` 和 `docs/QUALITY_SCORE.md`。

## 修改范围

- Plan 1 / Plan 2 已创建的 Terminal 模块与测试
- `packages/desktop/src/main/index.ts`
- 会话归档相关 renderer / main 协调路径
- `packages/desktop/package.json`
- `scripts/release-package.sh`
- 必要的 native artifact 验证脚本
- 本设计文档、执行计划、history、QUALITY_SCORE 和符合写作门槛的 learning

## 实施任务

### Task 3.1：attach / detach 与 renderer reload

- 收起面板、切换 Tab 和切换会话只 detach renderer，不关闭 backend。
- renderer reload 后根据当前会话 list / attach，先回放有界 init log，再继续实时流。
- 只有当前 BrowserWindow 可恢复自己的 Terminal，跨窗口 attach 持续拒绝。
- 连续 reload 不重复订阅、不重复回放、不产生负 ACK。

验证：

- 自动化模拟 detach -> data -> attach -> init log -> live data 顺序。
- Electron 手动 reload 和会话切换，命令继续运行且输出不串流。

### Task 3.2：Tab close、session archive 和 App quit

- Terminal Tab close 执行明确 close，等 main 返回后移除 Tab。
- shell 自然 exit 保留 Tab 和 exit code，Restart 创建新 backend 并更新同一 Tab 绑定。
- 会话归档前关闭该会话全部 Terminal；如关闭失败，阻止归档并显示错误，不保留隐身 shell。
- BrowserWindow 销毁和 App quit 路径收割 Terminal Registry，与 Bash task registry 各自记录计数。
- 检查 shell 后台子孙进程，不只检查根 PTY PID。

验证：

- close / exit / archive / quit 竞态单测。
- 启动可识别的测试 dev server，关闭 Tab 和 App 后用精确 PID 验证其不存在。
- 归档具有运行 Terminal 的测试会话，验证收割成功和失败分支。

### Task 3.3：发布链路固化

- 在 Desktop package scripts 增加确定性 native rebuild 步骤，明确 Electron version / target arch。
- `scripts/release-package.sh` 在 deploy 后检查 `pty.node` / `spawn-helper` 存在、架构和权限。
- Developer ID 和 ad-hoc 都先签名嵌套 native artifact，再签名外层 App；不只依赖 `--deep` 掩盖顺序。
- 签名验证失败时立即中止发布，不生成看似可用的 DMG。
- 新增制品 smoke 检查，能在打包 App 中启动 shell、执行命令并清理进程。

验证：

- arm64 本机 release package。
- native artifacts 的 `file`、权限和 `codesign` 检查。
- 外层 App `codesign --verify --deep --strict --verbose=2`。
- 从 Finder 启动打包 App，验证 PATH 与 Terminal。

### Task 3.4：压力和交互式验收

至少覆盖：

- `pwd`、`git status`、ANSI 颜色、中文和 emoji。
- Ctrl+C、Ctrl+D、选择复制、大段粘贴和链接打开。
- `vim`、Node/Python REPL、`top` 或等价全屏 CLI。
- dev server 长时运行、面板折叠、会话切换、renderer reload 和 Tab close。
- 有界压力输出，观测 pause / resume 和 main / renderer 响应性。
- 4 个同会话 Terminal、12 个单窗口 Terminal 和超限错误。
- 480 / 820 / 1120 / 1440px，浅色 / 深色 / system 两种实际分支。

自动化检查和人工 Electron / DMG 验收分开记录，不用单测通过宣称真实交互式 shell 验收完成。

### Task 3.5：文档、history 和 learning 收尾

- 根据最终实现更新终端设计文档、右侧面板规范、架构导航和执行计划进度。
- 按 `docs/HISTORY_GUIDE.md` 记录实现 history，不写入用户绝对路径、shell 输出或环境变量。
- 对照 `docs/QUALITY_SCORE.md` 更新 Desktop 运行时、安全、测试和发布制品的实际评分变化。
- 本任务同时命中 native addon / PTY / backpressure / process tree 的新概念、可迁移和有陷阱门槛，实现完成后必须读取 `docs/learnings/WRITING_GUIDE.md` 并写学习文档。
- 所有 active plan 验收完成后，按仓库规则移入 completed。

## 最终验收

- Terminal 从当前会话真实 workspace / worktree 启动。
- Agent Bash 行为、审批、沙盒和后台通知没有回归。
- renderer 重载、Tab 切换和会话切换后 Terminal 持续且不串流。
- Tab close、session archive、BrowserWindow 销毁和 App quit 后没有孤儿 shell / dev server。
- 大输出下背压可观测，内存缓冲有界，main / renderer 保持可交互。
- 真实打包 `.app` / DMG 能加载 native addon，嵌套和外层签名通过。
- 自动化与真实 Electron / DMG 验收记录清楚分层。

## 进度记录

- [x] Plan 2 通过。
- [x] attach / detach / reload 恢复。
- [x] Tab close / session archive / App quit 治理。
- [x] native prepare / deploy / nested signing 固化。
- [x] 自动化、Electron 和 DMG 分层验收。
- [x] 文档、history、QUALITY_SCORE 和 learning 收尾。
- [x] 计划归档到 completed。

## 最终证据

- 自动化：Desktop 全量 Vitest、typecheck、production build、主题契约、文档检查、仓库卫生和 `git diff --check` 通过。
- native：正式 ad-hoc release package 精确选择 `darwin-arm64` 预编译目录；`pty.node` 与 `spawn-helper` 单独签名、校验后再签外层应用，成功生成 `.app`、DMG 与 tar archive。
- 真实 Electron：从打包应用创建终端，`pwd` 命中当前会话 workspace；拖动右侧分隔线后 `stty size` 返回新尺寸；浅色与深色终端内容均可读。
- 进程：真实终端运行 `sleep 9876` 后关闭 Tab，精确 PID 不再存在；隔离 spike 另覆盖 Ctrl+C、压力输出、pause / resume、子孙进程和打包应用运行。
- 恢复：renderer 通过 `listTerminals -> attach -> init_log -> data` 恢复当前会话内存终端；旧回放超过 128 KiB 时显示截断提示。
