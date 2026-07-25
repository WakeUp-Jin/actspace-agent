## [2026-05-30 23:35] | Task: Kairos 配置表单再精简 + 可访问路径改「点击编辑」

### 🤖 Execution Context

- **Agent ID**: `5cdc1005-b9ef-4c1c-8573-3e46a3c3c90a`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> 设置的配置太多啦，要删几个：运行偏好只留工作时段/安静时段/睡眠区间，别用「夹紧」这词；可访问路径那个默认说明和常驻的空说明框太丑，设计交互重做；屏蔽规则只留屏蔽路径和禁用工具。可访问路径的交互给我方案先讨论。
> 拍板（AskQuestion）：路径/说明用「展示→点击编辑」(Cursor rule 风格)；默认 workspace 行标「默认」并禁止删除。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（renderer settings）、docs

**Key Actions:**

- **运行偏好精简**：删掉「时区 `rhythm.timezone`」「周末睡眠倾向 `rhythm.weekend`」两行，只留工作时段 / 安静时段 / 睡眠区间。睡眠倾向选项「浅睡（少夹紧）/ 深睡（多夹紧）」→「浅睡（更活跃）/ 深睡（更安静）」，睡眠区间说明「会被夹紧到该区间」→「会被限制在该区间内」，工作/安静时段说明同步去掉「夹紧」。
- **屏蔽规则精简**：删掉「免打扰时段 `timeWindows`」「单次唤醒工具上限 `maxToolCallsPerTick`」两块，只留屏蔽路径 + 禁用工具。连带移除未再使用的 `Stepper` 导入与 `BLOCKLIST_MAX_DEFAULT` 常量。
- **可访问路径重设计**：新增行内组件 `InlineEdit`（展示只读文本，点击变输入框，失焦/回车提交，Esc 取消）。路径与说明都走 `InlineEdit`；说明空态只渲染极轻的「+ 添加说明」幽灵按钮，**不再常驻空输入框 + 冗长 placeholder**；新增路径行自动进入编辑态（autoEdit）；删除按钮改为 hover 行才浮现。
- **默认 workspace 行保护**：`isDefaultWorkspacePath()` 用路径后缀 `kairos/workspace` 判定（main 端 scaffolding 固定写 `<kairosRoot>/workspace`），命中则标「默认」徽章、路径只读、不渲染删除按钮（说明 / 巡检仍可改）。
- **测试**：`kairos-config-files.test.tsx` 增 2 例——「默认行有徽章且无删除按钮、普通行可删」（断言用 `within(可访问路径 section)` 消歧，因运行偏好里也有「默认」字样）、「点击『+ 添加说明』编辑并写回 tip」。

### 🧠 Design Intent (Why)

用户的核心反馈是「设置项太多 + 可访问路径那块又重又丑」。删字段时坚持「UI 精简 ≠ 数据丢失」：写回仍是 load→clone→patch 已知字段→序列化，移除的字段（timezone/weekend/timeWindows/maxToolCallsPerTick 等）UI 不再触碰、文件里原样保留，后端能力不变。可访问路径回到用户最初就青睐的 Cursor rule「展示→点击编辑」范式：默认是一份可读的列表而非一排输入框，说明（tip）作为可选副信息只在需要时展开，去掉了空输入框噪音。默认 workspace 是 Kairos 文件工具的相对路径根，误删会让自主体失去落点，故标「默认」并禁删；识别用稳定的路径后缀而非新增 IPC，避免为一个 UX 护栏改契约。「夹紧（clamp）」是实现术语、对用户不友好，统一换成「更活跃 / 更安静 / 限制在区间内」的体感表述。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`（运行偏好/屏蔽规则精简 + 可访问路径 `InlineEdit` 重设计 + 默认行保护；移除 Stepper 导入/常量）
- `packages/desktop/src/renderer/test/kairos-config-files.test.tsx`（+2 例，import `within`）
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/exec-plans/active/20260530-kairos-config-editor.md`

### ✅ Verification

- `pnpm --filter @actspace/desktop typecheck` ✓
- `pnpm --filter @actspace/desktop test` ✓（27 文件 / 205 测）
- `pnpm --filter @actspace/desktop build` ✓
- 待办：Electron 真机走查浅/深主题下的可访问路径点击编辑与默认行禁删（browser mock 下 `window.kairos` 不存在、表单降级，需真机验视觉）。
