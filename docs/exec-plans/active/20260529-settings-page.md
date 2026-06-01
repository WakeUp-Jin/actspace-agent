# 设置页（Settings Page）开发计划

## 目标

为 actspace 桌面端新增一个独立的「设置」页面（整页接管：进入设置后左侧聊天侧栏替换为设置导航，主区显示设置内容），并补齐当前**完全缺失**的「运行时配置」能力：用户可在 UI 里配置 DeepSeek / Kimi 供应商 API Key、默认模型、主 Agent 与 Kairos 的基础参数、工具开关和 bash 审查策略，配置经加密持久化后**下一轮对话自动生效，无需重启**。首版导航分区：通用 / 模型 / 智能体 / 工具 / 外观。

## 范围

- 包含：
  - 新增 `view === "settings"`，在 `WorkbenchLayout` 中用设置导航替换聊天 `Sidebar`，主区渲染设置内容；接通 `Sidebar` 底部已存在但未接线的 `Settings` 按钮，并提供「返回应用」。
  - 新增 main 进程 `SettingsService`：`<userData>/settings.json`（非敏感项，原子写）+ `<userData>/secrets.json`（Electron `safeStorage` 加密的供应商 Key）。
  - 新增设置相关 IPC：`settings:get` / `settings:update` / `settings:set-provider-key` / `settings:clear-provider-key` / `settings:test-connection`，并在 preload 暴露到 `window.actspace`。
  - 运行时生效机制：`SettingsService` 把配置覆盖到 `process.env` 后调用 `loadEnv()` 刷新冻结的 `env`；Kairos 模型/思考链变更时重建 Kairos LLM。
  - 五个分区的具体实现（字段绑定见下文「分区与字段绑定」）。
  - 共享类型（`@actspace/shared`）、preload 桥类型（`packages/desktop/src/global.d.ts`）、单测、设计规范同步、history。
- 不包含：
  - 不实现深色主题真实落地（外观分区仅放浅色默认 + 深色 Coming soon + 工具调用密度滑杆）。
  - 不做「工作模式」「完全访问」两条（本轮讨论已明确删除）。
  - Kairos 进阶项（tick 预算、睡眠区间、节律、路径授权）不进设置页，继续走 `<userData>/kairos/config/*.json` 文件编辑。
  - 不引入账号 / 登录 / 账户中心（设置页规范明确不做）。
  - 不暴露供应商 Base URL、`DEEPSEEK_API_FORMAT` 的可视化切换（继续走 `.env`）。
  - 不改 bash allowlist / approval scheduler 主流程（只复用现有 `ACTSPACE_BASH_ALWAYS_ASK`）。

## 背景

- 必读文档（新会话 / 子 Agent 先读）：
  - `AGENTS.md`
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/SECURITY.md`
  - `docs/FRONTEND.md` 与 `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/front-设置页规范.md`
  - `docs/design-docs/front-全局视觉语言规范.md`
  - `docs/coding-standards/team/frontend-style-scope-conventions.md`
- 相关代码路径：
  - 页面落点：`packages/desktop/src/renderer/components/WorkbenchLayout.tsx`、`packages/desktop/src/renderer/components/Sidebar.tsx`（底部 `SETTINGS_ENTRY_CLASS` 按钮，`view`/`onSelectView`）
  - 现有 view 页范例：`packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`、`packages/desktop/src/renderer/pages/KairosPage.tsx`
  - 顶栏：`packages/desktop/src/renderer/components/WindowChromeBar.tsx`、`packages/desktop/src/renderer/components/SplitView.tsx`
  - Composer 初始模型：`packages/desktop/src/renderer/components/Composer.tsx`（185 行 `useState<ModelId>(DEFAULT_MODEL_ID)`）
  - 模型注册表：`packages/shared/src/model-config.ts`（`MODEL_LIST`、`DEFAULT_MODEL_ID`、`ModelId`、`provider`）
  - IPC 契约：`packages/shared/src/ipc.ts`、`packages/desktop/src/preload/index.ts`、`packages/desktop/src/global.d.ts`
  - main 进程入口与 IPC：`packages/desktop/src/main/index.ts`（`registerIpc`、`ensureDataDirectories`、`getDeepSeekBalanceSnapshot`、`ensureKairosController`）
  - env 与配置消费：`packages/agent-core/src/env.ts`（`loadEnv`/`getEnv`/`env` proxy）、`packages/agent-core/src/engine/create-agent-deps.ts`（`resolveAgentEnvConfig`/`buildLLMConfig`/`buildAgentConfig`）
  - bash 审查：`packages/agent-core/src/tools/tools/bash/permissions.ts`（188 行读 `env.ACTSPACE_BASH_ALWAYS_ASK`）
  - 工具暴露：`packages/agent-core/src/tools/index.ts`（`createToolManager` 用 `disabledTools` + `shouldExposeTool`）、`packages/agent-core/src/tools/exposure.ts`
  - Kairos 配置与装配范例：`packages/desktop/src/main/kairos-bootstrap.ts`、`packages/desktop/src/main/kairos-ipc.ts`、`packages/agent-core/src/kairos/env.ts`、`packages/agent-core/src/kairos/config/schema.ts`
- 已知约束：
  - **API Key 只能在 main / agent-core 运行时读取**，不得进入 renderer、session 事件或日志；`settings:get` 只返回「是否已配置」布尔，不回传明文。
  - 当前所有配置来自启动时 `loadEnv()` 冻结的 `env`，renderer 此前无任何运行时写配置通道；唯一已有的可写配置先例是 Kairos 的 JSON 文件（`kairos:read-config`/`kairos:write-config` + `controller.reloadConfig()`）。
  - `env` 是 frozen Proxy，但 `loadEnv()` 文档声明可多次调用并刷新 `_env`；消费方均通过 `env` proxy 动态读取，因此刷新后下一次读取即生效。
  - `loadEnv()` 取值优先级：`process.env[key] ?? fileVars[key]`，且空字符串 `""` 视为未设置回落默认。因此「覆盖到 process.env」是统一生效手段；未在 settings 配置的供应商 Key 不写 process.env，从而保留 `.env` 作为开发兜底。

## 目标架构

```txt
renderer SettingsPage
  -> window.actspace.settings* (IPC)
main SettingsService
  -> settings.json (非敏感)  +  secrets.json (safeStorage 加密的 Key)
  -> applyToProcessEnv(settings, secrets) -> loadEnv() 刷新冻结 env
  -> (Kairos 字段变更) 重建 Kairos LLM / reload

agent-core
  resolveAgentEnvConfig() / bash permissions / createToolManager
  仍只读 env proxy，不感知 settings 来源（保持依赖边界：agent-core 不依赖 desktop）
```

依赖边界说明：`agent-core` 不引入对 `SettingsService` 的依赖。生效通道是「main 写 `process.env` + `loadEnv()`」这一既有公共接口，`agent-core` 侧零改动即可让大部分 env-backed 设置生效。

## 数据模型与契约（以本节为准）

新增 `packages/shared/src/settings.ts`：

```ts
import type { ModelId } from "./model-config";

export type ProviderId = "deepseek" | "kimi";

export interface ProviderSettingsView {
  /** 由 main 根据 secrets 是否存在派生；renderer 永远拿不到明文 Key。 */
  hasApiKey: boolean;
}

export interface AppSettings {
  version: 1;
  /** null = 用内置 DEFAULT_MODEL_ID。 */
  defaultModelId: ModelId | null;
  providers: Record<ProviderId, ProviderSettingsView>;
  agent: {
    /** null = 用各 service 默认；范围 0–2。 */
    temperature: number | null;
    /** null = 用默认。 */
    maxTokens: number | null;
    /** 工具开关派生出的禁用工具名列表（写入 ACTSPACE_DISABLED_TOOLS）。 */
    disabledTools: string[];
    /** 「自动审查」开关 -> ACTSPACE_BASH_ALWAYS_ASK。 */
    bashAlwaysAsk: boolean;
  };
  kairos: {
    modelId: ModelId | null;
    thinking: "auto" | "on" | "off";
  };
}

export type SettingsUpdateInput = Partial<{
  defaultModelId: ModelId | null;
  agent: Partial<AppSettings["agent"]>;
  kairos: Partial<AppSettings["kairos"]>;
}>;

export type SetProviderKeyInput = { provider: ProviderId; apiKey: string };
export type ClearProviderKeyInput = { provider: ProviderId };
export type TestConnectionInput = { provider: ProviderId };
export type TestConnectionResult = { ok: boolean; message: string; detail?: string };
```

> UI 偏好（主题、工具调用密度）不进 `AppSettings`，走 renderer `localStorage`（沿用 `WorkbenchLayout`/`KairosPage` 的 localStorage 模式）。

IPC 通道（main `ipcMain.handle` + preload 暴露 + `global.d.ts` 类型）：

| 通道 | 入参 | 返回 |
|---|---|---|
| `settings:get` | 无 | `AppSettings` |
| `settings:update` | `SettingsUpdateInput` | `AppSettings` |
| `settings:set-provider-key` | `SetProviderKeyInput` | `{ ok: boolean; error?: string }` |
| `settings:clear-provider-key` | `ClearProviderKeyInput` | `{ ok: boolean }` |
| `settings:test-connection` | `TestConnectionInput` | `TestConnectionResult` |

## 分区与字段绑定（首版定稿）

- 通用 General：
  - 权限设置 ·「默认权限」：占位开关（UI 可见、暂不接逻辑，文案标注"占位"）。
  - 权限设置 ·「自动审查」：真接 `agent.bashAlwaysAsk` → `ACTSPACE_BASH_ALWAYS_ASK`（开 = 每条 bash 命令执行前都要确认，绕过 allowlist，硬拒绝仍生效）。
  - 通用 ·「语言」：固定「简体中文」（disabled）。
  - 主题移至外观分区。
- 模型 Model（供应商，非模型）：
  - DeepSeek / Kimi 两张供应商卡，状态徽标取 `providers[id].hasApiKey`。
  - 未连接显示「连接」→ Key 输入弹窗 → `settings:set-provider-key`；已连接显示「断开连接」→ `settings:clear-provider-key`。
  - 「测试连接」→ `settings:test-connection`：DeepSeek 复用 `/user/balance`（参考 `getDeepSeekBalanceSnapshot`），Kimi 用 `GET {KIMI_BASE_URL}/models`。
  - 「默认模型」下拉（`MODEL_LIST`）→ `defaultModelId`；renderer Composer 初始 `selectedModelId` 改为读该值。
- 智能体 Agent：
  - 主 Agent：温度（0–2）→ `agent.temperature` → `LLM_TEMPERATURE`；最大输出 token → `agent.maxTokens` → `LLM_MAX_TOKENS`。
  - Kairos：模型下拉 → `kairos.modelId` → `KAIROS_MODEL_ID`；思考链（自动/开/关）→ `kairos.thinking` → `KAIROS_THINKING`（`on→true`/`off→false`/`auto→auto`）。
  - 不含 Kairos 开启/暂停（留在 Kairos 页）。
- 工具 Tools：
  - 9 个工具开关：`read_file / grep / glob / list_directory / edit_file_diff / write_file / web_search / analyze_media / bash`，反选写入 `agent.disabledTools` → `ACTSPACE_DISABLED_TOOLS`。
  - `web_search` / `analyze_media` 受 `shouldExposeTool`（provider + apiFormat + 是否有 Kimi Key）约束：当前不可用时显示禁用态 + 原因说明（如"DeepSeek anthropic 模式下不暴露本地 web_search"）。
- 外观 Appearance：
  - 主题：浅色（默认，选中）+ 深色（Coming soon，disabled），仅写 localStorage 偏好。
  - 工具调用密度滑杆：写 localStorage，控制工具日志详略（消费方后续接 `ToolLogLine`，本轮先持久化偏好）。

## 生效机制细节

`SettingsService.applyToProcessEnv(settings, secrets)`（仅对已配置项写 `process.env`，随后 `loadEnv()`）：

- `DEEPSEEK_API_KEY` / `KIMI_API_KEY`：secrets 有值则写；无值则 `delete process.env[...]`，回落 `.env` 兜底。
- `ACTSPACE_DISABLED_TOOLS = settings.agent.disabledTools.join(",")`。
- `ACTSPACE_BASH_ALWAYS_ASK = settings.agent.bashAlwaysAsk ? "1" : "0"`。
- `LLM_TEMPERATURE` / `LLM_MAX_TOKENS`：非 null 才写。
- `KAIROS_MODEL_ID = settings.kairos.modelId ?? ""`；`KAIROS_THINKING = map(settings.kairos.thinking)`。
- 写完调用 `loadEnv()` 刷新 `_env`。主 Agent 因 `buildAgentConfig()` 每 turn 调 `resolveAgentEnvConfig()`，下一轮即生效；bash 审查每次 `classifyCommand` 读 env proxy，亦即时生效。

Kairos 特例：Kairos LLM 在 `ensureKairosController()` 创建时定型。当 `kairos.modelId` / `kairos.thinking` 变更时，main 需在 Kairos 处于非 ticking 态时重建其 LLM（`createKairosLlm()` + `resolveKairosThinkingEnabled()`）并热替换，或重启 controller。该步骤在阶段五单独处理与验证。

## 风险

- 风险：API Key 泄露（进 renderer / 日志 / session）。
  - 缓解：`safeStorage` 加密落盘；`settings:get` 只回 `hasApiKey`；不把 Key 写入任何 `logMain` / session 事件；测试连接只回成功与否与脱敏 message。
- 风险：`safeStorage.isEncryptionAvailable()` 为 false（部分 Linux 无 keyring）。
  - 缓解：`settings:set-provider-key` 在不可用时返回 `{ ok:false, error }`，UI 提示"系统密钥串不可用，无法安全保存"，**绝不**退化为明文落盘。
- 风险：`loadEnv()` 重新冻结 `env` 影响在途读取。
  - 缓解：消费方均通过 `env` proxy 按需读取；不缓存解构值。`SettingsService` 在 turn 之间应用更新即可（renderer 操作天然不在 turn 内）。
- 风险：Kairos LLM 重建时机不当导致状态错乱。
  - 缓解：仅在 controller `stopped`/`idle` 重建；ticking 中延迟到下一空闲点应用，UI 提示"将于下次空闲生效"。
- 风险：整页接管与 `WorkbenchLayout` 现有左栏 resize/hide 逻辑冲突。
  - 缓解：设置态左栏固定窄宽、禁用 hide/resize 的 snap；`view==="settings"` 时右栏强制关闭（参考 `showRightToggle={view !== "kairos"}` 现有做法）。
- 风险：清除供应商 Key 后 `.env` 兜底又把 Key 带回，用户以为已断开。
  - 缓解：在断开连接说明里标注「将回退到 .env 中的默认 Key（如有）」；徽标状态以 `hasApiKey`（settings 维度）为准并加注释。

## 里程碑

1. 阶段一 · 契约与数据地基（main + shared，可独立验证）
   - 新增 `packages/shared/src/settings.ts` 类型并从 `packages/shared/src/index.ts` 导出。
   - 新增 `packages/desktop/src/main/settings-service.ts`：load/get/update/setProviderKey/clearProviderKey、`safeStorage` 加解密、`applyToProcessEnv` + `loadEnv()`、默认值与原子写（`rename(tmp,dst)`，参考 `kairos-ipc.ts`）。
   - 单测 `packages/desktop/src/main/test/settings-service.test.ts`：默认值、update 持久化、加解密往返、`applyToProcessEnv` 写出的键值、`isEncryptionAvailable=false` 时拒绝保存、清除 Key 回落。
2. 阶段二 · IPC 接线
   - `packages/desktop/src/main/index.ts` 注册 5 个通道并在启动 `app.whenReady` 后 `settingsService.load()` 应用一次。
   - `packages/desktop/src/preload/index.ts` 暴露 `settings*` 到 `window.actspace`；`packages/desktop/src/global.d.ts` 补类型。
   - `settings:test-connection` 复用 `getDeepSeekBalanceSnapshot` 逻辑（DeepSeek）与新增 Kimi `/models` 探测。
3. 阶段三 · 渲染层骨架
   - `Sidebar.tsx`：`SidebarView` 增加 `"settings"`；底部 `Settings` 按钮 `onClick={() => onSelectView?.("settings")}`；挂 `⌘,`。
   - `WorkbenchLayout.tsx`：`view==="settings"` 时左槽渲染 `SettingsNav`（替换 `Sidebar`）、主槽渲染 `SettingsPage`、右栏关闭、chrome 标题为「设置」；提供「返回应用」回 `chat`。
   - 新增 `packages/desktop/src/renderer/components/settings/SettingsPage.tsx` + `SettingsNav.tsx` + 五个分区子组件骨架（沿用 Tailwind token，样式所有权遵循 `frontend-style-scope-conventions.md`）。
4. 阶段四 · 分区实现（按「分区与字段绑定」逐项接通 `settings:get`/`update`/`set-provider-key`/`clear-provider-key`/`test-connection`）。
   - 模型分区 Key 输入弹窗（OpenCode 式，单输入框 + 提交，不暴露 Base URL/format）。
   - 工具分区按 `shouldExposeTool` 渲染禁用态与原因。
   - 外观分区 localStorage 偏好。
5. 阶段五 · 生效联动
   - Composer 初始模型读 `defaultModelId`（App bootstrap 拉 `settings:get` 透传初值）。
   - Kairos 模型/思考链变更触发 main 重建 Kairos LLM（空闲时）。
   - 验证 `bashAlwaysAsk` 改动后下一条 bash 命令进审核。
6. 阶段六 · 验证与收尾：单测、typecheck、build、前端验收、规范/README/history 同步。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/agent-core typecheck`（确认零改动不破坏）
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`（含 `settings-service.test.ts` 与设置页 renderer 测试）
- 手工检查（按 `docs/FRONTEND_VERIFICATION.md`）：
  - 浏览器 mock：点击 `Settings` 进入整页接管，5 个分区可切换，控件交互正常。
  - Electron 真实：配置 DeepSeek Key → 测试连接成功 → 新建对话能正常出 turn；关掉某工具 → 下一轮该工具不出现；开「自动审查」→ 下一条 bash 进审核；改默认模型 → 新开 Composer 初始选中变化；改 Kairos 模型 → 空闲后生效。
  - 安全：`settings.json` 不含明文 Key；`secrets.json` 为密文；renderer devtools 与 `logs/latest-dev.log` 中无明文 Key。
- 观测检查：
  - `settings:get` 返回的 `providers.*.hasApiKey` 与实际密钥存在一致。

## 进度记录

- [x] 完成现状调研：确认无运行时配置层、Kairos JSON 为唯一可写配置先例、view 切换为页面落点机制。
- [x] 完成关键决策：整页接管、safeStorage 加密、5 分区、模型分区含默认模型+测试连接、通用分区逐条语义（去掉工作模式/完全访问，默认权限占位，自动审查接 BASH_ALWAYS_ASK）、外观占位、Kairos 仅模型+思考链。
- [x] 完成 active execution plan。
- [x] 阶段一：shared 类型 + SettingsService + 单测（8 例，含加解密往返、env baseline 还原、isEncryptionAvailable=false 拒绝保存）。
- [x] 阶段二：IPC 接线（5 通道）+ preload 暴露 `window.actspace.settings*` + global.d.ts + `app.whenReady` 内 `settingsService.load()`。
- [x] 阶段三：`SidebarView` 增 `"settings"`、Sidebar 入口接线、`WorkbenchLayout` 整页接管返回 `SettingsPage`、`SettingsNav` + 自带顶栏「返回」。
- [x] 阶段四：五分区实现（通用/模型/智能体/工具/外观）+ 供应商 Key 弹窗 + 测试连接 + 默认模型下拉 + 工具开关 + 外观 localStorage。
- [x] 阶段五：Composer 默认模型读 `defaultModelId`（App bootstrap 透传 + 用户手选后不覆盖）、Kairos 模型/思考链变更在空闲时重建 controller、bash 审查走 `ACTSPACE_BASH_ALWAYS_ASK`。
- [x] 阶段六：`settings-service.test.ts`(8) + `settings-page.test.tsx`(5)、shared/agent-core/desktop typecheck、`desktop build`、浏览器 mock 走查（整页接管 + 五分区切换 + 供应商卡）。

## 决策记录

- 2026-05-29：采用「整页接管」而非保留聊天侧栏的三栏方案；原因是与 `设置页规范.md` 文字一致、更贴近 Cursor 截图，且 `WorkbenchLayout` 的 view 切换天然支持替换左栏。现有「设置页定稿图」按三栏画，已过期，需重出。
- 2026-05-29：API Key 用 Electron `safeStorage` 加密落盘，不写回 `.env` 也不明文存 JSON；原因是符合 `SECURITY.md`，且 `.env` 退居开发期兜底。
- 2026-05-29：运行时生效采用「覆盖 `process.env` + `loadEnv()` 刷新」既有公共接口，而非在 `agent-core` 新增 override 模块；原因是消费方都通过 `env` proxy 动态读取，可让 Key/温度/工具/bash 审查/Kairos env 全部下一轮生效且不破坏 `agent-core` 对 `desktop` 的零依赖边界。
- 2026-05-29：通用分区删除「工作模式」「完全访问」，「默认权限」做占位，「自动审查」接 `ACTSPACE_BASH_ALWAYS_ASK`；原因是避免引入语义重叠和未定义的危险自动放行机制，首版只接确定可落地的开关。
- 2026-05-29：Kairos 在设置页仅做模型 + 思考链，进阶节律/预算/路径继续走文件编辑；原因是控制首版范围并避免与 Kairos 页运行控制重复。
- 2026-05-29：外观分区首版仅占位（浅色默认 + 深色 Coming soon + 工具调用密度），不实现深色 token；原因是当前 `tokens.css` 仅浅色，深色为独立较大工作量。
