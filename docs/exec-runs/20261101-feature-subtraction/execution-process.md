# 架构优化（功能减法 + 插件结构） — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261101-feature-subtraction/README.md`（P1–P5）、`docs/exec-plans/active/20261101-plugin-structure/README.md`（S1–S4）
- **执行模式**：连续执行（用户 2026-11-01 同意两步一起做完；每个子计划本地提交一次，不推送）
- **开始时间**：2026-11-01
- **结束时间**：进行中

## 执行时间线

### 基线

- **操作**：在 `18155df5`（只含设计与计划文档）上跑统一验证命令，记录已知失败。
- **验证**：见下方“基线结果”。

#### 基线结果

前提：desktop / client 的测试和类型检查依赖包的构建产物，先跑 `pnpm --filter @actspace/desktop build:deps:dev`。没有构建产物时这三项会报 “Cannot find module '@actspace/shared'”，不是代码问题。

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过 |
| `pnpm --filter @actspace/client test` | 通过 |
| `pnpm --filter @actspace/desktop test` | 通过 |
| `pnpm --filter @actspace/desktop typecheck` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm --filter @actspace/runtime test` | 通过 |
| `pnpm check:ipc-channels` / `check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` | 通过 |
| `pnpm check:packages` / `check:desktop-build-graph` | 通过 |
| `pnpm test:contract-matrix` | **已知失败**：`agent-contract-matrix.generated.md` 在 main 上已过期（S1 会重新生成） |
| `pnpm check:current-docs` | **已知失败**：363 条，全部在 `docs/exec-runs/`（不进 git 的截图和 `tmp/` 链接） |

### P1 删除「转成可视化 HTML」

- **操作**：按 `p1-visualize-removal.md` 删除整个功能。
  - 删整文件 3 个：`fixed-renderer-visualization.ts`、`ReplyHtmlRenderView.tsx`、`api/visualize.ts`。
  - 契约：`contract.visualize`、`fixed-renderer.ts` 的 `visualizeReply` / `listVisualizations` channel 常量、`ipc.ts` 里五个类型、main 的两个 handler。
  - renderer：`TurnActions` 去掉可视化按钮、状态机和「重新生成可视化」菜单项（`useRightPanel`、`useRef` 等随之变成未使用的 import，一并删）；`RightPanel` 去掉 `replyHtml` 分支和启动页入口；`RightPanelObjectMenu`、`RightPanelContext` 去掉 Reply；mock、`session-background-runs` fixture 去掉 `visualize`。
  - 测试：`conversation-view-tooltip.test.tsx` 删 2 个可视化用例；10 个 App 级测试的 bridge stub 删 `visualize.*`；`chat-presentation-recovery.test.tsx` 的「+」菜单项断言去掉「可视化回复」。
  - 文档：右侧面板规范删「Reply 视图」「消息可视化转换」并把入口数改为四个；工作台布局规范、存储与观测、icon-button、基础组件封装、tech-debt-tracker、`desktop-frontend-refactor/04、05` 里的相关引用同步改；`feature-release-notes.md` 新增 2026-11-01 条目（只能用「改进」分类）；新增 `docs/histories/2026-11/20261101-1600-remove-visualize-reply.md`。
- **影响文件**：删 3 个；改约 38 个。`apps/desktop/tsconfig.electron.json` 是 glob 白名单，没有 `fixed-renderer-visualization.ts` 的条目，无需改；没有 `guards.ts` 条目。
- **决定**：
  - `scripts/native-button-baseline.json` 除了删 `ReplyHtmlRenderView.tsx` 一行，还把 `TurnActions.tsx` 从 3 收紧到 2（检查脚本提示；删按钮后原生 button 少了一个）。`PurposePicker.tsx` 的同类提示在本任务之前就有，不动。
  - 新建 `docs/histories/2026-11/` 目录（此前没有 11 月目录）。
  - Space 演示里的 mock「可视化回复」标签（`components/space/model/selectors.ts`、`panel-kind-icons.tsx`、`SpaceReviewView.tsx`、`space-panel.test.tsx`）不动，遵循 README 实施细节第 6 条「Space 演示不动」。
  - `registry.completeText`、`HtmlRenderView.tsx` 保留（后者 P3 处理）。
- **验证**（先跑 `pnpm --filter @actspace/desktop build:deps:dev`）：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过（181） |
| `pnpm --filter @actspace/client test` | 通过（56） |
| `pnpm --filter @actspace/desktop test` | 通过（264 文件，2084 用例；首次跑有 1 个失败，见「遇到的问题」） |
| `pnpm --filter @actspace/desktop typecheck` | 通过 |
| `pnpm check:ipc-channels` | 通过（契约 153 个 channel） |
| `pnpm check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` | 通过 |
| `pnpm check:docs` / `check:current-docs` | 仍是 363 条已知失败，全部在 `docs/exec-runs/`，无新增 |
| `pnpm --filter @actspace/site test`（更新日志解析） | 通过（31） |
| 残留检查：对 `apps/desktop/src`、`packages/shared/src` grep `visualiz`、`replyHtml`、`ReplyHtml` | 无命中 |

## 遇到的问题

- P1：计划没列 `chat-presentation-recovery.test.tsx`，它断言「+」菜单项等于 `["可视化回复", "上下文"]`，删入口后失败，已改为 `["上下文"]`。另有 `RightPanel.tsx`、`RightPanelObjectMenu.tsx` 里提到 Reply / 可视化回复的注释和提示文字，一并改掉。

## 跳过或推迟的事项

- P1：Space 演示里的 mock「可视化回复」标签留待 Space 演示后续处理（见 P1 决定）。磁盘上旧的 `visualizations.json` 不读不删。
