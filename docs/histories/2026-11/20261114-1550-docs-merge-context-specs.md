## [2026-11-14 15:50] | Task: 上下文管理引擎的规范合并成三份现状文档

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 看看这个任务继续吧，第一步的 97 和 98 两个 PR 已经做完了。（上一轮建议的下一组设计规范是上下文管理引擎：对着代码合并成现状文档，沿用子智能体那一组的写法。）

### 🛠 Changes Overview

**Scope:** `docs/design-docs/`、`packages/context/` 的 README、代码注释、`docs/learnings/`、`docs/exec-plans/tech-debt-tracker.md`、`scripts/check-current-docs.mjs`

**Key Actions:**

- **合并**：这一组原来 14 份文档、9.0 万字符，现在 4 份、1.4 万字符。规则只写在三份现状文档里：[上下文引擎规范](../../design-docs/上下文管理引擎设计/agent-context-engine.md)（来源、补充、每个 Step 的顺序、已信任的对话视图、投影）、[渐进式披露](../../design-docs/上下文管理引擎设计/agent-progressive-disclosure.md)、[上下文压缩](../../design-docs/上下文管理引擎设计/agent-context-compaction.md)；目录的 README 只是这三份的路由表。
- **删除**：`上下文管理引擎设计/上下文管理引擎V2/`（6 份）、Context 数据结构规范、插件拆分规范、插件设计原则、压缩提示词说明，以及 `agent-plugin-runtime/` 下的 `agent-spec-context-trusted-surface.md` 和 `agent-spec-prompt-context-contributors.md`。
- **搬到相邻规范**：面板读哪个来源、响应体积、回退上限、历史表不存正文，进 [front-Context面板规范](../../design-docs/frontend/front-Context面板规范.md) §6.3；`context_*` 表进 [数据存储结构与职责](../../design-docs/core-data-storage-design.md)。
- **不抄代码里的东西**：类型只在 `packages/context/context-engine/src/types.ts`，压缩提示词只在 `packages/context/context-compaction/src/prompts.ts`，规范里不再有副本。
- **包 README**：`packages/context/README.md` 只留包表、包之间怎么连、入口与测试；`context-engine`、`prompt`、`context-compaction` 三个包的 README 改成「文件 → 内容」表。原来写在 README 里的「退役条件」挪进技术债表。
- **代码注释**：11 个文件里的「`agent-spec-context-trusted-surface.md` §3.x」改指上下文引擎规范的「已信任的对话视图」，只动注释。
- **顺带修正**：`docs/ARCHITECTURE.md` 写的「六类来源」改成实际的八类；`agent-target-agent-core.md` §8 讲 Prompt 排序的一段照代码改写；[静态前缀 + 动态尾部](../../learnings/2026-06/static-prefix-dynamic-suffix-for-prompt-cache.md)里「snapshot 同时存 `facts` 和 `modelFacts`」「动态块随 `user/message` 持久化」两处标成历史并写上现在的做法；渲染进程 mock 的文档列表换成新文件名。
- **检查**：`check-current-docs.mjs` 的 `currentTruthFiles` 里，贡献者契约换成上下文引擎规范，数量不变。

### 🧠 Design Intent (Why)

和子智能体那一组是同一个问题：一条规则散在设计目录、V2 子目录、决策记录和实现前的契约里，改一次上下文相关的代码要把它们都读进来，而其中大半篇幅是实施进度（T1–T5、D1–D14）、迁移过程（schema 8 → 9 → 10）、验收流水和抄进来的类型与提示词。合并后每个主题一份现状文档，只写现在的规则和原因。

每条规则都对着代码核对过再写。核对时发现这些地方已经不成立，按代码改了：

- 面板规范写的估算器版本是 `context-content-1`；现在的版本号是 `packages/util/shared/src/token-estimate.ts` 的 `ESTIMATOR_VERSION`。
- `context-engine` 的包 README 写着「生产不发布 `context.assembly`」「请求快照保持 schemaVersion 2」；现在 `context.assembly` 由 `@actspace/context-assembly` 提供，快照是 `schemaVersion: 3`。
- `docs/ARCHITECTURE.md` 写的是六类来源；现在是八类，多了后台任务清单和路径导航。

`agent-spec-prompt-context-contributors.md` 是 Context 来源实现前写的契约，和代码对不上的地方更多，所以整份删掉而不是精简，单独一个提交（`5731778b`），提交说明里逐条列了对不上的地方：

- 「每次请求持久化含完整 messages 的 snapshot」：现在提示词和工具只在 digest 变化时写，对话不进请求记录。
- `request-fact` 和「snapshot 同时保存 facts 和 modelFacts」：生产路径只认 `prompt-section` 和 `model-fact`。
- 子 Scope shadow 父 Scope：只存在于旧的 `ContributorRegistry`，生产里每个 Agent 一张独立来源表。
- 五个 Core Prompt section、Host 事实（sandbox、approval、renderer、Browser Bridge）、结构化诊断清单：代码里都不是这个样子。

仍然成立的不变量（来源只写自己声明的片、只能追加、顺序确定、必需与可选、不带凭据、三种 Context 的区分）先并进上下文引擎规范，再删契约。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：这轮没改运行时代码，代码文件里只动了注释、mock 的文档列表和 `currentTruthFiles` 的一行。没有实机验证。
- **遗留**：
  - 核对时发现的五处代码遗留登记在 `tech-debt-tracker.md`「上下文引擎遗留」：Loop 里不带 Context 来源的旧请求路径（生产不走，但 `agent-loop` 用测试帮助函数的 12 个测试文件里有 8 个完全不带来源，走的是它）、`context-engine` 的旧 `ContextAssembler`、没有人注册的 reducer 注册表、只有自己测试在用的包清单、披露插件在插件页的说明文字。
  - `agent-target-agent-core.md` §6、`agent-target-llm-adapter.md`、`agent-spec-session-format-v1.md`、`agent-forms-and-modes.md` 里还在用「Request Assembly」「request candidate」这类实现前的说法描述请求流程。它们属于 Agent Runtime 那一组规范，留到那一组整理时一起改。
  - 现有 histories 里指向已删文档的链接成了断链，按 `HISTORY_GUIDE.md` 不修。原文用 `git show 0a4a7145:<路径>` 查看。

### 📁 Files Modified

- `docs/design-docs/上下文管理引擎设计/agent-context-engine.md`、`agent-context-compaction.md`（新增），`agent-progressive-disclosure.md`、`README.md`（重写）
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/`、同目录另外 4 份旧文档、`docs/design-docs/agent-plugin-runtime/agent-spec-context-trusted-surface.md`、`agent-spec-prompt-context-contributors.md`（删除）
- `docs/design-docs/frontend/front-Context面板规范.md`、`docs/design-docs/core-data-storage-design.md`、`docs/design-docs/core-storage-and-observability.md`
- `packages/context/README.md`、`packages/context/context-engine/README.md`、`packages/context/prompt/README.md`、`packages/context/context-compaction/README.md`
- `docs/design-docs/index.md`、`docs/design-docs/agent-plugin-runtime/README.md`、`docs/ARCHITECTURE.md`、`docs/coding-standards/perf-memory-conventions.md`、`scripts/check-current-docs.mjs`
- `docs/design-docs/agent-plugin-runtime/agent-target-agent-core.md`、`agent-english-learning.md`、`docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/learnings/2026-06/static-prefix-dynamic-suffix-for-prompt-cache.md`、`docs/learnings/2026-07/20260704-slot-based-prompt-design.md`、`docs/learnings/2026-10/20261011-long-lived-context-projection.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `apps/desktop/src/renderer/mock/docs-fixture.ts`
- `packages/context/context-engine/src/**`、`packages/session/session-journal/src/**`、`packages/util/shared/src/runtime-v2/session-events.ts`、`apps/desktop/src/main/test/context-trusted-equivalence.test.ts` 共 11 个文件的注释
