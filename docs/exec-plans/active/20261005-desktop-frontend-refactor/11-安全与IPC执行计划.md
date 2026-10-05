# 11 安全与 IPC 执行计划

> 状态：**已批准**（2026-10-06），按 [00](00-总执行计划.md) 的顺序执行；进度见本文「进度记录」和 00 §11。
> 总计划：[00 总执行计划](00-总执行计划.md)。执行顺序第 2 位，排在 10 之后。
> 设计来源：[01 安全与 IPC 收口](../../../desktop-frontend-refactor/01-安全与IPC收口.md) S1–S5，外加 S7 的前置核实（只核实，不改）。
> - S6 放在 [13](13-Preload与MockBridge执行计划.md)，S8 放在 [17](17-settings-service拆分执行计划.md)，S9 放在 [15](15-运行目标执行计划.md)。
> - S4 中的删除部分已在 [10](10-冗余清理执行计划.md) 完成，本计划只写审计脚本。
>
> 执行记录：`docs/exec-runs/20261005-desktop-fe-11-security-ipc/`。
> 路径缩写：`M` = `apps/desktop/src/main`，`R` = `apps/desktop/src/renderer`，`S` = `packages/shared/src`。行号基于 2026-10-05（10 执行之前），动手前重新核对。

## 目标

- **sender 校验**：统一一个入口，遇到异常一律拒绝（fail-closed）。
- **工作区文件访问**：允许访问的 root 由 main 根据 registry 和会话决定，并用 realpath 防止符号链接逃逸。
- **主窗口防护**：
  - 开启 sandbox；
  - 拦截导航；
  - 拦截新窗口；
  - 拦截 webview；
  - 外链只通过 `openExternalSafely` 打开。
- **IPC channel 审计脚本**：main 注册、preload 暴露、常量定义三方不一致时失败。
- **生命周期**：关窗时销毁该窗口的终端，退出时清理服务，记录全局异常日志。

## 范围

### 包含

- 01 的 S1、S2、S3、S5。
- 01 S4 的审计脚本。
- C1：核实子进程是否继承 `applyToEnv` 写入的 Key，结论记入技术债。
- `docs/SECURITY.md` 补条款。

### 不包含

| 项 | 原因 |
| --- | --- |
| 主文档强制 CSP | 有技术障碍，见下文「J1 CSP」。本计划只做实验并记录结论 |
| `applyToEnv` 退役（01 S7） | 以后单独设计 |
| IPC 入参 guard、统一注册器（01 S6） | 13 |
| 改协议、改 Host | 本轮不做 |

## 背景（2026-10-05 核实）

### sender 校验（S1）

共 7 套，各自实现：

| 位置 | 做法 | 状态 |
| --- | --- | --- |
| `M/runtime-v2/desktop-shell-ipc.ts:57-62` 的 `handle()` | `window && (sender !== … \|\| senderFrame !== …)` | **fail-open**：没有窗口时整段跳过 |
| `M/runtime-v2/fixed-renderer-ipc.ts:116-117`（函数在 `:948-954`）；`:334` 另有 `isTrustedSender`，供 `:337` 的 `ipcMain.on(setNativeTheme)` 使用 | 只比较 `sender.id`，不比较 frame | fail-closed |
| `M/runtime-v2/projection-ipc.ts` | — | 已在 10 中删除 |
| `M/remote-hosts/ipc.ts:9-11` | 比较 sender 和 mainFrame | fail-closed |
| `M/runtime-v2/english-learning-ipc.ts:10-11` | 与 `getMainWindow()?.webContents` 比较 | fail-closed |
| `M/performance-ipc.ts:11` | 同上 | fail-closed |
| `M/terminal/terminal-ipc.ts` | — | 已在 10 中删除 |

`desktop-shell-ipc.ts:60` 的远端会话拦截要保留。

### 工作区访问（S2）

**由 renderer 决定 root、且没有经过 registry 校验的入口：**

| channel | handler | 下游 |
| --- | --- | --- |
| list / read / statWorkspaceFile | `desktop-shell-ipc.ts:76-83` | `M/workspace-fs-service.ts:198-200` 的 `resolveRoot`；`:212` 的 `toInsideRoot` 只做词法判断，并且用 `startsWith("..")` 判断越界，会把 `..foo` 这样的文件名误判为越界 |
| showArtifactContextMenu（`kind=workspace_file`） | `fixed-renderer-ipc.ts:619-620` | `M/artifact-context-menu-service.ts:26` 已经 realpath，但 root 来自 renderer；`:15-19` 的 `isInside` 同样用 `startsWith("..")` |
| getWorkspaceGitContext | `fixed-renderer-ipc.ts:597` | `M/workspace-git-context-service.ts`，直接下传 |
| createWorkspaceFolder | `fixed-renderer-ipc.ts:598` | `parentRoot` 可以是任意路径，并经由 `resolveWorkspaceSelection` **自动登记** |
| createSession | `fixed-renderer-ipc.ts:174-175` | `workspaceRoot` 直接下传给 `registry.createSession` |

**已经正确的入口（不改）：**
- `getWorkspaceEnvironment`、分支、提交、推送、`initGitRepository`、`openWorkspaceInTool`（`:641-668`）已走 `registeredWorkspaceRoot`（`:859-863`）。
- `setSessionWorkspace` 同上。
- Review 系列已走 `resolveReviewWorkspace`。

**registry 的情况：**
- 数据在 `M/workspace-registry-service.ts`，持久化到 `dataRoot/workspaces.json`。
- 校验函数分两类：
  - 严格：`resolveRegisteredWorkspaceSelection`（约 `:189-205`）；
  - 宽松：`resolveWorkspaceSelection`（`:90-98` 起），**会自动登记任意路径**。
- `workspaceRegistryOptions` 没有传入 `sessions`（`fixed-renderer-ipc.ts:851-857`，`desktop-shell-ipc.ts` 中也一样），所以 `mergeSessionWorkspaces` 在 IPC 路径上什么都不做。
- 即便传了，它也只收录 `sourceWorkspaceRoot`。

**worktree 会话：**
- `SessionWorktreeContext`（`S/session.ts:244-252`）中，`workspaceRoot` 是 worktree 路径。
- 运行时通过 `runtimeV2Registry.inspectSession(sessionId).workspaceRoot` 取得（`M/index.ts:221-226` 的终端 `readSession` 就是这么做的）。
- renderer 读文件时传的就是这个 worktree 路径（`TurnOutputArtifacts.tsx:193`、`ReviewDiffCanvas.tsx:302`）。
- **因此，如果只看 registry，worktree 会话的文件树、预览和 Review 都会失效。**

### 窗口（S3）

- `BrowserWindow` 只在 `M/index.ts:141-153` 创建一处：`contextIsolation: true`、`nodeIntegration: false`，**没有设置 sandbox**。
- main 中搜不到 `setWindowOpenHandler`、`will-navigate`、`will-attach-webview`，也没有 `session.webRequest` 和 `protocol.handle`。
- 加载方式：
  - 生产用 `win.loadFile(dist/index.html)`（file://，`:157`）；
  - dev 用 `VITE_DEV_SERVER_URL`，即 `127.0.0.1:${VITE_DEV_PORT || 5173}`。
- `shell.openExternal` 有 2 处：
  - `desktop-shell-ipc.ts:139`，URL 来自 `gh pr create` 的输出；
  - `artifact-context-menu-service.ts:60`，`cursor://file${encodeURI(realPath)}`。
- 同类平台动作还有 2 处：`artifact-context-menu-service.ts:53` 的 `open -a Cursor`，`fixed-renderer-ipc.ts:713` 的 `open -a "Google Chrome" chrome://extensions`。
- CDP 实测（见 00）：dev 构建的控制台只有两条 `Electron Security Warning (Insecure Content-Security-Policy)`。

### 生命周期（S5）

- **窗口关闭**：`closed`（`M/index.ts:158`）只清空 `mainWindow`。
- **终端**：
  - 终端的 owner 是 `event.sender.id`；
  - `terminal-session-service.ts:294` **已有 `closeOwner(ownerId)`，但没有任何调用方**；
  - `closed` 触发时 webContents 已经销毁，所以 id 要在创建窗口时先保存下来。
- **退出**：
  - `before-quit`（`:324-355`）已清理大部分服务，`finally` 中 `app.exit(0)`。
  - `browser-bridge-service` 和 `local-update-service` 没有 `dispose`。其中 browser bridge 会经 `runtimeV2Registry.dispose → profile.shutdown()` 间接关闭（`runtime-registry.ts:426-445`），要实测确认；update service 没有任何清理。
  - SSH 隧道由 `remoteHosts.dispose` 关闭（`remote-hosts/registry.ts:124`）。01 写的「未清理」不准确。
- **全局异常**：main 中没有 `uncaughtException` / `unhandledRejection` 处理。`logMain`（`:131-134`）依赖 `startupLogPath`。

### 子进程环境变量（C1 核实结论）

**会继承包含 API Key 的 `process.env`：**
- bash 工具：`packages/tools/shell-tools/src/node-ports.ts:68`、`:290`、`:305`。
- `rg`：`packages/tools/filesystem-search/src/node-ports.ts:113`。
- git / gh（不传 env，默认继承）：`review-git-service.ts:96`、`review-git-engine.ts:832`、`review-git-worker.ts:93`、`review-pr-service.ts:117`、`workspace-environment-service.ts:574`；`workspace-git-context-service.ts:415-425` 是显式展开后继承。
- ssh：`remote-hosts/ssh.ts:11`。
- browser bridge：`:736`。
- 更新脚本：`:474`。

**不会继承**：终端 pty，已经用 `sanitizeEnvironment` 处理（`terminal/shell-environment-service.ts:24-31`）。

## 决策记录

| 日期 | 决定 | 原因 |
| --- | --- | --- |
| 2026-10-05 | `assertTrustedSender(event, getMainWindow)` 的规则：没有窗口、窗口已销毁、`sender !== win.webContents`、`senderFrame !== win.webContents.mainFrame`，任一成立就抛错 | 统一按最严格的现有实现（remote-hosts）处理 |
| 2026-10-05 | 工作区访问的允许集合 = registry 中的 root ∪ 已存在本地会话的 `workspaceRoot`（含 worktree 路径）。比较时两侧都先 `realpath`，用 `path.relative` 判断包含：结果为 `..` 或以 `..${sep}` 开头才算越界 | 不让 worktree 会话失效；修正 `..foo` 误判 |
| 2026-10-05 | `createSession` 改用严格校验；`createWorkspaceFolder` 先校验 `parentRoot`，新建的子目录再登记；`selectWorkspaceDirectory` 保持自动登记 | 只有 `selectWorkspaceDirectory` 背后是用户在系统对话框里选的目录；其余入口的路径都由 renderer 给出，不收紧的话 registry 校验形同虚设 |
| 2026-10-05 | `openExternalSafely` 只允许 `https:`、`http:`、`mailto:`；打开 Cursor 改成独立的 `openInCursor(realPath)`，不经过 openExternal | 协议白名单；`cursor://` 只在已经 realpath 的工作区文件上使用 |
| 2026-10-05 | 关窗时调用 `closeOwner(savedWebContentsId)` | 已拍板（01-1） |
| 2026-10-05 | C1 只记录结论，不改代码 | 已拍板（C1 以后单独做） |
| 2026-10-05 | J1 选 A：本轮不强制主文档 CSP，只做实验并记录 | 用户拍板。HTML 预览的 srcdoc 会继承主文档策略，严格 CSP 会破坏预览；宽松 CSP 防不住 XSS |

### J1 CSP（2026-10-05 用户已选 A）

**问题**：01 原计划是「先 report-only 观察一轮，再强制」。核实后有三个障碍：

1. `Content-Security-Policy-Report-Only` 不能写在 meta 里。生产环境用 file:// 加载，`webRequest.onHeadersReceived` 是否会对它触发，需要实验确认。
2. 本轮连续执行，没有「观察一轮」的真实使用期。
3. **HTML 预览用的是 `iframe srcDoc` 加 `sandbox="allow-scripts"`**（`R/components/right-panel/HtmlRenderView.tsx:252-256`）。按 CSP 规范，srcdoc 文档会**继承父文档的策略**。主文档一旦设置 `script-src 'self'`，预览里注入的桥脚本和用户 HTML 里的内联脚本都会被拦截；`default-src 'self'` 还会拦截预览允许的 https 静态资源。

**选项：**

| 选项 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **A（建议）** | 本轮不强制主文档 CSP，只做实验。T9 在 Electron 中实测 srcdoc 继承和 file:// 头注入，结论写进执行记录和 `SECURITY.md`「待补强」；导航防护、sandbox 和 openExternal 照常做 | 不破坏 HTML 预览；XSS 升级成高危的主要路径（导航、新窗口、Node 能力）已经由 S3 其余部分堵住 | 主文档仍然没有 CSP，Electron 的 dev 警告还在 |
| B | 主文档强制宽松 CSP：`script-src 'self' 'unsafe-inline'`，default 放行 https | 有一层 CSP | 有 `unsafe-inline` 的 CSP 对 XSS 基本无效，只是名义上有 |
| C | 本轮给 HTML 预览改用自定义协议（例如 `actspace-preview://`），让它不继承主文档策略，然后主文档用严格 CSP | 一次做彻底 | 范围明显变大：协议注册、预览加载方式、桥脚本通信都要改，属于新的设计 |

**已定：A**。本轮不给主文档加 CSP，T9 只做实验并记录结论。C（预览改用自定义协议后再上严格 CSP）作为后续独立任务记进 `tech-debt-tracker.md`。

## 实施步骤

每个 T 一个提交。

| # | 文件 | 改动 | 测试 / 验证 |
| --- | --- | --- | --- |
| T0 | 执行记录 | 重新核对上文行号（10 执行后会漂移）；确认 main 中列出本地会话 `workspaceRoot` 的现成方法（`runtimeV2Registry` 的 list 或 inspect）；把结论写进执行记录 | 只记录 |
| T1 | 新增 `M/ipc/trusted-sender.ts`；改 `desktop-shell-ipc.ts`、`fixed-renderer-ipc.ts`（含 `:334` 的 `isTrustedSender`）、`remote-hosts/ipc.ts`、`english-learning-ipc.ts`、`performance-ipc.ts` | S1：各文件改为调用 `assertTrustedSender`，删除本地实现 | 新增 `M/test/trusted-sender.test.ts`：没有窗口、窗口已销毁、其他 webContents、子 frame 都拒绝，主窗口 mainFrame 放行；扩展 `runtime-v2-desktop-shell-ipc.test.ts`：`getMainWindow` 返回 `undefined` 时 handler 拒绝 |
| T2 | `M/index.ts`（:141-158）、`M/terminal/terminal-session-service.ts` | S5 第一步：创建窗口时保存 `webContents.id`，在 `closed` 中调用 `terminalSessionService.closeOwner(id)` | `terminal-session-service.test.ts` 新增用例：`closeOwner` 只关闭该 owner 的终端；新增 `M/test/main-lifecycle.test.ts`：把窗口事件接线抽成 `attachWindowLifecycle(win, deps)`，断言 closed 后用保存的 id 调用 `closeOwner` |
| T3 | `M/index.ts`、`M/browser-bridge-service.ts`、`M/local-update-service.ts` | S5 第二步：两个服务加幂等的 `dispose()`，并在 `before-quit` 中调用；新增 `installProcessErrorLogging(log)`，注册 `uncaughtException` / `unhandledRejection`，`startupLogPath` 未初始化时写 stderr | `browser-bridge-service.test.ts`、`local-update-service.test.ts` 各加 dispose 用例（调用两次不报错，子进程被终止）；`main-lifecycle.test.ts`：`process.emit("unhandledRejection", …)` 后 log 被调用 |
| T4 | 新增 `M/workspace-access.ts`；改 `M/workspace-fs-service.ts`（`toInsideRoot`） | S2 核心：`resolveWorkspaceAccess(input, deps)` 返回 realpath 后的 root，否则抛 `workspace_not_registered`；`deps` 注入 `readRegistry` 和 `listSessionWorkspaceRoots`（来源见 T0）；`toInsideRoot` 改为 realpath 加 `path.relative` | 新增 `M/test/workspace-access.test.ts`：`/`、`~`、registry 外的目录拒绝；registry 内指向外部的 symlink 拒绝；名为 `..foo` 的文件允许；registry 中的 root 允许；worktree 会话的路径允许；`workspace-fs-service.test.ts` 加 symlink 用例 |
| T5 | `desktop-shell-ipc.ts:76-83`、`fixed-renderer-ipc.ts:597-598, :619-620, :174-175`、`M/artifact-context-menu-service.ts`、`M/workspace-registry-service.ts` | S2 接线：fs 三件套、git context、右键菜单走 `resolveWorkspaceAccess`；`createSession` 改用严格校验；`createWorkspaceFolder` 先校验 `parentRoot`；`artifact-context-menu-service.ts:15-19` 的 `isInside` 换成共用的包含判断；`fixed-renderer-ipc.ts` 的 `registeredWorkspaceRoot` 收敛到新入口 | 现有的 `workspace-*.test.ts`、`artifact-context-menu-service.test.ts`、`runtime-v2-workspace-admission.test.ts`、`runtime-v2-workspace-picker.test.ts` 通过；新增用例：`createSession` 传未登记的 root 被拒绝，`createWorkspaceFolder` 传未登记的 `parentRoot` 被拒绝；Electron 冒烟：普通会话和 worktree 会话的文件树、文件预览、Review 正常 |
| T6 | 新增 `M/platform-actions.ts`；改 `desktop-shell-ipc.ts:139`、`artifact-context-menu-service.ts:53-60` | `openExternalSafely(url)`、`openInCursor(realPath)` | 新增 `M/test/platform-actions.test.ts`：允许 `https:`、`http:`、`mailto:`；拒绝 `file:`、`javascript:`、`cursor:`、相对路径、无法解析的字符串 |
| T7 | `M/index.ts`；新增 `M/window-security.ts` | S3：`createMainWindowOptions()` 显式设置 `sandbox: true`；`attachNavigationGuards(win, isAppUrl)` 包括：`setWindowOpenHandler` 调用 `openExternalSafely` 后返回 deny；`will-navigate` 遇到非 app URL 时 `preventDefault` 并交给 `openExternalSafely`；`web-contents-created` 时拦截 `will-attach-webview` | 新增 `M/test/window-security.test.ts`：`sandbox === true`；外部 URL 触发 `preventDefault`；app URL（dev origin、dist 的 file URL）放行；window open 返回 deny；`runtime-v2-preload-bundle.test.ts` 通过，并在 bundle 中 grep 除 `electron` 外没有其他 `require(`；Electron 冒烟：启动后各页正常，点消息中的外链会在系统浏览器打开，主窗口不跳转 |
| T8 | 新增 `scripts/check-ipc-channels.mjs` 和 `scripts/test/ipc-channels.test.mjs`；根 `package.json` 加 `check:ipc-channels` | S4 审计：读取 `S/runtime-v2/fixed-renderer.ts`、`S/performance.ts`、`S/english-learning.ts`、`S/host-protocol/` 的 channel 常量；检查每个 invoke 类 channel 都在 main 中注册、在 preload 中被引用（按常量名或字符串值匹配）；main 注册了但常量里没有的 channel 也算失败。13 落地契约后，脚本改为以契约为准（13 T10） | `pnpm check:ipc-channels` 通过；单测覆盖三种不一致各一例 |
| T9 | 执行记录、`docs/SECURITY.md` | J1 选 A：在 dev 构建中临时给 `index.html` 加一个严格的 meta CSP（**不提交**），用 CDP 打开 HTML 预览（含内联脚本）、mermaid、图片附件，记录违规报告；再实验 `onHeadersReceived` 对 file:// 是否触发。结论写进执行记录，并记入 `SECURITY.md`「待补强」和 `tech-debt-tracker.md` | 只记录；`git diff index.html` 为空 |
| T10 | `docs/SECURITY.md`、`docs/exec-plans/tech-debt-tracker.md`、01 | `SECURITY.md`「Electron 进程隔离」「文件系统访问控制」补充 sender 校验、workspace access、导航防护、openExternal 白名单；技术债新增 C1 条目（继承 Key 的子进程清单）；01 在各项后标注「已在 11 执行」，并更正背景中与现状不符之处 | `pnpm check:current-docs` |

## 验证方式

```bash
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:ipc-channels          # T8 之后
pnpm check:current-docs          # T10
```

Electron 验收（按 00 的「能做的验收」执行，结果截图存入执行记录）：

1. 启动后用 CDP 抓取控制台：没有新增 error。
2. **工作区**：普通会话打开文件树、预览一个文件；worktree 会话做同样的操作，再打开 Review。
3. **外链**：用 CDP `Runtime.evaluate` 模拟点击消息里的外链。`will-navigate` 被拦截，主窗口 URL 不变。打开系统浏览器这一步无法自动确认，交给验收。
4. **关窗**：打开一个终端，执行 `close` 关闭窗口后，`ps` 中没有该终端的 shell。需要在 macOS 上从 Dock 重新打开，同样交给验收。
5. **退出**：退出后 `ps` 中没有 browser bridge 和更新相关的子进程。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 工作区收紧后误拒合法路径（Default workspace、新建 worktree 的瞬间） | T4 测试覆盖 worktree；T5 后做 Electron 冒烟；出现误拒按「设计偏差」停下 |
| `sandbox: true` 导致 preload 中某个 Node 模块不可用 | T7 grep bundle 中的 `require(`；Electron 冒烟 |
| `will-navigate` 误拦 dev HMR 或 hash 路由 | `isAppUrl` 按 origin 和 file 路径比较，忽略 hash；单测覆盖 |
| `closeOwner` 是异步的，关窗后进程退出过快，终端没清理干净 | `before-quit` 中已有 `terminalSessionService` 的清理作为兜底 |
| 审计脚本把字面量 channel 误判为未暴露 | 同时按常量名和字符串值匹配；单测覆盖 |

**回滚**：T1–T8 每个都可以单独 revert；T4 和 T5 要一起 revert。

## 进度记录

- [ ] T0–T10

## 执行模式

连续执行（见 00）。J1 已定为 A。

## 执行文档

`docs/exec-runs/20261005-desktop-fe-11-security-ipc/`：`execution-process.md`、`execution-summary.md`、`acceptance-handoff.md`。

验收重点：
- 外链在系统浏览器打开；
- worktree 会话的文件和 Review 正常；
- macOS 关窗再从 Dock 打开后没有孤儿 pty；
- 退出后没有残留子进程。
