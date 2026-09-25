# 设置中心视觉重设计 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260925-settings-visual-redesign.md`
- **执行模式**：交互
- **开始时间**：2026-09-25 21:13
- **结束时间**：2026-09-25 23:30

## 执行时间线

### 步骤 1：T0 基线

- **操作**：跑设置相关测试与全量 desktop 测试，记录基线。
- **验证**：
  - 设置相关 6 个文件（settings-page、settings-color-semantics、provider-model-settings、english-learning、usage-statistics-page、usage-hover-card）：69 / 69 通过。
  - 全量 `pnpm --filter @actspace/desktop test`：785 个中 3 个失败，均与设置无关：
    - `src/main/test/workspace-git-context-service.test.ts` › hides Git controls for a non-repository workspace
    - `src/renderer/test/app-streaming-user-message.test.tsx` 两个用例（该文件在审批卡未提交改动中被修改）
  - 结束时失败数不得高于 3。

## 遇到的问题

## 跳过或推迟的事项

### 步骤 2：T0 视觉 fixture

- **操作**：新增 `test/fixtures/settings-preview.{html,tsx}`，用固定样例渲染整个 `SettingsPage`，支持 `?section=…&theme=…&detail=DeepSeek`。
- **遇到的问题**：用户的 5173 开发服务器中途停止；另起 `vite --port 5199` 只用于截图，不影响用户进程。

### 步骤 3：T1 基础部件

- **影响文件**：`SettingsPrimitives.tsx`、`tokens.css`、`tailwind.css`、`check-frontend-theme-colors.mjs`、`test/settings-primitives.test.tsx`、`test/settings-color-semantics.test.tsx`。
- **决定**：`PageShell` 的 `maxWidth` 改为 `width: default | wide`；只新增 `toggle-off` 一个颜色 token。
- **验证**：部件测试 5/5 通过；主题检查通过。

### 步骤 4：T2 / T6 / T7 导航、搜索页、工具页

- **影响文件**：`SettingsNav.tsx`、`SettingsPage.tsx`、`SearchSettings.tsx`、`useToolToggle.ts`、`test/search-settings.test.tsx`。
- **决定**：搜索通道行在关闭联网搜索时不变灰；通道改为行内输入 Key，不再用 `ProviderKeyModal`。
- **遇到的问题**：导航加了 `overflow-y-auto` 违反既有“导航不自带滚动”测试契约，已撤回。

### 步骤 5：T3 / T4 通用与外观

- **决定**：生成参数失焦即保存、非法值行内提示不提交；Chat 压缩阈值改为步进器；“撤销更改”并入“取消”。外观缩略图颜色放到只定义一次的 `--act-preview-*`。
- **验证**：新增“温度 3 失焦报错不提交、0.4 保存并提示”的用例。

### 步骤 6：T5 模型页

- **决定**：保留路由结构、所有 `h4` 标题与按钮名，只换容器和控件；连接内的模型选择继续用可搜索多选（规范与测试依赖），未改成 demo 的逐模型开关行。
- **遇到的问题**：自定义连接缺少 `baseUrl` 时 `compactAddress` 报错，已加保护；fixture 的已安装模型结构不对，已按测试样例修正。

### 步骤 7：T8 / T9 其余页面与使用统计

- **决定**：子 Agent 页直接选择 Explore 模型（写 `updateTaskModels`），不做启用开关与思考级别。
- **验证**：使用统计测试 4/4、悬停测试 3/3 通过。

### 步骤 8：全量验证

- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop test`：802 个中 801 通过；唯一失败 `workspace-git-context-service` 为基线已有失败（基线 3 个，另两个已被并行会话修复）。
- `pnpm check:frontend-theme`：通过。
- `pnpm --filter @actspace/desktop build:renderer`：通过。
- 截图：通用、外观、模型列表/详情、搜索、工具、子 Agent、归档、更新、使用统计，浅色与深色；520px 窄窗检查搜索页无横向溢出（headless Chrome 在 macOS 上不支持小于约 500px 的布局宽度）。

## 跳过或推迟的事项

- 子 Agent「启用」开关与「思考级别」：Runtime 不读 `routes.explore.enabled`，也没有思考级别字段。
- 搜索 Key 保存前测试连接：没有搜索 Key 测试接口。
- 连接测试“上次结果”：测试结果不持久化，只显示本次打开后的结果。
- 连接详情内逐模型开关行：保留现有可搜索多选。
- Electron 真实窗口验收：待用户执行。
