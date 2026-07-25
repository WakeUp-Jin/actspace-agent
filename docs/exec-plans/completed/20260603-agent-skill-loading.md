# Agent Skill 加载执行计划

## 目标

让主 Agent 能兼容 actspace 私有 Skill、跨客户端 `.agents/skills` 生态和 `.claude/skills` 生态：每轮 turn 能看到可用 Skill catalog，并能按 catalog 中的绝对 `location` 用既有 `read_file` 工具读取 Skill 正文。

本计划以 `docs/design-docs/tool-system/agent-skill-loading.md` 为设计事实来源，并替代旧计划 `docs/exec-plans/active/20260527-agent-tool-capabilities-breakdown/04-skill-backend-integration.md` 中“只扫描项目 `.agents/skills`”的第一版范围。

> 状态：已完成并归档。实现已落地到 `packages/agent-core/src/skills/` 和 `packages/desktop/src/main/agent-runtime-context.ts`；Skill 正文读取复用 `read_file`，不保留专用读取工具。

## 范围

包含：

- 新增 Skill discovery / parser / catalog renderer 模块。
- 扫描项目级和用户级 Skill 根目录：
  - `<workspaceRoot>/.actspace/skills/`
  - `<workspaceRoot>/.agents/skills/`
  - `<workspaceRoot>/.claude/skills/`
  - `<userData>/skills/`
  - `<userData>/.actspace/skills/`
  - `<home>/.agents/skills/`
  - `<home>/.claude/skills/`
- 只识别一级子目录中的 `SKILL.md`。
- 解析 `name`、`description` 和可选元数据，生成 warning 而不是让普通 turn 失败。
- 同名去重：项目级优先于用户级，同级按 actspace -> agents -> claude 顺序。
- 把 Skill catalog 注入 `SystemPromptContext` 的 `skills` bucket。
- catalog 中暴露 `SKILL.md` 绝对路径，并提示 Agent 任务匹配时用 `read_file` 读取该路径。
- 补 agent-core / desktop main 单测。
- 更新相关设计文档、模块地图和 history。

不包含：

- 不实现 Skill 安装器。
- 不实现 Composer Skill 菜单、设置页或管理 UI。
- 不实现文件监听热更新。
- 不实现 subAgent 隔离执行。
- 不执行 Skill 目录里的脚本。
- 不新增 Skill 专用读取工具。
- 不把 `.agents/skilll/` 误拼路径纳入正式扫描源。
- 不因 `allowed-tools` 自动放宽现有工具权限。

## Required Reading

执行前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/SECURITY.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/tool-system/agent-skill-loading.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/agent-runtime/agent-backend-design.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/foundations/skill-integration.md`

## 相关代码路径

- `packages/agent-core/src/skills/`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/context/types.ts`
- `packages/agent-core/src/context/modules/system-prompt.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/context-describe-service.ts`
- `packages/desktop/src/main/test/agents-md-service.test.ts`
- `packages/desktop/src/main/test/context-describe-service.test.ts`
- `packages/shared/src/context-buckets.ts`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/histories/`

## 契约草案

内部 Skill summary：

```ts
type SkillSummary = {
  name: string;
  description: string;
  location: string;
  directory: string;
  scope: "project" | "user";
  source: "actspace" | "actspace-userData" | "agents" | "claude";
  status: "available" | "warning";
  warning?: string;
};
```

Catalog segment：

```xml
<available_skills>
  <skill>
    <name>llm-agent-dev</name>
    <description>...</description>
    <scope>project</scope>
    <source>agents</source>
    <location>/abs/path/.agents/skills/llm-agent-dev/SKILL.md</location>
  </skill>
</available_skills>
```

Skill 正文读取：

```json
{ "path": "/abs/path/.agents/skills/llm-agent-dev/SKILL.md" }
```

Agent 读取 `SKILL.md` 后，再以该文件所在目录为基准解析正文里的相对路径；需要列资源时复用 `list_directory`，需要搜索材料时复用 `grep` / `glob`。

## 实施任务

1. Skill discovery 和 parser
   - 在 `packages/agent-core/src/skills/` 新增类型、扫描根生成、一级目录发现、frontmatter 解析和去重逻辑。
   - 解析失败、缺字段和读取失败返回 warning summary。
   - 不引入重型 YAML 依赖；优先实现只覆盖本需求的轻量 parser。
   - 验证：新增 agent-core 单测覆盖有效 Skill、无效 frontmatter、同名覆盖、`.claude` 和用户级目录。

2. Catalog 注入
   - 扩展 runtime context，让 `packages/desktop/src/main/agent-runtime-context.ts` 在加载 AGENTS.md 后加载 Skill catalog segment。
   - segment 使用 bucket `skills`，稳定性低于 core system prompt。
   - `context:describe` 走同一 loader，避免检查视图和真实 LLM 输入漂移。
   - 验证：desktop main 单测确认 catalog 进入 `systemPromptSegments`。

3. Skill 正文读取路径
   - 不新增专用工具；复用已有 `read_file`。
   - catalog 中保留绝对 `location`，让 Agent 能直接读取 `SKILL.md`。
   - Skill 资源探索复用 `list_directory`、`grep`、`glob` 等现有读类工具。
   - 验证：agent-core 单测覆盖 catalog 中的绝对路径和 `read_file` 提示文案。

4. 上下文与工具输出边界
   - 确认 `skills` bucket usage 能反映 catalog token。
   - 确认 Skill 正文不预注入系统提示词，避免长 Skill 正文撑爆上下文。
   - 确认正文读取使用现有 `read_file` 工具输出裁剪和预览语义。
   - 验证：context/test 或 engine/test 中加入 skills bucket 断言。

5. 文档同步与收尾
   - 更新 `docs/design-docs/agent-runtime/agent-current-module-map.md`。
   - 如 context state 文档受影响，更新 `docs/design-docs/model-context/agent-token-usage-and-context-state.md`。
   - 按 `docs/HISTORY_GUIDE.md` 记录本次代码变更。
   - 如实现中发现设计变更，回写 `docs/design-docs/tool-system/agent-skill-loading.md` 和本计划决策记录。

## 验证方式

命令：

- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/desktop test`
- `pnpm typecheck`

手工检查：

- 仓库内 `.agents/skills/llm-agent-dev/SKILL.md` 能出现在 Skill catalog。
- 如存在 `~/.agents/skills/*/SKILL.md` 或 `~/.claude/skills/*/SKILL.md`，同名去重符合优先级。
- `context:describe` 的 system prompt entries 能看到 `skills` bucket。
- Agent 可通过 catalog 中的绝对 `location` 使用 `read_file` 读取 `llm-agent-dev` 正文。

观测检查：

- 解析 warning 不阻断普通 turn。
- 未发现 Skill 时不注入空的大段系统提示词。
- 长 Skill 正文不会被预注入系统提示词；按需读取时走 `read_file` 的既有裁剪路径。

## 风险

- 风险：全局 Skill 可能包含不适合当前项目的强指导。
  - 缓解方式：catalog 标记 `scope` 和 `source`，只按需加载正文；后续再做 trust settings 和 source 开关。
- 风险：一次注入过多 Skill metadata 影响上下文前缀缓存。
  - 缓解方式：只注入精简 catalog，稳定排序，限制 description 长度。
- 风险：Skill 正文读取后被历史压缩吞掉。
  - 缓解方式：catalog 持续保留绝对 `location`；压缩摘要如涉及 Skill 内容，应提示可重新用 `read_file` 读取原始 `SKILL.md`。
- 风险：`.agents/skilll` 误拼目录被用户期待。
  - 缓解方式：正式规范只支持 `.agents/skills`；如实现诊断，可输出迁移提示，不把误拼路径长期固化。

## 进度记录

- [x] 设计文档落地到 `docs/design-docs/tool-system/agent-skill-loading.md`。
- [x] 完成 Skill discovery 和 parser。
- [x] 完成 Skill catalog 注入。
- [x] 完成基于 `read_file` 的 Skill 正文读取路径。
- [x] 完成测试和类型检查。
- [x] 完成模块地图、相关文档和 history。

## 决策记录

- 2026-06-03：第一版从“只扫描项目 `.agents/skills` summary”扩展为兼容项目级、用户级、`.agents/skills` 和 `.claude/skills`。
- 2026-06-03：不把 `.agents/skilll` 误拼目录纳入正式规范，避免未来生态路径变得不稳定。
- 2026-06-03：实现时让 desktop runtime context 一次性扫描 Skill registry，并生成 `skills` system segment；正文读取不新增专用工具，直接复用 `read_file` 读取 catalog 中的绝对 `location`。
- 2026-06-03：验证通过 `pnpm --filter @actspace/agent-core test -- src/skills/test/registry.test.ts`、`pnpm --filter @actspace/desktop test -- src/main/test/agents-md-service.test.ts` 和 `pnpm typecheck`。由于当前 vitest 配置会运行包内测试，上述前两个命令实际分别覆盖对应包内测试。
