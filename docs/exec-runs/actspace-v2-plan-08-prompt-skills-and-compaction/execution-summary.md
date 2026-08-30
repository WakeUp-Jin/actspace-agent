# ActSpace v2 P08：Scope、Prompt、Skills、Request Assembly 与 Compaction — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-08-prompt-skills-and-compaction.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-08-prompt-skills-and-compaction/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Agent Scope | `packages/agent-runtime/src/scope/` | parent chain、shadow、stable registry、child-first disposal |
| Prompt Assembly | `packages/agent-runtime/src/prompt/` | contributor contract、deterministic ordering、prepare seam、frozen snapshot |
| Skills | `packages/agent-runtime/src/skills/` | priority discovery、frontmatter、catalog/body split、provenance |
| Compaction | `packages/agent-runtime/src/compaction/` | token policy、region selection、append-only summary transaction |

## Agent 已完成的验证

- P08 定向测试：4 files、5/5。
- 全部 `agent-runtime` tests：11 files、54/54。
- TypeScript 5.9.3 strict NodeNext typecheck：通过。
- P08 没有引入旧 `ContextManager`、Electron、Renderer、Cordis 或 Provider SDK 依赖。

## 已知风险和遗留事项

- Skill discovery 当前只解析常用简单 frontmatter；复杂 YAML 语法需要在 P09/P12 接入时通过 catalog fixture 扩展，但不能放宽 workspace boundary。
- Compaction summarizer 当前提供 deterministic fallback；P05 接入真实 LLM summarizer 后必须保持失败不删除历史的 transaction 语义。
- Request snapshot 的 P04 event payload 具体字段由 P10 与 P05 联合接入，不能另建 mutable context cache。

## 后续建议

- P05 直接实现 `prepare(candidate)` 的 Adapter-bound one-shot 调用，并把 resolved metadata 写入 P04 `request/snapshot`。
- P10 以 `AgentScope + RequestAssembler + ToolRegistry + SessionHandle` 组装 main Loop。
