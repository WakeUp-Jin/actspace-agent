## [2026-11-14 04:35] | Task: 子智能体与后台任务的规范合并成三份现状文档

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 设计规范可以考虑合并重复的、精简表达。先做 A（清掉执行归档），再做 B 里的子智能体与后台任务这一组；做完之后再讨论其余的设计规范。

### 🛠 Changes Overview

**Scope:** `docs/design-docs/`、`packages/subagent/` 与 `packages/background-tasks/` 的 README、代码注释、`scripts/check-current-docs.mjs`

**Key Actions:**

- **合并**：这一组原来 13 份文档、7.2 万字符，现在 6 份、3.0 万字符。规则只写在三份现状文档里：[子智能体运行规范](../../design-docs/collaboration/agent-subagent-runtime.md)（运行时）、[后台任务](../../design-docs/collaboration/agent-background-tasks.md)（登记表、`task_*`、通知）、[front-子Agent与后台任务规范](../../design-docs/frontend/front-子Agent与后台任务规范.md)（界面）。
- **删除**：`docs/design-docs/子智能体和后台任务设计规范/`（6 份）和 `agent-plugin-runtime/agent-spec-agent-and-subagent.md`。两者里现在还成立、别处没有的内容先并进运行规范：工具表、状态与事件字段、能力与权限、模型选择、Fork 的边界与缓存、外部子智能体的协议表、生命周期、排除的方案。
- **不抄代码里的文字**：工具描述、参数说明、返回与错误文字只在 `packages/subagent/subagent/src/messages.ts`，通知版式只在 `packages/background-tasks/background-tasks/src/notification.ts`，规范里不再有副本。
- **包 README**：`packages/subagent/README.md`、`packages/subagent/subagent/README.md`、`packages/background-tasks/README.md` 只留包表、包之间怎么连、入口与测试、怎么扩展，规则改成链接。
- **代码注释**：31 个代码文件里的「设计 02 / 04 / 05 §N」改指现状规范的章节，只动注释。
- **顺带修正**：核对引用时发现 8 份其他规范里的子智能体描述和代码对不上，各改一两句：`agent-forms-and-modes.md` 与 `front-聊天输入框规范.md`（Plan 的工具表还列着 `explore`）、`front-轨迹视图规范.md` 与 `agent-spec-runtime-projection.md`（父轨迹从 `subagent/spawned` 找子会话）、`11-Harness统计设计.md`（统计读 `subagent/*`）、`agent-task-run-lifecycle.md`（子 Run 沿调用方的 Scope 取同一 generation）、`agent-session-transcript.md`（消息只在父子之间）、`多智能体协作/README.md`（对这一组的一句话介绍还写着默认后台、可续聊）。
- **检查**：`check-current-docs.mjs` 的 `currentTruthFiles` 去掉已删除的契约，55 → 54。

### 🧠 Design Intent (Why)

同一条规则写在四五个地方，做一次子智能体的改动就要把它们都读进上下文，其中两份（设计目录、实现前的契约）还和代码有出入。合并后每个主题只有一份现状文档，其他地方只链接。

规范只写现在的规则和原因，不写日期、状态和改动经过；这些在 history 里。

`agent-spec-agent-and-subagent.md` 是实现前写的契约，有四处和代码对不上，留着会误导，所以删掉而不是精简；仍成立的不变量已并入运行规范：

- 预设注册表（§5）和启动校验（§14）没有实现，两个预设是 `preset.ts` 里的常量。
- §5 说每次子 Run 独立取当前的 Harness 组合；代码是沿调用方的 Scope 取同一 generation。
- §6 的流程是父会话先接纳委派请求、再建子会话；代码是先建子会话，建成后才写 `subagent/spawned` 与 `subagent/activation`，建不成不写事件。
- §10 规定父 Turn 取消、退出时级联取消所有子智能体并先写终止事实；实际上后台子智能体不随父 Turn 取消，退出造成的结束不写事件，重启后补 `lost`。

模型可见的文字不抄进规范，是因为抄一份就多一处要同步的地方，而且它是这一组里最长的部分（原「设计 02」里约 7K 字符）。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：这轮没改运行时代码，代码文件里只动了注释和 `currentTruthFiles` 的一行。`pnpm check:docs`、`./scripts/ci.sh`、`pnpm lint`、markdownlint、`pnpm test:current-docs`、`pnpm test:package-readmes`、`pnpm check:hot-path-reads`、`pnpm check:scale-tests`，以及 `@actspace/subagent`、`@actspace/subagent-codex`、`@actspace/subagent-claude-code`、`@actspace/background-tasks` 四个包的测试都通过。没跑全量包测试，没有实机验证。
- **遗留**：
  - 合并时发现、这次没改的三处已登记到 `tech-debt-tracker.md`「子智能体与后台任务遗留」：官网的子智能体文档还是 2026-11-04 的说法；插件页里「子智能体调度」的说明文字还写着续派、中断；`BackgroundNoticeRow.tsx` 里子智能体通知的分支在桌面端对话里走不到。
  - `model-context/agent-multi-provider-llm.md` 还在讲 `exploreModel` 和探索用途，`core-data-storage-design.md` 的恢复扫描还以 `delegation/requested` 为例。它们属于别的规范组，留到那一组整理时一起改。
  - 现有 histories 里指向已删文档的链接成了断链，按 `HISTORY_GUIDE.md` 不修。原文用 `git show d0ca51c7:<路径>` 查看。
  - 契约删除是单独一个提交（`067f10e1`），要恢复只需回退它。这个提交的说明里有一句不准：写的是契约「工具名还是 explore、事件还是 delegation/*」，实际上契约用的已经是 `agent` / `agent_preset` / `agent_fork`，对不上的是上面列的四处。

### 📁 Files Modified

- `docs/design-docs/collaboration/agent-subagent-runtime.md`、`docs/design-docs/collaboration/agent-background-tasks.md`、`docs/design-docs/frontend/front-子Agent与后台任务规范.md`
- `docs/design-docs/子智能体和后台任务设计规范/`、`docs/design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md`（删除）
- `packages/subagent/README.md`、`packages/subagent/subagent/README.md`、`packages/background-tasks/README.md`
- `docs/design-docs/index.md`、`docs/design-docs/agent-plugin-runtime/README.md`、`scripts/check-current-docs.mjs`
- `docs/design-docs/frontend/front-轨迹视图规范.md`、`docs/design-docs/frontend/front-聊天输入框规范.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-agent-scope-model.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-prompt-context-contributors.md`、`docs/design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md`、`docs/design-docs/agent-runtime/agent-forms-and-modes.md`、`docs/design-docs/agent-runtime/agent-session-transcript.md`、`docs/design-docs/自进化的方案设计/11-Harness统计设计.md`、`docs/design-docs/多智能体协作/README.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `packages/subagent/**`、`packages/util/shared/**`、`packages/client/**`、`apps/desktop/src/renderer/**` 等 31 个文件的注释
