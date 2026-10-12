# 11 安全与 IPC — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/11-安全与IPC执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-11`，从 `refactor/desktop-frontend@f08802ed`（10 的 squash 提交）拉出
- **开始时间**：2026-10-06 00:40
- **结束时间**：2026-10-06 01:45

## 执行时间线

### T0：重新核对背景

10 执行后，行号已漂移。以下是当前位置（`M` = `apps/desktop/src/main`）。

- **sender 校验（S1）**：做法与计划描述一致，只有位置变化。
  - `M/runtime-v2/desktop-shell-ipc.ts:54-62` 的 `handle()`：`:57` 是 fail-open 判断，`:59` 是远端会话拦截（保留）。
  - `M/runtime-v2/fixed-renderer-ipc.ts`：`isTrustedSender` / `assertTrustedSender` 在 `:948-954`，`setNativeTheme` 监听在 `:333-337`。
  - `M/remote-hosts/ipc.ts:9-11`、`M/runtime-v2/english-learning-ipc.ts:10-11`、`M/performance-ipc.ts:9-12`。
  - 类型不统一：`index.ts` 的 `getMainWindow()` 返回 `BrowserWindow | undefined`，remote-hosts、english-learning、performance 声明的是 `() => BrowserWindow | null`。新函数接受两者。
  - 错误文案各不相同（english-learning 的是中文，面向用户）。`assertTrustedSender` 接受可选的 message，保留各处原来的文案。
- **工作区访问（S2）**：
  - `desktop-shell-ipc.ts:66-68`：list / read / statWorkspaceFile，传入 `options.roots`。
  - `M/workspace-fs-service.ts`：`resolveRoot` 在 `:198`，`toInsideRoot` 在 `:212`，越界判断 `:215` 是 `rel.startsWith("..")`。
  - `fixed-renderer-ipc.ts`：
    - createSession `:174-175`；
    - getWorkspaceGitContext `:597`；
    - createWorkspaceFolder `:598`；
    - showArtifactContextMenu `:619-620`；
    - `workspaceRegistryOptions` `:851-857`（没有 `sessions`）；
    - `registeredWorkspaceRoot` `:859-863`。
  - `M/artifact-context-menu-service.ts:17-19` 的 `isInside` 同样用 `startsWith("..")`。`:26` 的 root 来自 renderer，`:31` 已有 realpath。
- **列出本地会话 `workspaceRoot` 的现成方法**：`runtimeV2Registry.listSessions()`（`M/runtime-v2/runtime-registry.ts:147`）。它返回 `RuntimeV2SessionListItem[]`，每项带 `workspaceRoot: string | null`（`S/runtime-v2/runtime.ts:24`）。T4 的 `listSessionWorkspaceRoots` 就用它。
- **worktree（新发现）**：创建 worktree 会话的 `prepareExecutionContext`（`M/workspace-git-context-service.ts:129`）**在生产代码中没有调用方**，只有测试使用。目前从应用里创建不出 worktree 会话。
  - 允许集合仍按计划决定包含会话的 `workspaceRoot`：这能兼容旧数据和以后接入的 worktree，也不放宽 registry 以外的任意路径。
  - T5 的「worktree 会话冒烟」改为：用 `setSessionWorkspace` 或单测构造的会话路径来验证，并在交接文档中说明。
- **窗口（S3）**：
  - `BrowserWindow` 在 `M/index.ts:135-155` 的 `createMainWindow`：`contextIsolation: true`、`nodeIntegration: false`，没有 sandbox；`closed` 在 `:153`。
  - main 中仍然没有 `setWindowOpenHandler`、`will-navigate`、`will-attach-webview`。
  - `shell.openExternal`：`desktop-shell-ipc.ts:122`（PR URL）、`artifact-context-menu-service.ts:60`（`cursor://`，非 darwin 分支）。`open -a Cursor` 在 `:51-58`；`open -a "Google Chrome"` 在 `fixed-renderer-ipc.ts:713`。
  - **renderer 的外链**：`MarkdownProse.tsx:20` 和 `MarkdownRenderView.tsx:39`、`ToolLogLine.tsx:200` 都用 `target="_blank"`。现在点击外链，Electron 会默认新开一个应用内窗口。T7 之后改由 `setWindowOpenHandler` 拒绝并交给系统浏览器。这是计划中的预期变化，交接文档会写为用户可感知的变化。
- **生命周期（S5）**：
  - `before-quit` 在 `M/index.ts:316-345`。
  - `terminal-session-service.ts:294` 的 `closeOwner` 仍然没有调用方。
  - `app.on("activate")` 在 `:304`，Dock 重开时会重新创建窗口。
  - **`LocalUpdateService` 与计划的出入（偏差）**：它唯一的子进程是更新脚本（`local-update-service.ts:473-478`，`detached: true`）。这个脚本**必须**比应用活得久，因为它要等应用退出后替换 `.app`，再重新打开。dispose 不能终止它，否则更新会失败。
    - 它需要清理的只有 `readinessTimer`（`:46`、`:177`，一个 `setInterval`）。
    - 因此 T3 中「子进程被终止」只适用于 browser bridge。update service 的 dispose 改为断言：定时器被清除，调用两次不报错，不会 kill 更新脚本。
  - `BrowserBridgeService` 的子进程来自 `runCommand`（`:723-775`），都是短命令，自带超时 SIGKILL，没有登记在实例上。T3 中给它加一个在途子进程集合，dispose 时终止，之后拒绝新命令。
  - 全局异常处理仍然没有。`logMain` 在 `:125-129`，依赖 `startupLogPath`；`ACTSPACE_LOG_STDERR=1` 时也写 stderr。

### T1：统一 sender 校验（S1）

- 新增 `M/ipc/trusted-sender.ts`：
  - `isTrustedSender(event, window)`：窗口存在、未销毁、`sender === window.webContents`，并且 `senderFrame` 非空、等于 `window.webContents.mainFrame`，才返回 true。
  - `assertTrustedSender(event, getWindow, message?)`：不可信就抛错。message 可选，用来保留各处原有的错误文案。
- 接线：
  - `desktop-shell-ipc.ts`：原来没有窗口时整段跳过（fail-open），现在拒绝。`getMainWindow` 选项从可选改成必填，因为 fail-closed 之后不传就等于所有 handler 都不可用。`index.ts` 本来就传了。
  - `fixed-renderer-ipc.ts`：删掉本地的 `isTrustedSender` / `assertTrustedSender`。原来只比较 `sender.id`，现在同时比较 webContents 对象和 mainFrame。`setNativeTheme` 的 `ipcMain.on` 也改用共用的 `isTrustedSender`。
  - `remote-hosts/ipc.ts`、`english-learning-ipc.ts`、`performance-ipc.ts`：改为调用 `assertTrustedSender`，文案不变。
- 测试：
  - 新增 `M/test/ipc-sender-fixture.ts`（不是测试文件），`trustedWindow()` 返回一个假窗口和来自它 mainFrame 的事件。
  - 4 个 fixed-renderer 测试（chat-admission、run-references、task-command、workspace-picker）原来用 `{ sender: { id: 7 } }` 伪造来源，在新规则下会被拒绝，改用这个 fixture。task-command 中「其他来源被拒绝」的断言保留。
  - `performance-ipc.test.ts` 的假窗口补上 `isDestroyed`。
  - 新增 `M/test/trusted-sender.test.ts`（8 个用例）：主窗口 mainFrame 放行；没有窗口、null 窗口、已销毁窗口、id 相同但不是同一个 webContents、子 frame、缺失 frame、已释放 frame（null）都拒绝。
  - `runtime-v2-desktop-shell-ipc.test.ts` 新增「`getMainWindow` 返回 undefined 时 handler 拒绝」。
- 验证：
  - typecheck 通过；全量测试 135 通过 / 1 已知失败，用例 998 通过（+9）。
  - main 中除测试外，`senderFrame` / `sender !==` 只出现在 `ipc/trusted-sender.ts`。
  - **Electron 实测**（完整 build，临时数据目录）：fixed（`getSettings`）、shell（`listWorkspaces`）、Host（`actspaceHosts.list`）、performance（`setPerformanceActive` + `samplePerformance`）、english-learning（`getEnglishLearningState`）五类调用全部成功，主进程日志没有拒绝记录（`screenshots/t1-main.png`）。这说明真实 Electron 中 `event.senderFrame === win.webContents.mainFrame` 的对象比较成立，严格规则没有误伤主窗口。

### T2：关窗时销毁该窗口的终端（S5 第一步）

- 新增 `M/main-lifecycle.ts`，提供 `attachWindowLifecycle(win, { onClosed, closeOwnedTerminals, log })`：
  - 挂接时先保存 `win.webContents.id`，因为 `closed` 触发时 webContents 已经销毁；
  - `closed` 时先执行 `onClosed`（清空 `mainWindow`），再用保存的 id 调用 `closeOwnedTerminals`；
  - 清理失败时只写日志，不抛错。
- `M/index.ts` 的 `createMainWindow`：改为在 `mainWindow = win` 之后、加载页面之前挂接，避免页面加载失败时漏掉清理。原来的 `closed` 监听在加载之后才注册。`closeOwnedTerminals` 调用的是 `terminalSessionService?.closeOwner(ownerId)`，没有 node-pty 时什么都不做。
- `terminal-session-service.ts` 不需要改，`closeOwner` 已经存在，只是一直没有调用方。
- 测试：
  - 新增 `M/test/main-lifecycle.test.ts`：先把 webContents 换掉再触发 closed，`closeOwnedTerminals` 收到的仍是挂接时的 id；清理失败时写日志。
  - `terminal/test/terminal-session-service.test.ts` 新增「closeOwner 只关闭该 owner 的终端」：owner 7 有 2 个终端、owner 8 有 1 个，`closeOwner(7)` 后只有前两个 backend 被 kill。
- **Electron 实测**：
  - 建会话，开终端（pty 是 `zsh -l`，pid 35859，父进程是 Electron 主进程）。
  - 用 CDP 执行 `window.close()`：主进程仍在（macOS 关窗不退出），页面 target 消失，`ps -p 35859` 已经找不到该进程。主进程日志中没有 cleanup failed。
  - 从 Dock 重开需要交给验收。
  - 顺带发现：renderer 进程的启动参数里已经有 `--enable-sandbox`（Electron 39 默认开启 sandbox）。T7 中显式写 `sandbox: true` 是固化现状，不是改变行为。
- 验证：typecheck 通过；全量测试 136 通过 / 1 已知失败，用例 1001 通过（+3）。（T2 提交时误写为 137，在 T3 中更正。）

### T3：服务 dispose 与主进程错误日志（S5 第二步）

- `M/browser-bridge-service.ts`：
  - 模块函数 `runCommand` 新增可选参数 `active`：spawn 后把子进程放进集合，`exit` / `error` 时移出。
  - 类内新增私有 `run()`，4 个调用点（info、tabs、bash 构建、`runAbbAt`）都改走它。dispose 之后 `run()` 直接返回 `Browser Bridge 已关闭`，不再 spawn。
  - 新增幂等的 `dispose()`：标记已关闭，SIGKILL 所有在途子进程，清空集合。
- `M/local-update-service.ts`：新增 `dispose()`，只清 `readinessTimer`。按 T0 的记录，更新 helper 是 detached 进程，要在应用退出后接着替换应用，不能终止（与计划「子进程被终止」的偏离已在 T0 登记）。
- `M/main-lifecycle.ts`：新增 `installProcessErrorLogging(log, target = process)`，返回解除函数。
  - `unhandledRejection` 直接监听并写日志。
  - 异常监听的是 `uncaughtExceptionMonitor`，没有监听 `uncaughtException`。原因是注册 `uncaughtException` 会替换 Electron 的默认处理（弹出主进程错误对话框）。monitor 事件只观察，不改变行为。这是实现细节上的收窄，计划的目标「主进程异常有日志」不变。
- `M/index.ts`：
  - 模块顶层尽早调用 `installProcessErrorLogging`。`startupLogPath` 已就绪时走 `logMain`，否则写 stderr。日志行格式抽成 `formatLogLine`，与 `logMain` 共用。
  - `before-quit` 中，在 `terminalSessionService?.disposeAll()` 之后调用 `browserBridgeService?.dispose()` 和 `localUpdateService?.dispose()`。
- 测试：
  - `browser-bridge-service.test.ts`：fixture abb 在 `help` 时写下自己的 pid 并 `exec sleep 30`。`installFromFile` 不 await，等 pid 文件出现后连续调用两次 `dispose()`。断言安装结果为失败、`process.kill(pid, 0)` 抛错（进程已不存在），之后再安装直接返回「已关闭」。
  - `local-update-service.test.ts`：`start()` 后连续两次 `dispose()`，再把状态写成 `ready_to_replace`。断言 `onReadyToReplace` 没被调用（轮询已停），helper 的 `kill` 没被调用。
  - `main-lifecycle.test.ts`：用 EventEmitter 触发两类事件，log 被调用，解除后不再记录；再在真实 `process` 上注册，`process.emit("unhandledRejection", …)` 后 log 被调用，解除后监听数恢复。
- 验证：
  - typecheck 通过；全量测试 136 通过 / 1 已知失败，用例 1005 通过（+4）。
  - **Electron 实测**（完整 build，临时数据目录）：建会话并开终端，主进程的子进程有 3 个 Electron helper、`/bin/zsh -l`、git。用 `pkill -f`（SIGTERM，Electron 会走正常退出，触发 `before-quit`）退出后，主进程退出，以上子进程全部消失。日志最后一条是 `terminal closed`，没有 `shutdown incomplete`，也没有 `main process` 错误记录。
  - 临时数据目录里没有安装 abb，所以 Browser Bridge 在途子进程的终止只由单测覆盖。

### T4：工作区访问入口（S2 核心）

- 新增 `M/workspace-access.ts`：
  - `resolveWorkspaceAccess(input, { readRegistry, listSessionWorkspaceRoots })`：
    - 没传 root 时用 registry 的默认工作区。
    - 请求的路径先 realpath，失败（不存在）就拒绝。
    - 允许集合是 registry 的所有 `path` 加上本地会话的 `workspaceRoot`（worktree 会话就是 worktree 路径），每一项也先 realpath。
    - 请求路径等于其中某一项或在它下面才放行，返回 realpath 后的 root；否则抛 `WorkspaceAccessError`（`code = "workspace_not_registered"`）。
    - 允许子目录，是计划中没写明的取舍：子目录仍在登记过的范围内，不扩大可访问面；而且 realpath 之后，指向外部的 symlink 依然会被拒绝。
  - `isPathInside(parent, child)`：用 `path.relative` 判断，`rel === ".."` 或以 `../` 开头、或是绝对路径才算越界，`..foo` 不算。fs 服务和 T5 的右键菜单共用它。
  - `realpathOrNull(path)`：realpath 失败返回 null。
- `M/workspace-fs-service.ts` 的 `toInsideRoot` 改为异步：
  - root 先 realpath，再按词法判断是否越界；
  - 目标存在时再 realpath 一次，落到 root 外（symlink 逃逸）就算越界；
  - 目标不存在时只做词法判断，交给调用方报 `not_found`；
  - 返回的 `rel` 仍是请求时的相对路径（相对 realpath 后的 root），renderer 看到的路径不变。
  - 3 个调用点改为 `await`。
- 测试：
  - 新增 `M/test/workspace-access.test.ts`（8 个用例）：
    - registry 的 root 和子目录允许，返回 realpath；
    - 不传 root 时用默认工作区；
    - `/`、home、registry 外的目录、`root/..` 拒绝；
    - registry 内指向外部的 symlink 拒绝；
    - 通过 symlink 别名访问已登记目录允许；
    - 只在会话里出现的 worktree 路径允许；
    - 不存在的路径拒绝；
    - `isPathInside` 对 `..foo`、`..`、`/wx` 的判断。
  - `workspace-fs-service.test.ts` 新增 2 个用例：
    - 指向外部的目录 / 文件 symlink 在 list、read、stat 中都返回 `escapes_root`，指向内部的 symlink 照常读取；
    - 名为 `..foo` 的文件可以读和 stat（改动前会被误判为越界）。
- 验证：typecheck 通过；全量测试 137 通过 / 1 已知失败，用例 1015 通过（+10）。
- 这一步还没有接线，IPC 行为要到 T5 才变化。Electron 冒烟放在 T5 一起做。

### T5：工作区访问接线（S2）

- **对 T4 的两处收紧**（对照 01 P0-1 原文复核后调整）：
  - `resolveWorkspaceAccess` 从「等于或在 registry / 会话 root 下面」改为**等于**某一项（双方 realpath 后比较）。01 原文是「必须等于」；渲染端传的都是工作区根，子目录放行没有调用方需要，只会扩大可访问面。T4 的子目录用例改为断言拒绝。
  - `toInsideRoot` 改为对**最近存在的祖先**做 realpath（新增 `realpathOfNearestExisting`），与 01 第 2 步一致。T4 的版本在目标不存在时只做词法判断，`escape/missing.txt` 会返回 `not_found` 而不是 `escapes_root`，从而泄露 root 外的文件是否存在。新增用例覆盖。
  - 会话列表只在 registry 没命中时才读（新增用例断言次数）。
- `M/workspace-access.ts` 新增共用函数：`workspaceRegistryOptions(roots)`、`createWorkspaceAccessDeps(registryOptions, listSessions)`（运行时没 boot 或出错时当作没有会话）、`registeredWorkspaceRoot(options, requested)`。`fixed-renderer-ipc.ts` 和 `desktop-shell-ipc.ts` 各自的 `workspaceRegistryOptions`，以及 fixed 的 `registeredWorkspaceRoot`，都改为从这里导入（「收敛到新入口」）。
  - `registeredWorkspaceRoot` 仍然只认 registry、返回条目原文而不是 realpath：它的调用方（`setSessionWorkspace`、git 写操作、`createSession`）会把路径写进会话，侧栏按这个字符串分组。
- 接线：
  - `desktop-shell-ipc.ts`：list / read / statWorkspaceFile 先经 `resolveWorkspaceAccess`，把 realpath 后的 root 交给 fs 服务；不允许时抛错（renderer 的调用方本来就有 catch）。`ShellOptions` 新增必填的 `listSessions`，`index.ts` 传 `runtimeV2Registry?.listSessions() ?? []`。
  - `fixed-renderer-ipc.ts`：
    - `getWorkspaceGitContext`：先 `resolveWorkspaceAccess`。
    - `showArtifactContextMenu`（`workspace_file`）：root 不允许时返回 `{ shown: false, error: "invalid_target" }`，与解析失败的现有返回一致。
    - `createSession`：改用 `registeredWorkspaceRoot` 严格校验（未登记时抛 `workspaceRoot is not registered`）。
    - `createWorkspaceFolder`：`parentRoot` 必须是已允许的工作区，**或者**是用户刚通过 `selectWorkspaceDirectory`（不登记模式）在系统对话框里选的目录。后者只能用一次。不满足时返回 `{ ok: false, error: "workspace_not_registered" }`，不建目录。
      - 计划写的是「先校验 parentRoot」。但现有 UI 的「新建文件夹工作区」流程是：先用对话框选一个父目录（不登记），再建子文件夹。父目录通常不在 registry 里，只校验 registry 会让这个功能失效。对话框的选择发生在 main 进程，renderer 伪造不了，所以「用户刚选过」可以作为授权依据。
  - `artifact-context-menu-service.ts`：删掉本地的 `isInside`，改用共用的 `isPathInside`。
- 测试：
  - `runtime-v2-workspace-picker.test.ts` 新增 3 个用例：
    - `createSession` 传未登记的 root 被拒绝，`createSession` 不会被调用；传登记过的 root 正常创建。
    - `createWorkspaceFolder` 传未登记的父目录被拒绝且不建目录；对话框选过之后可以建；同一个目录第二次被拒绝。
    - `getWorkspaceGitContext` 传 `/` 被拒绝；右键菜单传未登记的 root 返回 `invalid_target`。
  - `runtime-v2-desktop-shell-ipc.test.ts` 新增 1 个用例：登记过的 root、默认 root、会话里的 worktree root 都可以读；未登记的目录和 `/` 在 list / read / stat 中都被拒绝。原有 2 个用例补上 `listSessions`。
  - `workspace-access.test.ts` 改 1 个、增 1 个；`workspace-fs-service.test.ts` 补「不存在的目标经 symlink 指向外部」的断言。
- 验证：
  - typecheck 通过；全量测试 137 通过 / 1 已知失败，用例 1020 通过（+5）。
  - **Electron 实测**（完整 build，临时数据目录；registry 中有默认工作区 `~/Downloads` 和仓库目录。只用仓库目录做冒烟，没有碰 Downloads）：
    - 允许：仓库目录的 list（36 项）/ read / stat、git context（`ready`）、`createSession`、Review 快照全部正常。
    - 拒绝：`../x` → `escapes_root`；list `/`、read `/etc/hosts`、git context `/` → `workspace_not_registered`；`createSession({ workspaceRoot: "/tmp" })` → `workspaceRoot is not registered`；`createWorkspaceFolder({ parentRoot: "/tmp" })` → `workspace_not_registered`，`/tmp/fe11-should-not-exist` 没有被创建；右键菜单 `/etc` → `invalid_target`。
    - UI：主界面、分支选择器、右侧文件树、`SECURITY.md` 预览正常（`screenshots/t5-main.png`、`t5-file-tree.png`、`t5-file-preview.png`）。
    - 主进程日志中的 `WorkspaceAccessError` 都来自上面故意发出的越界调用。
  - **worktree 会话**：生产代码里创建不出 worktree 会话（T0 记录），所以「会话 root 不在 registry 也能读」只由单测覆盖（shell IPC 用例和 `workspace-access` 用例）。已写进交接文档的待验收项。
  - 「新建文件夹工作区」的对话框需要人工点选，交给验收。

### T6：外部打开动作收口（S3 第一步）

- 新增 `M/platform-actions.ts`：
  - `isSafeExternalUrl(value)`：能用 `new URL` 解析成绝对 URL，且协议是 `https:`、`http:` 或 `mailto:`，才返回 true。
  - `openExternalSafely(url, open = shell.openExternal)`：不安全时不打开，返回 false；`open` 可注入，方便测试。
  - `openInCursor(realPath)`：从 `artifact-context-menu-service.ts` 原样搬来。macOS 用 `open -a Cursor`，其他平台拼 `cursor://file…` 后直接调用 `shell.openExternal`。`cursor:` 故意不在白名单里，URL 只能由 main 用已经校验过的路径拼出。
- 接线：
  - `desktop-shell-ipc.ts` 的 PR 创建：`shell.openExternal(result.url)` 改为 `openExternalSafely(result.url)`。URL 来自 `gh pr create` 的输出，正常情况下是 https，不受影响。
  - `artifact-context-menu-service.ts`：删掉本地的 `openInCursor` 和不再使用的 `spawn` 导入，改为从 `platform-actions` 导入。
  - main 中除测试外，`shell.openExternal` 只出现在 `platform-actions.ts`。
- 没有改的：`workspace-ide-service.ts` 的 `open -a Cursor <工作区路径>`（路径来自 registry 条目，T5 之前就是这样）；`fixed-renderer-ipc.ts` 的 `open -a "Google Chrome" chrome://extensions`（参数是固定字符串，没有外部输入）。
- 测试：新增 `M/test/platform-actions.test.ts`（13 个用例）：`https:`、`http:`、`mailto:` 允许并调用 `open`；`file:`、`javascript:`、`cursor:`、`chrome:`、绝对路径、相对路径、无法解析的字符串、空串、`undefined`、数字拒绝，`open` 没有被调用。
- 验证：typecheck 通过；全量测试 138 通过 / 1 已知失败，用例 1033 通过（+13）。
- Electron：创建 PR 会真实推送，Cursor 菜单需要人工点击，所以都没有实测。`openExternalSafely` 的真实路径由 T7 的外链冒烟覆盖。

### T7：窗口导航防护和 sandbox（S3）

- 新增 `M/window-security.ts`：
  - `createMainWindowOptions({ preload, title })`：原来 `index.ts` 中的窗口参数原样搬过来，`webPreferences` 增加 `sandbox: true` 和 `webviewTag: false`。T2 已确认 Electron 39 默认开启 sandbox，所以这一步是把现状写死，不改变行为。
  - `createAppUrlMatcher({ devServerUrl, indexHtmlPath })`：
    - dev：只认 dev server 的 origin。
    - 生产：只认 `dist/index.html` 这个 file URL，query 和 hash 不影响判断。同目录下的其他文件和 `/etc/passwd` 这类 file URL 都不算。
  - `attachNavigationGuards(win, isAppUrl, openExternal = openExternalSafely)`：
    - `setWindowOpenHandler` 一律返回 deny，URL 交给 `openExternal`。`openExternalSafely` 只放行 http(s) / mailto，其余丢弃。
    - `will-navigate` 遇到非 app URL 时 `preventDefault`，再交给 `openExternal`。
    - 打开失败时吞掉 rejection，避免触发 T3 的全局日志。
  - `blockWebviewAttachment(app)`：`web-contents-created` 时给每个 webContents 挂 `will-attach-webview` → `preventDefault`。
- `M/index.ts`：
  - `createMainWindow` 改用 `createMainWindowOptions`。在 `mainWindow = win` 之后、加载之前挂导航防护。`dist/index.html` 路径提成变量，加载和 matcher 共用。
  - 模块顶层调用 `blockWebviewAttachment(app)`。
- 范围说明：`will-navigate` 只管顶层 frame。HTML 预览的 iframe 是 `sandbox="allow-scripts"`，没有 `allow-top-navigation` 和 `allow-popups`，所以它既不能让主窗口跳转，也不能弹窗；它内部链接的跳转只发生在 iframe 内。这是 T9 CSP 实验要观察的对象，T7 不处理。
- 测试：
  - 新增 `M/test/window-security.test.ts`（8 个用例）：
    - 窗口参数中 `sandbox`、`contextIsolation`、`webviewTag` 的取值。
    - matcher 的生产模式：index 带 query / hash 允许；其他 file URL、https、无法解析的字符串拒绝。
    - matcher 的 dev 模式：同 origin 允许；端口不同、`localhost`、file URL 拒绝。
    - 新窗口一律 deny 并交给 opener。
    - 外部导航被取消；app 内导航放行，并且不交给 opener。
    - opener 抛错时不产生 unhandledRejection。
    - 默认 opener 丢弃 `javascript:` 和 `file:`，只打开 https。
    - `will-attach-webview` 被阻止。
  - `runtime-v2-preload-bundle.test.ts`：增加断言，bundle 中所有 `require(...)` 的集合只有 `electron`。本次构建产物 `dist-electron/preload/index.bundle.js` 用 grep 复核，结果相同。
- 验证：
  - typecheck 通过；全量测试 139 通过 / 1 已知失败，用例 1041 通过（+8）。
  - **Electron 实测**（完整 build，临时数据目录）：
    - renderer 进程的启动参数中有 `--enable-sandbox`。
    - 页面中 `typeof require`、`typeof process` 都是 `undefined`。
    - `window.open('file:///etc/hosts')`、`window.open('javascript:alert(1)')` 都返回 null，没有新的 page target（CDP 列表仍只有 1 个 page）。
    - 用 `<a href="file:///etc/hosts">` 点击触发顶层导航后，地址仍是 `dist/index.html`。
    - 这几个 URL 都会被 `openExternalSafely` 丢弃，所以测试过程中没有打开系统浏览器。
    - 重新加载后，fixed（`getSettings`）、shell（`listWorkspaces`）、Host、performance、english-learning 五类调用全部成功，主界面正常（`screenshots/t7-main-after-reload.png`）。主进程日志没有新的错误。
  - **用户可感知的变化**（写进交接文档）：消息中 `target="_blank"` 的外链，原来会在应用内新开一个 Electron 窗口，现在改为在系统默认浏览器中打开。真实的 https 外链点击需要人工验收（为了不在用户机器上弹浏览器，这次没有实测）。

### T8：IPC channel 审计脚本（S4）

- 新增 `scripts/check-ipc-channels.mjs`，根 `package.json` 新增 `check:ipc-channels`。
  - 常量来源：`RUNTIME_V2_FIXED_RENDERER_CHANNELS`（142 个）、`PERFORMANCE_CHANNELS`（2 个）、`ENGLISH_LEARNING_CHANNELS`（5 个）、`HOST_IPC`（11 个），共 160 个。`HOST_IPC` 实际定义在 `S/host-protocol/connections.ts`，计划写的是目录 `S/host-protocol/`。
  - 扫描范围：`apps/desktop/src/main` 和 `apps/desktop/src/preload` 下除 `test/` 和 `*.test.*` 以外的 ts 文件。
  - main 侧区分「注册」和「发送」：
    - 注册：`handle(`、`handleOnce(`（包括各文件包了一层的本地 `handle`）、`ipcMain.on(`、`ipcMain.once(`。不认裸的 `.on(`，以免把 `win.on("closed")` 当成 channel。
    - 发送：`.send(`、`#send(`、`send(`。
    - 第一个参数按「常量名.key」「别名.key」（例如 english-learning 的 `const channels = ENGLISH_LEARNING_CHANNELS`）或字符串字面量匹配。
  - preload 侧：只要引用了常量（常量名.key、别名.key 或字符串值）就算。fixed channel 经由 `FIXED_RENDERER_INVOKE_CHANNELS` 映射表引用，同样能匹配到。
  - 三种失败：
    1. 常量在 main 中既没有注册也没有发送；
    2. main 注册或发送了，但 preload 没有引用；
    3. main 用字面量注册或发送了常量表之外的 channel。
  - 计划写的是「每个 invoke 类 channel 都在 main 注册、在 preload 被引用」。脚本把事件类 channel（main 发送、preload 监听）也纳入同一规则，范围是计划的超集。当前仓库全部通过。
  - 导出 `parseChannelConstant`、`auditIpcChannels`、`runCheck`，供单测使用。
- 新增 `scripts/test/ipc-channels.test.mjs`（6 个用例）：
  - 解析带和不带 `Object.freeze` 的常量；
  - 一致时通过（别名和字符串值都能匹配，`win.on("closed")` 不算 channel）；
  - 三种失败各一例；
  - 仓库本身通过。
- **对真实源码做变异验证**（一次性脚本，没有提交）：
  - 把 `fixed-renderer-ipc.ts` 中 `listSkills` 的注册改成别的常量名 → 报「在 main 中没有注册，也没有发送」；
  - 从 preload 映射表删掉 `skills:list` → 报「在 main 中注册了，但 preload 没有引用」；
  - 不做变异时 0 处。
- 验证：`pnpm check:ipc-channels` 通过（160 个 channel）；`node --test scripts/test/ipc-channels.test.mjs` 6/6 通过；`pnpm check:current-docs` 通过。

### T9：主文档 CSP 实验（只记录，J1 = A）

没有改任何源码。临时改动全部已撤销：`git diff apps/desktop/index.html` 为空，`tmp/csp-probe.html` 和 `/tmp/csp-exp` 已删除，dist 已重新构建（不含 CSP）。

实验用的严格策略：

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'
```

**实验一：独立 Electron 39 小程序**（`/tmp` 下的一次性脚本，sandbox + contextIsolation，每个变体单独一个进程）

| 变体 | `onHeadersReceived` 看到 | srcdoc iframe 内联脚本（普通 / `sandbox="allow-scripts"` 且自带宽松 meta CSP） | `style="…"` 属性 | 动态插入 `<style>` |
| --- | --- | --- | --- | --- |
| 无 CSP | `mainFrame:nocsp.html`、`script:app.js` | 都执行 | 生效 | 生效 |
| meta CSP | `mainFrame:index.html`、`script:app.js` | **都不执行** | **被拦** | **被拦** |
| 无 meta，`onHeadersReceived` 给 mainFrame 注入 CSP 响应头 | 同上 | **都不执行** | **被拦** | **被拦** |

结论：

- `onHeadersReceived` 对 file:// 的主文档和子资源都会触发；注入的 CSP 头会生效，效果和 meta 完全一致。以后要上 CSP，可以在 main 里注入头，不必写进 `index.html`。
- `script-src 'self'` 在 file:// 下放行同目录的脚本（`./app.js`），Vite 产物的 `<script type="module" crossorigin>` 不受影响。
- srcdoc iframe 继承父文档的 CSP，iframe 自己的 meta CSP 只能再收紧，不能放宽（多条策略同时生效）。`sandbox` 不改变这一点。
- 上次组合运行时的 `ERR_FAILED` 是同进程内连续加载、换 partition 造成的干扰；每个变体单独一个进程后不再出现，和 CSP 无关。

**实验二：真实应用**（`index.html` 临时加上面的 meta，完整 build，临时数据目录，CDP）

- 启动：主界面正常，CDP 抓到 0 条 error / warning。React 的 `style` prop 通过 CSSOM 写入，不受 `style-src` 限制（页面上 63 个带 style 的元素都没有报违规）。截图：`screenshots/t9-strict-csp-boot.png`。
- HTML 预览：在文件树打开 `tmp/csp-probe.html`（含 `<style>`、`style` 属性、内联脚本）。标题仍是「CSP probe」，即内联脚本没有执行；`<style>` 和 `style` 属性都没有生效。`HtmlRenderView` 自己注入的主题基线 `<style>` 和桥脚本也在同一个 srcdoc 里，同样会被拦。截图：`screenshots/t9-strict-csp-html-preview.png`。
- 代码预览（查看源码）：highlight.js 只输出 class，不受影响。
- mermaid（替代探针，因为 mermaid 只出现在对话里、需要模型）：用 `innerHTML` 插入带 `<style>` 的 SVG，与 `MermaidDiagramBlock` 的 `dangerouslySetInnerHTML` 写法相同 → 样式没有生效，控制台报 `Applying inline style violates … 'style-src 'self''`。mermaid 渲染出的 SVG 自带 `<style>`，所以会失去样式。
- 图片：`data:` 图片正常加载（策略里放行了 `data:`）。

**对后续的意义**（T10 写进 `SECURITY.md`「待补强」和 `tech-debt-tracker.md`）：

- 严格 CSP 会直接破坏两处功能：HTML 预览（内联脚本、样式、桥脚本都失效）和 mermaid 图的样式。
- 要上严格 CSP，需要先做：
  1. HTML 预览改为不继承主文档策略的加载方式（计划中的方案 C：自定义协议）；
  2. mermaid 的样式改走 `style-src` 允许的路径（nonce / hash，或者把 SVG 放进同样隔离的预览里）。
- 做完这两项后，CSP 可以由 main 用 `onHeadersReceived` 注入，不必改 `index.html`。

### T10：安全文档、技术债和设计文档

- `docs/SECURITY.md`：
  - 「Electron 进程隔离」补充：显式 sandbox / webviewTag、sender 校验 fail-closed、`check:ipc-channels`、导航防护、外部打开白名单、主文档暂无 CSP、生命周期清理。
  - 「文件系统访问控制」补充工作区访问入口：精确等于 registry 或会话 root 的 realpath、`createSession` / `createWorkspaceFolder` 的规则、realpath 包含判断。
  - 「待补强」：原「Bash 工具子进程环境变量白名单」扩展为子进程环境变量白名单（C1 清单）；新增主文档 CSP（T9 结论和前置条件）。
- `docs/exec-plans/tech-debt-tracker.md` 新增「Desktop 安全遗留」：C1（继承 Key 的子进程清单）和主文档 CSP 两条。
- 01 设计文档：P0-1、P0-2、P0-3、P0-4、P1-6、§4 审计脚本各加「已在 11 执行」说明，并更正背景：
  - `workspace-open-service`、`workspace-environment-service` 的 IPC 入口在 11 之前就已经用 registry 校验，没有 P0-1 说的越界问题；
  - SSH 隧道已由 `remoteHosts.dispose` 关闭；
  - 「React inline style 需要 `'unsafe-inline'`」的判断不成立（CSSOM 不受限制），真正的阻碍是 srcdoc 继承和 mermaid `<style>`。
- 验证：`pnpm check:current-docs` 通过。

### 收尾

- **完整验证**（T10 之后）：
  - shared / desktop typecheck 通过；
  - desktop test：文件 139 通过 / 1 失败 / 1 跳过，用例 1041 / 1 / 2。唯一失败是基线中已知的 `workspace-git-context-service`。与 10 结束时（134 / 1 / 1、989 / 1 / 2）相比，新增 5 个测试文件、52 个用例；
  - `check:frontend-tokens`、`frontend-design-tokens.test.mjs`（5/5）、`check:ipc-channels`（160 个 channel）、`ipc-channels.test.mjs`（6/6）、`check:current-docs` 通过。
- **Sonnet 只读复核**（读 `refactor/desktop-frontend...HEAD` 的 diff、计划和 01）：sender 校验、路径包含、openExternal 白名单、URL 匹配、dispose 都没有问题。7 条发现的处理：

  | # | 发现 | 处理 |
  | --- | --- | --- |
  | 1 | `listSkills` 仍直接使用 renderer 传来的 `workspaceRoot`，可以列出任意目录下 `.claude/skills` 等处的 SKILL.md 名称和描述 | **已修**：传了 root 时走 `resolveWorkspaceAccess`，不传时仍用默认工作区。Composer 已有错误处理（显示「加载 Skills 失败」） |
  | 2 | `installBrowserBridgeFromRepo` 在 renderer 传来的目录里运行构建脚本 | 不在 11 范围内，改 UI 交互（由 main 弹对话框）。记入技术债和 `SECURITY.md`「待补强」 |
  | 3 | `pickedParentDirectories` 在名字校验前就被消费，名字不合法时用户重试会被拒；选过的目录一直有效 | **已修**：改为只记最近一次选择；建成功后才作废。现有 UI（`App.tsx` 的 `handleCreateWorkspaceFolder`）每次都先弹对话框再创建，所以原问题在界面上不可见，修复是为了让 main 侧的规则本身合理 |
  | 4 | `fs.promises.realpath` 不规范大小写，macOS 上可能误拒 | **不成立**：实测 `fs.promises.realpath("/users/…/desktop")` 返回 `/Users/…/Desktop`（只有 JS 实现的 `realpathSync` 不规范） |
  | 5 | 只拦 `will-navigate`，没有 `will-redirect` / `will-frame-navigate` | 不改：生产从 file:// 加载没有服务端重定向；子 frame 只有 sandbox 的 srcdoc 预览，`SECURITY.md` 写的就是「顶层导航」 |
  | 6 | `before-quit` 中两个 dispose 排在可能抛错的异步清理之后 | **已修**：移到 `finally` |
  | 7 | 审计脚本不检查 sender 校验、不区分 invoke / on | 记入技术债，随 13 的统一注册器和 contract 处理 |

- 修复的测试：`runtime-v2-workspace-picker.test.ts` 新增「名字不合法后可重试、后一次选择覆盖前一次」，并在拒绝用例中加入 `listSkills`。两条在旧代码上都失败，修复后通过（10/10）。
