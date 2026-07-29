# Workspace 侧边栏操作与会话 Tooltip

## 用户诉求

- Workspace 文件夹可点击，交互参考 Cursor，提供 `Open in IDE`、`Archive All` 和 `Remove from Sidebar`。
- 会话行 hover 时显示完整会话名称和文件夹路径。

## 主要改动

- Workspace 行拆成三个独立命中区：左侧折叠、中间操作菜单、右侧新建 Agent。
- 增加 Workspace 主题感知菜单，支持鼠标、右键、键盘方向键、Escape 回焦和 Portal 边界适配。
- `Open in IDE` 只向 main 传递 `workspaceId`，main 从 registry 解析并校验本地目录后打开 Cursor。
- `Archive All` 使用 Workspace 会话快照，包含 Pinned 会话；busy/待审批时禁用，active session 先切换或创建导航落点，main 返回成功/失败 id 集合。
- `Remove from Sidebar` 通过 `WorkspaceEntry.hidden` 持久化隐藏，不删除本地文件或 session；重新选择同路径会恢复。
- 会话行增加轻量两行 Tooltip，只显示完整标题和完整 Workspace 路径，不触发会话预览读取。
- 按 Cursor 的空间关系修正 Tooltip 锚点：从标题按钮扩大到完整会话行，使浮层沿 Sidebar 右侧分割线对齐并保留 8px 间距。
- 修复真实 Electron 启动期的 Workspace registry 并发竞争：移除重复的首屏读取，完整读改写按数据目录串行化，并使用唯一临时文件原子替换。

## 设计动机

- 导航、管理和新建操作使用不同命中区，避免文件夹名称点击语义不清。
- Workspace 隐藏建模为可恢复的 registry visibility，而不是删除数据或依赖前端临时过滤。
- 外部程序启动保持 main-owned，避免 renderer 直接指定任意本机路径。
- registry reconciliation 本质上也是写操作；只更换临时文件名不能防止旧快照覆盖，因此串行化边界覆盖读取、合并和落盘全过程。

## 关键文件

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/main/workspace-registry-service.ts`
- `packages/desktop/src/main/workspace-ide-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/shared/src/ipc.ts`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`

## 验证

- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/agent-core build`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test -- sidebar workspace-registry-service workspace-ide-service app-session-actions`
  - Vitest 实际运行桌面端全套：67 个测试文件，541 个测试全部通过。
- `pnpm --filter @actspace/desktop build`
- `pnpm check:frontend-theme`
- `git diff --check`
- `pnpm dev:log` + Computer Use：开发版 Electron 正常恢复 Workspace 和会话，不再出现 `workspaces.json.tmp` rename `ENOENT`；菜单三项与会话标题/路径 Tooltip 均通过真实界面验收。
- 后续 Tooltip 右边线对齐调整按用户要求只做自动测试，不再操作 Electron；最终视觉位置由用户验收。

## 学习沉淀判断

本轮同时命中可迁移、设计模式和易踩坑三项：registry reconciliation 会让临时过滤失效，隐藏当前导航对象还需要先建立可见落点。已沉淀到 `docs/learnings/2026-07/recoverable-visibility-needs-persistent-state.md`。
