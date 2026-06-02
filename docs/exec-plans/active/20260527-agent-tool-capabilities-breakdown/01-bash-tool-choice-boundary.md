# 主系统提示词文件与 Bash 工具选择边界计划

## 目标

把主 Agent 系统提示词收敛为一个用户可见、可编辑、可覆盖的文件，并在这份文件里写入首版工具选择边界，降低主 Agent 对 `bash` 的过度使用。完成后，设置页显示并保存的就是实际用于主 Agent 的系统提示词文件；Agent 面对文件读取、目录浏览、文本搜索、文件创建、文件编辑和文件删除任务时，应优先选择专门工具；`bash` 只用于真正需要 shell 的开发验证、Git、构建、测试和系统命令。

本计划承接 `docs/exec-plans/active/20260527-agent-tool-capabilities.md` 的 Task 1。

## 范围

包含：

- 将主 Agent 系统提示词正文从 `settings.json` 的大字符串迁移为 `<userData>/prompts/main-agent.md` 文件。
- `settings.json` 只保存主系统提示词文件路径，例如 `agent.systemPromptPath`。
- 设置页读取并显示该文件内容；用户保存时直接覆盖写入该文件。
- 首次启动或文件缺失时，用 actspace 默认主系统提示词模板创建该文件。
- 在默认主系统提示词文件中写入工具选择边界，特别是降低 `bash` 滥用的规则。
- 加载 `AGENTS.md` 规则文件，第一版至少覆盖运行时级别和工作区级别。
- 梳理当前工具定义中关于工具选择的说明。
- 明确 `bash` 与文件工具、搜索工具、目录工具的边界。
- 补充测试或 fixture，锁定“常见文件任务不优先 bash”的行为。
- 同步必要的设计文档和 history。

不包含：

- 不修改 `bash` 权限审批 UI。
- 不调整 bash 命令 allowlist / denylist；相关工作由 `docs/exec-plans/active/Bash工具和工具权限调度开发计划/` 承接。
- 不实现 `delete_file`；该能力由 `03-delete-file-tool.md` 承接。
- 不修改工具输出压缩；该能力已由 `docs/design-docs/agent-context-compression.md` 描述并落地。
- 不做多 prompt mode（`append` / `override` / `default`）设计；第一版只有一个主系统提示词文件，用户想改就直接改这个文件。
- 不做 instruction glob 列表；额外 instruction 文件后续再加。
- 不做嵌套目录级 `AGENTS.md` 动态加载；第一版只做固定层级。

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
- `docs/design-docs/agent-token-usage-and-context-state.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`

## 相关代码路径

- `packages/agent-core/src/prompt/main-agent.ts`
- `packages/agent-core/src/context/modules/system-prompt.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/tools/bash/definition.ts`
- `packages/agent-core/src/tools/tools/{read-file,grep,glob,list-directory,edit-file-diff,write-file}/definition.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/test/**`
- `packages/agent-core/src/tools/test/**`
- `packages/shared/src/settings.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/context-describe-service.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-token-usage-and-context-state.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`

## 约束

- 设置页看到的系统提示词内容必须和主 Agent 实际使用的系统提示词文件一致。
- 主系统提示词只有一个文件，不做隐性追加，不做隐藏 core prompt。
- 用户保存设置页时直接覆盖写入主系统提示词文件；用户可以决定保留默认规则还是全部重写。
- `settings.json` 只保存路径和轻量配置，不再长期保存大段系统提示词正文。
- 工具选择规则应进入默认主系统提示词模板，但运行时事实来源是 `<userData>/prompts/main-agent.md`。
- 不要把工具边界写成过长 prompt；优先短规则 + 精确 tool description。
- 不能让 `bash` 消失：构建、测试、Git 状态、命令行诊断仍需要它。
- `AGENTS.md` 内容属于规则上下文，应可见、可统计，并避免悄悄覆盖主系统提示词文件。

## Prompt 来源设计

第一版只保留一个主系统提示词文件：

```txt
<userData>/prompts/main-agent.md
```

`settings.json` 中保存：

```ts
agent: {
  systemPromptPath: string;
  disabledTools: string[];
  bashAlwaysAsk: boolean;
  temperature: number | null;
  maxTokens: number | null;
}
```

启动或读取设置时：

- 如果 `systemPromptPath` 缺失，写入默认路径 `<userData>/prompts/main-agent.md`。
- 如果文件不存在，用默认主系统提示词模板创建文件。
- 如果旧版 `agent.systemPrompt` 非空且新文件不存在，将旧内容迁移写入该文件。
- 如果旧版 `agent.systemPrompt` 为空且新文件不存在，写入包含工具边界规则的默认模板。

设置页：

- textarea 显示 `systemPromptPath` 指向文件的正文。
- 点击保存时通过 main/preload 覆盖写入该文件。
- 可以显示路径，方便用户知道内容落在哪里。
- 可选后续按钮：“恢复默认提示词”，本计划不强制第一版实现。

主 Agent turn：

- `runAndPersistTurn()` 读取 `systemPromptPath` 文件正文作为 `buildAgentConfig(runtimeContext.systemPrompt)`。
- Context 右侧视图和 `context-state.json` 中的 systemPrompt entry 展示同一份正文。

## `AGENTS.md` 加载设计

第一版加载固定层级：

```txt
<userData>/AGENTS.md
<workspaceRoot>/AGENTS.md
```

说明：

- `<userData>/AGENTS.md` 作为 actspace 运行时级别规则，适合用户全局偏好。
- `<workspaceRoot>/AGENTS.md` 作为当前工作区级规则，适合项目协作约束。
- 文件不存在时静默跳过。
- 文件读取失败时记录 warning，不阻断普通 turn。
- 两份 `AGENTS.md` 不写回主系统提示词文件，而是在 ContextManager 中作为规则上下文注入。
- 后续如果需要嵌套目录级 `AGENTS.md`，另开计划按当前文件路径动态加载。

建议注入顺序：

```txt
[main-agent.md]
[userData AGENTS.md]
[workspaceRoot AGENTS.md]
[tools / skills / conversation 等动态上下文]
```

`AGENTS.md` 内容建议计入 `rules` bucket，而不是 `systemPrompt` bucket，方便 Context 视图解释来源。

## 实施任务

1. 当前事实核对
   - 确认 `createToolManager()` 注册的工具顺序和可见工具列表。
   - 确认 `bashDefinition.description` 已声明哪些禁用场景。
   - 确认当前 `settings.agent.systemPrompt`、设置页 textarea、`runAndPersistTurn()` 的真实链路。
   - 确认 Context 右侧视图如何重建 system prompt entry。

2. 设计并落地主系统提示词文件
   - 在 shared settings 契约中新增 `agent.systemPromptPath`。
   - 在 SettingsService 中为旧 `agent.systemPrompt` 做兼容迁移。
   - 新增 main 侧读写主系统提示词文件的服务函数或 IPC handler。
   - 设置页读取文件正文并保存覆盖文件。
   - Agent turn 和 Context describe 都从文件读取系统提示词正文。

3. 设计默认系统提示词模板
   - 写清 `read_file` / `list_directory` / `grep` / `glob` / `write_file` / `edit_file` / `delete_file` / `bash` 的边界。
   - 删除类任务在 `delete_file` 未落地前，不应鼓励用 `bash rm`；应明确等待或说明工具缺失。
   - 规则语言面向模型，必须短、直接、可执行。
   - 默认模板只用于创建 `<userData>/prompts/main-agent.md`，之后用户文件是事实来源。

4. 加载 `AGENTS.md`
   - 支持 `<userData>/AGENTS.md` 和 `<workspaceRoot>/AGENTS.md`。
   - 在 ContextManager/SystemPromptContext 中作为 rules segment 注入。
   - Context usage / state 中让 rules bucket 能反映 `AGENTS.md` 内容。
   - 文件不存在时跳过，读取失败时给 warning 或日志，不阻断 turn。

5. 落地工具描述调整
   - 如发现单个工具 description 模糊，再局部调整对应 definition。
   - 避免改动无关提示词、provider、工具执行逻辑。

6. 补测试或 fixture
   - SettingsService：首次创建默认 prompt 文件、旧 `systemPrompt` 迁移、保存覆盖文件。
   - Main/preload/renderer：设置页显示文件内容，保存时写文件。
   - Context：`main-agent.md`、`userData/AGENTS.md`、`workspaceRoot/AGENTS.md` 都进入最终上下文。
   - 使用 mock LLM / tool definition fixture 覆盖工具边界。
   - 至少覆盖：读取文件、列目录、搜索文本、查找文件、创建文件、编辑文件。
   - 如果 `delete_file` 尚未完成，删除文件场景只记录为待补，不在本 plan 强行通过。

7. 文档与记录
   - 更新 `agent-current-module-map.md`、`agent-token-usage-and-context-state.md` 或 `agent-tool-preview-design-guidelines.md` 中必要的 prompt / rules / 工具边界说明。
   - 按 `docs/HISTORY_GUIDE.md` 记录本次代码变更。

## 验收标准

- 设置页显示的是 `<userData>/prompts/main-agent.md` 文件内容。
- 点击保存后，该文件内容被覆盖写入，下一轮主 Agent turn 使用新内容。
- 首次启动或文件缺失时自动创建默认主系统提示词文件。
- 旧版 `settings.agent.systemPrompt` 非空时能迁移到主系统提示词文件。
- `bash` description 和默认主系统提示词模板都明确：文件读/列/搜/写/编辑不用 bash。
- `<userData>/AGENTS.md` 和 `<workspaceRoot>/AGENTS.md` 存在时会进入上下文，缺失时不报错。
- Context state 能展示主系统提示词正文，并能在 rules bucket 中体现 `AGENTS.md` 内容。
- 常见文件任务的测试或 fixture 不再预期 `bash` 作为首选工具。
- `pnpm --filter @actspace/desktop test -- src/main/test/settings-service.test.ts` 通过。
- `pnpm --filter @actspace/desktop test -- src/renderer/test/settings-page.test.tsx` 通过。
- `pnpm --filter @actspace/agent-core test` 通过。
- `pnpm typecheck` 通过。

## 风险与缓解

- 风险：只改 prompt，真实模型仍偶尔选择 bash。
  - 缓解：同时收紧 tool description，并用可复现实例测试工具列表/规则可见性。
- 风险：用户覆盖主系统提示词文件后删掉工具边界，bash 滥用可能回归。
  - 缓解：这是当前设计明确接受的用户控制权；可提供“恢复默认提示词”作为后续增强。
- 风险：规则太长，增加上下文噪音。
  - 缓解：只写边界，不写操作教程；复杂行为放工具 description。
- 风险：`AGENTS.md` 内容过长或包含冲突规则。
  - 缓解：第一版先加载固定层级并在 Context 中可见；后续再做长度提示、冲突解释或开关。
- 风险：settings 迁移破坏用户已有提示词。
  - 缓解：非空旧字段只迁移到文件，不丢弃；保留旧字段兼容一个版本。
- 风险：删除文件任务在 `delete_file` 未实现前仍会诱导 bash。
  - 缓解：本计划标注依赖 `03-delete-file-tool.md`，待工具落地后补删除场景测试。

## 进度记录

- [ ] 确认当前工具注册、工具描述和系统提示词事实。
- [ ] 完成 `systemPromptPath` 设置契约和旧字段迁移。
- [ ] 完成 `<userData>/prompts/main-agent.md` 创建、读取和保存。
- [ ] 设置页改为直接显示和保存主系统提示词文件。
- [ ] Agent turn / Context describe 改为读取主系统提示词文件。
- [x] 完成 `<userData>/AGENTS.md` 和 `<workspaceRoot>/AGENTS.md` 加载。
- [ ] 设计并落地默认工具选择规则模板。
- [ ] 补齐工具选择测试或 fixture。
- [ ] 运行验证命令。
- [ ] 更新必要文档和 history。

## 决策记录

- 2026-06-02：本计划只收敛工具选择边界，不改 bash 执行权限与审批 UI，避免和 Bash 权限调度计划互相踩文件。
- 2026-06-02：主 Agent 系统提示词第一版只保留一个用户可编辑文件 `<userData>/prompts/main-agent.md`；settings 只保存路径，设置页直接读写该文件，不做 `append` / `override` 多模式。
- 2026-06-02：第一版加载固定两级 `AGENTS.md`：`<userData>/AGENTS.md` 和 `<workspaceRoot>/AGENTS.md`；嵌套目录规则后续再做。
- 2026-06-02：`AGENTS.md` 读取已抽到 main 侧 `agents-md-service.ts` 并补单测；真实 turn 与 `context:describe` 共用 `loadMainAgentRuntimeContext()`，Context 明细会同时展示默认主系统提示词与 rules bucket。
