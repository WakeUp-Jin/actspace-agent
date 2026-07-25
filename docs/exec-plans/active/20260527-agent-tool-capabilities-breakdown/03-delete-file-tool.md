# delete_file 工具新增计划

## 目标

新增 `delete_file` 工具，让 Agent 删除 workspace 内文件时不再使用 `bash rm`。完成后，删除 workspace 内存在文件需经用户审批后成功，删除不存在文件返回可读错误，删除 workspace 外路径被拒绝，前端能在运行中、审批中、完成后和 session 恢复后稳定展示删除动作。

本计划承接 `docs/exec-plans/active/20260527-agent-tool-capabilities.md` 的 Task 3。

## 范围

包含：

- 新增工具目录 `packages/agent-core/src/tools/tools/delete-file/`。
- 新增 snake_case 工具名 `delete_file`，目录使用 kebab-case。
- 只支持删除 workspace 内普通文件。
- 默认走 `ask` 权限审批；删除动作只允许一次性批准，不提供 `allow_similar`。
- 接入 ToolManager 注册、权限审批、streaming preview、bridge preview、session 恢复。
- 扩展 shared `ToolUiPreview` / `MessageBlock` 契约和必要前端渲染分支。
- 前端普通执行态复用轻量工具行；审批态使用独立的轻量删除确认块。
- 补单元测试、恢复测试和文档。

不包含：

- 不支持删除目录。
- 不支持批量删除。
- 不支持回收站/撤销。
- 不修改 Bash 权限体系。
- 不做额外的文件树刷新体验；如前端文件树需要刷新，由右侧面板计划后续接入。

## Required Reading

执行前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/SECURITY.md`
- `docs/HISTORY_GUIDE.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/agent-runtime/agent-backend-design.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`

## 相关代码路径

- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/tools/delete-file/index.ts`
- `packages/agent-core/src/tools/tools/delete-file/definition.ts`
- `packages/agent-core/src/tools/tools/delete-file/executor.ts`
- `packages/agent-core/src/tools/tools/delete-file/permissions.ts`
- `packages/agent-core/src/tools/test/**`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/streaming-preview-extractors.ts`
- `packages/agent-core/src/engine/test/**`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/components/messages/DeleteFileBlock.tsx`
- `packages/desktop/src/renderer/components/messages/**`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`

## 契约草案

工具定义：

- `name`: `delete_file`
- `previewKind`: `delete`
- 参数：
  - `path: string`，必填，绝对路径或相对 workspace root。

执行语义：

- `path` 缺失：返回 `path is required`。
- workspace 外路径：走 `guardWorkspacePath`，返回越界错误。
- 目标不存在：返回 `File not found: <path>`。
- 目标是目录：返回 `delete_file only supports files. Directories are not supported.`。
- 目标是普通文件：删除并返回 `{ type: "delete", filePath, relativePath }`。

权限语义：

- `delete_file` 第一版默认 `ask`，即使目标路径在 workspace 内也必须等待用户确认。
- `path` 缺失或 workspace 外路径在权限阶段直接 `deny`，不弹审批。
- 审批请求使用 `riskLevel: "high"`，摘要使用 `Delete filename`，reason 明确说明这是不可逆删除操作。
- 前端只提供 `Skip` 和 `Delete`；不提供 `allow_similar`，避免把删除动作扩大成批量放行。
- 审批通过后只执行当前这一次工具调用。

shared preview 建议：

```ts
| "delete"

| {
    kind: "delete";
    filePath: string;
    displayText: string;
    approvalRequestId?: string;
  }
```

展示文案：

- running: `Delete filename`
- completed: `Deleted filename`
- approval pending: `Delete file requires approval`
- denied: `Denied delete filename`
- failed: `Delete filename failed` 或沿用工具失败组件统一文案。

前端 UI 设计：

- 普通运行态和完成态保持轻量工具行，不使用图标、不使用卡片，和 Read / Grep / Directory List 同级。
- 审批态使用独立 `DeleteFileBlock`，形态参考 Bash 审批块但更克制：标题、目标文件、reason、底部操作按钮。
- 审批块主按钮使用危险语义 token（如 `bg-danger` / `text-on-danger`），文件名和 reason 使用主题感知 token，不写 raw hex。
- 审批块底部只保留 `Skip` 和 `Delete` 两个动作；提交中按钮 disabled 并显示进行中文案。
- `tool_approval_resolved` 后，同一条工具消息连续切换为 running / denied，不生成割裂的新消息块。
- session 恢复时只恢复最终 `Deleted filename` / `Delete filename failed` / `Denied delete filename` 等事实态；pending 审批由现有 pending approval 运行态恢复机制处理。

## 实施任务

1. shared 契约基座
   - 扩展 `ToolPreviewKind` 和 `ToolUiPreview`。
   - 扩展 `MessageBlock` 的 `delete` 分支，状态覆盖 `pending` / `running` / `completed` / `failed` / `denied`。
   - 扩展 `session-selectors` 对新 preview 的类型守卫和恢复逻辑。
   - 补 shared 测试。

2. agent-core 工具实现
   - 新建 `delete-file/definition.ts`、`delete-file/executor.ts`、`delete-file/permissions.ts`、`delete-file/index.ts`。
   - executor 使用 `guardWorkspacePath`，并用 `lstat` 区分文件/目录。
   - 删除用 `unlink`，只删除普通文件。
   - permission checker 对缺失 path / workspace 外路径直接 deny，对 workspace 内路径默认 ask。
   - 用类似 `createBashTool()` 的工厂注册，确保 `checkPermissions` 真正挂到 ToolManager。
   - 在 `tools/index.ts` 导出并注册工具。

3. preview 与 streaming
   - `engine/streaming-preview-extractors.ts` 注册 `delete` extractor，只提取 path。
   - `engine/bridge.ts#createToolUiPreview` 和 `getToolSummary` 增加 `delete` 分支。
   - 确认 `tool_call_streaming`、`tool_started`、`tool_approval_required`、`tool_approval_resolved`、`tool_finished`、持久化恢复几条路径用同一套 preview。

4. 前端展示与审批 UI
   - 在消息工具行渲染中支持 `delete` preview。
   - 非审批态复用现有轻量工具行样式。
   - 新增 `DeleteFileBlock` 处理 pending approval，复用 Bash 审批块的密度、圆角和布局语法，但文案与按钮收敛到删除语义。
   - `App.tsx` 收到 `tool_approval_required` 时把对应 delete block 标记为 pending，并记录 `approvalRequestId` / reason。
   - `ToolLogLine.tsx` 支持 completed / failed / denied 文案。
   - `ConversationView.tsx` 把 delete 加入工具消息分组与 compact relation。
   - 按 `front-主题与配色规范.md` 使用语义 token，浅/深主题都要验证。
   - 工具失败展示按现有失败组件处理。

5. 测试
   - agent-core：成功删除文件、目标不存在、目标是目录、workspace 外路径、缺失 path、权限 ask / deny / approve / deny decision 路径。
   - engine：streaming preview、approval required/resolved、最终 preview。
   - shared：session 恢复后能展示 `Deleted filename`、失败态和 denied 态。
   - renderer：审批块出现、`Skip`、`Delete`、审批通过后同一块进入 running、完成后显示 `Deleted filename`。

6. 文档与记录
   - 更新 `agent-tool-preview-design-guidelines.md` 的内置工具规范。
   - 更新 `agent-current-module-map.md` 的工具列表。
   - 按 `docs/HISTORY_GUIDE.md` 记录代码变更。

## 验收标准

- `delete_file` 出现在主 Agent 工具列表中。
- 删除 workspace 内存在文件时先出现审批；点击 `Delete` 后删除成功，文件确实不存在。
- 点击 `Skip` 后不删除文件，并展示 denied 状态。
- 删除不存在文件返回可读错误。
- 删除目录被拒绝。
- 删除 workspace 外路径被拒绝。
- 前端运行态展示 `Delete filename`，审批态展示删除确认块，完成态展示 `Deleted filename`，失败态和 denied 态可从 session 恢复。
- `pnpm --filter @actspace/agent-core test` 通过。
- `pnpm typecheck` 通过。
- 因为改到 renderer，按 `docs/FRONTEND_VERIFICATION.md` 做工程验证 + 浏览器 mock 验证；完成阶段尽量用 Electron 真实窗口确认审批交互。

## 风险与缓解

- 风险：删除不可逆，误调用会破坏用户文件。
  - 缓解：第一版只删 workspace 内普通文件，默认 ask 审批，且不提供 `allow_similar`。
- 风险：新增 preview kind 影响前端 exhaustive switch。
  - 缓解：先扩 shared 类型，再补 bridge/selector/renderer 测试。
- 风险：审批 UI 过重会破坏消息流节奏。
  - 缓解：只有 pending approval 使用轻量确认块；running/completed/failed/denied 仍是普通工具行。
- 风险：与 Bash 删除权限策略重复。
  - 缓解：`delete_file` 是模型首选能力，Bash 权限计划仍负责阻止危险 shell 删除。

## 进度记录

- [x] 完成 shared preview 契约。
- [x] 完成 agent-core `delete_file` 工具。
- [x] 完成 bridge / streaming preview。
- [x] 完成前端轻量工具行、删除审批块与恢复。
- [x] 完成测试与验证。
- [x] 更新必要文档和 history。

## 完成记录

- 2026-06-02：已完成 `delete_file` 工具实现与前端审批 UI。工具通过 `createDeleteFileTool()` 工厂注册，`checkPermissions` 默认返回 `ask` 且 `allowSimilar: false`；main 进程审批 registry 也拒绝 delete 的 `allow_similar` 决策。
- 2026-06-02：已补 shared `ToolUiPreview` / `MessageBlock` 的 `delete` 分支、bridge / streaming preview、session 恢复、renderer 普通工具行与 `DeleteFileBlock`。
- 2026-06-02：已运行 `pnpm --filter @actspace/agent-core test -- --run src/tools/test/delete-file.test.ts src/tools/test/scheduler-approval.test.ts src/engine/test/bridge.test.ts src/engine/test/streaming-preview-extractors.test.ts`，实际跑完 agent-core 全部 75 个测试文件，544 个测试通过。
- 2026-06-02：已运行 `pnpm --filter @actspace/desktop test -- --run src/main/test/approval-registry.test.ts src/renderer/test/delete-file-block.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`，实际跑完 desktop 全部 35 个测试文件，257 个测试通过。

## 决策记录

- 2026-06-02：`delete_file` 第一版只删除普通文件，不删除目录、不做批量、不做回收站，避免把高风险文件操作一次做大。
- 2026-06-02：`delete_file` 默认必须用户审批；前端审批态使用独立删除确认块，且只允许一次性 `Delete`，不提供 `allow_similar`。
