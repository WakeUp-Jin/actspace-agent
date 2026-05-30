# Kairos 配置文件编辑器 + 模型来源迁移到配置文件 开发计划

## 目标

两件事一起做：

1. **设置页结构化编辑 Kairos 配置文件**：在设置页「智能体」分区新增能力，让用户在 UI 里直接查看 / 编辑 `<userData>/kairos/config/` 下的 4 份文件（`preferences.json` / `paths.json` / `blocklist.json` / `rule.md`）。**3 份 JSON 用结构化表单（输入框列表 / 开关 / 下拉 / 多选 / 步进器），不暴露 raw JSON**；`rule.md` 是自由 markdown，保留文本框。所有控件**即时生效**（改一下就写盘），写回时**保留表单未暴露的字段**（含给 LLM 的 `tip` 与未来字段）。保存走已有的 `kairos:write-config` IPC（schema 校验 + 原子写 + `reloadConfig()`）。
2. **把 Kairos 模型的「真来源」从 env 迁到 `preferences.json`**（用户决策 B：「env 后面不一定有用，走配置文件更好」）。迁移后：
   - `preferences.json` 的 `modelId` 成为**唯一真来源**（不再是死字段）。
   - 设置页「Kairos 模型」下拉**改成读写 `preferences.json`**；与 raw 卡片编辑同一个文件、互相同步。
   - **改文件 modelId 或改下拉，都会真正切换 Kairos 所用模型 + 上下文 Sheet 显示同步**（保存后按需重建 controller）。
   - **改文件 `enabled` 会真正起 / 停 Kairos**（保存后调和运行态），Kairos 页「开启/暂停」按钮行为不变。

最终效果：Kairos 的「模型 / 开关 / sleep / 节律 / 路径 / 黑名单 / rule」全部以 `<userData>/kairos/config/` 为单一事实来源，UI 是它的友好视图与编辑器，所见即所得。

## 范围

- 包含：
  - **模型来源迁移（agent-core）**：Kairos LLM / ToolManager 工厂改为从传入的 `modelId`（来自 `preferences.modelId`）解析 ModelSpec，不再读 `KAIROS_MODEL_ID` env。`KairosContextSnapshot.modelId` 改报**解析后的真实模型 id**（null 回落 `DEFAULT_KAIROS_MODEL_ID`）。
  - **设置剥离（shared + main）**：从 `AppSettings.kairos` 移除 `modelId`（保留 `thinking`）；`SettingsService` 停写 `KAIROS_MODEL_ID`、`settings:update` 不再因 modelId 触发重建。
  - **级联触发（main）**：`kairos:write-config` 保存 `preferences.json` 后——若 `modelId` 变化则重建 controller（用新模型）；否则按 `enabled` 调和运行态（起/停）。
  - **渲染层**：`packages/desktop/src/renderer/components/settings/KairosSettings.tsx` 改为结构化表单，在「智能体」分区渲染：模型下拉 + 思考链下拉 + 运行偏好（作息节律 + 睡眠区间）+ 可访问路径（输入框列表）+ 屏蔽规则（屏蔽路径列表 + 禁用工具多选 + 免打扰时段列表 + 单 tick 上限）+ 用户规则（`rule.md` 文本框）。新增原子组件 `MultiSelect` / `TextField`（`SettingsPrimitives.tsx`）；抽出工具清单到 `settings/tool-catalog.ts` 供「工具」分区与 Kairos 禁用工具多选共用。
  - 浏览器 mock 模式（`window.kairos` 不存在）：所有配置表单与模型下拉降级为禁用提示，不报错；思考链下拉仍可用（走 settings）。
  - 单测同步 / 新增；设计文档同步（`设置页规范.md`、`kairos-autonomous-mode.md`）；`docs/histories/` 记录。
- 不包含：
  - **不暴露运行时 / 派生文件**：`memory/state.json`、`memory/usage-accumulator.json`、`memory/short-term/*.jsonl`、`observe/*`、`briefs/index.json`、`briefs/tasks/*.md`。
  - **不暴露 raw JSON**：3 份 JSON 改为结构化表单；仅 `rule.md`（自由 markdown）保留文本框。
  - **运行偏好只暴露精简字段**（作息节律 rhythm + 睡眠区间 sleepRangeSeconds）；`tickBudget` / `circuitBreaker` / `memory` / `tip` 不暴露，写回时原样保留。
  - **不在设置页放 `enabled` 开关**：启停只留在 Kairos 页；改文件 `enabled` 仍会级联起停（后端能力保留）。
  - **不迁移思考链（thinking）**：本期 `thinking` 继续走 `AppSettings.kairos.thinking` → `KAIROS_THINKING` env（它不是死/重复字段，无所见即所得冲突）。迁移到 `preferences.json` 作为后续可选项，写进决策记录。
  - 不改后端 IPC 契约形状：`kairos:read-config` / `kairos:write-config` / `window.kairos.*` 已存在，复用（仅在 main 端给 write-config 增加「写后级联」副作用，不改 payload）。
  - 不动 Kairos 页运行控制 / 上下文 Sheet 布局（仅其显示的 modelId 数据因来源变化而变准）。

## 背景

- 必读文档（新会话 / 子 Agent 先读）：
  - `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`
  - `docs/design-docs/agent-core/kairos-autonomous-mode.md`（Kairos 配置体系、存储布局、配置变更响应、模型 env 约定——本计划会更新其中模型口径）
  - `docs/design-docs/frontend-ui/设置页规范.md`（智能体分区信息架构）
  - `docs/FRONTEND_VERIFICATION.md`、`docs/coding-standards/team/frontend-style-scope-conventions.md`、`docs/design-docs/frontend-ui/主题与配色规范.md`
- 关键现状（已核对）：
  - 模型真来源 = `KAIROS_MODEL_ID` env：设置页下拉 → `settings.json` `kairos.modelId` → `SettingsService.applyToEnv` 写 `KAIROS_MODEL_ID` → `resolveKairosEnv()`（`packages/agent-core/src/kairos/env.ts`）→ `createKairosLlm()`（`packages/desktop/src/main/kairos-bootstrap.ts`）。改下拉后 `index.ts` 的 `settings:update` handler 比较前后值并调 `rebuildKairosController()`。
  - `preferences.json.modelId` 当前是**死字段**：仅 `controller.ts:518` 用 `config.preferences.modelId ?? null` 填 `KairosContextSnapshot.modelId`（默认 null → 恒显示「跟随主 Agent」）。
  - `enabled`：`preferences.enabled` 是「是否自启动」唯一持久字段；Kairos 页按钮经 `dispatchKairosControl` → `start({force:true})/stop()` + `setEnabledPreference()` 同时改运行态与文件。但 **`controller.reloadConfig()`（`controller.ts:363` 的 `reload`）只替换内存 config，不依据 `enabled` 起/停 processor**——所以「改文件 enabled」当前不级联到运行态。
  - 写后回调链：`kairos:write-config`（`packages/desktop/src/main/kairos-ipc.ts:102`）写盘后 `await controller.reloadConfig()`。`rebuildKairosController`（`index.ts:512`）：ticking 时跳过；否则 dispose 旧 controller+ipc → `ensureKairosController`（`index.ts:480`，含 `createKairos(...)`）重建 → `controller.start()`（尊重 `preferences.enabled`）。
- 关键代码路径：
  - agent-core：`kairos/env.ts`（`resolveKairosEnv`/`DEFAULT_KAIROS_MODEL_ID`）、`kairos/config/schema.ts`（`Preferences.modelId` 保留）、`kairos/controller.ts`（`CreateKairosOptions`、`getContextSnapshot`）。
  - main：`kairos-bootstrap.ts`（`createKairosLlm`/`createKairosToolManagerFactory`/`resolveKairosThinkingEnabled`）、`index.ts`（`ensureKairosController`/`rebuildKairosController`/`settings:update`）、`kairos-ipc.ts`（`kairos:write-config`）、`settings-service.ts`（`applyToEnv`/`defaultSettingsFromEnv`/`sanitizeKairos`）。
  - shared：`settings.ts`（`KairosSettings`/`AppSettings`/`SettingsUpdateInput`）、`kairos-contracts.ts`（`KairosContextSnapshot.modelId` 注释、`KairosBridgeApi`）。
  - 渲染：`components/settings/SettingsPage.tsx`（`AgentSection`）、`SettingsPrimitives.tsx`、preload `window.kairos`、`global.d.ts`。
- 已知约束：
  - JSON 校验是宽松合并型（缺/坏字段落默认，仅 `JSON.parse` 失败才 throw）——卡片要注明「非法/缺失字段会回落默认」。
  - 模型下拉与 raw 卡片编辑同一份 `preferences.json`：下拉变更时**以磁盘最新内容为基**（read → 合并 modelId → write），避免 stale；若磁盘 JSON 非法则提示「请先修复 preferences.json」。
  - 写盘 → reload 后再触发重建/级联，必须避免「在 invoke handler 执行中 dispose 自己的 ipc handler」——级联副作用用 `setImmediate` 延后到 handler 返回之后。

## 目标架构

```txt
设置页「智能体」> <KairosSettings>
  ├─ Kairos 模型 [下拉]      ── 读: parse(preferences.json).modelId
  │                           写: read 磁盘 → set modelId → window.kairos.writeConfig(preferences)
  ├─ Kairos 思考链 [下拉]    ── settings.json kairos.thinking → KAIROS_THINKING env（不变）
  └─ Kairos 配置文件
       preferences.json [raw 卡片]  ← 与上方模型下拉共享同一份内容
       paths.json / blocklist.json / rule.md [raw 卡片]
                       │ 读 window.kairos.readConfig         ↓ 写 window.kairos.writeConfig
main kairos-ipc.ts: kairos:write-config
   → schema 校验 → 原子写 → controller.reloadConfig()
   → (name==="preferences" 时, setImmediate) onPreferencesWritten(cfg):
        if resolve(cfg.modelId) !== currentKairosModelId → rebuildKairosController()  // 换模型(start() 尊重 enabled)
        else 按 cfg.enabled 调和运行态: enabled&&!running→start(); !enabled&&running→stop()

模型解析（迁移后）:
  preferences.modelId(string|null) → resolveKairosModelSpec(modelId)（null→DEFAULT_KAIROS_MODEL_ID）
     → createKairosLlm(modelId) / createKairosToolManagerFactory({workspaceRoot, modelId})
     → createKairos({ modelId: resolvedId })  → snapshot.modelId = resolvedId（显示=真实）
  KAIROS_MODEL_ID env: 不再被读取/写入（保留声明但弃用，注释标注）
```

## 配置文件 UI 规格（以本节为准）

总原则：**读出整个 JSON 对象 → 表单只 patch 它认识的字段 → `JSON.stringify(obj, null, 2)+"\n"` 写回（保留未暴露字段，含 `tip`）**。控件全部**即时生效**：开关 / 下拉 / 多选改即写；文本与数字输入 commit-on-blur（失焦或回车）才写；列表项增删即写。`kairos:write-config` 逐字写盘（仅 JSON.parse + 宽松 coerce 校验），结构化表单产出的 JSON 永远合法、不会被拒。

`KairosSettings` 状态：`prefs` / `pathsObj` / `blocklistObj`（三个 `Record<string,unknown>|null`，保留磁盘原对象）+ `ruleText` + 各文件 `parseError`（JSON.parse 失败）。`patch{Prefs,Paths,Blocklist}(mutate)`：JSON 克隆当前对象 → mutate → setState + 写盘（用 ref 取最新避免 stale）。

分组与控件（均在「智能体」分区，置于 Kairos 自主智能体之下）：

1. **Kairos 自主智能体**（`SettingGroup`）
   - 模型（`SettingsSelect`）：value = `prefs.modelId`（null→「跟随默认」）；onChange `patchPrefs(o.modelId=...)`。
   - 思考链（`SettingsSelect`）：走 `settings.kairos.thinking`（不入 preferences.json）。
2. **运行偏好 preferences.json**（精简：workHours / quietHours + sleepRangeSeconds）
   - 工作时段 `rhythm.workHours`：start / end（`TextField`，HH:MM）+ 睡眠倾向（`SettingsSelect`：更活跃 / 正常 / 更安静，**不出现「夹紧」**）。
   - 安静时段 `rhythm.quietHours`：同上。
   - 睡眠区间 `sleepRangeSeconds`：最短 / 最长 / 默认（`NumberField`，秒，min 1）。
   - **不暴露**：`rhythm.timezone`、`rhythm.weekend`、`tickBudget`/`circuitBreaker`/`memory`/`tip`——写回原样保留。
   - 解析失败：禁用本组 + 模型下拉，提示 + `[用默认值覆盖 preferences.json]`（写内置默认）。
3. **可访问路径 paths.json**（「展示 → 点击编辑」列表，Cursor rule 风格）
   - 每行：路径（`InlineEdit` mono，flex-1，只读文本点击变输入框）+ `watch`（`Toggle`）+ 删除（hover 行才浮现）；底部「+ 添加路径」，新增行自动进入编辑态。
   - 说明 tip：`InlineEdit`，**空态只显示「+ 添加说明」幽灵按钮、不常驻空输入框**；填值才写 `tip`，清空则删字段。
   - **默认 workspace 行**：路径后缀 `kairos/workspace` 判定 → 标「默认」徽章、路径只读、**无删除按钮**（防误删工作根目录；说明 / 巡检仍可改）。
   - 写回时过滤空 `path` 行（与 main 端 `parsePathsConfig` 丢空一致）；空行仅留在本地 UI 直到填值。
4. **屏蔽规则 blocklist.json**（精简：paths + toolsDenied）
   - 屏蔽路径 `paths`（glob 字符串列表，`TextField` mono + 删除 + 添加；写回过滤空串）。
   - 禁用工具 `toolsDenied`（`MultiSelect`，选项 = `tool-catalog.ts` 工具清单，选中=对 Kairos 禁用；默认 `["bash"]`）。
   - **不暴露**：`timeWindows`（免打扰时段）、`maxToolCallsPerTick`（单 tick 上限）——写回原样保留。
5. **用户规则 rule.md**（`<textarea>`，commit-on-blur + 「已保存」闪；自由 markdown，唯一保留文本编辑的文件）。

桥不可用（`window.kairos` undefined）：所有配置表单 + 模型下拉显示禁用提示「Kairos 配置仅在桌面端可编辑」，不发 IPC；思考链下拉仍可用。

样式：复用 `SettingGroup` 容器与语义 token（禁止 `text-black`/`bg-white`/`#hex`）；`MultiSelect` 复用 `SettingsSelect` 的 portal 定位；浅/深主题各验一次。

## 模型来源迁移规格（agent-core + main + shared）

1. `packages/agent-core/src/kairos/env.ts`：`resolveKairosEnv` 改签名为 `resolveKairosEnv(modelId: string | null)` —— modelSpec 由传入 `modelId` 解析（`asModelId(modelId) ?? DEFAULT_KAIROS_MODEL_ID`），`thinkingEnabled` 仍读 `KAIROS_THINKING` env 并按 `modelSpec.supportsThinkingToggle` 收口。导出 `resolveKairosModelSpec(modelId)` 便于复用。
2. `packages/desktop/src/main/kairos-bootstrap.ts`：
   - `createKairosLlm(modelId: string | null)`：用 `resolveKairosEnv(modelId).modelSpec` 建 LLM。
   - `createKairosToolManagerFactory({ workspaceRoot, modelId })`：provider/apiFormat 取 `resolveKairosEnv(modelId).modelSpec`。
   - `resolveKairosThinkingEnabled(modelId)`：返回 `resolveKairosEnv(modelId).thinkingEnabled`。
   - 新增 `resolveKairosModelId(modelId): string`：返回 `resolveKairosEnv(modelId).modelSpec.id`（解析后真实 id）。
3. `packages/agent-core/src/kairos/controller.ts`：`CreateKairosOptions` 增 `modelId: string`（解析后真实 id）；`getContextSnapshot().modelId` 返回 `opts.modelId`（替换 `config.preferences.modelId ?? null`）。
4. `packages/desktop/src/main/index.ts#ensureKairosController`：先 `loadKairosConfig(kairosRoot)` 取 `preferences.modelId`；据此调 `createKairosLlm(modelId)` / `createKairosToolManagerFactory({...modelId})` / `resolveKairosThinkingEnabled(modelId)`；`createKairos({ ..., modelId: resolveKairosModelId(modelId) })`；把 `resolveKairosModelId(modelId)` 存入模块级 `currentKairosModelId`。
5. `packages/agent-core/src/kairos/config/schema.ts`：**保留** `Preferences.modelId`（不删）。
6. `packages/shared/src/kairos-contracts.ts`：更新 `KairosContextSnapshot.modelId` 注释为「解析后真实模型；null 偏好回落 Kairos 默认模型」。

## 级联触发规格（main）

- `packages/desktop/src/main/kairos-ipc.ts`：`RegisterKairosIpcOptions` 增 `onPreferencesWritten?: (cfg: KairosConfig) => void`。`kairos:write-config` 在 `name==="preferences"` 写盘 + `reloadConfig()` 后，`setImmediate(() => opts.onPreferencesWritten?.(cfg))`，再 `return { ok:true }`（避免 dispose 自身 handler）。
- `packages/desktop/src/main/index.ts`：注册 kairos-ipc 时传 `onPreferencesWritten`：
  - `const desired = resolveKairosModelId(cfg.preferences.modelId);`
  - `if (desired !== currentKairosModelId) { await rebuildKairosController(roots); }`（重建路径里 `createKairos` 用新模型，`start()` 尊重新的 `enabled`，模型+开关一并落定）
  - `else { const st = kairosController?.getState(); if (st && cfg.preferences.enabled && !st.enabled) await kairosController.start(); else if (st && !cfg.preferences.enabled && st.enabled) await kairosController.stop(); }`
  - 失败写 `logMain`，不抛给 renderer（写盘已成功）。
- `settings:update` handler：去掉 modelId 比较，仅 `thinking` 变化时重建（thinking 仍走 env）。

## 风险

- 风险：模型来源迁移破坏既有「下拉改模型」链路。
  - 缓解：迁移后下拉走 `writeConfig` → `onPreferencesWritten` → 重建；阶段内用单测覆盖「写 preferences modelId 后 currentKairosModelId 变化触发重建」，Electron 真机验「选模型后上下文 Sheet 显示同步」。
- 风险：raw JSON 写错 → 保存失败 / 下拉无法合并。
  - 缓解：保存失败内联报错、磁盘不动；下拉变更前若磁盘 JSON 非法则提示先修。
- 风险：`enabled` 级联在 ticking 态执行 start/stop。
  - 缓解：stop() 直接走 processor.stop()；start() 幂等（已 enabled 直接 return）；modelId 重建在 ticking 时本就被 `rebuildKairosController` 延后（保持既有行为）。
- 风险：模型下拉与 preferences 卡片同编一个文件产生 stale / 互相覆盖。
  - 缓解：下拉以磁盘最新内容为基做 read→merge→write；任一写后都 `readConfig` 刷新共享 `preferencesContent`。
- 风险：移除 `AppSettings.kairos.modelId` 影响 mock / 测试 / Composer。
  - 缓解：Composer 不依赖它；逐一更新 `settings-page.test.tsx`、`app-streaming-user-message.test.tsx`、`MOCK_SETTINGS`、`settings-service.test.ts`。
- 风险：`KAIROS_MODEL_ID` env 残留导致误解。
  - 缓解：env.ts 中保留声明但加注释「已弃用：Kairos 模型改由 preferences.json 决定」；`.env.example` 同步说明。
- 风险：颜色/主题字面量违反规范。
  - 缓解：只用语义 token；浅/深双主题走查。

## 里程碑

1. 阶段一 · 模型来源迁移（agent-core + shared，可独立验证）
   - 改 `kairos/env.ts`（`resolveKairosEnv(modelId)` + `resolveKairosModelSpec`）、`controller.ts`（`CreateKairosOptions.modelId` + 快照源）、`kairos-contracts.ts` 注释。
   - 同步 `kairos/test/env.test.ts`（改为传 modelId 入参）、`kairos/test/controller.test.ts`（传 modelId、快照断言改解析值）。`config/test/schema.test.ts`/`loader.test.ts` 保留 modelId 期望（字段未删，不需大改）。
   - 验证：`pnpm --filter @actspace/shared build` → `pnpm --filter @actspace/agent-core test` 全绿。
2. 阶段二 · main 接线（bootstrap + index + kairos-ipc + settings-service + shared/settings）
   - `kairos-bootstrap.ts` 4 个函数签名带 `modelId`；`index.ts` `ensureKairosController` 先 load config 取 modelId、维护 `currentKairosModelId`、传 `onPreferencesWritten`；`settings:update` 去掉 modelId 重建分支。
   - `settings.ts` 移除 `KairosSettings.modelId`；`settings-service.ts` 去掉 modelId 的 seed/sanitize/`KAIROS_MODEL_ID` 写出。
   - `kairos-ipc.ts` 增 `onPreferencesWritten` 回调 + `setImmediate` 触发。
   - 验证：`pnpm --filter @actspace/desktop typecheck`；`settings-service.test.ts` 更新后绿。
3. 阶段三 · 渲染层 `KairosSettings.tsx`
   - 模型下拉（读写 preferences.json）+ 思考链下拉（settings）+ 4 张配置卡片；桥缺失降级；下拉与 preferences 卡片共享内容。
   - 在 `SettingsPage.tsx#AgentSection` 用 `<KairosSettings settings=... onUpdate=... />` 替换现有「Kairos 自主智能体」内联组 + 追加配置文件组。
4. 阶段四 · 单测
   - 新增 `packages/desktop/src/renderer/test/kairos-config-files.test.tsx`：mock `window.kairos`；覆盖 (a) 4 卡片展示+预览；(b) 点编辑出 textarea；(c) 保存调 `writeConfig`；(d) reject 内联报错不离开编辑态；(e) 桥缺失降级不调 IPC；(f) 改模型下拉 → `writeConfig` 写入合并了 modelId 的 preferences。
   - 更新 `settings-page.test.tsx`/`app-streaming-user-message.test.tsx`/`MOCK_SETTINGS`（去掉 kairos.modelId；模型下拉走 window.kairos mock）。
   - 验证：`pnpm --filter @actspace/desktop test` 全绿。
5. 阶段五 · 验证与收尾
   - `pnpm --filter @actspace/agent-core typecheck`、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop build`。
   - 文档：`设置页规范.md` 智能体分区改写（模型现由 preferences.json 决定 + 配置文件内联编辑）；`kairos-autonomous-mode.md` 更新模型口径（不再「不做 UI 模型独立选择 / 走 env」，改为「preferences.modelId 单一来源 + 设置页编辑」）；`.env.example` 标注 `KAIROS_MODEL_ID` 弃用。
   - `docs/histories/` 记一条。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/agent-core test` / `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/desktop typecheck` / `pnpm --filter @actspace/desktop test` / `pnpm --filter @actspace/desktop build`
- 手工检查（`docs/FRONTEND_VERIFICATION.md`）：
  - 浏览器 mock：设置→智能体，「Kairos 配置文件」+ 模型下拉显示「仅桌面端可编辑」，思考链可用。
  - Electron 真机（`pnpm dev:log`）：
    1. 4 张卡片展示真实文件内容；编辑 `rule.md` 保存→闪「已保存」→重进持久。
    2. 把 `blocklist.json` 改非法 JSON 保存→内联报错、磁盘文件未变。
    3. 上方「Kairos 模型」下拉选一个模型 → `preferences.json` 卡片里的 `modelId` 同步变化 → Kairos 页「上下文」Sheet 显示的模型 = 所选模型。
    4. 反向：在 `preferences.json` 卡片把 `modelId` 改成另一个合法模型保存 → 上方下拉同步 → 上下文 Sheet 同步 → （非 ticking 下）controller 重建日志可见。
    5. 在 `preferences.json` 卡片把 `enabled` 改 true 保存 → Kairos 真的开始运行（Kairos 页状态变）；改回 false 保存 → 停止。
  - 浅/深主题各走查卡片配色。
- 观测检查：`logs/latest-dev.log` 保存配置后可见 `reloadConfig` / `kairos controller rebuilt` 日志，无异常堆栈。

## 进度记录

- [x] 阶段零：现状调研（后端 IPC/preload 就绪；modelId 真来源=env、文件字段死；reloadConfig 不级联 enabled；rebuild 触发点在 settings:update）。
- [x] 阶段一：模型来源迁移（agent-core + shared）+ env/controller 单测绿（agent-core 500 测全过）。
- [x] 阶段二：main 接线（bootstrap/index/kairos-ipc/settings-service/settings）+ typecheck 通过。
- [x] 阶段三：`KairosSettings.tsx` + 挂载 AgentSection。
- [x] 阶段四：新增 `kairos-config-files.test.tsx`（6 例）+ 更新相关 mock，desktop 187 测全过。
- [x] 阶段五：agent-core/desktop typecheck + build 全过；文档（设置页规范 / kairos-autonomous-mode / .env.example）同步；history 已记。
- [x] 阶段六（改版）：3 份 JSON 由 raw 文本改结构化表单——`MultiSelect`/`TextField` 原子组件、`tool-catalog.ts` 抽离、`KairosSettings` 重写、`kairos-config-files.test.tsx` 重写（9 例）、设计文档同步。desktop typecheck + build + 190 测全绿。
- [x] 阶段七（精简 + 路径重设计）：按用户反馈砍字段——运行偏好去掉时区/周末睡眠倾向（只留工作/安静时段 + 睡眠区间）、去「夹紧」措辞；屏蔽规则去掉免打扰时段/单 tick 上限（只留屏蔽路径 + 禁用工具）；可访问路径改「展示→点击编辑」`InlineEdit` 列表（空说明用「+ 添加说明」幽灵按钮、新增行自动编辑、删除 hover 浮现），默认 workspace 行标「默认」且禁删。移除的字段全部写回原样保留。`kairos-config-files.test.tsx` 增 2 例（默认行禁删 / 点击加说明），desktop typecheck + build + 205 测全绿。

## 决策记录

- 2026-05-30：只暴露 `config/` 下 4 份文件做 UI 编辑，运行时/派生文件一律不暴露；原因是后者由 Kairos 自维护，手改破坏账目与事件流。
- 2026-05-30：~~统一 raw 文本编辑（JSON/Markdown），不做结构化表单~~。**已推翻**（见下）。
- 2026-05-30（改版）：3 份 JSON **改结构化表单**（路径输入框列表 / 屏蔽规则表单 / 运行偏好开关与字段），不再暴露 raw JSON；仅 `rule.md` 保留文本框。用户理由：raw JSON 对用户不友好。配套决策：
  - 运行偏好**只暴露精简字段**（rhythm 作息节律 + sleepRangeSeconds 睡眠区间）；tickBudget/circuitBreaker/memory/tip 不暴露、写回保留——避免把内部调参项推给用户。
  - **不在设置页放 `enabled` 开关**：与 Kairos 页「开启/暂停」按钮重复；启停只留在 Kairos 页（改文件 enabled 仍级联，后端能力保留）。
  - 禁用工具 `toolsDenied` 用**多选下拉**（非一排开关），选项复用「工具」分区的工具清单（抽到 `tool-catalog.ts`），与主 Agent 的全局工具开关在视觉上区分。
  - 写回策略：读出整个对象→patch→序列化写回，**保留表单未暴露字段**；控件即时生效（开关/下拉/多选即写，文本/数字 commit-on-blur，列表增删即写）。
- 2026-05-30：**采用方案 B**——把 Kairos 模型真来源从 `KAIROS_MODEL_ID` env 迁到 `preferences.json` 的 `modelId`，设置页下拉改成读写该文件。用户理由「env 后面不一定有用，走配置文件更好」；副得：消灭死字段、上下文显示恒准、改文件/改下拉都级联。代价：动 env/bootstrap/index/settings-service/settings 共五处模型接线，范围大于「仅加编辑器」。（推翻了 5-30 早先「移除死字段、来源=下拉/env」的决定。）
- 2026-05-30：`enabled` 接通级联——配置编辑器保存 `preferences.json` 后按 `enabled` 调和运行态（起/停），Kairos 页按钮不变；二者落同一文件，reload 后一致。
- 2026-05-30：本期**不迁移 thinking**（仍 settings/env）；它不是死/重复字段，无所见即所得冲突，迁移留作后续可选项以控范围。
- 2026-05-30：模型重建触发点从 `settings:update`（按 modelId）改到 `kairos:write-config`（保存 preferences 后按 modelId 变化）；级联副作用用 `setImmediate` 延后，避免在 invoke handler 内 dispose 自身 ipc handler。
- 2026-05-30（再精简）：用户嫌设置项过多/措辞难看，进一步收口可暴露字段：
  - 运行偏好只留**工作时段 / 安静时段 / 睡眠区间**；删掉时区、周末睡眠倾向；「夹紧」全部改为「更活跃 / 更安静 / 限制在该区间」等人话。
  - 屏蔽规则只留**屏蔽路径 + 禁用工具**；删掉免打扰时段、单 tick 工具上限。
  - 删掉的字段一律不从文件移除（patch 不触碰即原样保留），保证「UI 精简 ≠ 数据丢失」。
- 2026-05-30：可访问路径交互定稿为「展示 → 点击编辑」（沿用用户最初青睐的 Cursor rule 风格）。理由：原先「每行常驻一个空说明输入框 + 冗长 placeholder」又重又丑。改法经 AskQuestion 与用户确认：(a) 路径/说明都点击文本才出输入框，空说明用「+ 添加说明」幽灵按钮；(b) 默认 workspace 行标「默认」徽章并禁止删除（路径只读、说明/巡检可改）。默认行识别用路径后缀 `kairos/workspace`（main 端 scaffolding 固定写 `<kairosRoot>/workspace`），不新增 IPC 契约。
