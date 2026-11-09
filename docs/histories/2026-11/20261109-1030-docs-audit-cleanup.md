## [2026-11-09 10:30] | Task: docs 审计后的集中整理：计划归位、事实校准、删除原型、加强校验

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `Claude Fable 5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 再看看这个项目目前的 docs 文件夹里面的文档有什么值得优化吗？看看有哪些信息是漂移的，是错误的，是需要调整合并的，或者删除的，仔细检查一下，给我一个优化调整的方案。
>
> 开始执行吧。

### 🛠 Changes Overview

**Scope:** `docs/`（exec-plans、exec-runs、design-docs、learnings、HISTORY_GUIDE、SECURITY、RELIABILITY、ARCHITECTURE、assets）、`scripts/check-current-docs.mjs` 及其测试、两处 renderer mock 注释。

**Key Actions:**

- **[计划归位]**：已随 PR 合入 main 的 11 个 `exec-plans/active/` 计划（live-assistant-stream、request-record、context-trusted-surface、edit-resend-rewind、markdown-stream-throttle、stats-redesign、surface-derived、ci-pipelines、context-panel-polish、pi-ai-builtin-providers、subagent-compact-cards）移入 `completed/` 并登记索引；`frontend-ui-components-foundation.md` 补日期前缀；全仓库引用同步。`exec-plans/README.md` 的「当前进行中」只剩真正未完成的四项。
- **[事实校准]**：`RELIABILITY.md` 事件名改为当前词汇；`core-data-storage-design.md`、`上下文管理引擎V2/README.md` 不再写死 `schema 9`，改为以 `usage-read-model-schema.ts` 的 `user_version` 为准；`SECURITY.md`「真实模型调用」节按连接模板 + 四层数据模型 + pi-ai 内置服务商复用重写，「文件面板」改为「MD 文档」面板；`ARCHITECTURE.md` 的 scripts 描述、`perf-backlog.md` 的提交号与 patch 版本、`tech-debt-tracker.md` 已完成项、多份设计文档的状态行、`agent-spec-dsh-event-model.md` 里的个人路径一并修正。
- **[删除]**：`frontend/md-render-demo/` 与 4 份已落地或被取代的 `*-demo.html` 删除（保留用户文档明确标注「待 Electron 复验」的 context-panel-polish / stats-redesign / subagent-compact 三份）；`BUILD_ARTIFACTS` 豁免清空；`space-people (1).png` 改名 `space-people.png`；两个无任何外部引用的 `execution-process.md` 删除，`exec-runs/README.md` 补充目录名与计划 slug 不一致时的写法。
- **[重写]**：`agent-plugin-runtime/README.md` 改成「先读 → 契约表 → 决策背景 → 验收边界」的导航，去掉 P2/P5 摘要与清理流水；`agent-multi-provider-llm.md`「当前范围」改为现状指针（连接模板不限三家、四层数据模型取代 `billingMode`、内置服务商复用），删除 `billingMode` 小节；`agent-model-catalog-and-usage-cost.md` 指向真实存在的「设置页规范」；`架构优化/02-插件结构设计.md` 标明「原位置 / 原来手写的」列是改造前对照；`agent-spec-runtime-projection.md` 重复的 §14 改为 §15；V2 与自进化 README 说明编号不连续的原因；`多智能体协作/README.md`、`coding-standards/README.md` 描述对齐现状。
- **[校验加强]**：`scripts/check-current-docs.mjs` 链接检查扩到 `docs/*.md`、`docs/exec-plans/*.md`、`docs/learnings/`、`docs/coding-standards/`；事实口径检查扩到全部 `docs/design-docs`，新增旧事件名、`schema 9`、`billingMode`、个人绝对路径四条规则；新增 learnings 索引校验（分组计数、每篇被索引且只索引一次）；补对应测试。
- **[规则]**：`HISTORY_GUIDE.md` 增加「history 里的链接是写作当时的快照，失效不修」。

### 🧠 Design Intent (Why)

- 审计发现 `exec-plans/README.md` 把已合入的工作列为「进行中」，现行设计文档里还有 `schema 9`、旧事件名、`billingMode`、三家供应商等已被实现超越的陈述，这些会直接误导下一轮 Agent。先把事实对齐，再让校验脚本守住，避免下次再手工审计。
- 原型 demo 的既定规则是「选定后删除」，但多份已落地功能的 demo 仍留在仓库；删除时只保留文档明确要求复验的三份，不扩大范围。
- `exec-runs/` 过程文件沿用 2026-11-04 整理的尺度：被 completed 计划或 histories 引用的不删，只删无引用者；缺 `execution-summary.md` 的旧目录不补写，改为在 README 说明。
- histories 里指向已合并 learnings、已清理 exec-runs 的断链不修：history 是当时的快照，修链接会破坏可追溯性；这条写进 HISTORY_GUIDE，校验脚本也不覆盖 `docs/histories/`。
- 本应分四批四个 PR，实际合为同一分支四个提交一个 PR：四批改动互相依赖（第一批移动计划后第二、三批的链接才能定稿，第四批的校验规则又要求前三批先修完），分开反而会让每个 PR 都带着红色的 `check:docs`。

### 📁 Files Modified

- `docs/exec-plans/README.md`、`docs/exec-plans/completed/README.md`、`docs/exec-plans/completed/2026110[5-8]-*.md`（自 active 移入）
- `docs/exec-plans/perf-backlog.md`、`docs/exec-plans/tech-debt-tracker.md`
- `docs/SECURITY.md`、`docs/RELIABILITY.md`、`docs/ARCHITECTURE.md`、`docs/HISTORY_GUIDE.md`、`docs/README.md`
- `docs/design-docs/agent-plugin-runtime/README.md`、`agent-spec-dsh-event-model.md`、`agent-spec-runtime-projection.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`、`agent-model-catalog-and-usage-cost.md`
- `docs/design-docs/core-data-storage-design.md`、`docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/README.md`、`05-Context面板与SQLite联合设计.md`
- `docs/design-docs/架构优化/02-插件结构设计.md`、`docs/design-docs/多智能体协作/README.md`、`docs/design-docs/自进化的方案设计/README.md`、`docs/design-docs/子智能体和后台任务设计规范/01-设计决策.md`
- `docs/design-docs/frontend/README.md`、`front-Context面板规范.md`、`front-Markdown编辑与渲染规范.md`（删除 `md-render-demo/`、`context-bash-demo.html`、`subagent-message-demo.html`、`subagent-polish-demo.html`、`subagent-style-demo.html`）
- `docs/exec-runs/README.md`（删除两个无引用的 `execution-process.md`）
- `docs/learnings/README.md`、`docs/learnings/2026-05/scope-must-be-explicit-when-aggregating-multi-source.md`
- `docs/assets/readme/space-people.png`（改名）、`README.md`
- `scripts/check-current-docs.mjs`、`scripts/test/current-docs.test.mjs`
- `apps/desktop/src/renderer/mock/docs-fixture.ts`、`apps/desktop/src/renderer/mock/context-panel-fixture.ts`（注释与引用路径）
