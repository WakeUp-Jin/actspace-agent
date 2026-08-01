# Docs Execution Plan 生命周期清理与 Release 收口

状态：已完成

## 目标

让 `docs/exec-plans/active/` 只保留仍有真实实施工作的计划，并在不删除历史内容的前提下，把已经完成的计划归入 `completed/`、把被后续方案替代或已经失效的计划归入 `discarded/`。同时以 `origin/main..main` 的完整差异和新增 histories 为依据，补齐面向用户的 Release。

## 范围

- 包含：
  - 审核当前 28 组 active plan 的实现状态。
  - 使用文件移动保留 Git 历史，不删除计划正文。
  - 新建 `docs/exec-plans/discarded/` 并记录丢弃原因。
  - 更新 `docs/PLANS_GUIDE.md`、`docs/exec-plans/README.md` 和受影响的当前文档引用。
  - 为 active 生命周期增加机械检查。
  - 聚合更新 2026-07-29 至 2026-08-01 的公开 Release。
- 不包含：
  - 不移动、合并或改写既有 `docs/histories/`。
  - 不清理 design docs、learnings 或 references 正文。
  - 不把内部重构、测试数量、开发工具或 Docs 清理写入公开 Release。
  - 不修改产品代码。

## 分类规则

- `active/`：仍有明确、未完成的实现任务。
- `completed/`：计划的代码和文档主体已经落地；允许保留明确标注的真实 Provider、Electron 或远端操作验收边界。
- `discarded/`：计划被后续专项方案替代、验收场景已经失效，或继续按原计划执行会误导开发。
- 实现状态以当前代码、对应 history、设计文档和计划自身状态交叉确认，不只依赖旧 checkbox。

## 分类矩阵

### 保留 Active

| 计划 | 理由 |
| --- | --- |
| `20260711-agent-team/` | 明确标记为待执行，Team V1 尚未落地。 |
| `Bash工具和工具权限调度开发计划/` | 保留总览和仍待执行的 session allowlist；已完成的暂停恢复子计划单独归档。 |
| `frontend-ui-components-foundation.md` | 基础组件层仍是独立、未完成的前端工程任务。 |

### 移入 Completed

| 计划 | 完成依据 |
| --- | --- |
| `20260527-bugfix-foundation_代码编完需手动验证.md` | 对应修复和 histories 已落地，后续 UI 与回归覆盖已替代旧验收上下文。 |
| `20260527-frontend-interaction-polish/` | Composer、附件、Context、Workspace、Typography 均已有实现或后续专项实现。 |
| `20260527-right-panel-views.md` | Files、Context、Kairos、Reply、HTML 与 Terminal 已由当前右侧工作台实现。 |
| `20260529-appearance-fonts-and-zoom.md` | 代码、测试和浏览器验证完成，保留原文中的 Electron 验收边界。 |
| `20260530-workspace-file-explorer.md` | 文件树和多类型文件阅读已落地并被后续文件视图计划扩展。 |
| `20260602-archived-chats.md` | 会话归档已有实现和验证 history。 |
| `20260602-workspace-registry.md` | Registry 持久化、恢复和并发安全均已落地。 |
| `20260606-explore-subagent.md` | Explore 已进入产品与公开 roadmap 已完成项。 |
| `20260703-bash-execution-model/` | 输出管道、后台任务和 watchdog 已实现；保留手工验收边界。 |
| `20260704-bash-sandbox/` | macOS sandbox 第一期和权限分级已实现，后续债务已进入 tracker。 |
| `20260708-agent-evaluation/` | 计划声明的首个完整里程碑已经完成。 |
| `20260717-browser-locator-runtime-rewrite.md` | Runtime v5、Frame/OOPIF 路由、文档和 history 已落地。 |
| `20260724-multi-provider-llm/` | Plan 0-5、7 已完成；保留真实 Provider 统一手工验收边界。 |
| `20260725-frontend-color-system-migration*.md` | 迁移、审计、样板与工程检查均完成；保留最终人工 UI 验收边界。 |
| `20260730-composer-slash-command-menu.md` | 功能、自动化与 history 已完成。 |
| `20260730-review-workbench/` | Git-first Review Workbench 已完整落地并合并。 |
| `20260730-right-panel-file-view-optimization.md` | 文件新鲜度、阅读、高亮、CSV 与大文件能力已落地。 |
| `20260731-agent-runtime-desktop-cli.md` | Runtime、Desktop Adapter、CLI run/chat 和本机制品验证完成。 |
| `20260527-agent-tool-capabilities-breakdown/` | Bash 选择边界、delete_file 和 Skill 后端均已有实现与对应 history。 |
| `actspace-cache-loss-audit-plan.md` | CacheAuditTracker、旁路文件、脚本和测试已落地。 |
| `kairos_prompt_cache_optimization.md` | M1-M5 已完成，保留真实多 tick 缓存命中率验收边界。 |
| `Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md` | 暂停恢复、幂等 decision、Abort 和 Electron 验收已完成。 |

### 移入 Discarded

| 计划 | 丢弃原因 |
| --- | --- |
| `20260527-agent-tool-capabilities.md` | 旧母计划长期未同步，已经被拆分计划、completed plans 和当前工具设计文档替代。 |
| `开发者手动验收-20260529-bugfix-foundation-manual-acceptance.md` | 验收步骤针对 2026-05 UI 和运行时，当前实现已经多轮重构，继续执行会产生误导。 |

## Release 范围

- `2026-07-29`：Workspace 操作、Environment、本地 Git、Worktree、Composer 模式/Image/Skills、长会话导航和官网开发计划。
- `2026-07-30`：Review Workbench、交互式 Terminal、文件阅读、Slash 菜单和工作台布局。
- `2026-07-31`：DeepSeek Thinking 与 Terminal 启停可靠性。
- `2026-08-01`：本地 Agent CLI、宽屏工作台、Settings/无模型反馈和 unborn Git workspace 修复。

## 风险

- 风险：移动计划后当前文档仍指向旧路径。
  - 缓解：只修正 current/active 文档中的引用；history 保留当时路径，不改写历史证据。
- 风险：把只剩人工验收的计划误认为全部验收完成。
  - 缓解：归入 completed 只表示实施主体完成，原计划中的未验收边界继续保留并在索引说明。
- 风险：Release 混入内部工程噪音。
  - 缓解：排除 host-neutral 内部分层、worktree 开发身份、pre-push 统计、测试数量和 Docs 清理。

## 验证方式

- `pnpm check:docs`
- `pnpm test:site`
- `pnpm check:site`
- `pnpm build:site`
- `git diff --check`
- 检查 `active/` 不再包含明确已完成的旧计划。
- 检查 Release 同一日期只有一个条目，月份和日期倒序排列。

## 进度记录

- [x] 刷新并确认 `origin/main..main` 的 23 个提交和 18 份新增 history。
- [x] 完成 active plan 分类矩阵。
- [x] 创建 discarded 生命周期规则。
- [x] 完成计划移动和当前引用修复。
- [x] 更新 Release。
- [x] 完成验证并将本计划移入 `completed/`。

## 决策记录

- 2026-08-01：既有 histories 已按日期组织，本轮不移动、不合并、不改写。
- 2026-08-01：代码和文档主体完成但仍有真实环境验收边界的计划允许进入 completed，验收边界必须保留。
- 2026-08-01：被替代和已经失效的计划进入 discarded，不直接删除。
