# Plan 4：集成、验收与文档

> 状态：自动化、文档与核心 Electron 交互验收完成；主题、mutation 与远端验收待执行。

## 自动化门槛

- Shared contract、settings 和 session selector tests。
- Desktop Git engine、Coordinator、viewed sidecar、settings/model store 和 right-panel Review tests。
- Shared/agent-core build、desktop typecheck。
- Frontend theme check、`git diff --check`。

## 手动 Electron 验收

1. Review 在右侧 Tab 打开，聊天和左栏不消失。
2. Toolbar actions 位于同一行；没有 AI Review 和重复关闭按钮。
3. 零统计不显示。
4. Branch 子菜单展示真实本地分支及 upstream，主区显示 `local → upstream`。
5. Options 每项可点击并产生真实变化。
6. Files 在宽面板右侧停靠、窄面板独占内容区；jump、unified/split、图片预览和 viewed 可用。
7. 浅色、深色和窄面板无点击遮挡或横向布局破坏。

已通过 Computer Use 验收第 1–6 项中的核心命中与布局路径：Scope、Options、Expand/Collapse、Jump、Files、Commit 菜单均可点击，620px Files 停靠不遮挡 Diff，Branch 显示真实 upstream。主题、390px 真实窗口、图片和 mutation 仍保留为后续人工边界。

## Disposable repo 验收

- unstaged/staged/uncommitted/commit/branch 数据正确。
- stage/unstage/revert 修改真实 index/working tree。
- Copy git apply command 能在另一份 checkout 应用；包含 untracked 时明确拒绝。
- Commit/Push 失败分阶段表达，不丢失已成功的本地 commit。

## 真实远端边界

- Review 不自动 fetch。
- Push/Create PR 需要用户显式执行并单独记录结果。
- 自动化通过不等于真实 GitHub remote 验收通过。
