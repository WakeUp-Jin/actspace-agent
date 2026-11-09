## [2026-11-09 22:20] | Task: docs 第二轮漂移检查：learnings 失效路径、设计文档确认流水、Dependabot 排除项

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `Claude Fable 5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> OK，我们现在再看看 DOCS，还有什么值得清理、整理或者删除的。我检查一下看看还有什么漂移之类的，我们再把它更新或者优化一下。

### 🛠 Changes Overview

**Scope:** `docs/learnings/`（11 篇）、`docs/README.md`、`docs/CICD.md`、三份设计文档的状态行、`scripts/check-current-docs.mjs` 及其测试。

**Key Actions:**

- **[扫描]**：在 2026-11-09 上午那轮整理（`20261109-1030-docs-audit-cleanup.md`）之后，用临时脚本补扫了现有 `pnpm check:docs` 没覆盖的几类问题：全 `docs/` 的链接、反引号里引用但不存在的 `packages/` `apps/` `scripts/` `docs/` 路径、文档里提到但 `package.json` 里没有的 `pnpm` 命令、没被任何文档引用的 exec-runs / 资源文件 / 设计文档、技术债表里每一条的符号和行数是否仍成立。链接、pnpm 命令、设计文档引用、资源文件、技术债表全部对得上；漂移集中在 learnings 的反引号路径。
- **[learnings 路径]**：11 篇 learnings 里 13 处反引号路径指向已删除或已搬迁的文件。按 `WRITING_GUIDE` 的写法处理：路径已搬迁的直接改成现行路径（`packages/tools/runtime/src/` → `packages/core/tool-runtime/src/`、`packages/context/src/*` → `packages/context/context-engine/src/*`、`front-全局视觉语言规范.md` → `front-视觉token规范.md`、`front-设置中心重构规范.md` → `front-设置页规范.md`、一处 history 文件名写错）；文件已删除且无替代的（v1 Kairos / Lab 的设计文档与原型、`docs/archive/v1/`、`scripts/create-project.sh`、`packages/shared/src/kairos-aggregator.ts`）在首次出现处加「历史：…已移除」标注，教训正文不动；指向已清理的 `execution-process.md` / `optimization-results.md` 的改指同目录 `execution-summary.md` 并注明原始记录见 git 历史。
- **[校验加强]**：`scripts/check-current-docs.mjs` 的「反引号路径必须存在」检查从 `packages/` `apps/` 扩到 `scripts/` `docs/`，并新增对 `docs/learnings/` 的检查（只查路径，不查事实口径）；`YYYY-MM` 一类日期占位跳过，含「已清理」的行也算历史说明行。补一个测试用例覆盖新开关与豁免。`docs/README.md` 维护规则和 `WRITING_GUIDE` 写作原则同步写明这条检查。
- **[设计文档状态行]**：`agent-spec-context-trusted-surface.md`、`agent-spec-surface-derived.md`、`front-流式Markdown解析降频规范.md` 顶部的「待用户重跑 monitor / 待用户在 Electron 里确认」是确认记录，不该留在设计文档里（`docs/README.md`「各目录放什么」）；其中前者和 Markdown 降频的实测数字 run8 已经测出并登记在 `perf-backlog.md`「已完成」。三处改为指向性能待办，验收边界仍留在对应 completed 计划里。
- **[CICD]**：Dependabot 排除项写的是「两类」，实际 `.github/dependabot.yml` 还排除了由 `pnpm.overrides` 统一版本的 `katex`（OSV 清零那轮加的），补齐。

### 🧠 Design Intent (Why)

- 上一轮把链接检查扩到了 learnings，但 learnings 引用代码和文档时习惯用反引号而不是链接，所以 13 处失效路径一个都没被抓到；`WRITING_GUIDE` 自检清单第 5 条「引用的代码路径都存在吗」只靠人记不住，改成脚本守。
- 只给 learnings 开路径检查、不开事实口径检查：learnings 里保留旧符号是合法的（标「历史」即可），把退役 API 规则套上去会误报一片。
- 不动的部分：37 个没被现行文档引用的 `exec-runs/` 目录都有 `execution-summary.md` 并回指计划，属于合法验收记录；`多智能体协作/assets/demo/` 的 11 张 PNG 是 `apps/desktop/src/renderer/assets/space/` 缩放前的原图，有 README 说明来源；`references/dsh-self-modification-20261007.md` 里的 `packages/...` 是 DSH 的路径不是本仓库的，`references/` 不纳入路径检查；`check-current-docs.mjs` 里 `docs/archive/v1/` 的「归档链接须标历史」分支在目录删除后已成死代码，这轮没碰。
- `active/20261007-desktop-settings-write-consistency.md` 自 10-07 立项起一直「待拍板」，`exec-plans/README.md` 自己写着「再不推进就降级回技术债」；是否降级由用户定，这轮只提不改。

### 📁 Files Modified

- `docs/learnings/2026-05/auxiliary-info-must-not-drive-architecture.md`、`color-as-identity-badge-not-container.md`、`kairos-session-event-multi-producer.md`、`symlink-script-root.md`
- `docs/learnings/2026-07/20260704-slot-based-prompt-design.md`
- `docs/learnings/2026-08/20260831-journal-activity-projection.md`、`application-and-library-workspace-boundaries.md`
- `docs/learnings/2026-09/20260928-agent-form-scope-and-mode-gate.md`
- `docs/learnings/2026-10/20261006-electron-csp-srcdoc-inheritance.md`、`20261008-fail-open-watch-filter.md`、`20261011-long-lived-context-projection.md`
- `docs/learnings/WRITING_GUIDE.md`、`docs/README.md`、`docs/CICD.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-context-trusted-surface.md`、`agent-spec-surface-derived.md`、`docs/design-docs/frontend/front-流式Markdown解析降频规范.md`
- `scripts/check-current-docs.mjs`、`scripts/test/current-docs.test.mjs`
