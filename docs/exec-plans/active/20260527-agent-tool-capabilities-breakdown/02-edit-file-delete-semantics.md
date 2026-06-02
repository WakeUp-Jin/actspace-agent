# edit_file 删除语义补强计划

## 目标

补齐 `edit_file` 在删除文本时的行为定义和测试覆盖。完成后，`new_string: ""` 能可靠删除唯一匹配内容，多处匹配会返回明确错误，删除后的 diff 统计和前端 preview 能正确展示 deletions。

本计划承接 `docs/exec-plans/active/20260527-agent-tool-capabilities.md` 的 Task 2。

## 范围

包含：

- 为 `edit_file` 删除行为补充单元测试。
- 修正测试暴露出的删除边界问题。
- 保证错误信息能帮助模型下一步修正。
- 同步必要文档和 history。

不包含：

- 不新增 `delete_file` 工具；该能力由 `03-delete-file-tool.md` 承接。
- 不重写整个 edit/write 工具体系。
- 不调整前端 diff 组件视觉。
- 不改变 workspace 写入边界。

## Required Reading

执行前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/HISTORY_GUIDE.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/agent-testing.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`

## 相关代码路径

- `packages/agent-core/src/tools/tools/edit-file-diff/definition.ts`
- `packages/agent-core/src/tools/tools/edit-file-diff/executor.ts`
- `packages/agent-core/src/tools/tools/shared/write-atomic.ts`
- `packages/agent-core/src/tools/test/edit-write.test.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/renderer/components/messages/**`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`

## 已知现状

- 当前 executor 已支持 `new_string === ""` 的删除分支。
- 当前测试已覆盖：唯一替换、多处匹配错误、`replace_all`、`old_string` 不存在、新建文件、workspace 越界。
- 当前测试未覆盖计划要求的删除单行、多行、末尾换行、空替换、多处匹配删除等边界。

## 实施任务

1. 先补失败用例
   - 删除唯一单行，确认不会留下多余空行。
   - 删除唯一多行块，确认上下文行保留。
   - 删除文件末尾内容，确认末尾换行行为符合预期。
   - `new_string: ""` + 多处匹配 + `replace_all` 缺省，返回明确错误且不写文件。
   - `old_string` 不存在，错误提示要求模型先 read_file 验证当前内容。

2. 修正 executor
   - 只针对失败用例做最小修改。
   - 保持 `guardWorkspacePath` 和 `writeTextAtomic` 现有边界。
   - 删除行为必须在生成 diff 后原子写入。

3. 核对 preview 与 diff 统计
   - 确认 `renderEditResult()` 输出包含完整 unified diff。
   - 确认 `engine/bridge.ts#createToolUiPreview("edit_diff")` 能从 diff 中算出 deletions。
   - 如现有 `countDiffLines` 对删除场景误计，补对应测试后修正。

4. 文档与记录
   - 如删除语义有明确约定变化，同步 `agent-tool-preview-design-guidelines.md`。
   - 按 `docs/HISTORY_GUIDE.md` 记录代码变更。

## 验收标准

- `new_string: ""` 可以删除唯一匹配内容。
- 多处匹配时返回明确错误，不静默删除第一处。
- 删除后磁盘文件内容、unified diff、additions/deletions 统计都符合测试预期。
- `pnpm --filter @actspace/agent-core test -- src/tools/test/edit-write.test.ts` 通过。
- `pnpm --filter @actspace/agent-core test` 通过。
- `pnpm typecheck` 通过。

## 风险与缓解

- 风险：删除分支自动吞掉 trailing newline，导致用户想保留空行时行为反直觉。
  - 缓解：用测试明确当前策略；如果需要更细控制，另开计划，不在本 plan 扩参数。
- 风险：diff 统计把 patch header 的 `---` / `+++` 算进去。
  - 缓解：补删除场景 preview 测试，确保统计来自真实 diff 行。
- 风险：为了修删除语义顺手重构 write/edit 共用代码。
  - 缓解：本计划只允许最小修复，抽象留到重复真实出现后再做。

## 进度记录

- [ ] 补齐删除语义测试。
- [ ] 修正测试暴露的 executor 问题。
- [ ] 核对 preview / diff 统计。
- [ ] 运行验证命令。
- [ ] 更新必要文档和 history。

## 决策记录

- 2026-06-02：先以测试锁定 `edit_file` 删除语义，再做最小实现修复；不把“删除整个文件”混进 `edit_file`，该能力单独交给 `delete_file`。

