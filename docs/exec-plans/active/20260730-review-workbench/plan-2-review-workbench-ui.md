# Plan 2：Review Workbench UI

> 状态：已完成；核心 Electron 交互验收通过，等待用户继续做主题与 mutation 验收。

## 目标

在右侧对象 Tab 内提供紧凑、真实、可操作的 Git Review UI，同时保持聊天和左侧导航可用。

## 交付

- Scope menu：Last Turn、Uncommitted、Unstaged、Staged、Committed、Branch。
- Branch 子菜单异步读取有 upstream 的本地分支，展示 ahead/behind。
- 单行 toolbar：scope、非零 totals、options、collapse/expand、jump、diff mode、files、Commit or push。
- Branch metadata 行：`local → upstream`。
- totals 分别按正数渲染；不出现 `+0`、`-0`。
- Review Options：Refresh、word wrap、full files、rich preview、word diff、white space、copy git apply。
- Changed Files 在 `>= 560px` Review 容器中右侧停靠，在更窄容器中切换为独占文件列表；不使用覆盖中间 Diff 的遮罩。
- split diff 在 Review 容器 `>= 640px` 时开放；响应式不读取整个窗口宽度。
- toolbar 内的 Scope、Options、Jump、Commit 菜单使用顶层 portal，避免被横向滚动容器裁切。
- 空 snapshot 或宽度不足时，Expand、Jump、Files、split 显示明确 disabled 状态。
- Review Tab 关闭由对象 Tab chrome 负责。
- unified/split、图片预览、viewed、context expansion 和 mutation actions。
- 不展示 AI Review、Review activity、findings、行级 Agent 评论或重复关闭按钮。

## 验证

- Renderer test 覆盖六 scope、Options portal、零值隐藏、Files 停靠/390px 独占布局、空态 disabled、workspace 切换、AI Review 不存在、聊天与 Review 共存。
- Computer Use 真实 Electron 已确认 Scope、Options、Expand、Jump、Files、Commit 菜单可点击，620px Files 停靠不遮挡 Diff，Branch 展示 `main → origin/main`。
- 浅色/深色主题、390px 真实 Electron 和 disposable mutation 继续由用户手动验收。
