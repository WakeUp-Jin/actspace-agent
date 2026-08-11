# Agent Todo 工具 V1 - 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260808-agent-todo-tools.md`
- **执行过程**：`docs/exec-runs/20260808-agent-todo-tools/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成，保留真实 Electron 人工验收边界

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| AgentRun 级 Todo 状态 | `packages/agent-core/src/tools/tools/todo/` | 提供原子 replace/merge、稳定 ID、revision 和结构化错误 |
| 两个内部工具 | `packages/agent-core/src/tools/index.ts` | 注册 `todo_read` / `todo_write`，不请求 workspace 审批 |
| 流式与恢复 | `packages/agent-core/src/engine/`、`packages/agent-core/src/persistence/recovery.ts` | 实时与 session JSONL 恢复共用 `TodoUiPreview` |
| 独立消息块 | `packages/desktop/src/renderer/` | 同一 Run 只展示最新 Todo 快照，不提供用户编辑 |

## 人工验证指引

### 必须验证

1. **真实 Electron 中的多步骤 Todo 生命周期**
   - 验证方式：在能正常启动 Electron 的环境运行 `pnpm dev:log`，发送一个至少包含三个独立步骤的实现请求，观察创建、进行中、逐项完成和最终全完成状态。
   - 预期结果：消息区始终只有一张 Todo 列表；最多一项为进行中；后续写入原位替换内容；最终列表可折叠且没有编辑、拖拽或删除控件。

2. **会话关闭后的展示恢复**
   - 验证方式：完成一次包含 Todo 的 Run，关闭并重新打开应用，再进入该会话。
   - 预期结果：历史消息显示最后一份完整快照，顺序、状态、完成数和折叠行为与关闭前一致；其他 Run 不继承该清单。

3. **浅色、深色和跟随系统主题**
   - 验证方式：分别切换三种主题，检查 pending、in_progress、completed、failed 与长文本。
   - 预期结果：颜色随主题翻转，文本不溢出，不出现卡片套卡或硬编码浅色背景。

### 建议验证

1. **真实 provider 的工具使用纪律**
   - 验证方式：分别发送简单问答和复杂多步骤任务。
   - 预期结果：简单请求不创建 Todo；复杂请求创建 Todo，并在步骤完成后及时更新。

## Agent 已完成的验证

- Shared：session transcript/selector 共 23 项测试通过。
- Agent Core：Todo store/executor、ToolManager、prompt、bridge、streaming extractor 与 recovery 聚焦测试通过。
- Desktop：TodoListBlock 与 ConversationView 11 项测试通过；App Todo 实时替换回归测试通过。
- 两条既有 App 侧栏状态用例单独运行通过；整文件运行仍受已知状态隔离问题影响，与本功能无关。
- `pnpm typecheck` 通过。
- `pnpm build` 通过，只有既有 Vite 大 chunk 警告。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check` 通过。

## 已知风险和遗留事项

- 当前机器的 Browser 控制器没有可用实例，未产出浏览器截图。
- Electron 39.8.10 两次在窗口创建前发生相同 macOS 原生 SIGSEGV，未完成真实点击、视觉和进程重启验收；自动化恢复测试不等价于这部分人工验收。
- Todo 的 prompt 采用行为指引，真实 provider 是否在所有复杂任务中合理使用仍需产品观察。

## 后续建议

- 完成上述 Electron 人工验收后，再决定是否调整 Todo 的默认展开密度或 prompt 使用阈值。
- Team Task 后续必须保持独立共享模型，不把本地 TodoStore 扩展成 owner、依赖或调度系统。
