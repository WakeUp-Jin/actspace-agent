# Plan 1：Terminal 契约与 Electron main 运行时

## 目标

在 Phase 0 `Go` 后，实现不依赖 renderer 的 Terminal 核心运行时：shared IPC 契约、`TerminalBackend`、`LocalNodePtyBackend`、`TerminalSessionService`、`ShellEnvironmentService` 和可验证的进程树清理。

## 准入条件

- Plan 0 结论为 `Go`，且精确依赖版本和 rebuild 路径已记录。
- 用户已明确批准从技术验证进入产品实现。
- 开始前重新读取 `AGENTS.md`、本计划、设计文档、`docs/SECURITY.md`、`docs/RELIABILITY.md` 和 `docs/CODING_BEHAVIOR.md`。

## 修改范围

- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/test/`
- `packages/desktop/src/main/terminal/terminal-backend.ts`
- `packages/desktop/src/main/terminal/node-pty-terminal-backend.ts`
- `packages/desktop/src/main/terminal/terminal-session-service.ts`
- `packages/desktop/src/main/terminal/shell-environment-service.ts`
- `packages/desktop/src/main/terminal/terminal-process-cleanup.ts`
- `packages/desktop/src/main/terminal/test/`
- `packages/desktop/src/main/index.ts`，仅限服务组装、IPC 注册、BrowserWindow 所有权与退出收割

## 实施任务

### Task 1.1：shared 契约

在 `packages/shared/src/ipc.ts` 定义：

- create / attach / list / write / resize / ack / close 输入与结果。
- `TerminalEvent` 判别联合。
- `TerminalErrorCode`、状态和精简 snapshot。
- 尺寸、input 字节数和 ACK 数值的边界常量。

契约不允许 renderer 传 executable、argv、cwd、env 或任意信号。

验证：

- shared build 和契约单测。
- 无效 cols / rows、超大 input、负 ACK 和未知事件的测试。

### Task 1.2：Backend 抽象与 `LocalNodePtyBackend`

- 使用小而完整的 `TerminalBackend` 接口包装 `node-pty`。
- 实现 write、resize、pause、resume、terminate、data / exit 订阅和幂等 dispose。
- 将 native addon 加载失败转为 `native_module_unavailable`，不向 renderer 暴露 require stack 或本机路径。
- 保留未来 UtilityProcess / Remote Backend 的接口边界，不实现投机性代码。

验证：

- fake backend 单测锁定订阅和 dispose 语义。
- native integration 测试复用 Plan 0 spike 中可机械运行的部分。

### Task 1.3：ShellEnvironmentService

- 解析用户默认 shell 和 login-shell 环境。
- 缓存原始用户环境，每次创建 Terminal 时生成独立副本。
- 注入 `TERM=xterm-256color`、`COLORTERM=truecolor`和必要的 ActSpace 非敏感标识。
- 显式过滤 provider keys、access tokens、内部配置变量和不应传递的 Electron 启动变量。
- 日志只记录键数、shell 名和错误类别，不记录值。

验证：

- Finder-like 精简 `process.env` fixture 仍能得到预期 PATH。
- 敏感变量不出现在返回 env 和错误文本中。
- login shell 失败产生可理解、可脱敏的错误。

### Task 1.4：TerminalSessionService

实现：

- `Map<terminalId, TerminalSession>` 和 `Map<sessionId, terminalIds>`。
- 每会话 4 个、每窗口 12 个的运行中上限。
- create 时从 SessionStore / Workspace Registry 解析 workspace，不信任 renderer cwd。
- BrowserWindow / `webContents` 所有权校验。
- attach / detach、activeTerminalId、有界回放、自然 exit、restart 和 close。
- 16ms / 32 KiB 输出批处理、256 KiB 高水位、64 KiB 低水位和 128 KiB 回放缓冲。
- xterm ACK 未返回时暂停 backend，回到低水位后恢复。

验证：

- 所有权拒绝、数量上限、有界回放与 truncated 标记。
- 大量 data 会进入 pause，ACK 后 resume，且字节计数不变为负数。
- attach 期间 exit、close 期间 exit、重复 close 和 BrowserWindow 销毁竞态。
- 多会话 Terminal 数据不串流。

### Task 1.5：IPC 注册与退出收割

- 在 main 注册窄化 IPC handler 与单一 TerminalEvent 推送通道。
- handler 从 IPC event 获取 sender，不接受 renderer 伪造 owner id。
- BrowserWindow 销毁时 detach 或关闭所有所属 Session，策略与设计文档一致。
- `before-quit` 在现有 Bash task harvest 附近收割 Terminal Registry，但两个 registry 保持类型和日志分离。

验证：

- main 层单测覆盖 sender 所有权、销毁和退出。
- Desktop typecheck / build。
- `git diff --check`。

## 本计划验收

- renderer 仍无 Terminal UI，但 main 核心运行时可通过测试和受控 harness 完整验证。
- shared 修改后先 build `@actspace/shared`，再执行 Desktop 测试和 typecheck。
- 所有测试不记录 shell 实际环境值或用户本机绝对路径。
- 本计划通过后更新进度和决策记录，不提前改 renderer。

## 进度记录

- [x] Plan 0 `Go` 并获得正式实现批准。
- [x] shared Terminal 契约与测试。
- [x] Backend 抽象与 native backend。
- [x] ShellEnvironmentService。
- [x] TerminalSessionService 和背压。
- [x] IPC 注册与退出收割。
- [x] Plan 1 自动化验收。

实施结果：main 只接受 session / terminal 句柄、输入与尺寸；Shell、cwd 和脱敏环境由 main 推导。输出按 16ms 聚合并切成不超过 32 KiB 的 IPC 批次，256 / 64 KiB 高低水位控制 node-pty pause / resume，回放上限 128 KiB。单测覆盖所有权、尺寸、输入上限、数量上限、有界回放和 ACK 背压。
