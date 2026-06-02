# delete_file 工具新增计划

## 目标

新增 `delete_file` 工具，让 Agent 删除 workspace 内文件时不再使用 `bash rm`。完成后，删除存在文件成功，删除不存在文件返回可读错误，删除 workspace 外路径被拒绝，前端工具行能恢复展示 `Delete filename`。

本计划承接 `docs/exec-plans/active/20260527-agent-tool-capabilities.md` 的 Task 3。

## 范围

包含：

- 新增工具目录 `packages/agent-core/src/tools/tools/delete-file/`。
- 新增 snake_case 工具名 `delete_file`，目录使用 kebab-case。
- 只支持删除 workspace 内普通文件。
- 接入 ToolManager 注册、权限审批、streaming preview、bridge preview、session 恢复。
- 扩展 shared `ToolUiPreview` 契约和必要前端渲染分支。
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
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-backend-design.md`
- `docs/design-docs/agent-testing.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`

## 相关代码路径

- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/tools/delete-file/definition.ts`
- `packages/agent-core/src/tools/tools/delete-file/executor.ts`
- `packages/agent-core/src/tools/test/**`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/streaming-preview-extractors.ts`
- `packages/agent-core/src/engine/test/**`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/messages/**`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`

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

shared preview 建议：

```ts
| "delete"

| {
    kind: "delete";
    filePath: string;
    displayText: string;
  }
```

展示文案：

- running: `Delete filename`
- completed: `Deleted filename`
- failed: `Delete filename failed` 或沿用工具失败组件统一文案。

## 实施任务

1. shared 契约基座
   - 扩展 `ToolPreviewKind` 和 `ToolUiPreview`。
   - 扩展 `session-selectors` 对新 preview 的类型守卫和恢复逻辑。
   - 补 shared 测试。

2. agent-core 工具实现
   - 新建 `delete-file/definition.ts` 和 `delete-file/executor.ts`。
   - executor 使用 `guardWorkspacePath`，并用 `lstat` 区分文件/目录。
   - 删除用 `unlink`，只删除普通文件。
   - 在 `tools/index.ts` 导出并注册工具。
   - 如删除属于高风险写操作，补 `permissions.ts` 或接入现有 `ask` 权限策略。

3. preview 与 streaming
   - `engine/streaming-preview-extractors.ts` 注册 `delete` extractor，只提取 path。
   - `engine/bridge.ts#createToolUiPreview` 和 `getToolSummary` 增加 `delete` 分支。
   - 确认 `tool_started`、`tool_finished`、持久化恢复三条路径用同一套 preview。

4. 前端最小展示
   - 在消息工具行渲染中支持 `delete` preview。
   - 不做新视觉体系，复用现有轻量工具行样式。
   - 工具失败展示按现有失败组件处理。

5. 测试
   - agent-core：成功删除文件、目标不存在、目标是目录、workspace 外路径、权限审批路径。
   - engine：streaming preview 和最终 preview。
   - shared/renderer：session 恢复后能展示 `Delete filename`。

6. 文档与记录
   - 更新 `agent-tool-preview-design-guidelines.md` 的内置工具规范。
   - 更新 `agent-current-module-map.md` 的工具列表。
   - 按 `docs/HISTORY_GUIDE.md` 记录代码变更。

## 验收标准

- `delete_file` 出现在主 Agent 工具列表中。
- 删除 workspace 内存在文件成功，文件确实不存在。
- 删除不存在文件返回可读错误。
- 删除目录被拒绝。
- 删除 workspace 外路径被拒绝。
- 前端工具行展示 `Delete filename`，完成态和失败态可从 session 恢复。
- `pnpm --filter @actspace/agent-core test` 通过。
- `pnpm typecheck` 通过。
- 如果改到 renderer，按 `docs/FRONTEND_VERIFICATION.md` 做对应层级验证。

## 风险与缓解

- 风险：删除不可逆，误调用会破坏用户文件。
  - 缓解：第一版只删 workspace 内普通文件，并接入写类权限审批。
- 风险：新增 preview kind 影响前端 exhaustive switch。
  - 缓解：先扩 shared 类型，再补 bridge/selector/renderer 测试。
- 风险：与 Bash 删除权限策略重复。
  - 缓解：`delete_file` 是模型首选能力，Bash 权限计划仍负责阻止危险 shell 删除。

## 进度记录

- [ ] 完成 shared preview 契约。
- [ ] 完成 agent-core `delete_file` 工具。
- [ ] 完成 bridge / streaming preview。
- [ ] 完成前端最小展示与恢复。
- [ ] 完成测试与验证。
- [ ] 更新必要文档和 history。

## 决策记录

- 2026-06-02：`delete_file` 第一版只删除普通文件，不删除目录、不做批量、不做回收站，避免把高风险文件操作一次做大。

