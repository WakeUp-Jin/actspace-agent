# Bash 工具选择边界收敛计划

## 目标

降低主 Agent 对 `bash` 的过度使用。完成后，Agent 面对文件读取、目录浏览、文本搜索、文件创建、文件编辑和文件删除任务时，应优先选择专门工具；`bash` 只用于真正需要 shell 的开发验证、Git、构建、测试和系统命令。

本计划承接 `docs/exec-plans/active/20260527-agent-tool-capabilities.md` 的 Task 1。

## 范围

包含：

- 梳理当前工具定义和主 Agent 系统提示词中关于工具选择的说明。
- 明确 `bash` 与文件工具、搜索工具、目录工具的边界。
- 补充测试或 fixture，锁定“常见文件任务不优先 bash”的行为。
- 同步必要的设计文档和 history。

不包含：

- 不修改 `bash` 权限审批 UI。
- 不调整 bash 命令 allowlist / denylist；相关工作由 `docs/exec-plans/active/Bash工具和工具权限调度开发计划/` 承接。
- 不实现 `delete_file`；该能力由 `03-delete-file-tool.md` 承接。
- 不修改工具输出压缩；该能力已由 `docs/design-docs/agent-context-compression.md` 描述并落地。

## Required Reading

执行前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-backend-design.md`
- `docs/design-docs/agent-testing.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`

## 相关代码路径

- `packages/agent-core/src/prompt/main-agent.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/tools/bash/definition.ts`
- `packages/agent-core/src/tools/tools/{read-file,grep,glob,list-directory,edit-file-diff,write-file}/definition.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/test/**`
- `packages/agent-core/src/tools/test/**`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`

## 约束

- 工具选择规则应进入稳定、可版本化的仓库文件，不依赖聊天上下文。
- 不要把工具边界写成过长 prompt；优先短规则 + 精确 tool description。
- 不能让 `bash` 消失：构建、测试、Git 状态、命令行诊断仍需要它。
- 如果新增系统提示词内容，应尽量保持稳定，避免破坏 DeepSeek prefix cache。

## 实施任务

1. 当前事实核对
   - 确认 `createToolManager()` 注册的工具顺序和可见工具列表。
   - 确认 `bashDefinition.description` 已声明哪些禁用场景。
   - 确认 `MAIN_AGENT_SYSTEM_PROMPT` 是否仍为空，以及运行时是否有 Settings 注入覆盖。

2. 设计工具选择规则
   - 写清 `read_file` / `list_directory` / `grep` / `glob` / `write_file` / `edit_file` / `delete_file` / `bash` 的边界。
   - 删除类任务在 `delete_file` 未落地前，不应鼓励用 `bash rm`；应明确等待或说明工具缺失。
   - 规则语言面向模型，必须短、直接、可执行。

3. 落地提示词或描述调整
   - 优先在 `packages/agent-core/src/prompt/main-agent.ts` 添加稳定工具选择规则。
   - 如发现单个工具 description 模糊，再局部调整对应 definition。
   - 避免改动无关提示词、provider、工具执行逻辑。

4. 补测试或 fixture
   - 使用 mock LLM / tool definition fixture 覆盖工具边界。
   - 至少覆盖：读取文件、列目录、搜索文本、查找文件、创建文件、编辑文件。
   - 如果 `delete_file` 尚未完成，删除文件场景只记录为待补，不在本 plan 强行通过。

5. 文档与记录
   - 更新 `agent-current-module-map.md` 或 `agent-tool-preview-design-guidelines.md` 中必要的工具边界说明。
   - 按 `docs/HISTORY_GUIDE.md` 记录本次代码变更。

## 验收标准

- `bash` description 和主 Agent 稳定规则都明确：文件读/列/搜/写/编辑不用 bash。
- 常见文件任务的测试或 fixture 不再预期 `bash` 作为首选工具。
- `pnpm --filter @actspace/agent-core test` 通过。
- `pnpm typecheck` 通过。

## 风险与缓解

- 风险：只改 prompt，真实模型仍偶尔选择 bash。
  - 缓解：同时收紧 tool description，并用可复现实例测试工具列表/规则可见性。
- 风险：规则太长，增加上下文噪音。
  - 缓解：只写边界，不写操作教程；复杂行为放工具 description。
- 风险：删除文件任务在 `delete_file` 未实现前仍会诱导 bash。
  - 缓解：本计划标注依赖 `03-delete-file-tool.md`，待工具落地后补删除场景测试。

## 进度记录

- [ ] 确认当前工具注册、工具描述和系统提示词事实。
- [ ] 设计并落地稳定工具选择规则。
- [ ] 补齐工具选择测试或 fixture。
- [ ] 运行验证命令。
- [ ] 更新必要文档和 history。

## 决策记录

- 2026-06-02：本计划只收敛工具选择边界，不改 bash 执行权限与审批 UI，避免和 Bash 权限调度计划互相踩文件。

