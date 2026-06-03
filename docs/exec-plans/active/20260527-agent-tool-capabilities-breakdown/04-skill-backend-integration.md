# Skill 后端能力接入计划

> 状态：已被 `docs/exec-plans/completed/20260603-agent-skill-loading.md` 替代。新计划扩大了扫描范围，兼容项目级/用户级 `.actspace/skills`、`.agents/skills` 和 `.claude/skills`；最终实现保留 catalog 注入和绝对路径，Skill 正文读取复用 `read_file`。本文保留作为历史上下文，不再作为当前执行依据。

## 目标

让主 Agent 能发现仓库内可用 Skill，并把 Skill summary 注入上下文，使模型在前端、文档、表格、Agent 开发等任务中知道应该读取或使用对应 Skill。完成后，前端也能读取 Skill 列表或状态，为后续 Composer / Context UI 接入提供契约。

本计划承接 `docs/exec-plans/active/20260527-agent-tool-capabilities.md` 的 Task 6。

## 范围

包含：

- 扫描项目范围内的 `.agents/skills/**/SKILL.md`。
- 读取 `skills-lock.json` 作为补充元数据。
- 解析 Skill frontmatter，形成 `{ name, description, path, source?, status }` summary。
- 将 Skill summary 作为稳定上下文注入主 Agent。
- 让 Context state / snapshot 能体现 Skills 占用或注入状态。
- 暴露 main/preload/shared 契约，供前端读取 Skill 列表或状态。
- 处理 Skill 缺失、路径不可读、frontmatter 解析失败等非致命错误。

不包含：

- 不实现 Composer Skill 菜单视觉。
- 不实现一键安装 Skill。
- 不实现完整 `load_skill` 工具；第一版只注入 summary 和路径。
- 不加载所有 Skill 正文到上下文，避免上下文膨胀。
- 不执行 Skill 内 scripts。
- 不信任/加载 workspace 外全局 Skill；全局 Skill 扫描后续另开计划。

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
- `docs/design-docs/agent-token-usage-and-context-state.md`
- `docs/design-docs/agent-testing.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/foundations/overview.md`
- `.agents/skills/llm-agent-dev/references/foundations/skill-integration.md`

## 相关代码路径

- `skills-lock.json`
- `.agents/skills/**/SKILL.md`
- `packages/agent-core/src/context/types.ts`
- `packages/agent-core/src/context/modules/system-prompt.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/context/token-estimator.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/context-state-preview.test.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/context-buckets.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/**`
- `docs/design-docs/agent-token-usage-and-context-state.md`
- `docs/design-docs/agent-current-module-map.md`

## 设计原则

- 渐进式披露：第一层只注入 Skill 元信息，不注入完整正文。
- 本地可信边界：第一版只读取项目内 `.agents/skills` 和 `skills-lock.json`。
- 失败不阻断普通对话：解析失败 Skill 标为 warning，不让 Agent turn 失败。
- 上下文可见：Skills 应进入 context bucket / state，让用户知道它占了多少上下文。
- 路径有用：summary 中保留 `SKILL.md` 绝对路径，方便模型按需用 `read_file` 读取正文。

## 契约草案

内部 summary：

```ts
type SkillSummary = {
  name: string;
  description: string;
  skillPath: string;
  scope: "project";
  source?: string;
  sourceType?: string;
  status: "available" | "warning";
  warning?: string;
};
```

系统提示词注入格式建议：

```xml
<available_skills>
  <skill>
    <name>llm-agent-dev</name>
    <description>...</description>
    <path>/abs/path/.agents/skills/llm-agent-dev/SKILL.md</path>
  </skill>
</available_skills>
```

shared / IPC 第一版可以只暴露只读列表：

- `skills:list` 或归入 bootstrap state 的 `skills` 字段。
- renderer 只展示状态，不直接读文件系统。

## 实施任务

1. Skill 发现与解析
   - 新增 agent-core skill discovery 模块，扫描 `.agents/skills/*/SKILL.md`。
   - 解析 frontmatter 的 `name` 和 `description`。
   - 读取 `skills-lock.json`，把 `source/sourceType/computedHash` 合入 summary。
   - 对缺少 frontmatter、路径不可读、重复 name 返回 warning。

2. Context 注入
   - 在 `ContextManager` 或 `SystemPromptContext` 注册 `available_skills` 稳定 segment。
   - segment stability 应高于普通 conversation，低于核心系统提示词。
   - 不注入完整 Skill 正文。
   - `getUsageSnapshot()` 的 `skills` bucket 应能反映 summary token。

3. Context state
   - `engine/bridge.ts` 构建 context-state preview 时加入 Skills entry。
   - entry preview 包含 Skill 名称列表和 warning 数量。
   - 如果无可用 Skill，bucket 为 0 或 entry 明确空态，保持与现有 Context 约定一致。

4. IPC / preload 契约
   - 在 shared 中定义前端可读 Skill summary 类型。
   - main 进程暴露只读 Skill 列表。
   - preload 暴露最小 API。
   - 不允许 renderer 直接读取 `.agents/skills`。

5. 测试
   - agent-core：发现有效 Skill、跳过无效目录、frontmatter warning、lock 合并、重复 name 优先级。
   - context：Skill summary 进入 system prompt，usage bucket 计入 skills。
   - desktop/preload：IPC 返回裁剪后的只读 summary，不含 Skill 正文。

6. 文档与记录
   - 更新 `agent-current-module-map.md`。
   - 更新 `agent-token-usage-and-context-state.md` 中 Skills bucket 的数据来源。
   - 如新增 IPC，更新相关 shared/desktop 文档。
   - 按 `docs/HISTORY_GUIDE.md` 记录代码变更。

## 验收标准

- 仓库内 `.agents/skills/llm-agent-dev/SKILL.md`、前端相关 Skill 能被发现并出现在 summary。
- 用户请求前端、文档、表格、Agent 开发等任务时，模型上下文能看到对应 Skill 名称、描述和路径。
- Skill 缺失或路径不可读时有 warning，不阻断普通对话。
- Context state 能展示 Skills 注入状态或至少计入 Skills bucket。
- renderer 可通过 IPC 获得只读 Skill 列表或状态。
- `pnpm --filter @actspace/agent-core test` 通过。
- `pnpm typecheck` 通过。
- 涉及 renderer 时按 `docs/FRONTEND_VERIFICATION.md` 做对应验证。

## 风险与缓解

- 风险：一次性注入完整 Skill 正文导致上下文膨胀。
  - 缓解：第一版只注入 summary 和 path；完整正文由模型按需 `read_file`。
- 风险：项目 Skill 可能包含恶意指导。
  - 缓解：第一版只读当前仓库受控 `.agents/skills`，不扫描全局 Skill；后续再做信任配置。
- 风险：frontmatter YAML 解析过重或引入依赖。
  - 缓解：可先实现轻量 parser，只读取 `---` 中的 `name` / `description` 简单键值。
- 风险：Context bucket 已有 `skills` 但没有数据源，接入时前端空态变化。
  - 缓解：同步更新 context-state 测试和文档，明确 Skills bucket 数据来源。

## 进度记录

- [ ] 完成 Skill 发现和 frontmatter 解析。
- [ ] 合并 `skills-lock.json` 元数据。
- [ ] 完成 Skill summary 上下文注入。
- [ ] 完成 Context state / Skills bucket 接入。
- [ ] 完成 IPC / preload 只读列表。
- [ ] 完成测试、文档和 history。

## 决策记录

- 2026-06-02：Skill 第一版只接入项目级 `.agents/skills` summary，不扫描全局 Skill、不注入完整正文，用渐进式披露控制上下文体积和信任风险。
