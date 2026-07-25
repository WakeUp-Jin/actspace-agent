## [2026-06-03 23:58] | Task: Implement Agent Skill Loading

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 实现 Agent Skill 加载能力；后续根据反馈停用专用 `load_skill` 工具，改为 catalog 暴露绝对 `location`，由 Agent 复用 `read_file` 读取 `SKILL.md`。

### 🛠 Changes Overview

**Scope:** packages/agent-core, packages/desktop, docs

**Key Actions:**

- **[Skill Registry]**: 新增 `packages/agent-core/src/skills/`，支持 `.actspace/skills`、`.agents/skills`、`.claude/skills` 的项目级/用户级扫描、frontmatter 解析、同名去重和 catalog 渲染。
- **[Skill Reading]**: 停用专用 `load_skill` 工具；catalog 保留 `SKILL.md` 绝对路径，并提示 Agent 在任务匹配时用已有 `read_file` 读取。
- **[Runtime Context]**: 扩展 desktop 主 Agent runtime context loader，把 AGENTS.md rules 和 Skill catalog segment 注入真实 turn、context describe 与 compact。
- **[Build Hygiene]**: 给 `shared`、`agent-core`、`desktop` 增加正式 build 前的 `clean`，避免删除源码后旧 `dist` 产物继续残留。
- **[Tests]**: 补充 Skill registry catalog 和 desktop runtime context 测试，覆盖绝对 `location` 与 `read_file` 提示。
- **[Docs]**: 更新模块地图、context bucket 文档和 active plan 进度。

### 🧠 Design Intent (Why)

Skill 加载需要让 Agent 知道可用能力，但不能把所有 Skill 正文预注入上下文。最终实现采用“catalog system segment + `read_file` 读取绝对路径”的渐进式披露：catalog 负责发现和触发，正文读取复用已有文件工具，避免新增重复工具能力。

删除专用工具后还需要处理 TypeScript 构建产物边界：`tsc` 不会自动删除旧源码对应的 `dist` 文件，所以正式 build 现在先清输出目录再重建，保证桌面端通过包名消费的产物和源码事实一致。

### 📁 Files Modified

- `packages/agent-core/src/skills/`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/index.ts`
- `packages/shared/package.json`
- `packages/agent-core/package.json`
- `packages/desktop/package.json`
- `package.json`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/test/agents-md-service.test.ts`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/exec-plans/completed/20260603-agent-skill-loading.md`
