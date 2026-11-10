## [2026-11-10 03:10] | Task: 技术债表补齐超标文件，立 App 装配层拆分计划

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> （前端评估后续）我又合并了一批代码，你 pull 一下看看，然后上面的回复是不是有需要修改的地方……继续执行。

### 🛠 Changes Overview

**Scope:** `docs/exec-plans/`

**Key Actions:**

- **技术债表补齐**：`tech-debt-tracker.md`「Desktop 前端组件遗留」加一行，登记 2026-11-10 复查 `main` 时超过 500 行却未登记的 5 个文件：`App.tsx` 1670、`trajectory/builder.ts` 791、`stats/stats-ui.tsx` 617、`harness-stats/HarnessStatsCards.tsx` 523、`components/Composer.tsx` 507，并给每个写了拆法；原行里 `WorkspaceChromeControls.tsx` 行数按现状校正为 663。
- **立计划**：新增 `active/20261110-app-assembly-split.md`，把 `App.tsx` 按 8 个职责（会话列表、当前会话读取、工作区与模型、任务队列与审批、发送 / 中止 / 流事件、evict、会话动作、侧边对话）拆成 `use-*` hook，App 只留装配。7 个里程碑各一个 PR，按耦合从低到高排；16 个 `test/app-*.test.tsx` 作为特征测试一行不改。`exec-plans/README.md` 进行中表加入该计划。
- **顺手**：上一轮评估的建议 2「`useExhaustiveDependencies` 收口」已在 #67 完成、`noNonNullAssertion` 已在 #74 收口，评估回复据此修正，不再列为待办。

### 🧠 Design Intent (Why)

- 清单写明"超 500 行就要拆、超标文件见技术债"，但技术债表只有 2 个，评审项没有兜底就等于没有规则；先把 5 个补齐，让"文档说 A、代码是 B、都不报错"的缺口闭合。
- `App.tsx` 拆分跨多个 PR、涉及发送与审批时序，按 `PLANS_GUIDE` 必须落 execution plan。选"拆 hook 不拆组件"：App 的问题是状态与副作用堆在一起，不是 JSX 多；hook 放职责所属目录（`session/`、`target/`、`side-chat/`），沿用 `target/use-run-target.ts` 的既有模式；共享 ref 通过参数传入，避免复制 `messageRequestRef` 改变"丢弃过期响应"的语义。
- 前置条件现在才成立：hook 依赖规则已是 error，拆出去的 hook 依赖必须写全，不会把陈旧闭包一起搬走。

### 📁 Files Modified

- `docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-plans/active/20261110-app-assembly-split.md`
- `docs/exec-plans/README.md`
