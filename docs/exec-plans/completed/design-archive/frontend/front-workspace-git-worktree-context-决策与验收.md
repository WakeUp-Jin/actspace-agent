# Workspace / Git Branch / Worktree 执行上下文：决策与验收归档

归档：来自原《Workspace、Git Branch 与 Worktree 执行上下文规范》。现行规则见 `docs/design-docs/frontend/front-workspace-git-worktree-context.md`。本文保留尚未实现的「Created worktree」过程块设计、验收矩阵和已确认决策。

## Created Worktree 消息展示

以下过程块仍是展示目标。本轮B12完成目录创建、持久绑定与状态行恢复，未新增独立的准备事件或过程块。

Worktree 创建成功后，在当前 turn 的用户消息之后、Thinking 或工具过程之前显示一条可展开系统过程块：

```text
Created worktree
```

展开内容示例：

```text
Preparing worktree from main at a1b2c3d
Created branch actspace/92803054
Worktree created at .../worktrees/92803054/actspace-agent
Environment setup: none
```

- 默认折叠，只占一行；使用中性 completed 样式，不整块染绿。
- 支持复制完整路径；路径默认在视觉上缩略。
- 创建超过 `300ms` 时显示 `Creating worktree...` 运行状态。
- 运行状态可以使用克制的 operational indicator；完成后回到中性灰阶。
- 事件必须持久化，切换会话或重启后仍能恢复相同展示。
- `Environment setup: none` 明确表示 V1 不自动安装依赖或复制环境。

建议事件契约：

```ts
type WorkspacePreparationPayload = {
  kind: "worktree";
  status: "completed";
  sourceWorkspaceRoot: string;
  workspaceRoot: string;
  baseBranch: string;
  branch: string;
  baseCommit: string;
  durationMs: number;
  environmentSetup: "none";
};
```

运行中的短暂状态通过 runtime stream event 表达；只有完成事实进入 `sessions-v2/<sessionId>/journal.jsonl`。失败发生在消息正式提交前，走 Composer 就近错误，不写伪完成事件。

## 验收矩阵

| 场景 | 预期结果 |
| --- | --- |
| 普通 Git Workspace | 显示 Workspace、当前 branch、本机 |
| Git Workspace 尚无首次提交 | Branch 只显示 symbolic branch 名称；本机可运行；新建工作树禁用并显示「需要先创建提交」 |
| 非 Git Workspace | 隐藏 Branch；新建工作树禁用并说明「当前工作区不是可用的 Git 仓库」 |
| Git 缺失或检查失败 | 显示可恢复错误，不伪装成非 Git |
| 选择其它 branch 后取消 | 磁盘不发生变化 |
| This Mac 首次发送并成功切换 | Session 和状态行显示真实 branch |
| 脏目录阻止 branch switch | 保留输入，显示原因，可改用 New Worktree |
| New Worktree 首次发送成功 | 创建独立 branch/path，展示 Created worktree，再启动 Agent |
| Worktree 创建冲突 | 不覆盖已有内容，保留输入并给出重试路径 |
| 重启恢复 Worktree Session | 状态行与 Created worktree 事件保持一致 |
| 480px 窄窗 | 选择行按需换行，三个入口、菜单和远端机器子菜单都在窗口内 |
| 选远端 Host | 分支按钮消失；工作区列 Host 工作区；Host 未就绪时运行位置按钮带状态点和文案，发送禁用并说明原因 |
| 没有 Host | 运行位置菜单第二项为「连接远端机器…」，打开 设置 › Agent 服务器 |
| 对话中 | 状态行没有下拉；无法从任何入口切换机器 |
| 浅色 / 深色 | 边框、选中、disabled、running、error 均可辨认 |

## 已确认决策

- 2026-07-29：Workspace 菜单首版只保留 Recents、Use Existing 和 New Folder。
- 2026-07-29：非 Git 项目不显示 Branch 选择器。
- 2026-07-29：`Local` 统一改为 `This Mac`（界面文案「本机」）；Cloud 和 Remote SSH 只做禁用占位（2026-10-06 由 09 删除，换成「远端机器 ›」）。
- 2026-07-29：Worktree 在首次发送时延迟创建，不在选择菜单时立即落盘。
- 2026-07-29：自动分支使用 `actspace/<8位数字>`，不复用其它产品命名空间。
- 2026-07-29：ActSpace worktree 不进入 Workspace Recents；Session 保留原 Workspace 身份和独立 execution root。
- 2026-07-29：Worktree V1 不自动清理，不自动复制原目录未提交内容或环境。
- 2026-07-29：初始执行上下文菜单使用独立的向下展开定位，选择器行保持 overflow visible；Workspace Recents 首版限制为 5 项。（2026-10-06：菜单换成 `ui/Menu`，portal 到 body，不再依赖 overflow visible。）
- 2026-07-29：Workspace registry 的读取修复与路径注册按事务串行执行，每次原子写使用唯一临时文件，避免并发 rename 竞争和丢失更新。
- 2026-10-06：运行目标统一为 `RunTarget` + `capabilities` + `readiness`（计划 15）；远端会话的 `workspaceId` 和模型由 renderer 本地记录，不改 Host 协议；远端会话禁用新建工作树并说明原因。
- 2026-10-06：09 输入框优化：运行目标行改为三个无边框文字按钮和 `ui/Menu`；运行位置菜单为「本机 / 远端机器 › / 新建工作树」，Host ≥ 5 台时子菜单带搜索，无 Host 时为「连接远端机器…」；不可用的 Host 可选、发送按 readiness 禁用；对话中状态行只读。

