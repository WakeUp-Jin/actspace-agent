# 修复无首次提交仓库的首轮发送

## 用户诉求

新建会话绑定一个已经初始化并暂存文件、但尚无首次提交的 Git repository 时，首次发送会短暂闪动后消失。该仓库应继续显示当前 `main` 分支，并允许通过 `This Mac` 运行。

## 主要改动

- Git Context 在 `HEAD` 不存在时仍读取 symbolic branch，并把 `main` 作为当前分支返回。
- `This Mac` 对 unborn repository 原位放行；`New Worktree` 继续要求有效 commit，入口明确显示 `Requires commit`。
- Renderer 在 Turn 抛错后读取 Session 事件判断本轮输入是否已经持久化：未持久化则恢复输入、附件和错误，已持久化则恢复 Session，避免重复消息。
- 增加 Git service、Composer 和首次发送失败恢复的回归测试。

## 设计动机

Git 的 symbolic branch、branch ref、Index 和 commit 是不同状态。原位执行不依赖 commit，不应被 Worktree 的基线要求阻断；同时，`turn_started` 只表示 Runtime 已开始处理，不能代表 user event 已经落盘。

## 关键文件

- `packages/desktop/src/main/workspace-git-context-service.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `docs/design-docs/frontend/front-workspace-git-worktree-context.md`
