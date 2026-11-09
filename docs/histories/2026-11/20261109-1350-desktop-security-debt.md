## [2026-11-09 13:50] | Task: Desktop 安全遗留清零（safeStorage 异步、子进程 env、Browser Bridge 目录、CSP、IPC 审计）

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 安全债（tracker「Desktop 安全遗留」四条一条没动）……你看一下是否属实，是否确认，然后我们接下来的优化和调整方案是什么？……你就开始执行呗

### 🛠 Changes Overview

**Scope:** `apps/desktop/src/main/`（`index.ts`、`settings/`、`remote-hosts/`、`git/`、`review-git-*.ts`、`browser-bridge-service.ts`、`local-update-service.ts`、`window-security.ts`、`ipc/guards.ts`、`runtime-v2/fixed-renderer-ipc.ts`、`plugins/optional-plugin-stubs.ts`）、`apps/desktop/src/renderer/components/extensions/BrowserConnectPanel.tsx`、`packages/util/shared/src/`（新增 `child-process-env.ts`、`desktop-bridge/contract.ts`、`runtime-v2/fixed-renderer.ts`、`browser-bridge.ts`）、`packages/shell/tool-shell/src/node-ports.ts`、`packages/fs/tool-fs-search/src/node-ports.ts`、`scripts/check-ipc-channels.mjs`、测试、`docs/`

**Key Actions:**

- **safeStorage 迁异步**：`SecretCrypto` 与 `HostCredentials` 全部改用 `isAsyncEncryptionAvailable / encryptStringAsync / decryptStringAsync`；`decryptLegacySecrets` 改 async；读到 `shouldReEncrypt` 时顺手重写。Electron 46 会移除同步 API，这是升级前的阻塞项。
- **子进程 env 两档**：新增 `toolChildEnv`（继承 + 剥离名字匹配 `API_KEY / ACCESS_KEY / PRIVATE_KEY / SECRET / TOKEN / PASSWORD / CREDENTIAL` 的变量）和 `hostChildEnv`（`PATH / HOME / 代理 / locale / SSH_AUTH_SOCK` 等白名单）。bash（直跑、无沙箱、沙箱三分支）、`rg`、Browser Bridge 编译、本地更新脚本用前者；Desktop 自己拼 argv 的 git（含审查引擎与 worker）、ssh 用后者。
- **删 env 里的搜索 Key**：`settings/env.ts` 不再把 DeepSeek / Kimi / 智谱 / Tavily / TinyFish / Exa Key 写进 `process.env`（Desktop 工具端口早已走 `getToolEnvironment()` 直接注入，写 env 是死代码），改为主动清掉这些键；删 `SEARCH_PROVIDER_ENV_KEYS` 与 `applyProviderKey`。
- **Browser Bridge 源码目录改 main 选择**：`useSourceExtension(path)` 拆成 `selectSourceExtension()`（main 用 `showOpenDialog` 选目录并校验）与 `useBundledExtension()`；`installFromRepo()` 不再接受路径，只编译已保存的 `sourceRoot`；保存前 `realpath`，`build.sh` 必须是普通文件。renderer 不再能让 main 在任意目录跑脚本。
- **主文档 CSP**：`window-security.ts` 新增 `buildContentSecurityPolicy` / `installContentSecurityPolicy`，`app.whenReady` 时装到 `session.defaultSession.webRequest.onHeadersReceived`，只改 mainFrame / subFrame 响应。生产 `script-src 'self'`、`connect-src 'self'`、worker / object / frame / frame-ancestors / base-uri / form-action 全 `'none'`；dev 放开 Vite 需要的内联脚本和 `127.0.0.1:5173` ws。`style-src` 保留 `'unsafe-inline'`（见下）。
- **IPC 审计**：`check-ipc-channels.mjs` 新增规则，`apps/desktop/src/main/ipc/registry.ts` 之外出现 `ipcMain.handle / handleOnce / on / once(` 即失败。
- **文档**：tracker「Desktop 安全遗留」四行划掉，新增 safeStorage（已解）、`style-src` 去 `'unsafe-inline'`、偏好 env 退役三行；`SECURITY.md` 的 IPC 审计、CSP、子进程环境三段改写；`front-preload-bridge与mock规范.md` 检查清单加一条；计划 `20261109-desktop-security-debt.md` 移到 `completed/` 并登记；exec-runs 两份文档。

### 🧠 Design Intent (Why)

- 子进程 env 分两档而不是统一白名单：Agent bash 要能用用户装的工具链（nvm、Go、pyenv 都靠环境变量），统一白名单会把 Agent 废掉；但 Desktop 自己拼 argv 的 git / ssh 不需要用户环境，白名单更稳。Browser Bridge 编译脚本和更新脚本虽然 argv 由 main 控制，但依赖 Go / pnpm 工具链，执行时从白名单档改到工具档。
- `style-src` 保留 `'unsafe-inline'`：用 headless Chrome 实测 `style-src 'self'`——`innerHTML` 挂载的 `<style>` 与 `style` 属性都被拦，`DOMParser` + `importNode` 只救 `style` 属性，`createElement("style")` + `textContent` 被拦。mermaid 输出大量 `style` 属性、CodeMirror 的 style-mod 对 document 用 `<style>` 标签、Vite dev 用 `<style>` 注入，三者都要动才能去掉，需要 nonce 贯通 main → CSP → `EditorView.cspNonce` / Vite `html.cspNonce`，超出本轮范围，登记为新债。本轮 CSP 的收益在 `script-src 'self'` 与 frame / object / connect 的收口。
- CSP 用 `onHeadersReceived` 而不是 `<meta>`：`frame-ancestors` 等指令在 `<meta>` 里无效，而且 dev / 生产策略不同，由 main 按 `DEV_SERVER_URL` 生成更可控。
- Browser Bridge 走 `showOpenDialog` 而不是校验 renderer 传来的路径：路径由用户在系统对话框选定，renderer 根本拿不到入口，比「白名单目录」更简单也更严。
- 验证：desktop / shared / tool-shell / tool-fs-search 相关 vitest 全通过；desktop、tool-shell、tool-fs-search typecheck 通过；`check:ipc-channels`（143 channel）、`test:ipc-channels`、`check:docs`、`check:hot-path-reads`、`pnpm lint` 通过。本环境无 Electron 二进制，CSP 真机走查、Browser Bridge 对话框、Agent bash `env` 可见范围留给人工，清单在 `docs/exec-runs/20261109-desktop-security-debt/execution-summary.md`。
