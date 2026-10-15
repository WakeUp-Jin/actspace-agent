# 默认工作区改为首次启动兜底

- 状态：已完成，未提交（分支 `fix/session-default`）；只剩 Electron 实机验收
- 执行记录：[执行过程](../../exec-runs/20261015-default-workspace-first-run/execution-process.md)、[执行摘要](../../exec-runs/20261015-default-workspace-first-run/execution-summary.md)
- 日期：2026-10-15
- 执行模式：交互模式

## 背景与已确认决策

原设计里「默认工作区」是 registry 里一条 `kind: "default"` 的特殊条目，路径是 `~/Downloads`，每次读取都会补回来，不能从侧栏移除；旧会话缺 `workspaceRoot` 时也归到它。隐藏/归档当前会话所在的工作区时，如果没有别的会话可切，会自动建一个空会话当落点。

参考 DeepSeek Harness、Codex、opencode 后，用户在 2026-10-15 确认：

1. 采用「首次启动兜底」（DSH 式）：只有 registry 里一个工作区都没有（含已隐藏）时，创建 `~/Documents/ActSpace/default-workspace` 并登记成**普通工作区**，名字「默认工作区」。
2. 默认工作区可以从侧栏移除，移除后不再自动重建；排序和其他工作区一样按最近活跃。
3. 用户把所有工作区都移除后，新建会话页不能发送，提示「请先选择工作区」，不偷偷再建默认工作区。
4. 升级时，旧的 `kind: "default"`（Downloads）条目从 registry 移除。用户还有别的工作区时不再新建默认工作区。
5. 兜底目录创建失败时不弹窗，用户手动选一个文件夹即可（与第 3 条同一状态）。
6. 不做欢迎页，保留现在的新建会话页。
7. 隐藏/归档工作区时不再自动建空会话，改为回到新建会话页。
8. 旧会话：代码里不写删除逻辑；缺 `workspaceRoot` 的旧会话不再显示在侧栏。用户本地的数据另行手动清理。

## 范围

做：

- `packages/shared/src/ipc.ts`：`WorkspaceEntry.kind` 只剩 `"folder"`；去掉 `WorkspaceRegistry.defaultWorkspaceId` 和 `default_workspace_required` 错误。
- `apps/desktop/src/main/index.ts`：`defaultWorkspaceRoot` 改为 `<Documents>/ActSpace/default-workspace`。
- `apps/desktop/src/main/workspace-registry-service.ts`：
  - sanitize 丢弃旧 `kind: "default"` 条目；不再因为缺默认项回退成 fallback；
  - 读取后 registry 为空时 `mkdir -p` 兜底目录并登记为普通条目（label「默认工作区」），失败只记日志；
  - 没传 workspace 的 `resolveWorkspaceSelection` 返回错误，不再回退默认项；
  - `setWorkspaceHidden` 不再拒绝隐藏默认项；排序不再置顶默认项。
- `apps/desktop/src/main/workspace-access.ts`：`resolveWorkspaceAccess` 不再回退 `defaultWorkspaceId`。
- Renderer：
  - `App.tsx`：兜底工作区从 `bootstrapState.workspaceRoot` 改为「registry 第一个可见工作区」；启动、隐藏、归档工作区不再自动建会话；去掉默认项特判。
  - `target/readiness.ts` + `Composer.tsx`：本机目标没有工作区时 readiness 为 `workspace-required`，发送按钮禁用并提示「请先选择工作区」。
  - `sidebar/session-grouping.ts`、`WorkspaceSection.tsx`、`quick-open-routing.ts`：去掉默认项特判；缺工作区的旧会话不显示。
  - mock 与测试夹具同步。
- 文档：`front-左侧会话栏规范.md` 对应条款、`FRONTEND_VERIFICATION.md` mock 场景表、history。
- 实施中补上：会话目录重建时工作区列表不再等它；分页列表分组过滤已移除的工作区（见执行摘要）。

不做：

- 欢迎页、首启引导。
- 删除用户会话数据的迁移逻辑。
- 远端 Host 工作区逻辑。
- Host 级 `roots.workspaceRoot`（运行时默认根）的语义；只是打包版的值随 `defaultWorkspaceRoot` 从 Downloads 变成新目录。

## 任务

| # | 任务 | 验证 |
|---|---|---|
| T1 | shared 类型收窄 | `pnpm --filter @actspace/desktop typecheck` 通过 |
| T2 | registry service 改造 + 单测（空 registry 建目录、旧 default 条目丢弃、可隐藏、不重建、mkdir 失败留空） | `workspace-registry-service` 相关测试通过 |
| T3 | workspace-access、index.ts 路径 | 相关 main 测试通过 |
| T4 | renderer 兜底工作区、隐藏/归档流程、readiness 拦截 | 相关 renderer 测试通过 |
| T5 | 侧栏分组、快速唤起、移除菜单 | `session-grouping`、`quick-open-routing` 测试通过 |
| T6 | mock/fixtures 同步；`pnpm check:frontend-tokens` 等前端检查 | desktop 测试全量通过（既有已知失败除外，需在摘要注明） |
| T7 | 文档与 history | 文档无旧描述残留 |

## 风险与回退

- 升级用户如果只有 Downloads 下的会话：首次读取时 registry 为空，会建默认工作区；之后读到会话时 Downloads 会作为普通工作区被补回。可接受，结果是两个普通工作区。
- Host 级 `roots.workspaceRoot` 在打包版指向的新目录可能不存在（升级用户不会自动创建）；若 Electron 实机发现依赖目录存在，再在启动时补 `mkdir`。
- 回退：整体 revert 本分支提交即可，registry 文件里新登记的条目是普通 `folder`，旧版本也能读。

## 验收

- 浏览器 mock（已完成）：空场景首启只有一个工作区；移除后侧栏无工作区、新建会话页发送禁用且提示「请先选择工作区」；隐藏当前会话所在工作区回到新建会话页。
- Electron 实机待用户验证：全新数据目录首启创建 `~/Documents/ActSpace/default-workspace`；升级数据目录 Downloads 默认项消失。
