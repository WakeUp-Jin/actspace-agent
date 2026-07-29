## [2026-07-29 15:15] | Task: 完善 Workspace Git 与 Worktree 执行上下文

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop / local worktree`

### 📥 User Query

> 完善聊天首屏的 Workspace、Branch、This Mac 与 New Worktree 选择，并在创建 worktree 后给出比 Cursor 更明确的提示。

### 🛠 Changes Overview

**Scope:** `shared`、`agent-core`、`desktop`、前端与设计文档

**Key Actions:**

- **执行上下文契约**: 增加 Git context、首轮 execution context、worktree metadata 与 preparation stream/session event。
- **Git/worktree 服务**: Main 进程只通过参数化 Git 命令检查分支、切换 checkout、创建并验证隔离 worktree，失败时清理生成物。
- **首轮事务编排**: preparation 在用户消息落盘前完成；成功后用最终 execution root 构建 Agent，再持久化用户消息和准备记录。
- **Composer UI**: Workspace 菜单提供 Recents、Use Existing、New Folder；非 Git 项目隐藏 Branch；Local 改为 This Mac；Cloud/Remote SSH 为禁用占位；Git 项目可选 New Worktree。
- **可见反馈**: 对话流显示 Creating/Created worktree、生成分支、目录、base commit 与未自动配置环境的提示；准备失败恢复草稿和附件。

### 🧠 Design Intent (Why)

把用户长期选择的 Workspace 与本轮实际执行目录分开建模，避免 worktree 污染 Recents，同时让所有工具在 Agent 创建前就绑定到确定且经过验证的 execution root。首轮准备与用户消息提交保持事务边界，失败不会留下伪对话或半成品 worktree。

### 📁 Files Modified

- `packages/desktop/src/main/workspace-git-context-service.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/frontend/front-workspace-git-worktree-context.md`

## [2026-07-29 21:29] | Follow-up: 修复选择器弹层与 Workspace Registry 并发竞争

### 📥 User Query

> 初始 Composer 顶部出现轻微暗色背景，Workspace、Branch、This Mac 点击后看不到菜单，同时开发日志出现 `workspaces.json.tmp` rename `ENOENT`。

### 🛠 Changes Overview

- **Popover 可见性**: 初始执行上下文菜单改为从触发按钮下方展开；选择器行移除滚动裁剪并在窄窗换行。
- **紧凑 Recents**: Workspace 菜单限制为 5 条长期 Workspace，同时保留 Use Existing 和 New Folder。
- **Registry 并发安全**: 读取修复、路径注册按完整事务串行化；原子写使用唯一临时文件并清理残留。
- **回归保护**: 增加并发 registry 读写测试，以及三个初始菜单定位/内容测试。
- **真实验收**: production build 后启动 Electron，验证浅色、深色主题与三个菜单的实际命中区域。

### 🧠 Design Intent (Why)

横向 `overflow-auto` 会连带建立纵向裁剪区域，绝对定位的菜单虽然存在却无法被看到或点击。JSON 原子 rename 只保证单次替换完整，不会自动解决多个 read-modify-write 事务之间的竞争；因此需要同时处理布局裁剪、唯一临时文件与事务串行化。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/desktop/src/main/workspace-registry-service.ts`
- `packages/desktop/src/main/test/workspace-registry-service.test.ts`
- `docs/design-docs/frontend/front-workspace-git-worktree-context.md`
