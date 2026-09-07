# ActSpace 设置中心重构执行计划

> 2026-09-06 范围更新：分析观测功能与专用 Analysis / Trace 接口已退役。下文保留该页面或验收其入口的原计划条目已失效；Journal、聊天、Trajectory、Context 与 Usage 仍保留。

> 状态：实施中；P0、P1、P2、P3、P4、P5 已交付，P6 待人工验收与交付收口。
>
> 计划 slug：`20260830-actspace-settings-center-refactor`
>
> 本计划覆盖超过 8 个文件，涉及 shared contract、Electron main/preload、renderer、Prompt Runtime、Session Journal 投影和文档。执行时必须按阶段提交和验证，不得把所有改动堆成一次不可回退的 UI 大爆炸。

## 1. 目标

将 ActSpace 设置中心重构为 Maka 风格的分组设置壳层和连续配置流程：顶层删除“服务商”和“智能体”，Provider / Connection / Model 在一个“模型”页面内完成配置，身份偏好进入“通用”，快捷键进入“通用”，联网搜索进入“工具”，图片生成与图片分析进入“模型”，Agent 运行参数分散到 General / Tools / Subagents。Usage 重做为“活动分析”页面，首屏从汇总进入请求、Provider、Model、Tool 和 Pricing 明细；分析观测页面保持独立，Session Journal 仍是 Usage 与 Trace 的唯一持久事实源。

## 2. 范围

### 包含

- `settings.json` 从当前 v3 迁移到 `version: 4` 逻辑 namespace，并保留旧 v3 / `AppSettingsV2` 兼容投影直到所有调用方完成迁移。
- `settings.json`、`secrets.json`、`prompts/main-agent.md`、Session Journal、renderer `localStorage` 的存储所有权和 IPC 边界落地。
- 新的四组设置导航：偏好、能力、活动、系统。
- 一个模型页面承载 Provider 目录、Connection 配置、连接详情、模型目录、启用状态和模型能力；任务绑定与媒体默认选择迁移到通用。
- 通用页面承载 `displayName`、`responseStyle`、Agent System Prompt、温度、最大输出 Token 和快捷键。
- 工具页面承载工具开关、Bash 审查和联网搜索 Provider。
- 子 Agent 页面承载 Explore 路由；取消独立 Agent 设置页面。
- Usage 活动分析页面、页面偏好持久化和 Journal 投影兼容适配。
- 稳定 `connectionId`、`modelKey` 和 task binding 引用，断开连接不删除模型、Session、Journal 或历史 Usage。
- shared IPC、preload、Electron main、renderer 测试，文档与 history 同步。

### 不包含

- 不修改分析观测页面主体、Trace 层级、Trace 脱敏规则或独立工作区行为。
- 第一版不引入 `runtime-v2/usage-read-model.sqlite`；若未来增加，只能是可删除、可重建的查询缓存。
- 不把设置迁移到 workspace root，不增加项目级设置 scope。
- 不把 API Key、Management Key、搜索 Key 或图片 Key 放入 renderer、Journal、Trace 或普通 settings snapshot。
- 不迁移 Appearance 到 `settings.json`；主题、字体、字号继续使用 renderer `localStorage`。
- 不引入 Provider-native 搜索、插件自注册设置 schema、外部编辑热加载或多进程配置合并。
- 不加入当前运行时没有语义的 `permissionMode`、`thinkingLevel`、通知中心等字段。
- 不新增 Provider，不改现有 DeepSeek、Kimi、OpenRouter 协议实现和真实 Provider 行为。
- 不修改 `tmp/maka`、`tmp/deepseek-harness` 参考源码，不把它们当作 ActSpace 运行数据目录。

## 3. 设计真源与当前基线

### 3.1 设计真源

- [设置中心重构规范](../../../design-docs/frontend/front-设置中心重构规范.md)
- [存储与可观测性边界](../../../design-docs/core-storage-and-observability.md)
- [Token Usage 与 Context Projection](../../../design-docs/model-context/agent-token-usage-and-context-state.md)
- [多供应商 LLM、模型管理与任务模型设计](../../../design-docs/model-context/agent-multi-provider-llm.md)
- [前端验证约定](../../../FRONTEND_VERIFICATION.md)
- [Agent 测试策略](../../../design-docs/agent-plugin-runtime/agent-testing.md)

### 3.2 计划创建时的实现基线（用于追溯）

- `apps/desktop/src/main/settings-service.ts` 当前物理持久化为 `PersistedSettingsV3`，同时提供 `get()` 的兼容视图和 `getV2()` 的 v2 视图；当前写入使用 mutation queue 与 temp file + rename。
- `packages/shared/src/settings.ts` 当前仍定义 `AppSettingsV2`、`SettingsUpdateInput` 和 `SettingsV2UpdateInput`，包含 `providers`、`installedModels`、`customModels`、`taskModels`、`agent`、`skills`、`shortcuts` 等 v3 过渡字段。
- `apps/desktop/src/renderer/components/settings/SettingsNav.tsx` 当前仍包含 `providers`、`shortcuts`、`agent` 顶层 section；`SettingsPage.tsx` 直接按这些旧 ID 分发组件。
- `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx` 在计划创建时包含热力图、2D / 3D、Share 和按 Agent Run 聚合的请求行；P4/P5 已将其改为活动分析 UI，并保留旧请求行作为兼容回退。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts` 已从 Session Journal 投影模型、工具、成本和事件级活动；旧 `UsageStatisticsSnapshot` 仍作为兼容适配器，迁移期间必须明确标记粒度。
- `apps/desktop/src/renderer/components/analysis/` 和对应 Analysis IPC 是保留边界，本计划不重写其主体。

## 4. 目标数据流与依赖

```text
Settings UI / Usage UI
        │ typed preload API
        ▼
Electron main IPC
   ├── SettingsService ── settings.json v4 / secrets.json / prompt file
   ├── ModelStoreService / ModelRuntimeService
   └── Usage Projection ── Session Journal replay
        │
        ├── settings:changed-v4 → renderer snapshot refresh
        └── Usage snapshot → Activity UI

Agent Runtime
   ├── 读取 v4 settings namespace
   ├── Prompt Runtime 注入低优先级 personalization context
   └── 将真实请求、工具和 usage 写入 sessions-v2/*/journal.jsonl

Analysis UI
   └── 继续读取原有 Analysis projection，不与 Usage 合并
```

Settings、Prompt、Usage 和 Analysis 是四条不同数据路径，禁止通过 renderer 状态或第二份可写日志互相补数据。

## 5. 冻结的公共契约

### 5.1 v4 设置对象

在 `packages/shared/src/settings.ts` 中冻结以下逻辑 namespace：

```text
SettingsV4
├── general
│   ├── personalization { displayName, responseStyle }
│   ├── agentInstructions { systemPromptPath }
│   ├── taskDefaults { temperature, maxOutputTokens }
│   └── shortcuts
├── models
│   ├── connections
│   ├── definitions
│   ├── installed
│   └── taskBindings { defaultChat, utility, explore }
├── tools
│   ├── disabledTools
│   ├── bash { alwaysAsk }
│   └── searchProviders
├── media { imageGeneration, imageInspection }
├── skills { disabled }
├── subagents { routes }
└── activity { usage }
```

`appearance` 不进入该对象。设置数据属于 `<dataRoot>` 全局作用域；页面 section、窗口布局和主题属于 renderer UI 状态。

### 5.2 迁移映射

v3 → v4 必须使用以下唯一映射：

| v3 字段 | v4 字段 |
| --- | --- |
| `providers` | `models.connections`、`models.definitions`、`models.installed` |
| `installedModels` | `models.installed` |
| `customModels` | `models.definitions` |
| `taskModels.defaultChatModel` | `models.taskBindings.defaultChat` |
| `taskModels.utilityModel` | `models.taskBindings.utility` |
| `taskModels.exploreModel` / `agent.exploreModelId` | `models.taskBindings.explore` |
| `agent.systemPromptPath` | `general.agentInstructions.systemPromptPath` |
| `agent.temperature` | `general.taskDefaults.temperature` |
| `agent.maxTokens` | `general.taskDefaults.maxOutputTokens` |
| `agent.disabledTools` | `tools.disabledTools` |
| `agent.bashAlwaysAsk` | `tools.bash.alwaysAsk` |
| `searchProviders` | `tools.searchProviders` |
| `imageGeneration` / `imageInspection` | `media.imageGeneration` / `media.imageInspection` |
| `skills` | `skills` |
| `shortcuts` | `general.shortcuts` |

每个 Provider 在迁移时生成稳定的默认 `connectionId`；连接、模型和 task binding 不通过展示名称关联。

### 5.3 v4 Settings IPC

保留现有 provider、model、prompt 和 Usage 查询 IPC 作为兼容表面，同时新增 v4 settings authority 表面：

- `settings:get-v4` → 返回 `{ version: 4, revision, settings }`，其中不包含明文凭据。
- `settings:update-v4` → 输入 `{ namespace, patch, expectedRevision }`，Main 完成 namespace 校验、合并、原子写入并返回最新 snapshot。
- `settings:changed-v4` → Main 成功提交后向可信 renderer 推送 `{ revision, changedNamespaces }`。

旧 `settings:get`、`settings:update` 和 provider/model 专用 IPC 在所有页面切换完成前继续工作，最终阶段再删除没有消费者的旧路径。新的 Renderer 页面不得写入完整 `settings.json`。

## 6. 实施阶段

每个阶段必须可独立合并。阶段完成后应用仍可启动、打开设置并保留已有配置；后续阶段未执行不能成为前一阶段的运行时前置条件。

### P0：v4 契约、迁移和 Settings Authority

**目标**：让 v4 结构可被读取、校验、迁移和通过 typed IPC 访问，但不改变设置页面布局。

**允许修改**：

- `packages/shared/src/settings.ts`
- `packages/shared/src/runtime-v2/desktop-ipc.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- `apps/desktop/src/main/test/runtime-v2-settings-migration.test.ts`
- `packages/shared/src/test/settings.test.ts`

**动作**：

1. 定义 `SettingsV4`、namespace 类型、`SettingsV4Snapshot`、`SettingsNamespacePatch`、`SettingsRevision` 和稳定连接 / 模型引用类型。
2. 实现 `migrateV3ToV4()`，按 5.2 映射生成对象映射形式的 `connections`、`definitions` 和 `installed`。
3. 迁移前原子生成 `settings.v3.backup.json` 与 digest 文件；源文件损坏、备份冲突或校验失败时拒绝覆盖。
4. 保留 `get()` / `getV2()` 兼容投影，让旧 SettingsPage 在 P1-P4 完成前继续运行。
5. 实现 `getV4()` 与 `updateNamespaceV4()`；更新只接受已知 namespace、JSON-safe 值和 expected revision。
6. 保留 `secrets.json` v2 的 0600 和 main-only 约束，禁止 v4 snapshot 携带凭据明文。

**验收**：

- v3 → v4 迁移幂等；重复启动不重复生成不同连接 ID。
- malformed JSON、备份冲突、未知必需字段不会覆盖原设置。
- 迁移后旧 `get()` / `getV2()` 与 v4 snapshot 表示同一份用户配置。
- stale revision 被拒绝并返回最新 snapshot；同一 Main 进程的 mutation queue 保持串行。
- `pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/shared test`、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test -- src/main/test/runtime-v2-settings-migration.test.ts` 通过。

**回退**：

保留 v3 backup，不删除用户数据。若需要启动旧版本，先将对应 `settings.v3.backup.json` 恢复为 `settings.json`；不得让旧版本直接读取未知 v4 文件。

### P1：Maka 式设置壳层与分组导航

**目标**：替换设置页布局和导航，但暂时通过兼容适配器渲染旧功能，避免功能因导航替换而消失。

**允许修改**：

- `apps/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/test/settings-page.test.tsx`
- `apps/desktop/src/renderer/test/sidebar.test.tsx`
- `apps/desktop/src/renderer/test/settings-color-semantics.test.tsx`

**动作**：

1. 将 `SettingsSectionId` 收敛为 `general`、`appearance`、`model`、`subagents`、`tools`、`plugins`、`skills`、`usage`、`archivedChats`、`analysis`、`update`。
2. 按“偏好 / 能力 / 活动 / 系统”分组渲染窄侧栏；删除 `providers`、`agent`、`shortcuts` 顶层按钮。
3. 在 `SettingsContent` 中为旧 Provider、Agent、Shortcut 内容保留临时内部挂载点，直到 P2/P3 完成；用户不应看到空页面或丢失入口。
4. Usage 暂时可以作为新 `usage` section 的旧页面适配器；P4 完成后删除旧页面入口。
5. Sidebar 的 Usage 动作改为打开 `view=settings`、`settingsSection=usage` 的统一路由；保留 Analysis 独立路径。
6. section 记忆使用 renderer localStorage，不写入 settings v4；列表、详情和窄窗口导航保持单一滚动所有权。

**验收**：

- 设置导航只有四组，顶层不显示“服务商”和“智能体”。
- 旧 Provider、Agent、快捷键、Skills、归档和 Analysis 功能仍可从新壳层到达。
- 设置页在大窗口、820px 以下和 600px 以下均不产生整体横向溢出。
- 键盘可完成导航、返回、section 切换，Analysis 仍保持原有工作区和状态。
- 运行 `pnpm --filter @actspace/desktop test -- src/renderer/test/settings-page.test.tsx src/renderer/test/sidebar.test.tsx src/renderer/test/settings-color-semantics.test.tsx`。

**回退**：

恢复旧导航组件和 route alias；不触碰 settings.json、Session Journal 或 Analysis 数据。

### P2R：统一模型页面、默认模型职责与标题层级

**目标**：让用户在单一“模型”页面完成 Provider 连接、模型发现、启用和模型能力管理；将任务默认模型与媒体默认模型放入“通用”；所有设置页面统一为一个页面 `h2`、分组 `h3`、子分组 `h4`，同时保持 Provider / Connection / Model 的数据分层。

**允许修改**：

- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `apps/desktop/src/renderer/components/settings/OpenRouterModelCatalogDialog.tsx`
- 新增 `apps/desktop/src/renderer/components/settings/ModelConnectionsSection.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/main/model-store-service.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `apps/desktop/src/renderer/test/model-selection.test.ts`
- `packages/shared/src/test/model-resolver.test.ts`

**动作**：

1. 将连接列表与 Provider 连接详情先收敛到同一模型页面；本轮已落地连接列表到详情的返回路由，以及“添加服务 → 搜索服务商 → 配置连接”的连续路由。Provider 配置表单仍复用现有安全边界，后续再把 `ProviderSettings` 收敛为内部连接子组件。
2. 保留已有的连接测试、余额刷新、代理、Management Key、额外凭据和 OpenRouter 目录功能。
3. 模型列表使用 `connectionId`、`modelKey` 和能力元数据；任务选择器只读 `models.taskBindings`，但任务默认选择器位于“通用”页面。
4. 图片生成和图片分析默认选择器位于“通用 → 媒体默认”；连接、凭据和模型定义仍复用模型数据层；联网搜索不放入模型页面，移动到 P3 工具页面。
5. 每个设置页面只保留一个 `h2` 页面标题，`SettingsSection` 使用 `h3`，内部子分组使用 `h4`；Dialog 标题只在 Dialog 局部语义内使用 `h2`。
6. 删除连接时只清理对应凭据和连接状态；保留模型定义、Session、Journal、历史 Usage 和失效引用提示。
7. 更新 Composer 和 Explore 的候选解析只消费统一 Model Resolver，不按裸模型名去重。

**验收**：

- 用户可从模型列表完成“选择 Provider → 填凭据 → 测试 → 安装/启用模型 → 设置任务绑定”的连续流程。
- 顶层不存在“服务商”；已有三家 Provider 的连接、余额、代理和额外 Key 行为不回归。
- “模型”页面不再显示任务默认模型、图片生成和图片分析默认选择；这些入口只出现在“通用”。
- 每个设置页面的主内容区域只有一个 `h2`，页面分组标题不会再错误使用 `h2`。
- 断开 / 删除连接不会删除模型历史和 Usage；失效 binding 不会静默替换。
- OpenRouter 目录加载失败、空结果、重复添加和取消操作均有可恢复状态。
- 运行 `pnpm --filter @actspace/desktop test -- src/renderer/test/provider-model-settings.test.tsx src/renderer/test/model-selection.test.ts` 与 `pnpm --filter @actspace/shared test -- src/test/model-resolver.test.ts`。

**回退**：

保留 `ProviderSettings` 内部组件和旧 provider IPC alias；只回退页面路由，不回滚已迁移的 v4 数据。若模型引用迁移异常，使用 v3 backup 恢复并重新运行幂等迁移。

### P3：通用、工具、子 Agent 与身份 Prompt

**目标**：移除独立 Agent 页面，把设置按用户任务分散，并让身份偏好在下一轮 Agent 请求中以低优先级 context 生效。

**允许修改**：

- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- 新增 `apps/desktop/src/renderer/components/settings/GeneralSettings.tsx`
- 新增 `apps/desktop/src/renderer/components/settings/SubagentSettings.tsx`
- 新增 `apps/desktop/src/renderer/components/settings/ToolsSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ShortcutSettings.tsx`
- `apps/desktop/src/renderer/components/settings/tool-catalog.ts`
- `packages/shared/src/settings.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- `packages/prompt/src/core-contributors.ts`
- `packages/prompt/src/contributor.ts`
- `packages/prompt/src/test/assembler.test.ts`
- `packages/prompt/src/test/host-context.test.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `apps/desktop/src/renderer/test/settings-page.test.tsx`
- `apps/desktop/src/main/test/runtime-v2-settings-migration.test.ts`

**动作**：

1. General 页面提供 `displayName`、`responseStyle`、System Prompt 文件编辑、temperature、maxOutputTokens 和 quick open shortcut。
2. Tools 页面提供 disabled tools、Bash always ask 和联网搜索 Provider；搜索凭据继续走 `secrets.json`。
3. Subagents 页面只展示真实 Explore route；模型引用复用 `models.taskBindings.explore`，不复制身份或 System Prompt 设置。
4. `PromptContributor` 增加受校验的 `profile/personalization` contributor，身份偏好只能影响称呼和表达方式，不能覆盖 core safety、workspace instructions、工具权限或审批规则。
5. SettingsService 继续把工具、Bash、temperature、max token 映射到下一轮运行环境；已有 prompt 文件读写和 20,000 字符限制保留。
6. 删除 `agent` 顶层 UI route；旧 `agent` IPC 仅保留兼容映射，所有新页面通过 v4 namespace patch 更新。

**验收**：

- 顶层不存在“智能体”；General、Tools、Subagents 各自只展示其职责范围。
- 身份偏好保存后下一轮请求的 prompt snapshot 可见对应低优先级 contributor，不能覆盖安全段或工具能力。
- System Prompt 只写 `prompts/main-agent.md`，正文不进入 settings snapshot 或 Journal。
- 快捷键冲突保留旧有效值；Bash、工具开关和 Explore 失效模型均显示真实原因。
- 运行 `pnpm --filter @actspace/prompt typecheck`、`pnpm --filter @actspace/prompt test`、`pnpm --filter @actspace/desktop test -- src/renderer/test/settings-page.test.tsx src/renderer/test/model-selection.test.ts`。

**回退**：

隐藏 personalization contributor 和新页面路由，继续使用旧 `agent` 兼容投影；不删除用户填写的身份文本或 Prompt 文件。

### P4：Maka 式 Usage 活动分析与偏好持久化

**目标**：将 Usage 变成活动分析页面，移除首屏热力图、2D、3D、Share 和不可用控件，并把查看偏好与 Journal 事实明确分离。

**允许修改**：

- `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`，或拆分为新 `apps/desktop/src/renderer/components/settings/ActivityUsagePage.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- `packages/shared/src/settings.ts`
- `packages/shared/src/ipc.ts`
- `apps/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `apps/desktop/src/renderer/test/fixtures/usageStatisticsFixture.ts`

**动作**：

1. 新页面结构固定为时间范围、汇总指标、Requests / Providers / Models / Tools / Pricing 五个 Tab 和按需展开的明细。
2. 新 UI 使用 `24h`、`7d`、`30d`、`all`；将旧 `day`、`week`、`month`、`total` 作为 IPC 迁移兼容输入映射，不让旧文案继续出现在页面。
3. `activity.usage` 保存 `range`、`status`、`modelFilter`、`showDetails`、`activeTab`，只保存查看偏好。
4. Usage 汇总和明细继续从 Journal projection 读取；P4 的 Agent Run 聚合行曾标记为“活动汇总”，P5 已补真实 request/tool activity row，不能宣称旧兼容行是独立 LLM call。
5. 请求明细需要回链到 Session；成本显示估算依据和 unavailable 状态，不显示虚假零成本。
6. `WorkbenchLayout` 的旧 `view=usage` 迁移为设置中心 `section=usage`；Analysis 仍保持独立入口和原有筛选、滚动、详情返回状态。
7. 不写 Usage sidecar，不实现 SQLite；删除筛选偏好不会触碰 Journal、设置、Session 或凭据。

**验收**：

- Usage 首屏没有热力图、2D、3D 和 Share。
- 汇总可以进入 Provider、Model、Tool、Pricing 和请求明细；加载失败、日志截断、空数据和筛选无结果可区分。
- 重启和重新打开设置后恢复 Usage 页面偏好；修改偏好不改变任何 Journal usage。
- Analysis 页面主体、Trace 层级和安全边界保持不变。
- 运行 `pnpm --filter @actspace/desktop test -- src/renderer/test/usage-statistics-page.test.tsx src/renderer/test/settings-page.test.tsx`，并补 `fixed-renderer-projection` 相关定向测试。

**回退**：

保留旧 `UsageStatisticsPage` 和 `view=usage` alias；只回退页面读取适配器，不删除 `activity.usage` 或 Session Journal。

### P5：事件级活动投影、旧路径清理与最终收口（已完成）

**目标**：在兼容 Usage UI 稳定后，补齐真实 LLM request / Tool invocation 粒度，并清理不再有消费者的旧设置入口。

**允许修改**：

- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session-selectors.ts`
- `apps/desktop/src/renderer/components/settings/ActivityUsagePage.tsx` 或 P4 选定的 Usage 文件
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/shared/src/settings.ts`
- 旧 provider / agent / shortcut 兼容测试和对应 exports

**动作**：

1. 从 `request/header`、`request/context`、`assistant/message`、`step/end`、`llm/retry`、`llm/retry-started`、`tool/call` 和 Tool terminal 事件生成稳定的 activity row：`requestId`、`sessionId`、`turnId`、`providerId`、`modelKey`、token、cost、latency、status、costBasis；当前 Journal 没有可安全推导的 `connectionId` 时不伪造该字段。
2. 保留旧 `UsageStatisticsSnapshot` 适配器，直到新活动记录通过 golden 和重启重建测试。
3. 删除没有消费者的 `providers`、`agent`、`shortcuts` 顶层 route 和旧 Usage 独立 view；保留 `getUsageStatistics` 作为显式兼容 IPC，直到后续版本确认没有外部调用方。
4. 更新 `docs/design-docs/frontend/front-设置中心重构规范.md`、`core-storage-and-observability.md`、`agent-token-usage-and-context-state.md`、`agent-multi-provider-llm.md`、`frontend/README.md` 和 `docs/design-docs/index.md`（若索引入口需要补充）。
5. 更新 `docs/exec-plans/README.md`、本计划状态、`docs/exec-runs/20260830-actspace-settings-center-refactor/` 执行记录和 `docs/histories/`。

**验收**：

- 新 Usage 活动记录可以从 Journal 冷启动重建；删除派生缓存不影响会话恢复。
- retry 每次真实 request 有独立记录，不被聚合覆盖；缺少 provider usage 时显示 unknown / estimated。
- `rg -n "case \"providers\"|case \"agent\"|case \"shortcuts\"|view === \"usage\"" apps/desktop/src/renderer` 只剩明确兼容测试或历史说明。
- `pnpm typecheck`、`pnpm build`、`pnpm check:current-docs`、`pnpm check:frontend-theme`、`pnpm check:packages`、`pnpm --filter @actspace/desktop test` 通过；真实 Electron 与人工主题/重启/Provider 验收仍留给 P6。

**回退**：

保留旧 IPC adapter 和 v4 settings reader；回退只移除新 Activity consumer，不删除 Journal、模型定义或历史设置。旧顶层 route 只有在确认无 renderer / preload 消费者后才能删除。

### P6：最终人工验收与交付收口

**目标**：完成 Electron 真实链路、浅深主题、持久化恢复和文档状态收口。

**允许修改**：

- 本计划涉及的实现文件、测试文件、设计文档、history 和 execution run 文档。

**动作与检查**：

1. 运行工程验证：`pnpm typecheck`、`pnpm build`、`pnpm check:current-docs`、`pnpm check:frontend-theme`、`pnpm check:packages`、`pnpm check:secrets`。
2. 使用浏览器 Renderer 验证 Settings Shell、模型列表、连接详情、General、Tools、Subagents 和 Usage 的空态、错误态、加载态、窄窗布局和浅深主题。
3. 使用 `pnpm dev` 启动 Electron，确认 preload 注入、`settings.json` v4 迁移、Main-only secrets、Prompt 文件写入、重启恢复和 Analysis 独立入口。
4. 使用已有用户凭据进行可选真实 Provider 手工探针；没有新凭据依赖，未提供凭据时不得把该门禁写成通过。
5. 在 `docs/exec-runs/20260830-actspace-settings-center-refactor/` 填写 execution-process 和 execution-summary，记录实际验证层级和未验证的真实 Provider / packaged Electron 范围。

## 7. 阶段依赖与并行边界

```text
P0 v4 contract + migration
          │
          ▼
P1 shell + navigation
      ┌───┴─────────┐
      ▼             ▼
P2 model       P3 general/tools/subagents
      └──────┬──────┘
             ▼
        P4 Usage activity
             │
             ▼
        P5 event-level projection + cleanup
             │
             ▼
        P6 Electron/manual/docs closeout
```

- P0 必须先冻结 v4 类型、迁移映射和 IPC 输入，P1-P3 才能修改新页面。
- P2 和 P3 在 P0 完成后可以并行，但不能各自发明 ModelKey、task binding 或 namespace 类型。
- P4 依赖 P1 的 `usage` section 和 P0 的 `activity.usage` patch；P4 不依赖 P2/P3 的全部页面完成。
- P5 依赖 P4 的 UI 通过兼容投影稳定运行；P5 不允许重写 Journal 事件格式。
- P6 必须在 P0-P5 的自动化门禁通过后执行；真实 Provider、Electron packaged build 和人工截图仍是独立外部门禁。

## 8. 风险与攻击面

### 数据迁移失败

v3 → v4 是最危险的持久化步骤。缓解措施是源文件 digest、v3 backup、幂等迁移、原子 rename、失败不覆盖和旧版本回退指引。任何未知必需字段都 fail closed，不用默认空对象覆盖用户配置。

### UI 与运行时不一致

新页面只通过 typed IPC 和 v4 snapshot 更新；旧页面在迁移期间使用兼容投影。所有新字段必须在对应 Runtime 行为存在后才能进入正式 schema，避免出现“设置可改但不生效”。

### Usage 粒度误导

P4 阶段投影按 Agent Run 聚合并标记兼容粒度；P5 已补真实 request / tool activity row。没有 request ID 或成本依据时显示 unknown / estimated，不把 UI 汇总伪装成账单事实。

### 跨窗口和外部写入

第一版只实现 Main mutation queue 和 root revision；namespace revision、外部热加载和插件写入明确暂缓。若未来出现第二写入方，必须先扩展 revision 契约，不能绕过 Settings Authority 写文件。

### 回滚成本

回滚只允许恢复代码路径和读取适配器，不删除 Session、Journal、模型或凭据。v4 物理文件已经发布后，旧版本启动必须使用保留的 v3 backup 恢复流程。

## 9. 非代码依赖与权限

- 本计划不需要新的 MCP、网络服务或第三方 CLI。
- Maka 和 DeepSeek Harness 只作为仓库内参考源码与设计资料，不在实现阶段动态加载。
- 真实 Provider 手工验收只使用用户已有凭据；代码测试使用 mock / fixture，不在计划中索取或记录 API Key。
- 不修改、不提交、不删除当前工作区中与本计划无关的 dirty changes。

## 10. 验证矩阵

| 层级 | 必须验证 |
| --- | --- |
| Shared / migration | v3→v4、幂等、损坏文件、备份冲突、稳定 ID、无 secret 泄露 |
| Main / IPC | typed IPC、revision、mutation queue、prompt 文件、secrets 权限 |
| Renderer | 分组导航、行展开、模型路由、身份表单、工具/子 Agent、Usage 空态和错误态 |
| Usage projection | Journal replay、兼容聚合、request/tool 粒度、unknown/estimated 成本 |
| Responsive / theme | 大窗口、820px、600px、浅色、深色、跟随系统、键盘 focus |
| Electron | preload、真实 dataRoot、重启恢复、Settings 与 Analysis 路由、退出不损坏数据 |
| Regression | 现有模型选择、Composer、Explore、Archive、Analysis、Session Journal 和 CLI 不回归 |

## 11. 计划执行记录

实现开始时创建：

```text
docs/exec-runs/20260830-actspace-settings-center-refactor/
├── execution-process.md
└── execution-summary.md
```

执行过程中每完成一个阶段，更新阶段状态、实际命令、失败原因和回退结果。完成后将本计划移动到 `docs/exec-plans/completed/`，并同步 `docs/exec-plans/README.md`、history 和执行摘要。未完成的真实 Provider、Electron packaged、截图和签名验收必须明确标记，不能写成自动化通过。

## 12. 进度记录

- [x] 2026-08-30：设置中心产品与持久化设计已确认。
- [x] 2026-08-30：冻结 v4 namespace、Provider / Connection / Model 边界和 Usage / Journal 所有权。
- [x] P0：v4 contract、v3→v4 migration、Settings Authority。
- [x] P1：Maka 式设置壳层与分组导航。
- [x] P2：统一模型页面与稳定对象引用。
- [x] P3：通用、工具、子 Agent 与身份 Prompt。
- [x] P4：Usage 活动分析与页面偏好持久化。
- [x] P5：事件级活动投影、旧路径清理与最终文档同步。
- [ ] P6：Electron 真实验收、人工截图和交付收口。

## 13. 执行模式

采用**交互模式**。P0 涉及设置迁移和公共 IPC，P2 涉及凭据与模型引用，P4/P5 涉及 Usage 数据语义；每个阶段完成后逐阶段检查，不使用夜间模式进行首次 v4 持久化迁移或 Usage 数据源切换。
