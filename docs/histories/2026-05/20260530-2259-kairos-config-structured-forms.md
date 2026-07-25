## [2026-05-30 22:59] | Task: Kairos 配置编辑器从 raw JSON 改为结构化表单

### 🤖 Execution Context

- **Agent ID**: `5cdc1005-b9ef-4c1c-8573-3e46a3c3c90a`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> 小调整：json 文件不该用 raw 方式，应保留出字段、前端用表单/开关。可访问路径用输入框列表，屏蔽规则也考虑，运行偏好可设置（字段待讨论），放在 Kairos 自主智能体下面。
> 拍板：运行偏好「精简」（只作息+睡眠区间）；不放 enabled 开关；禁用工具用「多选下拉」并复用设置页工具清单。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（renderer settings）、docs

**Key Actions:**

- **新增原子组件**：`SettingsPrimitives` 加 `MultiSelect`（多选下拉，复用 `SettingsSelect` 的 portal 定位 + 复选框项、选后不收起）与 `TextField`（受控、commit-on-blur，适合即时生效表单的字符串字段）。
- **抽离工具清单**：新建 `settings/tool-catalog.ts` 导出 `TOOL_ITEMS`，由「工具」分区（主 Agent 全局开关）与 Kairos「禁用工具」多选共用，消除两处各维护一份工具名的漂移。
- **`KairosSettings` 重写为结构化表单**（替换 4 张 raw JSON 卡片）：
  - 运行偏好 `preferences.json`（精简）：时区 / 工作时段 / 安静时段 / 周末睡眠倾向（作息节律）+ 睡眠区间最短/最长/默认（秒）。
  - 可访问路径 `paths.json`：输入框列表（路径 mono + 巡检 Toggle + 可选说明 + 增删）。
  - 屏蔽规则 `blocklist.json`：屏蔽路径 glob 列表、禁用工具 `MultiSelect`、免打扰时段 from–to 列表、单次唤醒工具上限 `Stepper`。
  - 用户规则 `rule.md`：保留 textarea，失焦自动保存。
- **写回策略**：读出整个对象 → `patch{Prefs,Paths,Blocklist}` 克隆并 mutate 表单认识的字段 → `JSON.stringify` 写回，**保留未暴露字段（含 `tip`、tickBudget/circuitBreaker/memory）**。`paths`/`blocklist` 写盘前过滤空行（与 main `parse*` 丢空一致），空行仅留本地 UI 待填。用 ref 取最新对象避免 stale。
- **测试**：重写 `kairos-config-files.test.tsx`（9 例）——结构化分组渲染、桥缺失降级、添加路径写回、watch 开关、禁用工具多选、睡眠区间、模型下拉保留字段、rule 失焦写回、preferences 解析失败禁用 + 默认值覆盖恢复。

### 🧠 Design Intent (Why)

raw JSON 对用户不友好且容易改坏（少逗号就整文件回落默认）。改成结构化表单后，用户改的是有语义的控件，产出的 JSON 永远合法、`kairos:write-config` 不会拒。难点在「只暴露部分字段又不能丢用户其它字段」：因此不整体替换文件，而是 load→clone→patch 已知字段→序列化，未暴露字段（含给 LLM 的 `tip`）原样保留。控件即时生效与设置页其它分区一致；禁用工具用多选下拉而非一排开关，既紧凑又能和「工具」分区（主 Agent 的全局开关）在视觉与语义上区分。运行偏好只暴露作息+睡眠，把 tickBudget/circuitBreaker/memory 这类内部调参项留在文件里、不推给用户。模型来源迁移与 enabled 级联（上一轮）保持不变。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`（+MultiSelect/+TextField）
- `packages/desktop/src/renderer/components/settings/tool-catalog.ts`（新增）
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`（TOOL_ITEMS 改 import）
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`（重写）
- `packages/desktop/src/renderer/test/kairos-config-files.test.tsx`（重写，9 例）
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/exec-plans/active/20260530-kairos-config-editor.md`
