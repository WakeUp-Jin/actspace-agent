# Workspace 侧边栏操作与会话 Tooltip 执行计划

## 目标

让用户可以直接从左侧 Workspace 文件夹打开 Cursor、安全归档该 Workspace 的全部会话、或将该 Workspace 从侧边栏隐藏；同时在会话行 hover/focus 时展示完整会话名和 Workspace 绝对路径。

## 范围

- 包含：
  - Workspace 文件夹名称点击/右键菜单，顺序为 `Open in IDE` / `Archive All` / `Remove from Sidebar`。
  - `Open in IDE` 的 main-owned 路径解析、目录校验和 Cursor 打开链路。
  - Workspace 级批量归档，含 active session 导航落点、busy 禁用和部分失败结果。
  - Workspace registry 持久化 `hidden`，侧边栏和 Pinned 共同过滤，重新选择同路径时恢复。
  - 会话行两行 Tooltip：完整标题 + 完整 Workspace 路径。
  - shared / preload / renderer 契约、定向测试、设计文档同步和 history。
- 不包含：
  - Workspace 重命名、拖拽排序、会话跨 Workspace 迁移。
  - IDE 选择设置；首版固定打开 Cursor。
  - 隐藏 Workspace 管理页；首版通过重新选择同一目录恢复。
  - 删除任何 Workspace 文件或 session 数据。

## 背景

- 相关文档：
  - `docs/design-docs/frontend/front-左侧会话栏规范.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/SECURITY.md`
- 相关代码路径：
  - `packages/shared/src/ipc.ts`
  - `packages/desktop/src/main/workspace-registry-service.ts`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/preload/index.ts`
  - `packages/desktop/src/global.d.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
- 已知约束：
  - renderer 不能直接打开路径；main 必须通过 registry 的 `workspaceId` 重新解析。
  - 现有单会话操作禁止归档 active session；Workspace 批量归档必须先创建或切换导航落点。
  - registry 当前会从 session `workspaceRoot` 反向合并；hidden 状态必须在合并时保留。
  - 颜色只消费现有语义 token，并验证浅/深主题。

## 风险

- 风险：批量归档中途失败导致部分成功。
  - 缓解方式：main 按 session id 返回成功/失败集合，renderer 只在批处理结束后刷新一次。
- 风险：隐藏后因 session 反向合并立即重现。
  - 缓解方式：`hidden` 是 registry 条目属性，合并只补新路径，不改写已有条目的 visibility。
- 风险：隐藏 active Workspace 后中间区仍指向不可见会话。
  - 缓解方式：隐藏前先切换到其他可见会话，否则在 Default workspace 创建新会话。
- 风险：菜单与 Tooltip 同时出现或被 sidebar overflow 截断。
  - 缓解方式：使用 Portal/collision-aware primitive，菜单打开和 rename 状态显式关闭 Tooltip。

## 里程碑

1. 锁定 shared IPC 和 Workspace registry visibility 契约，并用 service 测试验证隐藏/恢复/反向合并。
2. 实现 main/preload 的 Open in IDE、批量归档与 visibility IPC，补安全校验测试。
3. 实现 App 的 active session 导航落点和侧边栏过滤，实现 Workspace 菜单与会话 Tooltip。
4. 补 renderer 交互测试、更新设计文档实现状态、记录 history。
5. 串行构建 shared 产物后执行定向测试、typecheck、build 和主题检查。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/desktop test -- workspace-registry-service sidebar app-session-actions`
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop build`
  - `pnpm check:frontend-theme`
  - 视改动范围和失败情况再补 `pnpm run ci`
- 手工检查：
  - 文件夹箭头只折叠，名称点击/右键打开同一菜单，`+` 仍新建 Agent。
  - 菜单浅色/深色主题、键盘 focus、Escape 回焦和边界 collision 正常。
  - 会话 Tooltip 显示完整标题与绝对路径，右键菜单/重命名时不重叠。
- 观测检查：
  - Electron 中 `Open in IDE` 打开正确 Workspace 目录。
  - 重启应用后 hidden Workspace 仍不可见；重新选择同目录后恢复。
  - `Archive All` 后 Archived Chats 可恢复，busy Workspace 不可批量归档。

## 进度记录

- [x] 设计规范获得用户批准。
- [x] 完成 shared 和 Workspace registry 契约。
- [x] 完成 main/preload IPC。
- [x] 完成 App 与 Sidebar 交互。
- [x] 完成测试、文档与 history。
- [x] 完成全部自动验证并移入 `completed/`。

## 决策记录

- 2026-07-29：Workspace 行分为左侧折叠、中间菜单、右侧新建三个独立命中区，避免单个点击同时承担导航和管理语义。
- 2026-07-29：`Remove from Sidebar` 建模为持久化 hidden，不删除 registry/session/本地文件；重新选择同路径是首版恢复入口。
- 2026-07-29：会话 Tooltip 严格保持两行，不复用旧的重型 session preview 契约。
- 2026-07-29：实现完成并通过 shared/agent-core 构建、desktop typecheck/build、541 个桌面端测试与主题契约检查。
- 2026-07-29：真实 Electron 验收暴露启动期两个 `workspace:list` 争用固定 `.tmp`；移除重复首屏读取，并将 registry 完整读改写串行化、临时文件唯一化，新增并发回归测试。
- 2026-07-29：通过 `pnpm dev:log` 和 Computer Use 复验开发版 Electron，Workspace/session 恢复正常，菜单和 Tooltip 可用，启动日志不再出现 registry rename `ENOENT`。
- 2026-07-29：参考 Cursor，将完整会话行作为 Tooltip 定位锚点，浮层左边缘保持在 Sidebar 分割线右侧 8px；本次对齐调整按用户要求只做自动验证，视觉由用户验收。
