# 2026-07-30 Git-first Review Workbench 总计划

## 状态

- Plan 5–7 已实现：后台请求集合由 load policy 唯一决定，tracked patch 批量读取，Git/patch 解析进入 worker，renderer 使用虚拟行。
- Plan 8 自动化与真实 Electron capped 核心路径已完成；Standard、浅/深主题、尺寸与快速切换验收进行中。
- 性能纠偏后，capped 的 Scope、Options、Files、Jump、Collapse/Expand、Commit 菜单、单文件切换与滚动已重新通过；Standard、浅/深主题、390px/620px、20 文件快速切换、disposable Git mutation 和真实 Push/Create PR 仍待验收。
- 设计事实源：`docs/design-docs/core-review-change-sources.md`。
- 大 Diff 性能事实源：`docs/design-docs/core-review-large-diff-loading.md`。

## 目标

把旧的 Uncommitted raw diff 升级为 Codex-like 右侧 Git Review Workbench：六种真实 scope、结构化 Diff、upstream Branch 比较、紧凑单行工具栏、真实 Review Options、Git actions 和安全失效模型。

AI Review、Review 模型、findings、Review activity、detached review 和评论回注不属于最终产品范围，已从实现与契约中移除。

## 计划文件

- `plan-0-shared-contracts-and-coordinator.md`：selection/snapshot、typed IPC、generation、cache 与 viewed sidecar。
- `plan-1-git-engine-and-actions.md`：六 scope、upstream Branch、结构化 Diff、mutation、patch export、Commit/Push/Create PR。
- `plan-2-review-workbench-ui.md`：右侧 Tab、单行 toolbar、portal menus、Files 停靠/窄宽独占布局、Diff renderer 与窄面板行为。
- `plan-3-agent-review-and-feedback.md`：记录 AI Review 能力撤销和全链路清理范围。
- `plan-4-integration-acceptance-and-docs.md`：跨层接线、自动化、文档和手动验收边界。
- `plan-5-load-contract-and-coordinator.md`：load policy、批量 patch/full-content 契约、generation 取消与请求调度。
- `plan-6-git-batch-and-full-content.md`：prepared snapshot、tracked batch、untracked 并发、Git worker 与完整正文。
- `plan-7-dual-mode-virtual-renderer.md`：Standard/capped 双模式、虚拟 row renderer、真实错误恢复与 Options 语义。
- `plan-8-performance-acceptance-and-docs.md`：规模 fixture、命令/DOM 预算、Electron 回归和文档收口。

## 全局约束

- Renderer 不运行 Git、不读任意文件、不解析 raw Git file header。
- Main 每个 IPC 重新校验 registered workspace/session intent；repository、HEAD、upstream、merge-base 等 Git 基线按 snapshot generation 只准备一次。
- Branch 只接受 Main 返回的本地分支；upstream 由 Main 重新解析。
- 打开/刷新 Review 不自动 fetch。
- 所有控制项必须接真实行为，不保留占位开关。
- 统计为零时不显示 `+0` 或 `-0`。
- Review 保持右侧对象 Tab，聊天区和左侧导航始终可用。
- 自动化不执行真实 Push/Create PR。

## 完成门槛

- 六 scope 都返回真实数据。
- Branch 展示 `local → upstream`，Diff 只包含本地独有提交，并提示 behind/diverged 状态。
- Review toolbar 是单行 action bar；Branch metadata 另占轻量信息行。
- Refresh、word wrap、full files、rich preview、word diff、white space、copy git apply 全部可用。
- stage/unstage/revert 具备 generation/fingerprint guard。
- shared build、desktop typecheck、targeted/full tests、主题检查和 `git diff --check` 通过。

## 进度

- [x] 设计与计划。
- [x] Shared contract、Coordinator 和 Git engine。
- [x] 右侧 Review Workbench 和 Git actions。
- [x] 纠正错误的全屏 Focus Mode，恢复右侧 Tab。
- [x] Branch 改为本地分支对比 upstream remote-tracking ref。
- [x] 工具栏合并为单行，隐藏零值统计。
- [x] Review Options 接入真实行为。
- [x] 修复 toolbar 弹层被 overflow 裁切导致的“点击无反应”。
- [x] Files 改为宽面板右侧停靠、窄面板独占列表，不再用遮罩压住 Diff。
- [x] Review 跟随当前 workspace；已删除 workspace 专属的陈旧 Review Tab 身份。
- [x] Computer Use 验证 Scope、Options、Expand、Jump、Files、Commit 和 upstream Branch。
- [x] AI Review 全链路移除。
- [x] 自动化与文档收口。
- [x] 完成本机 Codex 大 Diff、批量 Git、虚拟渲染和 full-content 调用链分析。
- [x] 收敛 Standard/capped 最终设计和 Plan 5–8。
- [x] 执行 Plan 5：加载契约与 Coordinator 调度纠偏。
- [x] 执行 Plan 6：Git 批处理、Review worker 与完整正文数据面。
- [x] 执行 Plan 7：双模式与虚拟 Diff Renderer。
- [ ] 执行 Plan 8：性能自动化与 capped 核心 Electron 回归已完成；其余真实窗口矩阵进行中。
- [ ] 用户完成真实 Electron 与远端验收后移入 `completed/`。

## 决策记录

- 2026-07-30：Review 不使用 Focus Mode，只作为右侧对象 Tab。
- 2026-07-30：Branch 的产品语义是本地分支对比其 upstream，不是自由输入 base ref。
- 2026-07-30：remote-tracking ref 采用本机已有状态，Review 不隐式联网 fetch。
- 2026-07-30：工具栏 actions 保持一行；`local → upstream` 是 metadata，不是第二排 toolbar。
- 2026-07-30：用户明确不需要 AI Review，因此删除 UI、IPC、运行时、模型设置和 session 事件，不只隐藏入口。
- 2026-07-31：Review 内部按自身容器宽度响应；弹层 portal 到顶层，Files 不再覆盖 Diff。
- 2026-07-31：文件数超过 128、变更行超过 9,000 或估算变更内容超过 12 MiB 时进入 capped single-file mode；文件树保留全部，中央只请求并挂载当前文件。
- 2026-07-31：Standard mode 批量请求全部 patch，但完整文件正文只按可见范围懒加载；`Don't load full files` 不是纯显示开关。
- 2026-07-31：whitespace option 表示是否忽略纯空白变更，不再表示渲染可见空格字符。
- 2026-07-31：旧 Plan 0–4 保留为功能基线，新增 Plan 5–8 纠正请求、Git 和渲染性能模型。
- 2026-07-31：通用 Git runner 不做自动重放；worker crash 最多重建一次，单文件读取失败由显式 Retry 恢复，避免 mutation 重复副作用。
- 2026-07-31：worktree 专属 Electron bundle ID 恢复了可重复 Computer Use；capped 核心路径已验收，未把尚未执行的 Standard、主题/尺寸、快速切换与远端动作计为完成。
