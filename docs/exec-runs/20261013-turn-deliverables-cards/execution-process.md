# 轮尾改动卡与交付文件卡 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261013-turn-deliverables-cards.md`
- **执行模式**：交互
- **开始时间**：2026-10-13
- **结束时间**：进行中

## 执行时间线

### 步骤 0：调研与方案收敛

- **操作**：
  - 通读 DSH ui-deliverables、ui-open-in-app、FileTypeIcon、tool-present 与 native-command。
  - 由两个只读子智能体梳理 ActSpace 的工具/投影链路，以及 main/renderer 基础设施。
- **决定**：见计划的决策记录。
- **验证**：用户认可 demo `docs/design-docs/frontend/turn-deliverables-demo.html`。

### 步骤 1：T1 后端 `present` 工具

- **操作**：
  - 在 filesystem-read 加 `present`：最多 4 个文件；用 `lstat` 拒绝符号链接和目录；用 realpath 拒绝工作区外的路径。
  - 在 agent-form 和 agent 模式里装配。
  - 提示词新增 `core/output-choice`，只在 Agent 模式输出。
- **验证**：filesystem-read 8 项、prompt output-choice、core/agent 17 项、runtime 组合 13 项测试通过。

### 步骤 2：T2 投影

- **操作**：
  - shared 新增 `present` 预览、`PresentedFile` 和 MessageBlock。
  - tool-card 从 detail 读取文件，并补齐工作区输出路径。
  - selector、流式 `toolEntryToBlock` 与 ToolLogLine 渲染「Presented 文件名」。
- **验证**：selector 和 tool-preview 测试通过，desktop typecheck 通过。

### 步骤 3：T3 main IPC

- **操作**：
  - 新增 `workspaces.listFileApplications` 和 `workspaces.openFile`（`action: open | reveal`）。
  - `file-applications-service.ts` 移植 DSH 的 JXA 查询与去重。打开前用未去重的完整列表校验应用 id。
  - 路径统一经过 `withWorkspaceAccess` 和 `resolveArtifactContextTarget`（realpath + 工作区内）。
  - 补齐 guard、guard 测试和 mock。
- **验证**：
  - main 测试 37 项通过；`check:ipc-channels`、`check:renderer-bridge` 通过。
  - 在本机真实执行 JXA：约 0.44 秒返回 8 个应用，含图标和本地化名称。

### 步骤 4：T4 文件类型图标

- **操作**：
  - `components/files/` 移植 FileTypeIcon、CodeFileIcon、code-file-types 和 48 个代码图标。颜色改用 `--act-file-type-*` 固定色 token。
  - 附 `DEEPSEEK_HARNESS_LICENSE.txt`，并在 `NOTICE` 中注明。
- **验证**：file-type-icon 18 项测试通过，`check:frontend-theme` 通过。

### 步骤 5：T5 轮尾数据推导

- **操作**：
  - `components/turn-tail/turn-tail-data.ts`：从本轮 `write_diff` / `edit_diff` / `delete` / `present` 块推导改动与交付。
  - 新建文件识别 `@@ -1,1 +1,N @@` 的幽灵旧侧空行并去掉，避免显示成「删除了 1 行」；同一文件多段 hunk 按时间顺序保留，不合并。
  - 沿用旧的兼容规则：删除事件只带文件名时，本轮恰好只有一个同名文件才认定是它（现在改为按基名匹配，因为在同一轮里新建又被删除的文件必须去掉）。
- **验证**：`turn-tail-data.test.ts` 10 项通过（含新建后删除、同名多文件不误删）。

### 步骤 6：T6 改动卡与悬停 diff

- **操作**：
  - `TurnChangesCard.tsx`：单文件 / 多文件头部、折叠、`+/-` 合计、文件行；右键弹出文件菜单。
  - `TurnDiffPopover.tsx`：悬停 500ms 打开、宽度为卡片宽度减 48、`max-height: 420px`、移出 200ms 关闭。
- **验证**：由 `turn-tail.test.tsx` 覆盖。

### 步骤 7：T7 每轮 Review 标签

- **操作**：
  - 右侧面板新增 `turnReview` 标签类型，数据随标签传入（`changes` + 选中下标 + revision），不复用基于 Git 的 `ReviewWorkspace`。
  - `TurnReviewView.tsx`：左侧文件列表，右侧左右对比 / 单栏、自动换行、文件菜单与「打开整个文件」；纯新增文件强制单栏。
- **验证**：`turn-tail.test.tsx` 的 Review 用例（单栏→切文件→左右对比→换行→打开整个文件）通过。

### 步骤 8：T8 交付卡与原生打开

- **操作**：
  - `TurnDeliverables.tsx`：卡片网格、超过 4 个折叠、点击预览、右键走文件菜单。
  - `OpenWithButton.tsx` + `open-turn-file.ts`：默认应用按钮与关联应用下拉，末项「显示文件位置」；远端会话改为经 Host 下载，不显示原生按钮。
- **验证**：`turn-tail.test.tsx` 覆盖本地打开 / 显示位置 / 右键菜单，以及远端预览 + 下载。

### 步骤 9：T9 设置开关

- **操作**：
  - 设置 v4 新增 `general.showTurnCodeChanges`（默认 true），补 guard、迁移与 fixtures。
  - `useShowTurnCodeChanges.ts` 用一个模块级共享订阅读设置，避免长会话里每轮各发一次请求；切换设置立即生效。
- **验证**：`turn-tail.test.tsx` 的开关用例通过。

### 步骤 10：T10 TurnView 接线

- **操作**：
  - `TurnTail.tsx` 替换 `TurnView` 里的 `TurnOutputArtifacts`：改动卡 → 交付卡 → 图片列表。
  - `TurnOutputArtifacts.tsx` 收缩为只渲染生成图片（不再收录 Write/Edit 文件）。
  - `ConversationView.tsx` 计算轮号；历史未加载完（`browse.hasEarlier`）时不显示轮号。
- **验证**：`turn-output-artifacts.test.tsx` 改为图片专用并去掉迁移走的用例，其余项通过。

### 步骤 11：T11 mock 场景、测试与文档

- **操作**：
  - `mock/scenarios/turn-deliverables.ts`：两轮数据（改 7 个文件、交付 5 个、含新建后删除的临时脚本），并为 `workspaces.readFile` 提供假文件。
  - `mock-db.ts` 支持按轮的 `tool` 消息并投影成 `tool-result`。
  - 新增 `turn-tail.test.tsx`（10 项）、`mock-bridge.test.ts` 场景断言，补 `native-button-baseline.json` 三条。
  - 更新 `front-中间消息区规范.md`、`FRONTEND_VERIFICATION.md`、本文件和计划进度。
- **验证**：
  - `turn-tail.test.tsx` 10 项、`turn-tail-data.test.ts` 10 项、`turn-output-artifacts.test.tsx` 15 项、`mock-bridge.test.ts` 20 项通过。
  - `check:frontend-theme`、`check:frontend-tokens`、`check:ipc-channels`、`check:renderer-bridge` 通过；desktop renderer / main typecheck 通过。
  - 浏览器截图（亮色、暗色、480px）见 `screenshots/`。

## 遇到的问题

- 另一会话正在改模型连接设置（`ProviderSettings.tsx`、`CustomConnectionModels.tsx`、`styles/index.css`、`model-connection.css`）。它导致 desktop typecheck 和 `check:frontend-tokens` 暂时失败，与本计划无关，本计划不去修改这些文件。

## 跳过或推迟的事项
