# [2026-10-11] | Task: 模型多选框摘要与分组 + Context 右侧栏 Demo

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 设置页连接详情的模型多选框，选中后把所有模型名拼进输入框，框被撑宽；OpenRouter 这种长目录也要考虑。右侧栏 Context 参考 dsh-context 先出一个 HTML demo。

### 🛠 Changes Overview

**Scope:** `apps/desktop` renderer 设置页；设计文档。

**Key Actions:**

- **多选框触发器**：改为固定一行的摘要「已启用 N / 总数」+ 前两个短名 + `+剩余数`，不再 `labels.join(", ")`。
- **撑宽修复**：模型分区的 grid 改为 `grid-cols-[minmax(0,1fr)]`，grid 子项默认 `min-width:auto` 导致截断失效。
- **下拉面板**：改用 `ui/Popover`（去掉手写 document 监听），加「全部 / 已启用」分段筛选；两个以上厂商前缀时按厂商分组并去掉前缀；搜索结果不超过 20 个时才显示「全部启用」。
- **拆分**：`ModelMultiSelector` 从 `ModelSettings.tsx` 拆成单独组件，分组、摘要逻辑拆成纯函数 `model-selector-groups.ts` 并补单测；原生按钮基线随之迁移（总数不变）。
- **Context 面板 Demo**：`docs/design-docs/frontend/context-panel-demo.html`，参考 dsh-context 的 Current Context / Context Browser / Trend / Events；按用户决定去掉历史请求切换，明细只对比上次请求。
- **后端数据需求**：`docs/design-docs/frontend/front-Context面板后端数据需求.md`，交给 Context 引擎 V2 重构方；列出读取形状、稳定条目 key、估算口径、上限与压缩阈值、现有 Journal 来源与缺口、数据量预算。
- **会话内容简化**（同日追加）：明细里只有「会话内容」一类改为纯清单。每行显示类型、标题、新增标记、占比条和 token，不展开原文。去掉搜索和排序，固定最新在前，保留类型筛选。整行点击跳到轨迹对应记录，筛选行右侧放「在轨迹中打开」。后端文档相应改为：会话条目不带预览和全文，新增 `trajectoryRef`（与轨迹记录身份对齐）；前端计划加上轨迹「定位记录」入口。

### 🧠 Design Intent (Why)

触发器只承担「当前状态一眼可读」，完整清单交给下拉；OpenRouter 的厂商前缀在每一行重复是噪音，改成组标题后既能区分又更短。批量启用在长目录里收益低、误操作代价高，所以加数量上限。

会话内容和轨迹重叠：轨迹已经能逐条看消息和工具输入输出，面板再展开原文就是重复，而且这一类是数据量的大头。面板只回答「哪些条目占了多少」，看原文交给轨迹。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/settings/ModelMultiSelector.tsx`（新）
- `apps/desktop/src/renderer/components/settings/model-selector-groups.ts`（新）
- `apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `apps/desktop/src/renderer/test/model-selector-groups.test.ts`（新）
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `scripts/native-button-baseline.json`
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`
- `docs/design-docs/frontend/context-panel-demo.html`（新）
- `docs/design-docs/frontend/front-Context面板后端数据需求.md`（新）
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`

### ✅ Verification

- `vitest`：model-selector-groups / provider-model-settings / custom-model-reasoning / settings-page 共 82 个用例通过。
- `tsc --noEmit -p tsconfig.json` 通过；`check-frontend-design-tokens`、`check-frontend-theme-colors` 通过。
- 未做浏览器 mock 和 Electron 实机验证。
