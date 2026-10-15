# 默认工作区改为首次启动兜底 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261015-default-workspace-first-run.md`
- **执行过程**：`docs/exec-runs/20261015-default-workspace-first-run/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（未提交，分支 `fix/session-default`）；Electron 实机验收待做

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 去掉特殊的默认工作区类型 | `packages/shared/src/ipc.ts` | `kind` 只剩 `folder`，没有 `defaultWorkspaceId` |
| 首次启动兜底 | `main/workspace-registry-service.ts`、`main/index.ts` | registry（含已隐藏）为空才建 `~/Documents/ActSpace/default-workspace`，登记为普通工作区「默认工作区」；建目录失败只记日志；旧 Downloads 默认项读取时丢弃 |
| 不再静默回退 | `main/workspace-access.ts`、`workspace-registry-service.ts` | 没传工作区的选择/访问直接拒绝 |
| 兜底工作区 = 最近活跃的可见工作区 | `renderer/App.tsx` | 替换原来的 `bootstrapState.workspaceRoot` |
| 没有工作区时不能发送 | `target/readiness.ts`、`Composer.tsx`、`composer-run-context.ts` | readiness `workspace-required`，提示「请先选择工作区」 |
| 移除/归档不再建空会话 | `renderer/App.tsx` | 没有可切会话时回到新建会话页 |
| 默认工作区可移除；旧会话不显示 | `Sidebar.tsx`、`sidebar/*`、`quick-open-routing.ts`、`ShortcutSettings.tsx` | 没有路径也匹配不到工作区的本地会话不显示 |
| 工作区列表不等会话目录 | `renderer/App.tsx` | 目录重建期间也能发送 |
| 侧栏不把已移除的工作区加回来 | `renderer/App.tsx` | 分页列表分组过滤已隐藏工作区 |
| mock 场景 | `mock/scenarios/{empty,index}.ts` | 新增 `?mock=no-workspace` |

## 人工验证指引

### 必须验证

1. **全新安装首启**
   - 验证方式：用一个空的数据目录启动 Electron（或临时挪走 `workspaces.json`，且没有任何会话）。
   - 预期结果：`~/Documents/ActSpace/default-workspace` 被创建；侧栏只有「默认工作区」；直接输入就能发送。
2. **升级现有数据**
   - 验证方式：用现有数据目录启动。
   - 预期结果：Downloads 的「Default workspace」不再出现（除非还有 Downloads 下的会话，那时它作为普通工作区出现）；已有工作区存在时不会新建默认工作区；没有路径的旧会话不显示。
3. **移除最后一个工作区**
   - 验证方式：在侧栏把所有工作区都「从侧栏移除」，然后重启。
   - 预期结果：回到新建会话页，侧栏工作区区域为空，发送按钮禁用并提示「请先选择工作区」；重启后不会自动重建默认工作区；在 Composer 选一个文件夹后可以发送。

### 建议验证

1. **移除当前会话所在的工作区**
   - 预期结果：有别的工作区会话时切过去；没有时回到新建会话页，不产生空会话。

## Agent 已完成的验证

- `pnpm typecheck`（desktop，两份 tsconfig）：通过。
- `npx vitest run`（apps/desktop）：233 个文件 / 1884 条通过，7 条跳过（既有）。
- `check:frontend-tokens`、`check:frontend-theme`、`check:ipc-channels`、`check:renderer-bridge`、`check:packages`、`check:desktop-build-graph`、`check:docs`、`check:current-docs`：通过。
- 浏览器 mock（headless Chromium）：`?mock=no-workspace` 发送被拦截并提示「请先选择工作区」；`?mock=empty` 可发送，移除唯一工作区后回到新建会话页、侧栏无残留文件夹、发送被拦截；无页面错误。

## 已知风险和遗留事项

- 只在 Downloads 下有会话的升级用户：启动时 registry 先为空，会建「默认工作区」；之后后台发现会话时 Downloads 作为普通工作区补回，结果是两个工作区。已接受。
- 打包版 Host 级 `roots.workspaceRoot` 现在指向新目录，升级用户可能不存在；如实机发现有依赖，再在启动时补 `mkdir`。
- 本机 Chat 形态不显示工作区行；没有工作区时只能从发送按钮提示看到原因。
- 用户本地旧会话数据未清理，按约定另行确认后手动处理。

## 后续建议

- Electron 实机验收通过后提交。
