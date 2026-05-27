# 2026-05-27 Agent 工具能力补齐计划

## 目标

补齐当前 Agent 工具系统中导致 Bash 过度使用、文件修改语义不完整、上下文过大不可控和 Skill 能力缺席的问题。完成后，Agent 应优先使用专门工具完成文件与上下文任务，Bash 只承担真正需要 shell 的操作。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/agent-core/current-module-map.md`
- `docs/design-docs/agent-core/backend-agent-design.md`
- `docs/design-docs/agent-core/backend-agent-testing.md`
- `docs/design-docs/agent-core/tool-preview-design-guidelines.md`
- `docs/design-docs/agent-core/token-usage-and-context-state.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`
- `.agents/skills/llm-agent-dev/references/context/overview.md`

补充素材：

- `2026-05-27的使用bug小记.md`

## 范围

包含：

- `#2` Bash 工具调用太频繁，需要通过专门工具和 prompt/tool description 降低滥用。
- `#3` `edit_file` 删除行为异常。
- `#4` 新增 `delete_file` 工具。
- `#14` 上下文压缩功能。
- `#15` 工具结果压缩和读取工具输出压缩。
- `#20` Skill 功能接入。

不包含：

- 不修 Bash 审核态 UI、工具失败展示 UI、Markdown 表格或 Usage 页面；这些由 `20260527-bugfix-foundation_代码编完需手动验证.md` 负责。
- 不做 Composer 的 Skill 菜单视觉；前端入口由 `20260527-frontend-interaction-polish/README.md` 负责，本计划只提供后端能力和契约。
- 不实现右侧 Context 可编辑面板；只提供后端 context state / compression 所需数据与操作边界。
- 不改变密钥读取规则，不读取 `.env` 内容。

## 相关代码路径

- `packages/agent-core/src/tools/**`
- `packages/agent-core/src/engine/**`
- `packages/agent-core/src/context/**`
- `packages/agent-core/src/prompt/**`
- `packages/agent-core/src/persistence/**`
- `packages/agent-core/src/messages.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `skills-lock.json`
- `.agents/skills/**`
- `docs/design-docs/agent-core/tool-preview-design-guidelines.md`
- `docs/design-docs/agent-core/token-usage-and-context-state.md`

## 并行边界

- 本计划 owns 工具定义、工具调度、工具输出裁剪、上下文压缩和 Skill 后端发现/注入。
- 如需新增前端 preview 字段，只能扩展 `ToolUiPreview`，并同步更新 `tool-preview-design-guidelines.md`。
- 不改 Usage 页面 UI；如果上下文压缩产生 usage 或 context snapshot，只写共享事件，由 Usage 会话消费。
- 不改 Composer 视觉；只为前端计划提供 IPC 或 shared 类型。

## 实施任务

### Task 1: 降低 Bash 滥用

修改目标：

- 梳理当前工具清单和 prompt 中对 Bash 的描述。
- 明确 Bash 只用于真实 shell 任务：运行命令、构建、测试、系统工具。
- 文件查看、创建、编辑、删除、搜索、目录读取必须优先走专门工具。

验收：

- 让 Agent 执行“创建文件、读取文件、删除文件、列目录、搜索文本”时，不应优先生成 Bash。
- 工具选择策略有测试或 fixture 覆盖。
- 文档写清 Bash 与文件工具边界。

### Task 2: 修复 `edit_file` 删除语义

修改目标：

- 覆盖删除单行、多行、空替换、末尾换行、多处匹配和 old_string 不存在等情况。
- 错误信息必须可帮助模型下一步修正，而不是模糊失败。

验收：

- `new_string: ""` 可以删除唯一匹配内容。
- 多处匹配时返回明确错误，不静默改错位置。
- 删除后 diff 统计和 UI preview 正确显示 deletions。

### Task 3: 新增 `delete_file` 工具

修改目标：

- 新增 snake_case 工具名 `delete_file`，目录使用 kebab-case。
- 支持安全边界：只能删除 workspace 内文件，目录删除不在第一版范围。
- 接入权限审批、preview、持久化事件和恢复展示。

验收：

- 删除存在文件成功，删除不存在文件返回可读错误。
- 不能删除 workspace 外路径。
- 前端工具行展示 `Delete filename`，完成态和失败态可恢复。

### Task 4: 上下文压缩策略

修改目标：

- 基于 `token-usage-and-context-state.md` 设计压缩触发阈值。
- 压缩 conversation/history 时保留关键用户意图、已修改文件、未完成决策和失败原因。
- 压缩结果进入 context state，不污染原始 session.jsonl。

验收：

- 构造长会话 fixture，超过阈值后触发压缩。
- 压缩后下一轮仍能知道当前任务、文件和关键约束。
- 压缩事件或日志可追踪，便于排障。

### Task 5: 工具结果和读取工具输出压缩

修改目标：

- 对 `read_file`、`grep`、`glob`、`list_directory`、`bash` 等工具输出进行模型输入侧裁剪。
- 前端展示用 preview 不受裁剪影响，原始可排障信息按现有日志策略保留。

验收：

- 大文件读取不会把完整内容塞进模型上下文。
- 大 grep / bash 输出有明确截断说明和下一步建议。
- 工具输出压缩不会破坏 session 事件恢复。

### Task 6: Skill 后端能力接入

修改目标：

- 读取仓库内 skill 索引或 lock 文件，形成可注入给 Agent 的 Skill summary。
- 支持按用户意图触发相关 Skill 的说明注入。
- 暴露前端可读的 Skill 列表或状态，供 Composer / Context UI 后续使用。

验收：

- 用户请求前端、文档、表格、Agent 开发等任务时，Agent 能看到对应 Skill 指南。
- Skill 缺失或路径不可读时有明确错误，不阻断普通对话。
- Context state 可展示 Skills 占用或注入状态。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @actspace/agent-core test`
- 覆盖 edit/delete/context compression 的单元测试或 fixture。
- 涉及 IPC 时按 `docs/FRONTEND_VERIFICATION.md` 做 Electron 验证。

## 进度记录

- [ ] 确认当前工具注册、prompt 和 preview 契约。
- [ ] 完成 Bash 使用边界收敛。
- [ ] 完成 `edit_file` 删除语义修复。
- [ ] 完成 `delete_file` 工具。
- [ ] 完成上下文压缩第一版。
- [ ] 完成工具结果和读取输出压缩。
- [ ] 完成 Skill 后端能力接入。
- [ ] 跑完验证，更新必要文档和 history。

## 决策记录

- 2026-05-27：本计划负责 Agent 能力层，不负责具体前端样式；新增工具必须遵守 `tool-preview-design-guidelines.md` 的命名与 preview 契约。
