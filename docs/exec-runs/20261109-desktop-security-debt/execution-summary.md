# Desktop 安全遗留清零 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261109-desktop-security-debt.md`
- **执行过程**：`docs/exec-runs/20261109-desktop-security-debt/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（代码与自动化验证完成；Electron 真机验收未做；`style-src` 保留 `'unsafe-inline'` 作为新登记的债）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| safeStorage 迁异步 | `apps/desktop/src/main/{index.ts,settings/types.ts,settings/store.ts,remote-hosts/credentials.ts}` + 8 个测试 | Electron 46 删同步 API；`SecretCrypto` 与 `HostCredentials` 全改 `*Async`，读到 `shouldReEncrypt` 时重写 |
| 子进程 env 构造函数 | `packages/util/shared/src/child-process-env.ts`（新）、`index.ts`、单测 | `toolChildEnv` 继承 + 剥离凭据模式变量；`hostChildEnv` 基础白名单 |
| 子进程接入 | `tool-shell/node-ports.ts`、`tool-fs-search/node-ports.ts`、`browser-bridge-service.ts run()`、`local-update-service.ts`（tool）；`git/run-git.ts`、`review-git-engine.ts`、`review-git-worker.ts`、`remote-hosts/ssh.ts`（host） | bash / rg / 编译 / 更新脚本看不到 Key 但能用用户工具链；git / ssh 只拿 PATH / HOME / 代理 / locale |
| 删 env 里的搜索 Key | `settings/env.ts`、`settings/constants.ts`、`settings/store.ts`、`settings-characterization.test.ts` | Desktop 工具端口早已直接从 `getToolEnvironment()` 拿 Key，env 写入是死代码；`applyToEnv` 现在只清凭据键、写偏好 |
| Browser Bridge 源码目录 | `desktop-bridge/contract.ts`、`runtime-v2/fixed-renderer.ts`、`browser-bridge.ts`、`ipc/guards.ts`、`optional-plugin-stubs.ts`、`fixed-renderer-ipc.ts`、`browser-bridge-service.ts`、`BrowserConnectPanel.tsx` | `selectSourceExtension` 由 main 弹目录对话框；`installFromRepo` 无参只编译已保存目录；保存前 `realpath`，`build.sh` 须为普通文件 |
| 主文档 CSP | `window-security.ts`、`index.ts`、`window-security.test.ts` | `onHeadersReceived` 下发；生产 `script-src 'self'`、frame / object / worker / base-uri / form-action `'none'`；dev 放开 Vite 需要的内联脚本与 ws |
| IPC 审计 | `scripts/check-ipc-channels.mjs`、`scripts/test/ipc-channels.test.mjs` | 注册器之外出现 `ipcMain.handle / on` 即失败 |
| 文档 | `tech-debt-tracker.md`、`SECURITY.md`、`front-preload-bridge与mock规范.md`、计划与索引、history | 四条划掉，新增 safeStorage（已解）、`style-src`、偏好 env 三行 |

## 人工验证指引

### 必须验证

1. **CSP 下现有界面无违规**（macOS 真机，`pnpm dev:log` 与打包版各一次）
   - 验证方式：打开 DevTools Console；依次：发一条含 mermaid 代码块的回复、含代码高亮的回复、含 KaTeX 公式的回复；拖一张图片做附件并预览；打开右侧「MD 文档」面板编辑；打开统计页；mermaid 图点「下载 PNG」。
   - 预期结果：Console 没有 `Refused to …` 的 CSP 违规；各功能渲染正常。dev 下 Electron 不再打印「Insecure Content-Security-Policy」之外的 CSP 警告（dev 允许 `'unsafe-inline'` 脚本，这条警告仍会有；打包版应完全没有）。
2. **Browser Bridge 源码目录流程**
   - 验证方式：扩展 › 浏览器 › 高级开发选项 → 「选择源码扩展」。
   - 预期结果：弹出系统目录对话框；选到不含 `browser-bridge/apps/chrome-extension` 的目录时提示「该目录缺少有效的 ActSpace Chrome 扩展。」；选对后「源码：」显示真实路径（符号链接被解析）；「从源码编译」不再需要路径，编译成功；「切回随包扩展」清掉路径。取消对话框不报错。
3. **Agent bash 看不到 Key**
   - 验证方式：设置里配置一个 Tavily Key；在会话里让 Agent 执行 `env | grep -i -E 'key|token|secret'`。
   - 预期结果：输出里没有 `TAVILY_API_KEY`；如果你的 shell 自己导出了 `GITHUB_TOKEN` 等，也不会出现。`PATH`、`HOME`、`LANG` 等正常，`which go` / `node -v` 和你终端里一致。
4. **远程主机凭据（safeStorage 异步）**
   - 验证方式：设置 › 远程主机新增一台（任意配对 token），重启应用后再看。
   - 预期结果：重启后主机仍在、连接状态正常；主进程日志没有 `safeStorage` 相关错误；Electron 45 下不再出现同步 API 弃用警告。
5. **旧 secrets v1 迁移**
   - 验证方式：如果手头有 v1 的 `secrets.json`（`version: 1`，密文字段），放到 dataRoot 启动。
   - 预期结果：启动后变为 `version: 2` 明文、权限 600，设置页 Key 状态「已配置」。没有 v1 文件可跳过（`runtime-v2-settings-migration.test.ts` 已覆盖）。

### 建议验证

1. **git / ssh 子进程在白名单 env 下正常**
   - 验证方式：审查面板打开一个 diff；配置了 SSH 远程主机的话连一次。
   - 预期结果：diff 正常；ssh 用到 `SSH_AUTH_SOCK` 的 agent 认证仍可用（白名单已包含）。如果你的 git 依赖 `GIT_SSH_COMMAND`、`GIT_CONFIG_GLOBAL` 等自定义变量，这些现在不会传给 Desktop 自己发起的 git，请反馈。
2. **本地更新脚本**
   - 验证方式：设置 › 本地更新执行一次。
   - 预期结果：脚本能找到 pnpm / corepack（env 已继承）；日志无 `command not found`。
3. **Browser Bridge 从源码编译**
   - 验证方式：选好源码目录后点「从源码编译」。
   - 预期结果：`build.sh` 能找到 Go（`toolChildEnv` 保留 `GOPATH` 等），编译完成。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop typecheck`、`@actspace/tool-shell` / `@actspace/tool-fs-search` typecheck：通过。
- desktop vitest：P1 / P2 相关 8 文件 61 用例、P3 相关 4 文件 155 用例、`window-security.test.ts` 11 用例通过。
- `@actspace/shared` 31 文件 245 用例、`tool-shell` 118 用例、`tool-fs-search` 4 用例通过。
- `pnpm check:ipc-channels`（143 channel）、`pnpm test:ipc-channels`（13 用例）通过。
- `pnpm check:docs`、`pnpm check:hot-path-reads`、`pnpm lint`：见 history 记录的最终一轮结果。
- headless Chrome CSP 实验（`style-src 'self'` 下各种样式注入方式的表现）：记录在执行过程「遇到的问题」。

## 已知风险和遗留事项

- `style-src` 保留 `'unsafe-inline'`：mermaid `style` 属性、CodeMirror style-mod、Vite dev 注入三者都依赖；已登记 tracker 一行并写明路线（DOM 挂载 + `adoptedStyleSheets`、`EditorView.cspNonce`、`html.cspNonce`）。
- `toolChildEnv` 是模式过滤：名字不含 `KEY / TOKEN / SECRET / PASSWORD / CREDENTIAL` 的敏感变量仍会被 Agent bash 看到。这是保留「Agent 可用用户工具链」的产品取舍，SECURITY.md 已写明。
- `hostChildEnv` 未放行 `GIT_*` / `GIT_SSH_COMMAND` 等自定义 git 变量：依赖它们的用户会看到行为变化。如有反馈，在 `HOST_ENV_PREFIXES` 加 `GIT_` 并评估 `GIT_CONFIG_*` 的注入面。
- CSP `connect-src 'self'`：renderer 目前不直接联网（全走 IPC）。将来若有 renderer 直连的功能（例如本地 Host 的 WebSocket），需要同步改策略。

## 后续建议

- 下一步可以直接升级 Electron 46（safeStorage 阻塞已清），升级计划里把「CSP 真机走查」合并进去一起做。
- 偏好 env（`ACTSPACE_DISABLED_TOOLS` 等）退役：找出 Desktop 内还在读这些 env 的路径，改走 settings 读模型后删 `applyToEnv`。
