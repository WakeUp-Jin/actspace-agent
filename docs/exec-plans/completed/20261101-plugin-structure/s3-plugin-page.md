# S3 插件开关与插件页

## 目标

能关的插件（本轮是操控浏览器、英语学习）默认关闭。关闭时不加载、没有常驻开销。扩展页的「能力」标签改为「插件」页：分「全局插件」「会话插件」两组，列出当前形态里组合进来的全部插件，能关的给开关，改了以后提示重启生效。本子计划取代功能减法 P6。

## 范围

- 包含：
  - 设置字段 `tools.plugins`；
  - 关闭时的加载控制；
  - 桌面 main 里浏览器和英语学习的条件创建、IPC 桩；
  - 新 IPC `plugins.list`；
  - 插件页；
  - 浏览器工具组和语音设置跟随开关隐藏；
  - 测试和文档。
- 不包含：
  - 其他插件的开关；
  - 运行中热切换；
  - 从安装包里拿掉 Go 程序、Chrome 扩展；
  - CI 的 `check:browser` 和 Go 测试；
  - 英语学习相关的设置 schema（`media.speech`、`general.englishLearning`、`speech-minimax` 密钥）。

## 必读

- [02 插件结构设计](../../../design-docs/架构优化/02-插件结构设计.md) §7
- demo plugins-page-demo.html（原文已删除，见 git 历史）：按方案 B（用户 2026-11-01 选定）实现，浅色和深色都要对照
- [功能减法 P6](../20261101-feature-subtraction/p6-optional-capabilities.md)：它的「机制」和 main 侧步骤 2、3 的行号与判空清单仍然有效，本子计划直接沿用，只把开关来源从 `tools.optionalCapabilities` 换成 `tools.plugins`
- `docs/design-docs/frontend/front-主题与配色规范.md`、设置页现有样式（`SettingsPrimitives.tsx`、`SkillsSection.tsx`）

## 步骤

`D=apps/desktop/src`。

### 1. 设置

- `packages/util/shared/src/settings.ts`：`SettingsV4Tools` 增加 `plugins?: Record<string, boolean>`。注释写明三点：key 是 Entry id；缺省取 manifest 的 `display.defaultEnabled`；修改后重启生效。
- `D/main/settings/migrations.ts` 的 tools 规范化：`plugins` 只保留值为布尔的项，其他丢弃。不升 schema 版本。
- `D/main/settings/defaults.ts`：不写默认值（缺省由 manifest 决定）。
- 新文件 `D/main/plugins/plugin-switches.ts`：
  - `resolvePluginSwitches(settings)` 返回 `Map<entryId, boolean>`：遍历 `PLUGIN_CATALOG`，`canDisable` 的取 `settings.tools.plugins?.[id] ?? display.defaultEnabled`，其余恒为 `true`。
  - `D/main/index.ts` 启动时调用一次，结果作为本次进程的“启动开关”，传给下面各处。

### 2. 加载控制

- 全局插件关闭：`D/main/runtime-v2/desktop-host-adapter.ts` 给 `createProfileComposition` 传 `invocationPatch`，对每个关闭的全局插件做 `disable`（`PatchOperation` 见 `packages/composition/bundle/src/index.ts`）。先在 `packages/core/runtime/src/harness/english-learning.test.ts` 写“disable 之后条目被跳过”的用例，确认 patch 写法。
- 会话插件关闭：对 `browser-tools`，桌面端不上报 `browser` 能力。S2 的通用规则会让它不进 Harness。如果以后有不依赖 Host 能力的会话插件也要能关，就把关闭的会话插件 id 放进 `AGENT_RUNTIME_HOST_PORT_ID` 的 `disabledHarnessEntries`。本步骤在 `boot.ts` 增加可选参数 `disabledPlugins`，把这条路一并打通，并补测试。
- 浏览器关闭时，main 的具体改动照 P6 步骤 2：
  - 不创建 `BrowserBridgeService`；
  - 不轮询，不安装 Native Host；
  - registry 与 IPC 判空；
  - 10 个浏览器 IPC 注册为桩：`getStatus` 返回“未启用”（需要时给 `BrowserBridgeStatus` 加 `"disabled"`），其余返回错误“插件未开启”。
- 英语学习关闭时，照 P6 步骤 3：
  - 不创建 `DesktopSpeechPlayback`；
  - 英语学习 IPC 注册为桩；
  - `runtime-registry.ts` 里相关路径跳过。

### 3. `plugins.list` IPC

- 契约：`packages/util/shared/src/ipc.ts` 增加 `PluginListItem`。字段见设计 §7.3：`id`、`title`、`description`、`scope`、`directory`、`canDisable`、`loaded`、`enabled`。
- channel 与 contract：
  - `packages/util/shared/src/desktop-bridge/contract.ts` 增加 `plugins.list`；
  - `packages/util/shared/src/runtime-v2/fixed-renderer.ts` 增加 channel 常量。
- handler：新文件 `D/main/plugins/plugins-ipc.ts`，注册方式与其他 fixed-renderer IPC 相同。
  - `loaded`：取本次启动组合结果里该条目是否 `enabled && state !== "skipped"`。
  - `enabled`：每次调用时重新读设置，算出的值。
  - 只返回当前形态组合里出现的条目。
  - `llm-service` 只返回一行。
- renderer：
  - `apps/desktop/src/renderer/api/plugins.ts`；
  - `mock/handlers.ts` 的 mock 数据照 demo。
- 跑 `pnpm check:ipc-channels`、`pnpm check:renderer-bridge`。

### 4. 插件页

- `components/extensions/ExtensionsPage.tsx`：`TABS` 的 `capabilities` / 「能力」改为 `plugins` / 「插件」；搜索占位改为“搜索插件…”。
- 新文件 `components/extensions/PluginsSection.tsx`，取代 `CapabilitiesSection.tsx`，按 demo 方案 B 实现（能关的在上，「内置插件 N 个，不能关闭」折叠行默认收起，有搜索词时展开）：
  - 用 `pluginsApi.list()` 取数据，分两组，组标题和一句说明照 demo。
  - 每行显示名称、目录标签、说明。
    - 不能关的显示「内置」。
    - 能关的显示 `Toggle`（`components/ui/`），点击后用 `settingsApi.update` 写 `tools.plugins[id]`，再重新取列表。
    - `enabled !== loaded` 时显示「重启后开启」或「重启后关闭」。
  - `browser-tools` 为 `loaded && enabled` 时，行下渲染 `BrowserConnectPanel`；`english-learning` 同理渲染 `EnglishLearningCapability`。两个条件不满足时都不挂载，也就不会调用 `useBrowserBridgeStatus` / `englishLearningApi`。
  - 搜索匹配名称、说明、目录、id。
- 删除 `CapabilitiesSection.tsx`。
- `components/settings/sections/ToolsSection.tsx` 与 `tool-catalog.ts`：`browser-tools` 未加载时隐藏“浏览器”工具组。
- `components/settings/SettingsPage.tsx`：`english-learning` 未加载时不挂载 `SpeechSettingsSection`。
- 加载状态的来源：两处都读 `pluginsApi.list()` 里对应条目的 `loaded`。新增一个小 hook `usePluginLoaded(id)`，放在 `hooks/`。
- 样式：只用主题 token，开关用现有 `Toggle`。

### 5. 测试

- 新增：
  - `D/main/test/plugin-switches.test.ts`：缺省取 `defaultEnabled`；设置覆盖；不可关的忽略设置。
  - `D/main/test/plugins-ipc.test.ts`：`loaded` 与 `enabled` 的组合；只返回当前形态的条目；`llm-service` 去重。
  - `D/main/test/optional-plugins.test.ts`：默认设置下不创建浏览器服务、不起定时器、不上报 `browser`；英语学习条目被 disable；两组桩 handler 的返回值。
  - `renderer/test/plugins-section.test.tsx`：
    - 分组与计数；
    - 「内置」与开关；
    - 切换开关后出现重启提示；
    - 关闭时不请求浏览器和英语学习状态；
    - 开启并已加载时展开详情；
    - 搜索。
- 修改：
  - `renderer/test/extensions-page.test.tsx`：标签名改为「插件」。
  - `english-learning.test.tsx`：mock `plugins.list` 返回已加载后，再断言原行为。
  - `D/main/test/runtime-v2-browser-reconfigure.test.ts`：显式传入 browser；新增“未传 browser”用例。
  - `D/main/test/settings-characterization.test.ts` 的 fixtures。
- 删除：`capabilities-section` 相关测试（如有）。

### 6. 文档

- 仓库根 `AGENTS.md`「外部能力代码」：浏览器能力默认不加载，在扩展 › 插件里开启。
- `README.md`、`docs/ARCHITECTURE.md`、`docs/roadmap.md`：内容照 P6 步骤 6。
- `docs/design-docs/browser/` 各篇与 `agent-english-learning.md`：开头写“默认不加载，在扩展 › 插件中开启”。
- 站点文档：
  - `apps/site/src/content/docs/browser.md`、`english-learning.md`：同样的说明；
  - 提到「能力」页的地方改为「插件」页。
- `docs/exec-plans/active/20260928-chrome-connect-experience.md`：顶部注明“随架构优化暂停”。
- `docs/releases/feature-release-notes.md`。

## 验证

- 命令：README「统一验证命令」。
- 浏览器 mock 模式：插件页浅色、深色各截一张，与 demo 对照。
- 常驻开销：默认设置启动 Electron，60 秒内 main 日志里没有浏览器状态轮询；`ps` 里没有 `abb` 相关进程；数据目录下没有新写的 Native Host 清单。
- 手工检查（Electron）：
  - 默认：插件页里两个可关插件的开关都是关；工具设置没有浏览器组；常规设置没有语音设置；Agent 工具列表里没有 `browser_*`。
  - 打开操控浏览器：出现“重启后开启”。重启后连接面板、工具组、`browser_*` 工具都回来，Chrome 扩展可以连接。
  - 打开英语学习并重启：选目标会话、双语回答、朗读都与现在一致。
  - 关闭英语学习并重启：语音设置消失，旧会话能正常打开。

## 风险

- `runtime-registry.ts` 里浏览器和英语学习的判空有约 20 处，漏一处会在启动或恢复时报错。缓解：照 P6 的行号清单逐处改；手工检查覆盖启动、新建会话、归档会话。
- disable patch 的 target 写法错误会让 boot 校验失败。缓解：步骤 2 先写测试。

## 回滚

`git revert` 本提交。设置里的 `tools.plugins` 对旧代码无害。
