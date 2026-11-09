# Desktop 安全遗留清零（C1 子进程 env、Browser Bridge 安装目录、CSP、safeStorage 异步）

## 目标

把 `tech-debt-tracker.md`「Desktop 安全遗留」四条和一条未登记的 Electron 46 阻塞项一次收掉：renderer 不再能让 main 在任意目录跑脚本；子进程不再继承 API Key；主文档有严格 CSP；`safeStorage` 不再调用 Electron 46 已移除的同步 API；IPC 审计脚本禁止绕过统一注册器。

## 范围

- 包含：
  - P1 `safeStorage` 同步 API → 异步（`main/index.ts` 的 `electronSecretCrypto`、`settings/types.ts` 的 `SecretCrypto`、`settings/store.ts` 的 v1 迁移解密、`remote-hosts/credentials.ts`）。
  - P2 C1：删除 `settings/env.ts` 里把搜索 Key 写进 `process.env` 的代码；新增共用的子进程环境构造函数，bash / rg / git / Browser Bridge / ssh / 本地更新脚本全部改用。
  - P3 `browserBridge.installFromRepo` 与 `browserBridge.useSourceExtension` 改为 main 弹目录对话框，channel 不再接受路径参数。
  - P4 mermaid SVG 内联 `<style>` 改走 CSSOM；main 用 `onHeadersReceived` 注入严格 CSP。
  - `scripts/check-ipc-channels.mjs`：main 里出现裸 `ipcMain.handle` / `ipcMain.on` 视为失败。
  - 文档：tracker、`docs/SECURITY.md`、history、exec-runs。
- 不包含：
  - 升级 Electron 到 46（本计划只消除同步 API 依赖，升级另起）。
  - `applyToEnv` 里的非敏感偏好（`IMAGE_GENERATION_BASE_URL` / `ACTSPACE_*` / `LLM_*`）退役：它们仍被 `settings/defaults.ts` 首启动读取，不是安全问题，本轮不动。
  - Bash 沙箱的网络域名过滤（tracker v1 历史债务）。
  - CLI Host 的 env 读取（`packages/host/agent-host/src/node-ports/tool-host-services.ts`）：CLI 本来就以显式环境变量为凭据入口。

## 背景

- 相关文档：`docs/exec-plans/tech-debt-tracker.md`「Desktop 安全遗留」；`docs/exec-plans/completed/design-archive/desktop-frontend-refactor/01-安全与IPC收口.md` P0-3、P1-1；`docs/exec-runs/20261005-desktop-fe-11-security-ipc/execution-summary.md`（CSP 实验结论）；`docs/SECURITY.md`「Electron 进程隔离」。
- 相关代码路径：
  - `apps/desktop/src/main/settings/env.ts`、`settings/constants.ts`（`SEARCH_PROVIDER_ENV_KEYS`）、`settings/store.ts`、`settings/types.ts`。
  - `apps/desktop/src/main/index.ts:106-110`、`apps/desktop/src/main/remote-hosts/credentials.ts`。
  - `packages/shell/tool-shell/src/node-ports.ts`（bash 三个分支）、`packages/fs/tool-fs-search/src/node-ports.ts`（rg）、`apps/desktop/src/main/git/run-git.ts`、`review-git-engine.ts`、`review-git-worker.ts`、`browser-bridge-service.ts`（`run`）、`remote-hosts/ssh.ts`、`local-update-service.ts`（`defaultSpawnHelper`）。
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`（`browserBridge.*`）、`main/ipc/guards.ts`、`packages/util/shared/src/desktop-bridge/contract.ts`、`apps/desktop/src/renderer/components/extensions/BrowserConnectPanel.tsx`。
  - `apps/desktop/src/renderer/components/messages/mermaid-renderer.ts`、`main/window-security.ts`、`apps/desktop/index.html`。
  - `scripts/check-ipc-channels.mjs`、`scripts/check-ipc-channels.test.mjs`。
- 已知约束：
  - Electron 官方 breaking-changes：同步 `safeStorage.isEncryptionAvailable / encryptString / decryptString` 在 45 弃用、46 移除；旧密文可用 `decryptStringAsync` 解；`decryptStringAsync` 返回 `{ result, shouldReEncrypt }`。当前 `apps/desktop/package.json` 是 `electron ^45.2.3`。
  - Desktop 的工具凭据已由 `model-runtime-service.ts getToolEnvironment()` 直接从 secrets store 注入（`runtime-v2/tool-host-services.ts`），Desktop 内没有任何代码读 `process.env.<SEARCH>_API_KEY`，删 env 写入不改行为。
  - 11 的 CSP 实验结论：React style prop 走 CSSOM 不受 `style-src` 限制；阻碍只剩 mermaid SVG 内嵌 `<style>`（HTML 预览已删）。
  - 子进程 env 的产品取舍（2026-11-09 决定，见决策记录）：工具类子进程（bash / rg）继承用户环境但剥离密钥模式变量；Desktop 自己发起的 git / ssh / Browser Bridge / 更新脚本用严格白名单。

## 风险

- 风险：剥离 env 后用户依赖环境变量的开发工作流（`gh`、`aws`、`npm publish`）在 Agent bash 里失效。
  - 缓解：工具类子进程只剥 `*_API_KEY / *_SECRET* / *_TOKEN / *_PASSWORD / AWS_* / GH_TOKEN / GITHUB_TOKEN / NPM_TOKEN` 等明确的凭据模式，`PATH` / `HOME` / locale / 代理变量全部保留；剥离规则单测覆盖；SECURITY.md 写明。
- 风险：`safeStorage` 异步化后 v1 secrets 迁移路径的错误处理变化。
  - 缓解：`decryptLegacySecrets` 保持「任一字段失败则整体返回 undefined、保留原文件」语义；`runtime-v2-settings-migration.test.ts` 已覆盖该路径，fake crypto 改成 Promise 后重跑。
- 风险：严格 CSP 拦掉现有功能（highlight.js、图片附件 data/blob URL、markdown 编辑器）。
  - 缓解：策略允许 `img-src data: blob:`、`font-src data:`；dev 模式放开 Vite HMR；单测覆盖策略字符串；真机验收按 `execution-summary.md` 清单逐项过，控制台无 CSP 违规。
- 风险：Browser Bridge 改对话框后 `useSourceExtension` 的 renderer 调用方式变化。
  - 缓解：契约、guards、preload 由 `check:ipc-channels` 和 `ipc-guards.test.ts` 守一致；`BrowserConnectPanel.tsx` 只剩两个按钮调用。

## 里程碑

1. P1 safeStorage 异步（独立 commit）。
2. P2 C1：删 env Key 写入 + 子进程 env 构造函数（独立 commit）。
3. P3 Browser Bridge 目录对话框（独立 commit）。
4. P4 mermaid CSSOM + CSP（独立 commit）。
5. IPC 审计脚本 + 文档同步（独立 commit）。

## 验证方式

- 命令：`pnpm lint`、`pnpm --filter @actspace/desktop test`（含 `settings-characterization`、`runtime-v2-settings-migration`、`remote-host-registry`、`ipc-guards`、`browser-bridge-service`）、`pnpm --filter @actspace/tool-shell test`、`pnpm --filter @actspace/tool-fs-search test`、`pnpm check:ipc-channels`、`pnpm test:ipc-channels`、`pnpm check:hot-path-reads`、`pnpm check:docs`。
- 手工检查（真机，按 `docs/exec-runs/20261109-desktop-security-debt/execution-summary.md`）：mermaid 图、代码高亮、图片附件、Markdown 编辑器在 CSP 下正常且控制台无违规；扩展 › 浏览器「选择源码扩展」「从源码编译」走系统对话框；Agent bash 里 `env | grep -i key` 看不到搜索 Key。
- 观测检查：Electron 45 下主进程日志不再出现 `safeStorage` 同步 API 弃用警告。

## 进度记录

- [x] 核实四条债务与 safeStorage 现状（2026-11-09，结论见决策记录）。
- [x] P1 safeStorage 异步（2026-11-09）。
- [x] P2 C1（2026-11-09）。
- [x] P3 Browser Bridge（2026-11-09）。
- [x] P4 CSP（2026-11-09；mermaid CSSOM 与 `style-src` 收紧推迟，见决策记录）。
- [x] IPC 审计脚本 + 文档同步（2026-11-09）。

## 决策记录

- 2026-11-09：tracker 对 C1 的描述已过期——「工具配置改由 Runtime 配置端口注入」已在 `getToolEnvironment()` 完成，Desktop 内无 `process.env.<SEARCH>_API_KEY` 消费者；「只有终端 pty 经 `sanitizeEnvironment` 过滤」已失效（终端模块已删）。所以 C1 不需要单独设计，直接删 env 写入并给子进程加 env 构造函数。
- 2026-11-09：子进程 env 分两档。工具类（bash / rg）继承 + 剥离凭据模式：Agent 要能用用户装的工具链，但不该看见 Key；Desktop 自发的 git / ssh / Browser Bridge / 更新脚本用白名单：argv 完全由 main 控制，不需要用户环境。
- 2026-11-09：IPC 守卫一条实际已随 13 完成（注册器强制 sender 校验 + guard，审计脚本以契约为来源）；本计划只补「审计脚本禁止裸 `ipcMain.handle` / `ipcMain.on`」并更新文档。
- 2026-11-09：safeStorage 是 Electron 46 阻塞项但 tracker 未登记，并入本计划作为 P1 最先做；Electron 升级本身不在本计划内。
- 2026-11-09（执行中调整）：Browser Bridge 编译脚本与本地更新脚本改用工具档 `toolChildEnv` 而不是白名单——`build.sh` 依赖用户的 Go / node 工具链变量，更新脚本依赖 pnpm / corepack 环境，白名单在真实机器上会直接失效；argv 仍由 main 控制，剥离凭据足够。只有 git / ssh 用 `hostChildEnv` 白名单。
- 2026-11-09（执行中调整）：`style-src` 保留 `'unsafe-inline'`，mermaid CSSOM 改造不做。headless Chrome 实测 `style-src 'self'` 下：`innerHTML` 挂载的 `<style>` 与 `style` 属性都被拦；`DOMParser` + `importNode` 只救得了 `style` 属性；`createElement("style")` + `textContent` 被拦。mermaid 输出大量 `style` 属性、CodeMirror 的 style-mod 对 document 用 `<style>` 标签、Vite dev 也用 `<style>` 注入，去 `'unsafe-inline'` 需要 nonce 贯通（`EditorView.cspNonce` + Vite `html.cspNonce`），另登记 tracker。本轮 CSP 的收益在 `script-src 'self'` 与 frame / object / connect / base-uri / form-action 收口。

## 执行模式

- **交互模式**：人在线，Agent 操作逐步审批。改动涉及凭据存储和 IPC 契约。

## 执行文档

- `docs/exec-runs/20261109-desktop-security-debt/execution-process.md`
- `docs/exec-runs/20261109-desktop-security-debt/execution-summary.md`
