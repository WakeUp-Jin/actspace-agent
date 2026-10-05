# 01 Desktop 安全与 IPC 收口

> 范围：`apps/desktop/src/main`、`apps/desktop/src/preload`、`apps/desktop/src/global.d.ts`。
> 优先级：本目录最高，建议第一个落地。
> 迁移去向：实施计划进 `docs/exec-plans/active/`；安全默认约束补进 `docs/SECURITY.md`。

## 1. 现状速览

| 项 | 现状 |
| --- | --- |
| 窗口配置 | `main/index.ts:143-153`：`contextIsolation: true`、`nodeIntegration: false`；`sandbox` 未显式声明（依赖 Electron 默认）；无 `webSecurity` 改动 |
| 导航防护 | 全 main 无 `setWindowOpenHandler`、`will-navigate`、`will-attach-webview` |
| CSP | `renderer/index.html` 与 `session.webRequest` 均未设置 CSP（HTML 预览 iframe 自带 CSP，见 05） |
| IPC 注册点 | 6 个文件各自注册：`fixed-renderer-ipc.ts`、`desktop-shell-ipc.ts`、`projection-ipc.ts`、`remote-hosts/ipc.ts`、`english-learning-ipc.ts`、`performance-ipc.ts` |
| channel 契约 | 常量放在 `@actspace/shared`：FIXED_RENDERER 约 142 个、DESKTOP 20 个、DESKTOP_SHELL 10 个，另有 HOST_IPC / PERFORMANCE / ENGLISH_LEARNING |
| preload | `preload/index.ts` 623 行；只 import `RUNTIME_V2_FIXED_RENDERER_CHANNELS`（`:173`），并维护一张 142 项「短别名 → 常量」表（约 `:176-312`） |
| 入参校验 | 只有 TS 泛型标注；运行时校验只有 `remote-hosts/ipc.ts:14-33` 比较完整 |
| 远端凭据 | 做得好：safeStorage 加密、0600、原子写；token 不出 main；`HOST_IPC.call` 屏蔽 `auth.*` / `host.hello`；SSH `StrictHostKeyChecking=yes`、`ForwardAgent=no` |
| 终端 | 做得好：每个操作校验 `event.sender.id` 所有权；cwd 来自 Session 而不是渲染进程；shell 环境经 `sanitizeEnvironment` 去掉密钥类变量（`terminal/shell-environment-service.ts:24-31`） |

## 2. P0 问题

### P0-1 渲染进程可指定任意 `workspaceRoot` 读主机文件

**证据**

- `main/workspace-fs-service.ts:198-200`：

  ```ts
  function resolveRoot(input: { workspaceRoot?: string }, roots: AppDataRoots): string {
    return resolve(input.workspaceRoot ?? roots.defaultWorkspaceRoot);
  }
  ```

- `main/runtime-v2/desktop-shell-ipc.ts:76-83`：`listWorkspaceDir` / `readWorkspaceFile` / `statWorkspaceFile` 把渲染进程传入的 `input` 原样转给上面的函数，没有核对 workspace registry。
- `toInsideRoot`（`workspace-fs-service.ts` 同文件）只做词法比较 `relative(root, abs).startsWith("..")`，不做 `realpath`：workspace 内的 symlink 可以指向外部。
- `main/workspace-open-service.ts:120` 同样直接 `resolve(input.workspaceRoot ?? ...)`。
- 对照：Review 走 `resolveReviewWorkspace`，会查 registry，是正确做法。

**后果**：渲染进程一旦出现 XSS（markdown、mermaid、artifact 预览、第三方 HTML），攻击者可以传 `workspaceRoot: "/"` 或 `~`，通过 `readWorkspaceFile` 读 `~/.ssh/*`、`dataRoot/secrets*.json`（密文，但配合其他缺口可放大）、remote-hosts 凭据文件。

**附带小 bug**：`rel.startsWith("..")` 会把合法文件名 `..foo` 误判为越界。

**修复方案**

1. 新增 `main/workspace-access.ts`，导出唯一入口：

   ```ts
   type WorkspaceAccess = { workspaceId: string; root: string /* realpath */ };
   async function resolveWorkspaceAccess(input: { workspaceRoot?: string; sessionId?: string }): Promise<WorkspaceAccess>
   ```

   - `workspaceRoot` 必须等于 registry 中某个条目的 `path`，或等于某个 Session 的 worktree execution root（worktree 不在 registry，但在 Session meta 中）。
   - 返回前对 root 做 `realpath`，后续所有路径都基于 realpath 后的 root。
2. `toInsideRoot` 改为：先 `resolve`，再对**最近存在的祖先**做 `realpath`，最后用 `path.relative` 判断 `rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)`。
3. `workspace-fs-service`、`workspace-open-service`、`workspace-git-context-service`、`workspace-environment-service` 全部改用 `resolveWorkspaceAccess`。
4. 错误码统一 `workspace_not_registered`，与 `terminal-session-service.ts:150` 的现有文案保持一致。

**验收**

- 单测：传 `/`、`~`、registry 外目录、registry 内 symlink 指向外部、`..foo` 文件名，分别断言拒绝 / 拒绝 / 拒绝 / 拒绝 / 允许。
- Electron 手测：右侧文件树、文件预览、「在 Finder / 编辑器中打开」在普通工作区和 worktree 会话中都正常。

### P0-2 `desktop-shell-ipc` 的 sender 校验 fail-open

**证据**：`main/runtime-v2/desktop-shell-ipc.ts:59`

```ts
const window = options.getMainWindow?.();
if (window && (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)) throw ...
```

没有窗口时整段跳过。这组 handler 同时承载 workspace 文件读取、Review mutation 和 terminal create / write（`:143-151`）。

其余注册点各有一套写法：`sender.id` 比较、`sender ===` 比较、`senderFrame` 比较；`projection-ipc.ts:328` 不校验 frame。

**修复方案**

- 新增 `main/ipc/trusted-sender.ts`：

  ```ts
  export function assertTrustedSender(event: IpcMainInvokeEvent, getWindow: () => BrowserWindow | undefined): void
  // 无窗口 → 拒绝；sender 不是主窗口 webContents → 拒绝；senderFrame 不是 mainFrame → 拒绝
  ```

- 6 个注册点全部改用它（见 §4 的统一注册器）。

### P0-3 窗口缺导航防护与 CSP

**证据**：全 main grep 不到 `setWindowOpenHandler` / `will-navigate` / `will-attach-webview`；`renderer/index.html` 无 CSP meta；`session.webRequest` 未设置响应头。

**后果**：markdown 链接、mermaid 节点、artifact 中出现可点击链接时，主窗口可能被导航到外部页面；该页面仍然加载 preload，拿到完整的 `window.actspace`（含 terminal 写入、文件读取）。这是纵深防御缺口，与 P0-1 / P0-2 叠加时风险放大。

**修复方案**

1. `createMainWindow`：
   - `webPreferences.sandbox: true` 显式写出（`runtime-v2-preload-bundle.test.ts:12` 已验证 preload bundle 兼容 sandbox）。
   - `win.webContents.setWindowOpenHandler(({ url }) => { openExternalSafely(url); return { action: "deny" }; })`。
   - `win.webContents.on("will-navigate", (event, url) => { if (!isAppUrl(url)) { event.preventDefault(); openExternalSafely(url); } })`。
   - `app.on("web-contents-created", (_, contents) => contents.on("will-attach-webview", e => e.preventDefault()))`。
2. CSP：生产包在 `index.html` 加 meta；dev server 下放宽 `connect-src` 允许 Vite HMR。建议起点：

   ```text
   default-src 'self';
   script-src 'self';
   style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob:;
   font-src 'self' data:;
   connect-src 'self';
   frame-src 'self' blob: data:;   /* HTML 预览 iframe 用 srcDoc，需要核对 */
   object-src 'none';
   base-uri 'none';
   ```

   mermaid 动态 import、highlight.js、xterm 都需要实测；`style-src 'unsafe-inline'` 暂时保留（Tailwind 运行时与 React inline style）。
3. 新增 `openExternalSafely(url)`：只允许 `https:`、`mailto:`；`cursor://`、`vscode://` 这类编辑器协议走单独白名单，且只接受本机绝对路径。

### P0-4 `shell.openExternal` 未校验

- `desktop-shell-ipc.ts:139`：`shell.openExternal(result.url)`，url 来自 `gh pr create` 的输出，不校验协议和主机。
- `artifact-context-menu-service.ts:60`：拼 `cursor://file${encodeURI(path)}`，风险较低，但同样纳入白名单。

改为统一走 `openExternalSafely`。

## 3. P1 问题

### P1-1 Provider key 写入 `process.env`

**证据**：`settings-service.ts:1307-1318` `applyToEnv()` 把搜索服务 key（`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `EXA_API_KEY` / `TINYFISH_API_KEY`，见 `:270-275`）、图片生成 base URL / model、工具开关写进 `process.env`，并在 10 处调用。

**已核实**：终端 pty 的环境经 `sanitizeEnvironment` 过滤密钥类变量，不会泄漏到用户终端。

**待核实**：

- bash 工具子进程、git 子进程、SSH 子进程是否继承 `process.env`。
- 这些 key 被写进 env 的原因：是否只是为了让同进程的工具插件通过 `process.env` 读取。

**方向**：不再用 `process.env` 作为配置总线。工具插件需要的配置通过 Runtime 的配置端口注入（与 LLM 凭据「只在 Main 解析」的做法一致），`applyToEnv` 最终删除。

### P1-2 三套 channel 并行注册，部分无调用方

**证据**：

- `projection-ipc.ts` 由 `main/index.ts:23` 的 `registerRuntimeV2Ipc` 注册，只使用 `RUNTIME_V2_DESKTOP_CHANNELS`（44 处引用）；preload 只 import `RUNTIME_V2_FIXED_RENDERER_CHANNELS`（`preload/index.ts:173`）。→ 这批约 18 个 handler 在生产中**没有调用方**，只被 `runtime-v2-projection-ipc.test.ts` 覆盖。
- `desktop-shell-ipc.ts` 的 workspace / review / terminal 在 `DESKTOP_SHELL` 和 `FIXED_RENDERER` 两个 namespace 下各注册一遍（`:76-151`，同一 listener 写两行）。
- 事件也双发：终端事件同时发 `DESKTOP_SHELL.terminalEvent` 和 `FIXED.terminalEvent`（`main/index.ts` 约 `:236-237`）；`reviewChanged` 同理（`desktop-shell-ipc.ts:50-51`）。
- preload 的短别名表让同一个 channel 有三个名字：常量名、channel 字符串、短别名。

**方案**

1. 只保留 `RUNTIME_V2_FIXED_RENDERER_CHANNELS` 这一套（它是 preload 实际使用的）。
2. 删除 `projection-ipc.ts`、`RUNTIME_V2_DESKTOP_CHANNELS`、`RUNTIME_V2_DESKTOP_SHELL_CHANNELS`，以及对应的重复 `handle(...)` 行和双发事件。
3. 删除 preload 的短别名表，preload 直接引用常量（见 04）。
4. 先做一次 channel 使用审计脚本：列出 shared 里每个 channel 常量 → main 是否注册 → preload 是否调用，作为删除依据并放进 CI（见 §4）。

### P1-3 `fixed-renderer-ipc.ts` 是胖路由

**证据**：943 行。`handle()`（`:116-128`）里内嵌远端路由：按 `remote-approval:`、`host:` 字符串前缀把调用分流到 `remote.create / decide / handle / mergeList`。此外还有：

- `:708` 直接 `spawn("open", ["-a", "Google Chrome", ...])` 打开扩展页。
- 约 `:143` 用 `process.env.npm_package_version` 作为版本号，打包后可能取不到。

**方案**：

- 本地 / 远端分流下沉到一个 `SessionGateway`（main 内），IPC 层只做「校验 sender → 校验入参 → 调用 gateway」。与 03 的 `RunTarget` 在 main 侧对应。
- 版本号改用 `app.getVersion()`。
- 「打开 Chrome」这类平台动作收进 `platform-actions.ts`，与 `openExternalSafely` 放一起。

### P1-4 `settings-service.ts` 是 2637 行的 god object

当前职责（按代码区域）：

1. 持久化与多代迁移：`migrateV1Settings`、`mergePersistedSettingsV3`、`legacySettingsFromV4` 等（约 `1500-2100`），备份写入（`2540-2600`）。
2. 密钥文件：`SecretCrypto`、`parseSecretsV1/V2`。
3. Provider 与 credential CRUD：`addProviderCredential`、`updateProviderConnection` 等。
4. 自定义连接校验与认证推导：`validateCustomConnection`、`resolveAuthScheme`。
5. 图片生成、语音、搜索用量：`getSearchUsage`（`:1211`）。
6. system prompt 文件读写（`:1142`、`:1150`）。
7. env 注入 `applyToEnv`。

**拆分**：

| 新模块 | 内容 |
| --- | --- |
| `settings/settings-store.ts` | 读写当前版本 settings、原子写、备份 |
| `settings/settings-migrations.ts` | v1→v4 迁移，纯函数，单测覆盖每一代样本 |
| `settings/secrets-store.ts` | SecretCrypto、secrets 文件版本 |
| `settings/provider-connections.ts` | provider / credential / custom connection CRUD |
| `@actspace/shared` 纯函数 | `validateCustomConnection`、`resolveAuthScheme`、sanitize（renderer 与 CLI 可复用） |
| `settings/system-prompt-file.ts` | system prompt 文件 |
| `SettingsService` | 只做门面：组合上述模块、发变更事件 |

迁移代码是否还要保留 v1/v2：取决于是否仍有用户数据停在这些版本。建议保留迁移但冻结（不再改），并在文件头写明最早支持版本。

### P1-5 Git 执行路径四套

`review-git-engine.ts`（1320 行，经 worker 执行，不阻塞主线程）之外，`review-git-service.ts:96`、`workspace-git-context-service.ts:415`、`review-pr-service.ts:117`、`workspace-environment-service.ts:574` 各自 `execFile("git", ...)`，timeout / maxBuffer 各不相同。

**方案**：抽 `main/git/run-git.ts`（统一 timeout、maxBuffer、`GIT_TERMINAL_PROMPT=0`、错误分类），四处改用。

### P1-6 生命周期

| 问题 | 证据 | 方案 |
| --- | --- | --- |
| macOS 关窗后 pty 成孤儿 | `main/index.ts:158` 的 `closed` 只清 `mainWindow`；`terminal-session-service` 不监听 `webContents.destroyed`；重开窗口后 `sender.id` 变化，旧终端无法再 attach | 窗口 `closed` 时按 owner 调 `terminalSessionService.disposeOwner(ownerId)`；或者设计成「终端跟会话走、窗口重开可重新 attach」，二选一，需要拍板 |
| 退出时清理不全 | `main/index.ts:324-355` 的 `before-quit` 未调用 `browserBridgeService` 和 `localUpdateService` 的 dispose；SSH 隧道子进程未见显式清理 | 补 dispose；所有 service 实现 `Disposable`，退出时按注册逆序释放 |
| 无全局异常处理 | 全 main 无 `unhandledRejection` / `uncaughtException` | 记录到 `logMain`，不吞掉 |
| 单窗口假设 | `getMainWindow()` + `webContents.send` 广播 | 维持单窗口，但把「广播」收进一个 `RendererEvents` 对象，方便以后多窗口 |

### P1-7 preload 在做业务转换

`preload/index.ts:1-6` import 了 `projectChatWindow`、`projectChatEvents`、`createMessageBlocks`，在 bridge 层拼消息块。这违反 `docs/SECURITY.md:30`「最小 bridge」原则，也让同一份投影逻辑在 preload 和 renderer 各跑一遍（renderer 的 `App.tsx` 还在调用 `createMessageBlocks`，见 02）。

**方案**：preload 只做 `ipcRenderer.invoke` / `on` 的薄封装；投影统一在 renderer 侧（`@actspace/session-projection`）做。

## 4. 统一 IPC 注册器（目标形态）

```ts
// main/ipc/registry.ts
type Handler<C extends keyof FixedRendererContract> =
  (input: FixedRendererContract[C]["input"], ctx: { sender: WebContents }) => Promise<FixedRendererContract[C]["output"]>;

export function createIpcRegistry(getWindow: () => BrowserWindow | undefined) {
  return {
    handle<C extends keyof FixedRendererContract>(channel: C, schema: Validator<...>, handler: Handler<C>): void,
    dispose(): void,
  };
}
```

- 每个 handler 都经过：`assertTrustedSender` → `schema.parse(input)` → handler。
- `schema` 先从高风险的入口做起：所有带路径、URL、shell 参数、hostId 的 channel。可以用 zod 或手写 guard，不强求一次覆盖 142 个。
- `FixedRendererContract` 放在 `@actspace/shared`，preload 用同一个类型生成方法签名（见 04），彻底消除「main / preload / global.d.ts」三处手写漂移。
- CI 检查脚本 `scripts/check-ipc-channels.mjs`：列出 contract 中每个 channel 是否在 main 注册、是否被 preload 暴露；任何一侧缺失则失败。

## 5. 实施步骤

| 步骤 | 内容 | 依赖 | 预估 |
| --- | --- | --- | --- |
| S1 | `assertTrustedSender` 统一 + fail-closed | 无 | 0.5 天 |
| S2 | `resolveWorkspaceAccess` + realpath + 4 个 service 改造 + 单测 | 无 | 1 天 |
| S3 | 导航防护、`sandbox: true`、`openExternalSafely`、CSP（先 report-only 观察一轮） | 无 | 1 天 |
| S4 | channel 审计脚本；删 `projection-ipc.ts`、DESKTOP / DESKTOP_SHELL 常量、重复注册、双发事件 | S1 | 1 天 |
| S5 | 生命周期：窗口关闭清理终端、补齐 dispose、全局异常日志 | 无 | 0.5 天 |
| S6 | 统一注册器 + 高风险 channel 入参校验 | S1、S4、04 的 contract | 2 天 |
| S7 | `applyToEnv` 退役（先核实 bash / git 子进程 env） | Runtime 配置端口 | 1–2 天 |
| S8 | `settings-service` 拆分 | 无，但改动大，建议单独一轮 | 2–3 天 |
| S9 | `run-git` 统一；`fixed-renderer-ipc` 远端路由下沉 | 03 | 1–2 天 |

## 6. 验收

- 单测：workspace 越界用例集；sender 校验（无窗口、子 frame、其他 webContents）均拒绝；`openExternalSafely` 协议白名单。
- 静态：`check-ipc-channels` 通过；grep 不再出现 `RUNTIME_V2_DESKTOP_CHANNELS` / `RUNTIME_V2_DESKTOP_SHELL_CHANNELS`。
- Electron 真机（按 `docs/FRONTEND_VERIFICATION.md`）：
  - 点击消息中的外链 → 在系统浏览器打开，主窗口不跳转。
  - 右侧文件树、预览、Review、终端、「创建 PR 后打开」均正常。
  - macOS 关窗再从 Dock 打开 → 无孤儿 pty（`ps` 核对）。
  - 退出应用 → 无残留 Browser Bridge / SSH 子进程。
  - CSP 打开后：mermaid、代码高亮、HTML 预览、图片附件、xterm 正常，控制台无 CSP 违规。

## 7. 开放问题（2026-10-05 已拍板）

1. 终端生命周期：**窗口关闭时销毁该窗口拥有的终端**，不做重新 attach。
2. 设置迁移版本：S8（拆分 `settings-service`）只搬代码不改逻辑，历代迁移代码原样保留，不涉及此问题。
3. IPC 入参校验：**手写 guard**，不引入 zod。

范围调整：S6 并入 [13 执行计划](13-Preload与MockBridge执行计划.md)；S7（`applyToEnv` 退役）本轮不做，以后单独设计（本轮只核实子进程是否继承这些 Key）；S8 单独成 [17 执行计划](17-settings-service拆分执行计划.md)；S9 并入 [15 执行计划](15-运行目标执行计划.md)。
