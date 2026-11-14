## [2026-11-14 03:45] | Task: 删除已完成计划归档和执行记录，计划完成即删除

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 一个不复杂的子智能体优化任务花了 30 多美元，一起排查是不是 docs 里无关文档太多。执行计划和执行进度可以删减，设计规范可以合并精简；history 是完整时间线，保留。（讨论方案后）先做 A，把执行归档清理掉，再做 B 里的子智能体与后台任务。

### 🛠 Changes Overview

**Scope:** `docs/`、`scripts/check-docs.sh`，少量代码注释、包 README 和 `apps/site`

**Key Actions:**

- **删除归档**：`docs/exec-plans/completed/`（214 项计划连同索引共 351 个文件，另有 24 个 design-archive 文件）和 `docs/exec-runs/` 下 174 个已完成计划的目录（246 个文件），共 621 个文件。`docs/` 从 1740 个文件、752 万字符降到 1119 个、374 万字符。7 份进行中计划和其中 4 份已有的执行记录目录保留。
- **先清引用**：71 份设计文档、27 份 learnings、顶层文档、进行中计划、包 README、代码注释、官网来源表里指向归档的链接，以及「见执行摘要」这类不带路径的文字指针，全部去掉。learnings 的「关联」改指对应的 history；设计文档里靠归档才说得清的内容改指代码或测试。
- **搬一份还在用的**：`design-archive/frontend/front-composer-mentions-annotations-决策与验收.md` 属于进行中的计划，移到 `active/20260928-composer-mentions-annotations/decisions-and-acceptance.md`。
- **遗留登记**：只写在归档里、现在还成立的事项登记到 `tech-debt-tracker.md`：Browser Use 实机验收没覆盖的验收点、子智能体与后台任务 5 项、「没有实机验证记录的功能」10 项。
- **规则**：`PLANS_GUIDE.md` 改成计划完成即删除、不归档，新增「计划完成时」的收尾步骤。交互模式不再写执行过程和执行摘要；夜间模式照写，人看过摘要后随计划删除。history 模板加「未验证与遗留」。learnings 只关联 history。设计文档、learnings、包 README、代码注释不把计划和执行记录当内容来源。
- **检查**：`check-docs.sh` 不再要求 `completed/` 存在；`completed/` 下出现 Markdown，或 `docs/exec-runs/<目录>/` 没有同名的进行中计划，都报错。

### 🧠 Design Intent (Why)

排查那次任务的用量后确认：钱主要花在长上下文上，读进来的每份文档都留在上下文里，被之后的每个请求重复计费。归档占 `docs/` 一半字符，搜索时会命中它，而里面的内容已经过期，读了既花钱又可能被旧结论带偏。

归档能删的前提是它不是任何现行内容的唯一来源，所以顺序是先清引用、把还成立的遗留登记出来，最后删文件。做过什么、为什么这么做，查 `docs/histories/`；现在的规则，查设计文档；原文在 git 历史里（`git show d0ca51c7:<路径>`，办法写在 `docs/exec-plans/README.md`）。

只删不改规则，归档会重新长出来，所以同时改了收尾规则，并让 `check:docs` 拦住。检查只看 Markdown：执行记录里的截图和 `.DS_Store` 被 `.gitignore` 忽略，拉取这次删除后本机目录可能还在。

交互模式不再写执行过程和执行摘要，是因为人全程在场，这两份文档和计划的进度记录、history、PR 描述重复。原来只写在执行摘要里的「没验证的范围」改由 history 的「未验证与遗留」承担，否则计划删掉后这类信息没有落脚的地方。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：这轮没改运行时代码，代码文件里只动了注释。`pnpm check:docs`、`./scripts/ci.sh`、`pnpm lint`、markdownlint、`pnpm test:current-docs`、`pnpm test:package-readmes`、`pnpm test:refactor-stats`、官网的 `check` 与 `test`、被改注释的 3 个 desktop 测试文件都通过。没跑全量包测试。
- **遗留**：
  - 现有 histories 里指向已删计划和执行记录的链接成了断链，按 `HISTORY_GUIDE.md` 不修。
  - 保留的 4 个执行记录目录属于交互模式的进行中计划，按新规则本来不用写，沿用到各自计划完成。
  - 技术债表「没有实机验证记录的功能」是照归档里各份执行摘要的「人工验证指引」整理的，没有重新实机验证；每一项现在还值不值得补验，需要人判断。
  - 提交 `d7ffb1a8` 的说明把删除数量写成「350 份已完成计划和 25 份 design-archive」，实际是 351 个计划文件和 24 个 design-archive 文件（有一份 design-archive 在更早的提交里移到了 `active/`），总数 621 没错。

### 📁 Files Modified

- `docs/exec-plans/completed/`、`docs/exec-runs/<已完成计划>/`（删除）
- `docs/PLANS_GUIDE.md`、`docs/exec-plans/README.md`、`docs/exec-runs/README.md`
- `docs/HISTORY_GUIDE.md`、`docs/histories/template.md`、`docs/learnings/WRITING_GUIDE.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `scripts/check-docs.sh`
- `docs/design-docs/**`、`docs/learnings/**`（去掉指向归档的链接）
