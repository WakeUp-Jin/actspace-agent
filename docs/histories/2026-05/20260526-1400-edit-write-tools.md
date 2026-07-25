# Edit/Write 工具实现

日期：2026-05-26

## 用户诉求

为 Agent 增加两个真正的文件修改工具：
1. `edit-file`：精确字符串替换，实际写入文件（原先只生成 diff 预览）
2. `write_file`：创建/覆写文件

要求：
- 使用 `diff` 库生成标准 unified diff 供前端展示
- 前端 edit 和 write 共享同一个 diff 卡片组件
- 预留权限审批接口但当前默认 allow

## 主要改动

### 新增文件

- `packages/agent-core/src/tools/tools/shared/write-atomic.ts`：原子写入（tmpfile → fsync → rename + 权限保留 + 自动建目录）
- `packages/agent-core/src/tools/tools/write-file/{definition,executor,permissions}.ts`：Write 工具
- `packages/agent-core/src/tools/tools/edit-file-diff/permissions.ts`：Edit 权限检查（预留 AgentMode）
- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`：统一 diff 卡片组件
- `packages/agent-core/src/tools/test/edit-write.test.ts`：16 个单元测试
- `docs/references/llm-agent-dev-skill-fixes/fix-llm-agent-05-skill-file-tools-fix.md`：Skill 修复计划

### 修改文件

- `packages/agent-core/src/tools/tools/edit-file-diff/{definition,executor}.ts`：从只读 diff 预览改为实际写入 + diff 库生成 unified diff + replace_all + 弯引号规范化
- `packages/agent-core/src/tools/index.ts`：注册 write_file 工具，传入 renderResult
- `packages/agent-core/src/engine/bridge.ts`：增加 `write` previewKind 的 preview 和 summary
- `packages/shared/src/session.ts`：ToolPreviewKind 增加 `write`、ToolUiPreview 增加 write 变体、MessageBlock 增加 `write_diff`
- `packages/shared/src/session-selectors.ts`：write preview 映射 + getDiffSummary 同时匹配 edit_diff/write
- `packages/desktop/src/renderer/components/ConversationView.tsx`：路由 `write_diff` 到 FileDiffBlock
- `packages/agent-core/package.json`：新增 `diff` + `@types/diff` 依赖

### 文档更新

- `docs/design-docs/agent-runtime/agent-current-module-map.md`：记录新工具和 shared helper
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：增加 write_file 展示规范
- `docs/references/llm-agent-dev-skill-fixes/README.md`：索引新增修复文档

## 设计决策

- **diff 库 vs 手动拼接**：使用 `diff` npm 库的 `createTwoFilesPatch` 生成标准 unified diff，包含上下文行和 hunk header，和 git diff 输出格式一致。
- **前端组件共享**：edit 和 write 共享 `FileDiffBlock`，通过 `kind` 区分标题动作词（Edited/Wrote）。deletions 为 0 时不显示红色计数。
- **权限默认 allow**：两个工具的 `checkPermissions` 默认返回 allow。ToolScheduler 已有 `awaiting_approval` 完整流程，未来通过 AgentMode 配置切换即可启用审批。
- **renderResult**：为 edit/write 注册了 renderResult 函数，返回 diff 文本 + 文件路径摘要，同时服务模型消费和 bridge preview 统计。

## 验证

- 28 个测试文件全部通过（207 个测试），包括新增 16 个 edit/write/原子写入测试
- 前端 7 个测试通过
- shared/agent-core/desktop 三个包类型检查通过
