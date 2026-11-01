# P6 浏览器与英语学习默认不加载

> 2026-11-01：本子计划不单独执行，已并入[插件结构 S3](../20261101-plugin-structure/s3-plugin-page.md)。下文的「机制」和 main 侧步骤 2、3（行号与判空清单）由 S3 直接引用，开关来源从 `tools.optionalCapabilities` 换成 `tools.plugins`。

## 目标

Agent 操控浏览器和英语学习变成“可选能力”：默认关闭；关闭时不创建服务、不轮询、不注册专属接口、界面上只剩「能力」页的一个启用开关。打开开关并重启后，与现在的行为一致。

## 范围

- 包含：设置字段、桌面 main 的条件创建、host 能力上报、IPC 桩、renderer 入口收拢、测试、文档。
- 不包含（留到第二步插件结构）：
  - 把 browser-tools 从 `@actspace/runtime` 的依赖和重导出中拆出去。
  - 从默认安装包里拿掉 Go 程序、Chrome 扩展和 `browser-components`。第一步里用户仍要能在设置中启用，所以打包内容不变。
  - CI 的 `check:browser` 和 Go 测试（代码仍在仓库里，门禁保留）。
  - 英语学习相关的设置 schema（`media.speech`、`general.englishLearning`、`speech-minimax` 密钥）不动，避免迁移。

## 必读

- `AGENTS.md`（「外部能力代码」一节）
- [01 功能减法设计](../../../design-docs/架构优化/01-功能减法设计.md) 第 5、6 节
- `docs/design-docs/browser/` 下的现有设计
- `docs/design-docs/agent-plugin-runtime/agent-english-learning.md`

## 机制

- **浏览器**：现有 `packages/runtime/src/startup/boot.ts:143` 在 host 能力里没有 `browser` 时已经禁用 `browser-tools` 条目。所以只要桌面端关闭时不创建 `BrowserBridgeService`、不创建 browser capability、不上报 `browser` 能力，后端就不会加载浏览器工具。runtime 不需要改。
- **英语学习**：它通过 `packages/desktop-app/src/bundle.ts` 的 `DESKTOP_APP_BUNDLE` 进入组合，loader 条目在 `packages/runtime/cordis.yml` 和 `TRUSTED_LOADER_ENTRIES` 里（两者 boot 时校验一致，不能只删一边）。关闭时由桌面端给 `createProfileComposition` 传 `invocationPatch`，对 english-learning 条目做 `disable` 操作（`packages/bundle/src/index.ts` 的 `PatchOperation`）；boot 只加载 `enabled && state !== "skipped"` 的条目（`boot.ts:96`）。不改 cordis.yml，不改 bundle。

## 步骤

路径相对仓库根，`D=apps/desktop/src`。行号以 `b590e02f` 为准，动手前复核。

### 1. 设置字段

- `packages/shared/src/settings.ts`：`SettingsV4Tools` 新增 `optionalCapabilities?: { browser?: boolean; englishLearning?: boolean }`，注释写明“缺省为关闭，修改后重启生效”。
- `D/main/settings/defaults.ts`：默认 `{ browser: false, englishLearning: false }`。
- `D/main/settings/migrations.ts` 的 tools 规范化（约 268–277 行）：`optionalCapabilities: { browser: x.browser === true, englishLearning: x.englishLearning === true }`。不升 schema 版本。
- 更新 `D/main/test/settings-characterization.test.ts` 的 fixtures（`D/main/test/fixtures/settings/**`）以包含新字段。
- `D/main/index.ts` 启动时读取一次这两个值，作为本次进程的开关（不在运行中热切换）。

### 2. 浏览器：main

- `D/main/index.ts`：
  - `new BrowserBridgeService(...)`（约 182–187 行）和整段轮询（约 242–267 行，`syncBrowser`、`scheduleBrowserSync`）包进 `if (optional.browser)`。关闭时不安装或注册 Native Host、不写托管 skill、不起定时器。
  - 传给 registry 和 `registerFixedRendererIpc` 的 `browser` / `browserBridge` 在关闭时为 `undefined`。
  - 清理与 `dispose`（约 317、336 行）判空。
- `D/main/runtime-v2/desktop-host-adapter.ts`：`options.browser` 改为可选；缺省时不调用 `createDesktopBrowserCapability`、不追加 `"browser"` 能力、不注册 `host.browser` 与 `BROWSER_TOOLS_HOST_PORT_ID`、不写 `BROWSER_BRIDGE_UNAVAILABLE` 告警（约 7、44、53、70、93、134、158 行）。
- `D/main/runtime-v2/runtime-registry.ts`：`options.browser` 改为可选，`refreshBrowser`、重配置与恢复、`endTurn`、`browserReady` 全部判空（约 54–55、76–110、488–490、546、564、582–590、615 行）。
- `D/main/runtime-v2/fixed-renderer-ipc.ts`：`browserBridge` 改为可选。关闭时仍注册 10 个 channel，但用桩 handler：`getStatus` 返回“未启用”状态，其余返回错误“浏览器能力未启用”。channel 和契约不删，`check:ipc-channels` 保持通过。若现有 `BrowserBridgeStatus` 没有合适的状态值，新增 `"disabled"`。`openExtensions` 里的 `spawn open -a "Google Chrome"` 移进 `BrowserBridgeService`。

### 3. 英语学习：main

- `D/main/runtime-v2/desktop-host-adapter.ts`：关闭时给 `createProfileComposition` 传 `invocationPatch`，`disable` english-learning 条目；`"actspace.host.speech"` 服务不注入。
- `D/main/index.ts`：关闭时不创建 `DesktopSpeechPlayback`（约 199–200 行），`registerEnglishLearningIpc` 改为注册桩 handler：`getState` 返回 `enabled: false` 且带“英语学习未启用”提示的状态，其余返回错误。
- `D/main/runtime-v2/runtime-registry.ts`：`englishLearning()` 相关路径（约 259–260 行的归档联动、约 577 行的启动恢复 `enableSession`、`#bindLearningNotifications`）在关闭时跳过，不抛错。

### 4. renderer

- 新增 `apps/desktop/src/renderer/hooks/useOptionalCapabilities.ts`：从 `settingsApi.getV4()` 读取 `tools.optionalCapabilities`。模块级变量记下窗口加载后第一次读到的值，作为“本次启动的值”；之后读到的值与它不同，就是“已改、未重启”。不新增 IPC。已知边界：只刷新窗口、不重启应用时，会把已改的值当成启动值，此时入口显示与实际加载状态可能不一致，重启即恢复。
- `components/extensions/CapabilitiesSection.tsx`：两张卡片都显示标题、一句说明和「启用」开关（`Toggle`）。开关写设置；当前值与启动时值不同，显示“重启 ActSpace 后生效”。关闭状态下不渲染 `BrowserConnectPanel` 和 `EnglishLearningCapability` 的细节，也不调用 `useBrowserBridgeStatus` / `englishLearningApi`。
- `components/settings/sections/ToolsSection.tsx` 与 `components/settings/tool-catalog.ts`：浏览器关闭时隐藏“浏览器”工具组。
- `components/settings/SettingsPage.tsx`：英语学习关闭时不挂载 `SpeechSettingsSection`（约 15、195 行）；`focusSpeech` 链路保留。
- `BrowserApprovalBlock`、`stream-blocks.ts` 的 `browser_` 分支按工具名触发，关闭时不会出现，保留不改。

### 5. 测试

- 新增：
  - `D/main/test/optional-capabilities.test.ts`：关闭时不创建浏览器服务、不起定时器、不上报 `browser` 能力；english-learning 条目被 disable；桩 handler 返回值。
  - `renderer/test/capabilities-section.test.tsx`：开关、重启提示、关闭时不请求浏览器状态和英语学习状态。
- 修改：
  - `D/main/test/runtime-v2-browser-reconfigure.test.ts`：显式传入 browser（启用路径），并新增“未传 browser”用例。
  - `D/main/test/browser-bridge-service.test.ts`、`english-learning-ipc.test.ts`、`english-learning-settings.test.ts`：按启用路径保留。
  - `renderer/test/extensions-page.test.tsx`、`english-learning.test.tsx`：先打开开关再断言原有行为。
  - `packages/runtime/src/harness/english-learning.test.ts`：增加 disable patch 后条目被跳过的用例。

### 6. 文档

- `AGENTS.md`「外部能力代码」一节：说明浏览器能力默认不加载、在「能力」页启用。
- `README.md`（约 43、101、115 行）、`docs/ARCHITECTURE.md`（约 13、21、54、63、88–91 行）、`docs/roadmap.md`（约 22、25 行）。
- `docs/design-docs/browser/` 各篇与 `agent-english-learning.md` 开头加状态说明“默认不加载，在设置 › 能力中启用”。
- 站点 `apps/site/src/content/docs/browser.md`、`english-learning.md` 加同样说明。
- `docs/exec-plans/active/20260928-chrome-connect-experience.md` 顶部注明“随功能减法暂停”。
- `docs/releases/feature-release-notes.md`、`docs/histories/`。

## 验证

- 命令：README「统一验证命令」+ 依赖类命令（`pnpm --filter @actspace/runtime test`、`pnpm test:contract-matrix`）。
- 常驻开销检查：默认设置下启动 Electron，60 秒内 main 日志里没有浏览器状态轮询，`ps` 看不到 `abb` 相关进程；数据目录下不新写 Native Host 清单。
- 手工检查（Electron）：
  - 默认：「能力」页两张卡片只有开关；工具设置里没有浏览器组；常规设置里没有语音设置；Agent 的工具列表里没有 `browser_*`。
  - 打开浏览器开关，提示“重启后生效”；重启后连接面板、工具组、`browser_*` 工具都回来，Chrome 扩展可连接。
  - 打开英语学习开关并重启：选目标会话、双语回答、朗读与现在一致。

## 风险

- `runtime-registry.ts` 里浏览器和英语学习的逻辑交织约 20 处，判空漏一处会在启动或恢复时报错。缓解：`runtime-v2-browser-reconfigure.test.ts` 加“未传 browser”用例，手工检查覆盖启动、新建会话、归档会话。
- disable patch 的 `target` 写法不对会导致 boot 校验失败。缓解：先在 `english-learning.test.ts` 写用例确认再接入桌面端。

## 回滚

`git revert` 本子计划的提交。设置里多出的 `optionalCapabilities` 字段对旧代码无害（规范化时被丢弃）。
