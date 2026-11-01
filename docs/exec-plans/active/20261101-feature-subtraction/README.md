# 功能减法 — 执行计划总览

状态：待执行。P1–P5 照本计划执行；P6 并入[插件结构 S3](../20261101-plugin-structure/s3-plugin-page.md)，不单独执行。

- 分支 / worktree：`架构优化` @ `../actspace-agent-arch-slim`（从 `main@b590e02f` 切出）。
- 设计真源：[01 功能减法设计](../../../design-docs/架构优化/01-功能减法设计.md)、[文档面板规范](../../../design-docs/frontend/front-文档面板规范.md)、demo [md-file-tree-demo.html](../../../design-docs/frontend/md-file-tree-demo.html)（方案 A）。
- 执行记录：开始执行时创建 `docs/exec-runs/20261101-feature-subtraction/execution-process.md` 与 `execution-summary.md`（从 `docs/exec-runs/templates/` 复制）。
- 执行模式：连续执行，与[插件结构](../20261101-plugin-structure/README.md)合起来按 P1–P5 → S1–S4 的顺序做完，只在遇到阻塞或需要用户决定的事时停下。

## 子计划与顺序

按“先删干净的、再删有耦合的、最后做新东西”排序。每个子计划独立可回滚，各自一个提交（或一组提交）。

| 顺序 | 子计划 | 内容 | 依赖 |
|---|---|---|---|
| 1 | [P1 删除「转成可视化 HTML」](p1-visualize-removal.md) | 按钮、Reply 视图、生成逻辑、IPC | 无 |
| 2 | [P2 删除内置终端](p2-terminal-removal.md) | node-pty、xterm、终端标签、IPC；`capabilities.terminal` 改名 | 无 |
| 3 | [P3 文件打开收敛](p3-file-open-convergence.md) | 只渲染 Markdown 和图片；HTML 走默认浏览器，其他走默认应用；打不开时的兜底对话框 | P1（`html` 标签的最后一个来源随 P1 消失） |
| 4 | [P4 文档面板](p4-docs-panel.md) | Markdown 文件树取代工作区文件树；预览 / 源码切换与编辑保存；标签改名「文档」「改动」 | P3（共用文件打开路由） |
| 5 | [P5 Git Review 只留查看](p5-review-trim.md) | 删暂存/还原、已查看、apply/PR/初始化、Review 内提交对话框、实时监听；+N/−M 改为强制刷新 | 无（与 P4 只在标签名上重叠） |
| 6 | ~~[P6 浏览器与英语学习默认不加载](p6-optional-capabilities.md)~~ | 并入插件结构 S3：用通用插件开关 `tools.plugins` 取代 `tools.optionalCapabilities`，「能力」页改为「插件」页 | — |

P1、P2、P5、P6 互不依赖，必要时可以调换顺序；P3 → P4 必须串行。

## 实施细节决定（盘点代码后补充，执行前请用户确认）

设计文档没有覆盖、盘点代码时才发现的细节。下面是计划采用的默认做法，用户可以推翻。

1. **Review 里的「提交或推送」对话框一并删除。** `ReviewWorkspace.tsx` 的 `GitDialog`（调用 `workspacesApi.commit/commitAndPush`）和顶部工作区菜单的提交功能重复。按 01 第 8 节“动手操作 git 的入口统一放在顶部工作区菜单”删除。顶部菜单不受影响。
2. **Review 范围菜单去掉「上一轮」。** 生产代码从未给 `ReviewGitEngine` 传 `loadLastTurn` / `loadLastTurnFileDiff`，这一项一直显示“不可用”；“这一轮改了什么”已由回复尾部的本轮改动卡（`TurnReviewView`）提供。保留的范围是：全部未提交、未暂存、已暂存、某个提交、某个分支。
3. **文档面板：预览 / 源码切换，源码直接编辑**（2026-11-01 用户确认）。编辑器用原生 `<textarea>`，⌘S / Ctrl+S 保存，不做冲突检测（以人为准）；渲染只加大纲和 Mermaid，其余“渲染做精”以后单独立项。`CodeRenderView` 保留，因为 Space 演示（`SpaceFileView.tsx`）和远端文本预览还在用。
4. **（已被插件结构 S3 取代）可选能力的开关放在设置里，改动后重启生效。** 新增可选字段 `tools.optionalCapabilities?: { browser?: boolean; englishLearning?: boolean }`，缺省为 `false`，不升 schema 版本、不写迁移（与现有 `tools.deepseekFetchEnabled?` 同样做法）。「能力」页两张卡片保留标题和一个「启用」开关，开关旁注明“重启 ActSpace 后生效”；关闭时卡片不显示连接面板、语音设置等细节。
5. **远端 Host 会话的文件打开保持现状。** 远端文件不能交给本机默认应用，`remoteArtifact.ts` 的文本 / 图片预览照旧；文档面板只在本机会话出现（沿用现有 `developmentEnabled` 的判断）。
6. **Space 演示里假的“终端”面板不动。** 它是 mock 数据，不依赖 xterm / node-pty，属于“本轮不动”的 Space 演示。

## 全局约束（每个子计划都适用）

- 执行前先读仓库根 `AGENTS.md`，再按子计划「必读」读文档。
- 新代码只用主题 token，改样式前读 `docs/design-docs/frontend/front-主题与配色规范.md`，浅色和深色都要验。
- 删 IPC 时同步改五处：`packages/shared/src/desktop-bridge/contract.ts`、`packages/shared/src/runtime-v2/fixed-renderer.ts` 的 channel 常量、main 的 handler、`apps/desktop/src/main/ipc/guards.ts`（如有）、`apps/desktop/src/renderer/mock/handlers.ts`；再跑 `pnpm check:ipc-channels`。
- `apps/desktop/tsconfig.electron.json` 按白名单列出 main 文件，删 main 文件时必须同步删条目，否则 `typecheck` 报错。
- 历史文档不改：`docs/exec-plans/completed/`、`docs/histories/`、`docs/exec-runs/`、`docs/learnings/`（学习记录最多加一行“已移除”）。
- 每个子计划把 01 第 12 节列出的对应文档在**同一个提交**里改完，不提前改。
- 每个子计划结束时按 `docs/HISTORY_GUIDE.md` 在 `docs/histories/` 记一条，写清删了什么、为什么。
- 每个子计划完成后在本分支本地提交一次（2026-11-01 用户同意），不推送。

## 统一验证命令

每个子计划收尾都跑（基线先在 P1 开始前跑一遍记录已知失败；2026-11-01 已知：本 worktree 里 `check:docs` / `check:current-docs` 报 363 条失败，全部是 `docs/exec-runs/` 下不进 git 的截图和 `tmp/` 链接，不算本计划引入）：

```sh
pnpm --filter @actspace/shared test
pnpm --filter @actspace/client test
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm check:ipc-channels
pnpm check:renderer-bridge
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:docs
pnpm check:current-docs
```

涉及 runtime / 依赖的子计划（P2、P6）另跑：

```sh
pnpm install            # 删依赖后更新 pnpm-lock.yaml
pnpm typecheck
pnpm --filter @actspace/runtime test
pnpm test:contract-matrix
```

全部完成后跑一次 `pnpm test`、`pnpm typecheck`、`pnpm --filter @actspace/desktop build`，并在 Electron 实机走一遍各子计划的「手工检查」。

## 回滚

每个子计划独立提交。回滚某一项就 `git revert` 对应提交；P3 和 P4 有依赖，回滚 P3 前先回滚 P4。P2 回滚后需要重新 `pnpm install` 恢复 node-pty 原生模块。用户数据不做破坏性迁移：旧的 `visualizations.json`、`review/view-state.json` 留在磁盘上不读也不删，回滚后仍可用。

## 进度

- [ ] 基线：跑统一验证命令，记录已知失败。
- [ ] P1 删除「转成可视化 HTML」。
- [ ] P2 删除内置终端。
- [ ] P3 文件打开收敛。
- [ ] P4 文档面板。
- [x] P5 Git Review 只留查看（2026-11-01）。
- [x] P6 并入插件结构 S3（2026-11-01），由 S3 完成（2026-11-02）。
- [ ] 收尾：全量检查、Electron 实机检查、执行摘要、history、设计文档状态改为“已实施”，计划移入 `completed/`。

## 决策记录

- 2026-11-01：用户逐项确认减法清单与文档面板方案 A（见设计文档）。
- 2026-11-01：浏览器能力第一步不改 runtime 组合。现有机制已经是“host 没有 `browser` 能力就不加载 browser-tools”（`packages/runtime/src/startup/boot.ts:143`），所以只要桌面端在关闭时不创建浏览器服务、不上报 `browser` 能力，后端自然不加载。把 browser-tools 从 runtime 依赖里拆出去留到第二步插件结构。
- 2026-11-01：P6 并入插件结构 S3。第二步把「能力」页改为「插件」页，开关做成通用的 `tools.plugins`，再单独做一套 `tools.optionalCapabilities` 会马上被替换。
- 2026-11-01：+N/−M 去掉监听后必须走 `refreshSnapshot`（强制刷新）。基准测试里用 `getSnapshot` 时一直读到旧缓存，返回 0 个文件。
- 2026-11-01：Review 的 git 后台线程（`ReviewGitWorkerClient`）保留。它是首次请求时才启动的，删监听后只承担用户触发的 diff 解析和 `cat-file`，这两项放主进程会卡界面。

## 暂停的计划

[Chrome 扩展连接、启动与使用体验闭环](../20260928-chrome-connect-experience.md) 与 P6 方向冲突，随本计划暂停；是否删除由用户决定。
