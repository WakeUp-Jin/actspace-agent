# Docs v1 归档与 v2 校准 — 执行摘要

状态：已完成，2026-09-08。

[执行计划](../../exec-plans/completed/20260908-docs-v1-archive-v2-refresh.md) · [过程](execution-process.md) · [逐文件迁移映射](migration-map.md)

## 交付结果

- 只创建 v1 归档，不创建 v2 归档。50 个旧设计/审计/笔记/资产移入 `docs/archive/v1/`，另保存 Member/Room/Team 的 3 份完整旧稿，原位保留精简未来产品设计。
- 原位更新 v2 总体架构、Runtime/Composition 与插件组装/Agent 启动说明；校准相关 Plugin、Service、Profile、Agent、Projection、Prompt、包边界和当前入口。
- 精确区分基础 BootedProfile 与生产 BootedRuntimeProfile；CLI run、App Service、Journal 和部分实施目标以当前源码与计划状态核对。
- 10 个已实现计划入口进入 completed，1 个无独立工作的重定向进入 discarded；保留 P1/P2、Session Projection、Context、最终验收和前端基础组件的剩余工作。本任务自身随后进入 completed。
- 新增 docs 总导航和归档导航；history、learning、exec-run 保持原位置。现有链接修复不改变历史源码事实。
- 当前事实检查从 29 份扩展到 40 份；递归检查 design-docs、archive、exec-plans、exec-runs 的 Markdown 链接与 HTML 资产，历史资料仅检查链接、不禁用旧术语。

## 验证

| 检查 | 结果 |
|---|---|
| `pnpm check:docs` | 通过；当前入口、文档骨架、计划登记、递归链接与资产 |
| `pnpm test:current-docs` | 6/6 通过；覆盖退役 API/CLI、旧归档入口、未标识历史导航、迁移断链和带空格/括号路径 |
| `pnpm check:repo` | 通过；密钥扫描与前端主题约束 |
| `git diff --check` | 通过 |
| 迁移完整性 | 映射中的 92 个目的文件均存在，旧位置均已移除；另有 3 份完整稿快照。数字不包含本任务最后的计划归档 |
| PNG/HTML 完整性 | 10 个移动资产的 SHA-256 与迁移前一致 |
| 协作完整稿 | 原稿中的 packages/apps 源码路径集合保留，未改写成 v2 接口 |

本任务未改产品代码、未操作用户数据、未暂存/提交/推送；工作区并行中文界面任务的代码和文档改动保持原样。共享计划索引补入该任务登记。

## 剩余边界

全 docs 扫描剩余 16 处既有候选断链，不属于本次迁移新增：

- `docs/histories/2026-05/20260527-0015-window-chrome-strip-refactor.md`：12 处旧源码/错误相对文档路径。
- `docs/histories/2026-05/20260527-0030-chrome-strip-traffic-light-and-right-tabs.md`：3 处旧源码/相对文档路径。
- `docs/learnings/2026-07/astro-base-path-needs-source-assets.md`：1 处示例图片路径。

它们已在 tech-debt-tracker 单独登记；历史源码路径不能简单链接到当前不同实现。本文的检查是文件存在性与有限规则校验，不覆盖所有 Markdown 语法、远端链接和锚点，也不证明文档中的所有目标都已实现。

真实 Provider、Electron、Chrome、签名/公证和发行制品验收未在本任务重跑。completed 计划中的人工门禁仍按原结果保留，active 的阻塞项未改成通过。

## 人工阅读验收

1. 从 [文档总导航](../../README.md)进入当前架构，确认首读路径解释 Profile → App Service → Agent → Journal/Projection。
2. 从 [v1 归档](../../archive/v1/README.md)找到旧设计、审计和笔记，确认归档用途和替代入口明确。
3. 查看 collaboration 下的 Member/Room/Team：只保留产品意图，完整旧稿与早期原型仍可访问。
4. 在 [计划索引](../../exec-plans/README.md)确认待做工作与已实现但尚有人工验收的记录分开。

回退按迁移映射逆向移动并恢复本次正文修改；仅回退本任务的文档/脚本，不覆盖并行任务内容，不涉及用户数据。

## 2026-09-09 追加复核结果

用户追加的 exec-plans / design-docs 检查已完成，逐项结论和后续合并去向见 [后续复核清单](followup-audit.md)。

- 初始 10 个 active 入口逐项复核。中文界面任务自行归档后，本轮补齐 Context 的全仓回归并移动其 3 个计划文件至 completed，最终剩余 8 个 active。P2 恢复语义检查和负向 fixtures 的待办，不把旧 G2 PASS 改写为当前完整验收。
- 修复生成矩阵落后于 7 个 package 声明的问题；只使用原生成器更新 JSON/Markdown，不修改产品或检查脚本。
- Context 数据契约集中到 Usage/Context 主规范，面板原路径保留交互；Service 三层规范与 P0 历史背景的归属已明确。事件名与 seq 文档按当前实现校准。
- 设置中心总规范与模型/Usage 子规范、工具预览与流式修复设计的进一步整理，已列出章节去向与独有内容保留要求；未删除 v2 知识文档。

本次 `pnpm check:docs`、`pnpm test:current-docs`（6/6）、`pnpm check:repo`、`pnpm test:contract-matrix`（2/2）、刷新后的 `pnpm run gen:contract-matrix --check` 和 `git diff --check` 通过。矩阵检查通过只证明当前实现范围，不证明尚缺的语义 validator 已存在。

额外运行的 `pnpm -r --if-present typecheck` 在当时的中文界面 fixture 中失败：`ComposerReviewSummary` 不接受 `state`；这是独立任务改动，本轮未修改其代码。原 ProviderSettings 类型阻塞未再出现。该任务收口后，本轮重跑全仓 typecheck/test 均通过（Desktop 97 文件、651 用例），Context 的 G1 完成并归档；真实宿主验收未重跑。
