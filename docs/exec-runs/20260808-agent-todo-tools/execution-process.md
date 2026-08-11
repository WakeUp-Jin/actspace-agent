# Agent Todo 工具 V1 - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260808-agent-todo-tools.md`
- **执行模式**：交互
- **开始时间**：2026-08-08（具体分钟未记录）
- **结束时间**：2026-08-09 00:10

## 执行时间线

### 步骤 1：确认契约与接入边界

- **操作**：复核设计、执行计划、Runtime、工具预览、前端主题和验证规范。
- **影响文件**：`docs/design-docs/tool-system/agent-todo-tools.md`、`docs/exec-plans/completed/20260808-agent-todo-tools.md`。
- **决定**：Todo 保持 `sessionId + agentRunId` 作用域，Task/TeamTask 不复用此模型；renderer 只消费 `TodoUiPreview`。
- **验证**：设计与计划不存在 TBD，占位范围与用户批准范围一致。

### 步骤 2：实现 shared 契约与状态核心

- **操作**：增加 Todo 类型、递归工具参数 schema、TodoStore、replace/merge、后端 ID、时间戳、revision 与原子校验。
- **影响文件**：`packages/shared/src/session.ts`、`packages/agent-core/src/internal-tools.ts`、`packages/agent-core/src/tools/tools/todo/`。
- **决定**：输入携带的 ID 只表示更新当前快照中的既有项；未知 ID 拒绝，避免调用方伪造后端身份。
- **验证**：Todo store/executor、ToolManager 与 prompt 聚焦测试通过。

### 步骤 3：贯通流式事件与恢复

- **操作**：让 bridge 在 started/finished 阶段发结构化 Todo preview；scheduler 保留 executor 的 structured 结果；恢复器只选择同一 Run 最近成功的 `todo_write`。
- **影响文件**：`packages/agent-core/src/engine/`、`packages/agent-core/src/persistence/recovery.ts`、`packages/shared/src/session-selectors.ts`。
- **决定**：partial JSON 不解析 Todo 数组；失败写入和 `todo_read` 都不能成为权威恢复快照。
- **验证**：bridge、streaming extractor、恢复和 selector 测试通过。

### 步骤 4：接入 Desktop 独立 Todo 块

- **操作**：增加只读 TodoListBlock，接入 ConversationView 与 App 实时聚合；同一 Run 的后续 Todo 调用替换旧快照。
- **影响文件**：`packages/desktop/src/renderer/App.tsx`、`packages/desktop/src/renderer/components/ConversationView.tsx`、`packages/desktop/src/renderer/components/messages/TodoListBlock.tsx`。
- **决定**：Todo 不进入普通工具日志或 Worked for 分组；running 展开、恢复后的全完成列表默认折叠。
- **验证**：Todo 组件、ConversationView 与 App 实时替换的定向测试通过；主题 token 检查通过。

### 步骤 5：仓库级验收与归档

- **操作**：执行类型检查、生产构建、定向测试、文档与 diff 检查，并同步设计、模块地图、history、learning 和 execution run。
- **影响文件**：`docs/` 下本任务相关设计、计划、执行记录、history 与 learning。
- **验证**：`pnpm typecheck`、`pnpm build` 和聚焦测试通过；完整结果见执行摘要。

## 遇到的问题

- **问题**：浏览器 renderer 验收无法启动。
  - **原因**：当前 Browser 控制器没有可用浏览器实例。
  - **应对**：保留组件与 App 级 DOM 测试，真实视觉验收转入人工验证指引。
- **问题**：`pnpm dev:log` 两次在创建 Electron 窗口前退出。
  - **原因**：Electron 39.8.10 进程在 macOS 原生 `IONotificationPortGetRunLoopSource` 栈发生 `EXC_BAD_ACCESS / SIGSEGV`，应用 JavaScript 尚未报告异常。
  - **应对**：停止重复启动，保留 production build 和 renderer 自动化结果，将 Electron 点击、视觉和真实进程恢复列为人工验收。
- **问题**：Desktop 整份 App 测试有两条既有侧栏状态断言受前序 UI 状态影响而失败。
  - **原因**：测试文件的侧栏折叠状态隔离不足；同样失败已记录于既有 Kairos history。
  - **应对**：两条用例单独运行均通过，Todo 新增用例单独及整文件运行均通过；未扩大本任务范围修改侧栏夹具。

## 跳过或推迟的事项

- 浏览器截图验收：无可用 Browser 实例。
- Electron 真实视觉、点击和重启恢复验收：原生进程在窗口创建前崩溃，按执行摘要交给可正常启动 Electron 的环境。
