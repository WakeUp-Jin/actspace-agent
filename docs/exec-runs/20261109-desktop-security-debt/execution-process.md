# Desktop 安全遗留清零 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261109-desktop-security-debt.md`
- **执行模式**：交互（Cursor Cloud Agent，用户确认方案后一次执行到底）
- **开始时间**：2026-11-09 12:40
- **结束时间**：2026-11-09 14:10

## 执行时间线

### 步骤 1：核实四条债务与 safeStorage 现状

- **操作**：逐条对照 tracker「Desktop 安全遗留」与代码：grep `process.env.<SEARCH>_API_KEY` 消费者、`sanitizeEnvironment`、`ipcMain.handle` 注册点、`installFromRepo` 调用链、`safeStorage.*` 调用点；查 Electron 45 / 46 的 safeStorage 变更。
- **决定**：
  - C1 属实但描述过期：Desktop 工具端口早已从 `ModelRuntimeService.getToolEnvironment()` 拿搜索 Key（`runtime-v2/tool-host-services.ts`），`settings/env.ts` 往 env 写 Key 是死代码；「终端 pty 经 `sanitizeEnvironment` 过滤」已随终端模块删除失效。
  - IPC 守卫一条实质已随 13 完成（注册器强制 `assertTrustedSender` + guard），只差审计脚本禁止裸注册。
  - Browser Bridge 与 CSP 属实。
  - `safeStorage` 同步 API（45 弃用、46 移除）仍在 `SecretCrypto` 与 `remote-hosts/credentials.ts` 使用，tracker 未登记，是最紧迫的一条。
- **验证**：结论写入计划「决策记录」。

### 步骤 2：P1 safeStorage 迁异步

- **操作**：`SecretCrypto` 三个方法改返回 Promise；`index.ts` 的 `electronSecretCrypto` 用 `isAsyncEncryptionAvailable / encryptStringAsync / decryptStringAsync`；`store.ts` 的 `decryptLegacySecrets` 改 async；`remote-hosts/credentials.ts` 整体改异步，`get` 读到 `shouldReEncrypt` 时顺手 `set` 重写；8 个测试文件的 crypto fake / electron mock 改异步。
- **影响文件**：`apps/desktop/src/main/{index.ts,settings/types.ts,settings/store.ts,remote-hosts/credentials.ts}`，`apps/desktop/src/main/test/` 下 8 个测试。
- **决定**：保留「任一字段解密失败则整体返回 undefined、保留原文件」语义；`HostCredentials.set` 把可用性检查移进串行链，避免并发时顺序错乱。
- **验证**：8 个相关测试 61 用例通过；`pnpm --filter @actspace/desktop typecheck` 通过。

### 步骤 3：P2 C1 子进程 env

- **操作**：新增 `packages/util/shared/src/child-process-env.ts`（`toolChildEnv` / `hostChildEnv` / `isCredentialEnvName`）及 21 个单测；bash（`tool-shell/node-ports.ts` 三处：直跑、无沙箱、沙箱）、`rg`（`tool-fs-search`）、Browser Bridge `run()`、本地更新 `defaultSpawnHelper` 改 `toolChildEnv`；`run-git.ts`、`review-git-engine.ts`、`review-git-worker.ts`、`remote-hosts/ssh.ts` 改 `hostChildEnv`（git 另加 `GIT_TERMINAL_PROMPT=0`）；`settings/env.ts` 删搜索 Key 写入与 `applyProviderKey`，删 `SEARCH_PROVIDER_ENV_KEYS`，`applyToEnv` 不再接 secrets；`settings-characterization.test.ts` 改为断言凭据键不在 env。
- **决定**：计划原本把 Browser Bridge 编译与更新脚本归到白名单档，执行时改为 `toolChildEnv`——`build.sh` 需要用户的 Go / node 工具链（`GOPATH`、`GOFLAGS`、nvm 等），更新脚本需要 pnpm / corepack 环境，白名单会让它们在真实机器上失效；两者 argv 仍完全由 main 控制，剥离凭据即可。只有 git / ssh 用 `hostChildEnv`。
- **验证**：`@actspace/shared` 245 用例、`tool-shell` 118、`tool-fs-search` 4、desktop 相关 8 文件 61 用例通过；`tool-shell` / `tool-fs-search` / desktop typecheck 通过；`biome lint` 无错误。

### 步骤 4：P3 Browser Bridge 源码目录改 main 选择

- **操作**：契约 `useSourceExtension(string|null)` 拆成 `selectSourceExtension(void)`（main 用 `showOpenDialog` 选目录并校验）与 `useBundledExtension(void)`；`installFromRepo` 入参改 `void`，只编译已保存的 `sourceRoot`；`BrowserBridgeActionResult` 加 `canceled?`；guards 三条改 `NO_INPUT`；`optional-plugin-stubs.ts`、`fixed-renderer-ipc.ts`、`BrowserConnectPanel.tsx` 同步；服务侧 `useSourceExtension` 保存前 `realpath`，`buildAndInstall()` 要求 `build.sh` `lstat().isFile()`。
- **影响文件**：`packages/util/shared/src/{runtime-v2/fixed-renderer.ts,desktop-bridge/contract.ts,browser-bridge.ts}`，`apps/desktop/src/main/{ipc/guards.ts,plugins/optional-plugin-stubs.ts,runtime-v2/fixed-renderer-ipc.ts,browser-bridge-service.ts}`，`apps/desktop/src/renderer/components/extensions/BrowserConnectPanel.tsx`，`ipc-guards.test.ts`、`browser-bridge-service.test.ts`（新增用例：符号链接目录保存为真实路径、未选目录时 `buildAndInstall` 拒绝）。
- **验证**：`check:ipc-channels` 通过（契约 143 个 channel）；`browser-bridge-service` / `ipc-guards` / renderer `extensions-page` / `plugins-section` 155 用例通过；desktop typecheck 通过。

### 步骤 5：P4 CSP

- **操作**：先用本机 headless Chrome 做 `style-src 'self'` 实验（见「遇到的问题」），再在 `window-security.ts` 加 `buildContentSecurityPolicy({ devServerUrl })` 与 `installContentSecurityPolicy(session, policy)`，`index.ts` 在 `app.whenReady` 时装到 `session.defaultSession`；只改 `mainFrame` / `subFrame` 响应，替换已有 CSP 头。
- **决定**：`style-src` 保留 `'unsafe-inline'`（原因见下）；其余按计划严格：`script-src 'self'`、`connect-src 'self'`、`img-src 'self' data: blob:`、`font-src 'self' data:`、`media-src 'self' blob:`、worker / object / frame / frame-ancestors / base-uri / form-action 全 `'none'`。dev 下放开 `script-src 'unsafe-inline'`（Vite react-refresh 预热脚本是内联的）和 `connect-src http(s)://127.0.0.1:5173 ws://127.0.0.1:5173`。
- **验证**：`window-security.test.ts` 新增 3 用例（生产策略字段、dev 放开项、只改文档响应并替换旧头）通过。

### 步骤 6：IPC 审计脚本

- **操作**：`scripts/check-ipc-channels.mjs` 新增规则 6：main 在 `apps/desktop/src/main/ipc/registry.ts` 之外出现 `ipcMain.handle / handleOnce / on / once(` 即失败；`auditIpcChannels` 加 `registrarPath` 参数便于测试。`scripts/test/ipc-channels.test.mjs` 改 1 个用例、加 1 个用例。
- **验证**：`pnpm test:ipc-channels` 13 用例通过；`pnpm check:ipc-channels` 通过。

### 步骤 7：文档同步

- **操作**：tracker 四行划掉并补 safeStorage、`style-src` 残余、偏好 env 三行；`SECURITY.md` 的 IPC 审计、CSP、子进程环境三段改写，「待补强」替换为新的残余项；`front-preload-bridge与mock规范.md` 的检查清单加一条；计划移到 `completed/` 并登记索引；history。

## 遇到的问题

- **问题**：`pnpm --filter @actspace/desktop test` 启动即报 `Failed to resolve import "@actspace/client/sessions"`。
  - **原因**：workspace 包未构建；`build:deps:dev` 又因 `agent-service` 的测试文件引用了未构建的 `session-persistence-jsonl` / `boot` / `composition` 而失败（`tsconfig.json` 的 `include: ["src"]` 把测试一起编进去）。
  - **应对**：先 `pnpm --filter "@actspace/session-persistence-jsonl..." --filter "@actspace/boot..." --filter "@actspace/composition..." build`，再 `build:deps:dev`。属于环境问题，没有改仓库。
- **问题**：严格 `style-src 'self'` 能不能落地。用本机 headless Chrome 跑了一页实验（`meta` CSP `style-src 'self'`，SVG 带 `<style>` 和 `style` 属性）：
  - `innerHTML` 挂载：`<style>` 与 `style` 属性都被拦。
  - `DOMParser` + `importNode` 挂载：`style` 属性生效，`<style>` 被拦。
  - `adoptedStyleSheets` + `el.style.cssText`：都生效。
  - `document.createElement("style")` + `textContent`：被拦。
  - **结论**：mermaid 单独可以用「DOM 挂载 + `<style>` 转 `adoptedStyleSheets`」解决，但 mermaid 输出大量 `style` 属性（`.attr("style", …)`），而 CodeMirror 的 `style-mod` 对 `document` 走 `<style>` 标签 + `textContent`（只对 ShadowRoot 用 `adoptedStyleSheets`），Vite dev 也用 `<style>` 注入。去掉 `'unsafe-inline'` 需要 nonce 贯通 main → CSP 头 → preload → `EditorView.cspNonce`，加 Vite `html.cspNonce`，超出本计划范围，登记为新的一行技术债。本轮 CSP 的价值在 `script-src 'self'` 与 frame / object / connect 的收口。

## 跳过或推迟的事项

- mermaid 内联 `<style>` 改 CSSOM：`style-src` 既然保留 `'unsafe-inline'`，这一步没有收益，随「`style-src` 去 `'unsafe-inline'`」一起做。
- 真机验收：本环境没有 Electron 二进制与显示器，CSP 下 mermaid / 代码高亮 / 图片附件 / Markdown 编辑器是否有违规、Browser Bridge 对话框流程、Agent bash 里 `env` 的可见范围，留给人工按执行摘要验证。
- 升级 Electron 46：不在范围内；P1 只是扫清阻塞。
