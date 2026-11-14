# 执行计划

这个目录保存需要跨多轮推进、具有明确依赖的执行计划。`active/` 只反映当前仍可继续执行的工作；计划完成就删除，仓库里不保留已完成计划的归档。

## 目录

- `active/`：仍有明确下一步、责任边界和验证方式的计划。
- `templates/`：新计划模板。
- `tech-debt-tracker.md`：暂不立项、但需要持续跟踪的技术债。
- `perf-backlog.md`：性能与内存优化任务总表，实机采样发现的热点先登记在这里。

具体维护规则见 `docs/PLANS_GUIDE.md`。

## 当前进行中

| 计划 | 当前状态与下一步 |
|---|---|
| [脚本执行：bash 规则放宽、随包 Python、临时目录与提示词](active/20261109-script-execution.md) | 2026-11-09 设计拍板，T1–T9 已实现（分支 `cursor/script-execution-design-c53e`，待合入）；macOS / Windows 打包冒烟待下一次 `release.yml`。 |
| [App 装配层拆分](active/20261110-app-assembly-split.md) | 2026-11-10 立项，未开始。`App.tsx` 1670 行按 8 个职责拆成 `use-*` hook，App 只留装配（目标 ≤ 300 行），Context 字段与 `WorkbenchLayout` prop 不变。下一步：M1 侧边对话 + evict。 |
| [`@actspace/shared` 契约分层](active/20261109-shared-contract-split.md) | P1 已完成待合入：`ipc.ts` / `session.ts` 按主题拆成 `src/ipc/`、`src/session/`，`check:packages` 新增「后端包不得引用桌面 IPC 契约」规则；对外 API 不变。P2 / P3（子入口、按归属拆包）等 P1 与 #66 / #67 / #68 合入后评估。 |
| [CI 提速：拆 job 并行 + tsc -b 增量缓存](active/20261109-ci-speedup.md) | P1 `exclude` 修正与根脚本切 `tsc -b` 已落地；下一步拆 `ci.yml` 四个 job 加缓存，再做 desktop 分片。 |
| [Desktop settings 写入一致性修复](active/20261007-desktop-settings-write-consistency.md) | 待拍板：2026-10-07 立项（来源：Desktop 前端重构 17 的特征测试），D1–D4 一直未决定；再不推进就降级回 [技术债](tech-debt-tracker.md)。 |
| [Composer 文件引用与回复批注](active/20260928-composer-mentions-annotations/README.md) | P0、PA、PA2 已实施；PA2 真实 Electron 主要流程通过，边界项见实机逐项记录；PB（编辑器内 `@` 文件引用）待实施。 |
| [前端基础组件](active/20260926-frontend-ui-components-foundation.md) | Button / IconButton / Tooltip / Menu / Popover / Dialog / Select 等已落地；只剩 Switch、Textarea、Tabs 三个基础组件及对应迁移。 |

## 已完成的计划在哪

完成的计划和它的执行记录直接删除，收尾步骤见 `docs/PLANS_GUIDE.md`「计划完成时」。做过什么、为什么这么做，查 `docs/histories/`；现在的规则，查设计文档。

要看某份旧计划的原文，从 git 历史里取：

```sh
# 列出被删掉的计划和执行记录
git log --diff-filter=D --name-only --format= -- docs/exec-plans docs/exec-runs | sort -u

# 读某一份：先找到删除它的提交，再从那个提交的父提交里读
git log --diff-filter=D --format=%H -1 -- docs/exec-plans/active/<plan>.md
git show <commit>^:docs/exec-plans/active/<plan>.md
```

2026-11-14 之前完成的计划当时归档在 `docs/exec-plans/completed/`（已删除），旧执行记录在 `docs/exec-runs/` 下，那天一并删掉了。最后一个带着它们的提交是 `d0ca51c7`，那批文件直接从它读，例如 `git show d0ca51c7:docs/exec-plans/completed/README.md` 是当时的索引。
