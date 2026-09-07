# ActSpace v2 P08：Scope、Prompt、Skills、Request Assembly 与 Compaction — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-08-prompt-skills-and-compaction.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 20:53
- **结束时间**：2026-08-22 20:59

## 执行时间线

### 步骤 1：实现 Agent Scope 与 layered registry

- **操作**：实现 opaque Scope identity、parent visibility、child shadow、stable enumeration、scope-owned disposer 和 parent dispose 的 child-first cleanup。
- **决定**：Scope 是 Agent 语义作用域，不是权限沙箱；工具与 contributor registry 均是 scope-owned，不使用静态全局 map。
- **验证**：child shadow、parent fallback、重复 registration 和 disposal 通过。

### 步骤 2：实现 Prompt Contributor 与 Request Assembly

- **操作**：实现 contributor metadata、稳定排序、required/optional resolve、JSON-safe frozen candidate、P05 prepare seam 和 logical request snapshot。
- **决定**：候选先固定，再调用 LLM `prepare`；resolved metadata 只允许 route/model/registration/default/retry 等可审计值，credential-like 字段直接拒绝。
- **验证**：乱序 registration 产生相同 snapshot，optional failure 显式 skipped，required failure fail-closed。

### 步骤 3：迁移 Skills 发现与渐进披露

- **操作**：按 `.actspace/skills`、`.agents/skills`、`.claude/skills` 优先级发现 `SKILL.md`，实现 frontmatter 校验、catalog contributor 和 selected body contributor。
- **决定**：catalog 不预注入全文；正文只在 selected skill assembly 时按受限文件路径读取，并携带 source/digest provenance。
- **验证**：root priority、sorted discovery 和 catalog 不泄露绝对路径通过。

### 步骤 4：实现 Compaction transaction

- **操作**：按 token usage/context limit 选择 region，调用可替换 summarizer，复用 P04 的 `started -> summary -> replacement -> ended` append-only transaction。
- **决定**：summary 失败不写 replacement；原 Journal facts 不删除，后续 Surface 只通过 replacement 变化。
- **验证**：transaction 结构、replacement 和 original source retention 通过。

## 遇到的问题

- **问题**：P05 尚未落地，不能让 Prompt 模块依赖 SDK 或 Provider 类型。
  - **应对**：先固定 `PreparedRequestMetadata` 和 `prepare(candidate)` seam；P05 只需适配该 seam，不会反向污染 Request Assembly。
- **问题**：旧 ContextManager 同时管理 conversation、Prompt 与 compression。
  - **应对**：P08 只新增 v2 模块，未修改旧 ContextManager；P10/P12 接入时以 P04 Surface 和 request snapshot 为唯一事实来源。

## 跳过或推迟的事项

- LLM route、Adapter registration 和 wire dispatch 由 P05 提供。
- Agent Loop、Inbox、Todo 和 Host facts 注入由 P10-P14 接入。
- 在线 contributor rebind、Preset standing mount、generic Workflow 和 background Subagent 不属于 P08。
