# Workspace、Git Branch 与 Worktree 执行上下文计划

## 目标

把初始 Composer 当前静态的 Workspace / `main` / `Local` 展示升级为一条真实、可恢复的本机执行上下文链路：用户可以选择最近 Workspace、选择本地 Git branch、使用 `This Mac` 或在首次发送时创建隔离 Worktree；成功创建后在消息流展示可恢复的 `Created worktree` 事件，并在会话状态行持续显示真实 branch 与运行位置。

设计事实来源：`docs/design-docs/frontend/front-workspace-git-worktree-context.md`。

## 范围

- 包含：
  - Workspace Recents、Use Existing、New Folder 菜单交互。
  - Git repository 状态、当前 branch、本地 branch 列表和安全 branch switch。
  - `Local` 文案统一迁移为 `This Mac`。
  - Cloud、Remote SSH 禁用占位和可访问说明。
  - 延迟创建 `actspace/<8位数字>` task branch 与本机 worktree。
  - Session worktree metadata、workspace preparation stream/session event。
  - `Creating worktree...`、`Created worktree` 和 follow-up Worktree 状态展示。
  - 非 Git、Git 缺失、脏目录、branch/path 冲突和创建失败恢复。
  - Shared、main、preload、renderer、Agent turn 对接、自动化测试、设计文档、history 和分层验收。
- 不包含：
  - Cloud Runner、Remote SSH、远端仓库浏览、clone、fetch 或 workspace 上传。
  - Remote branches、commit、merge、rebase、push、pull 和冲突解决 UI。
  - 自动 stash、force switch、复制未提交文件、`.env` 或安装依赖。
  - Worktree 删除、归档联动清理、批量管理页和可编辑 branch slug。
  - 改变宽窗 Workbench 布局、Composer 模型/附件/Context 行为或现有 Review scope。

## 开始实施前必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-全局视觉语言规范.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-基础组件封装规范.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/frontend/front-workspace-git-worktree-context.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
- 改完代码前读取 `docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`；如果满足学习沉淀标准，再读取 `docs/learnings/WRITING_GUIDE.md`。

## 当前实现基线

- `packages/desktop/src/renderer/components/Composer.tsx`
  - 已有三个 initial context selector，但 branch 固定为 `main`，runtime 固定为 `Local`。
  - Workspace 只渲染上层传入列表，菜单没有 Recents 分组、Use Existing 或 New Folder。
- `packages/desktop/src/renderer/App.tsx`
  - 已读取 workspace registry，并在发送时才把最终 Workspace 写入 Session。
  - 尚无 Git context、待选 branch、run location 或 worktree 创建状态。
- `packages/desktop/src/main/workspace-registry-service.ts`
  - 已负责长期 Workspace registry；本计划不得把临时 worktree 注册为顶层 Workspace。
- `packages/desktop/src/main/review-git-service.ts`
  - 已有 `execFile` Git runner、repository 检查和错误脱敏模式，可复用底层抽象，但 Review service 不应承担 branch/worktree 产品职责。
- `packages/shared/src/session.ts`
  - SessionMeta 只有 `workspaceId` / `workspaceRoot`，尚无 worktree metadata 或 workspace preparation event。
- `packages/desktop/src/main/agent-turn.ts`
  - Agent turn 从 SessionMeta 的 `workspaceRoot` 解析真实工具根；worktree 准备完成后应继续复用这条路径。

## 共享契约

### Git Context IPC

在 `packages/shared/src/ipc.ts` 定义结构化契约，名称在实施时保持统一：

```ts
type GitBranchItem = {
  name: string;
  current: boolean;
  checkedOutPath?: string;
};

type WorkspaceGitContext = {
  status: "ready" | "not_repository" | "no_head" | "git_not_found" | "failed";
  workspaceRoot: string;
  currentBranch?: string;
  detachedCommit?: string;
  headCommit?: string;
  branches: GitBranchItem[];
  error?: string;
};

type WorkspaceGitContextInput = {
  workspaceRoot?: string;
};
```

- `checkedOutPath` 表示该 branch 已被某个 worktree 占用，renderer 显示 `In use`。
- `not_repository` 与 `git_not_found` 必须分开，不能都转换成隐藏 Branch。
- 错误信息只包含可恢复的用户文案，不返回原始 stderr。

### Execution Context

```ts
type SessionRunLocation = "this_mac" | "worktree";

type PendingExecutionContext = {
  workspaceId?: string;
  sourceWorkspaceRoot: string;
  branch?: string;
  runLocation: SessionRunLocation;
};

type SessionWorktreeContext = {
  kind: "worktree";
  sourceWorkspaceRoot: string;
  workspaceRoot: string;
  baseBranch: string;
  branch: string;
  baseCommit: string;
  createdAt: string;
};
```

- `PendingExecutionContext` 只用于首条消息发送前的 renderer / IPC 输入，不直接持久化。
- `SessionWorktreeContext` 是完成后的会话事实，写入 `SessionMeta.worktree?`。
- 普通 This Mac 会话不写 `worktree`。

### Turn Preparation 与事件

```ts
type TurnExecutionContextInput = {
  runLocation: "this_mac" | "worktree";
  workspaceId?: string;
  sourceWorkspaceRoot: string;
  branch?: string;
};

type WorkspacePreparationResult =
  | { ok: true; context: SessionWorktreeContext; durationMs: number }
  | { ok: true; context?: undefined; workspaceRoot: string; branch?: string; durationMs: number }
  | {
      ok: false;
      error: "not_repository" | "no_head" | "branch_not_found" | "branch_conflict" |
        "path_conflict" | "git_not_found" | "command_failed" | "verification_failed";
      message: string;
    };
```

`RunTurnInput` 增加可选 `executionContext?: TurnExecutionContextInput`，只用于尚未产生首个 turn 的 Session。renderer 不调用独立的 branch switch / worktree create mutation IPC；main 在同一次 `agent:run-turn` 中完成准备和 Agent 启动，避免两次 IPC 之间留下半完成状态。

在 `SessionEventType` 增加 `workspace_preparation`，payload 只记录成功完成事实。在 `RuntimeStreamEvent` 增加 started / finished 事件，用于超过 300ms 时显示运行状态。创建失败发生在 user event 持久化前，renderer 保留输入并显示就近错误，不写伪完成事件。

## 状态与提交顺序

首条消息必须按以下顺序推进：

1. Renderer 校验存在 Workspace；如果 Git context 仍在 loading，禁用发送并显示轻量状态。
2. Renderer 调用一次 `agent:run-turn`，同时提交用户输入和 `executionContext`；输入在 main 返回准备成功前不清空。
3. `This Mac`：main 再检查 current branch；需要时执行安全 `git switch`。
4. `Worktree`：main 创建并校验 worktree，得到 `SessionWorktreeContext`。
5. 准备失败：不清空输入、不持久化 user message、不启动 Agent；焦点回到相关选择器或输入框。
6. 准备成功：main 更新 SessionMeta 的最终 execution root / worktree metadata。
7. Main 从更新后的 `SessionMeta.workspaceRoot` 构建 Agent dependencies。ContextManager 必须在本轮 `user_message` append 前完成历史恢复，否则 Agent.run 再注入用户输入时会形成重复消息。
8. 依赖创建成功后，以同一 turn 顺序 append `user_message` 和可选 `workspace_preparation` completed event，再进入 thinking / tools；renderer 展示顺序固定为 user -> workspace preparation -> agent process。

如果现有 `Composer.onSend` 同步清空输入无法满足失败恢复，应把首条发送改为可等待的 async contract；follow-up 发送行为保持现状。现有 renderer 若在 IPC 完成前乐观插入 streaming user block，需要为 preparation failure 回滚该临时块。

## 风险

- 风险：This Mac branch switch 修改用户原目录，且 working tree 可能有未提交改动。
  - 缓解：选择时不执行；首次发送时使用普通 `git switch`，让 Git 自己拒绝不安全切换；禁止 stash、force 和 discard，并保留输入。
- 风险：把 worktree 当成 Workspace 注册会污染 Recents、Sidebar 分组和长期身份。
  - 缓解：`workspaceId` 固定指向 source Workspace，worktree 只存在于 SessionMeta 和 execution root。
- 风险：分支已被其它 worktree 使用，或自动 branch/path 碰撞。
  - 缓解：读取 `git worktree list --porcelain`，生成前检查 ref/path，冲突时重新生成 8 位 id；不覆盖现有对象。
- 风险：创建命令成功但目标状态不完整。
  - 缓解：验证 branch、HEAD commit、common git dir；只有验证通过才更新 SessionMeta。失败清理只针对本次明确创建且未承载用户内容的目标。
- 风险：用户误以为未提交修改、`.env` 或依赖会进入 worktree。
  - 缓解：New Worktree 选择态和 Created worktree 详情明确 `Environment setup: none`，不声称复制环境。
- 风险：Session 输入清空早于执行上下文准备结果。
  - 缓解：首条发送改成 async acceptance；失败恢复原文本、附件、模型与选择器状态。
- 风险：新增事件破坏 session replay、selector exhaustive switch 或 Kairos 聚合。
  - 缓解：补 shared selector/replay 测试；未知或无关事件仍按既有兼容策略忽略。
- 风险：路径和 Git stderr 暴露本机隐私。
  - 缓解：UI 默认缩略路径；日志只记录必要路径和脱敏错误；不进入遥测或公开制品。

## 里程碑与任务

### 1. 共享类型与 Session 兼容

- 修改 `packages/shared/src/ipc.ts`：增加 Git context、branch、run location 和 worktree create 契约。
- 修改 `packages/shared/src/session.ts`：增加 `SessionWorktreeContext`、`SessionMeta.worktree?`、`workspace_preparation` event payload 和 runtime stream events。
- 修改 `packages/shared/src/index.ts` 或对应 barrel export，保证 desktop / agent-core 只从 `@actspace/shared` 消费。
- 修改 Agent Core session meta / selector 兼容逻辑，只新增可选字段，不批量迁移旧 Session。
- 测试：
  - `packages/shared/src/test/session-selectors.test.ts`
  - `packages/shared/src/test/session-transcript.test.ts`
  - `packages/agent-core/src/persistence/test/meta.test.ts`
  - `packages/agent-core/src/persistence/test/session-store.test.ts`
- 完成标准：旧 Session 无 worktree 字段仍可读取；新字段 round-trip；workspace preparation 不进入模型对话文本。

### 2. 专用 Git Execution Context Service

- 新增 `packages/desktop/src/main/workspace-git-context-service.ts`，不要继续扩大 `review-git-service.ts` 职责。
- 抽取或复用受控 Git runner：`execFile("git", ["-C", workspaceRoot, ...args])`、timeout、maxBuffer、missing Git 判断和错误脱敏。
- 实现：
  - repository / HEAD 检查。
  - 当前 branch 或 detached commit。
  - `for-each-ref` 本地 branch 列表。
  - `worktree list --porcelain` branch 占用映射。
  - This Mac 安全 branch switch。
  - `actspace/<8位数字>` 与 `<dataRoot>/worktrees/<id>/<repo>` 生成。
  - `git worktree add -b`、成功校验和最小失败清理。
- 测试新增 `packages/desktop/src/main/test/workspace-git-context-service.test.ts`，使用临时真实 Git repository 覆盖：
  - 非 Git、无 HEAD、detached HEAD。
  - branch 列表、当前项、其它 worktree 占用。
  - clean switch 成功、dirty switch 被 Git 拒绝且文件不变。
  - create 成功、branch conflict、path conflict、命令失败和校验失败。
  - Git missing 的注入 runner 分支。
- 完成标准：service 不通过 shell，不覆盖现有 path/ref，不修改不在请求范围内的文件。

### 3. IPC、Preload 与 Session 准备编排

- 修改 `packages/desktop/src/main/index.ts`：注册只读 `workspace:get-git-context`；branch switch 和 worktree create 不暴露成 renderer 可独立调用的 mutation IPC。
- 修改 `packages/desktop/src/preload/index.ts` 和 `packages/desktop/src/global.d.ts`：暴露严格类型 bridge。
- 修改 `RunTurnInput` 和 `packages/desktop/src/main/agent-turn.ts`，在同一次 `agent:run-turn` 内消费首条消息的 `executionContext`：
  - preparation 必须发生在 `user_message` append 和 Agent dependencies 构建之前。
  - preparation failure 返回结构化可恢复错误，不写 user event，不启动 Agent。
  - preparation success 后更新 meta，先创建 Agent dependencies，再 append `user_message` + 可选 `workspace_preparation`，避免上下文恢复重复读取本轮输入。
- 调整 Session 创建 / 更新路径：
  - Worktree 成功后写 `workspaceId`、worktree `workspaceRoot`、`SessionMeta.worktree`。
  - This Mac branch 成功后写真实 source Workspace root，并清除不适用的 worktree metadata。
- 运行中通过 `agent:stream` 或专用受控 stream 推送 workspace preparation started / finished；完成事件写入 session.jsonl。
- 测试 `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`、main 侧 `agent-turn` 测试和 session persistence 测试，锁定“失败不提交用户消息，成功后顺序为 user -> workspace preparation -> agent process”。
- 完成标准：renderer 不直接计算目标路径或执行 Git；SessionMeta 是 Agent turn 的 execution root 事实来源。

### 4. Workspace 菜单与目录动作

- 从 `packages/desktop/src/renderer/components/Composer.tsx` 提取初始执行上下文组件，例如 `components/composer/ExecutionContextSelectors.tsx`，避免继续扩大 Composer。
- Workspace menu：
  - Recents 首版最多 5 项，当前项勾选，路径缩略 + tooltip。
  - Use Existing 调用现有 directory picker，选择后注册 / 选择但不立即提交 Session。
  - New Folder 新增 main IPC，校验 folder name、创建目录、注册并选择。
  - worktree paths 不进入菜单或 registry。
- App 层维护 selected Workspace 和 recent order；若 registry 尚无最近使用字段，先给 `WorkspaceEntry` 增加可选 `lastOpenedAt` 或定义从本地会话更新时间派生的稳定规则，并在设计文档允许范围内选择单一事实来源。
- 测试：更新 `composer.test.tsx`、`app-streaming-user-message.test.tsx`、`workspace-registry-service.test.ts`。
- 完成标准：取消 picker 不改变状态；同路径不重复注册；新目录冲突不覆盖；菜单支持键盘操作。

### 5. Branch 与 Run on UI

- Workspace 变化时异步读取 Git context，使用 request id / abort 语义丢弃旧响应，避免快速切换 Workspace 时状态串线。
- Git ready + HEAD 存在时显示 Branch；非 Git 隐藏；Git missing / failed 显示就近错误和 retry。
- Branch menu 支持搜索、本地 branches、current check、detached 状态和 `In use` 提示。
- Run on menu：
  - `This Mac` 默认和可选。
  - Cloud / Remote SSH disabled + `Coming soon`。
  - New Worktree 在 Git ready 时可选；否则 disabled + `Requires Git`。
- 把所有用户可见 `Local` runtime 文案和相关测试更新为 `This Mac`；不要误改 localStorage、local update、local provider 等其它技术语义。
- 测试：`composer.test.tsx` 覆盖菜单互斥、loading、非 Git、错误、disabled、键盘和 600px selector row 行为。
- 完成标准：选择 branch / worktree 不立即写磁盘；三个入口在浅深主题与窄窗都可辨认。

### 6. 首条发送、Created Worktree 与状态行

- 首条发送支持等待 execution preparation；准备中禁用重复提交，但不清空输入。
- 增加 `WorkspacePreparationBlock` 或等价消息组件，渲染 running / completed：
  - running 延迟 300ms 出现。
  - completed 默认折叠，显示 base commit、任务 branch、缩略 path、`Environment setup: none` 和复制路径动作。
  - completed 使用中性样式；running 才使用 operational indicator。
- 修改 Session event -> MessageBlock selector，确保事件位于 user message 后、thinking/tools 前，并在重启恢复后一致。
- Follow-up 状态行：普通会话显示真实 branch + This Mac；worktree 显示 task branch + Worktree，tooltip 展示 source Workspace、base branch 和完整 path。
- 已产生 turn 的会话不允许切换 Workspace、branch 或 run location。
- 测试新增或更新：
  - `packages/shared/src/test/session-selectors.test.ts`
  - `packages/desktop/src/renderer/test/composer.test.tsx`
  - `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
  - 新的 `workspace-preparation-block.test.tsx`
  - `conversation-view-tooltip.test.tsx`
- 完成标准：创建失败保留输入；成功消息可恢复；状态行不显示硬编码 main / Local。

### 7. 文档、History 与验证收口

- 按最终实现同步：
  - `docs/design-docs/frontend/front-workspace-git-worktree-context.md`
  - `docs/design-docs/frontend/front-聊天输入框规范.md`
  - `docs/design-docs/core-storage-and-observability.md`
  - `docs/design-docs/agent-runtime/agent-turn-layers.md`，如果发送前 preparation 改变主链路。
  - `docs/ARCHITECTURE.md`，仅当导航或模块边界变化。
- 新增 `docs/histories/2026-07/<timestamp>-workspace-git-worktree-context.md`。
- 对照学习沉淀标准：本任务包含 Git worktree identity、长期 Workspace 与 execution root 分离、发送前事务式 preparation，预计满足至少两条；实现完成后读取 `docs/learnings/WRITING_GUIDE.md`，判断是否新增可迁移学习文档。
- 执行全部验证并把结果写入本计划进度记录；完成后移动到 `docs/exec-plans/completed/`。

## 验证方式

### 工程命令

按依赖顺序串行运行，避免 shared 产物陈旧：

```sh
pnpm --filter @actspace/shared build
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop exec vitest run src/main/test/workspace-registry-service.test.ts src/main/test/workspace-git-context-service.test.ts
pnpm --filter @actspace/desktop exec vitest run src/renderer/test/composer.test.tsx src/renderer/test/app-streaming-user-message.test.tsx src/renderer/test/conversation-view-tooltip.test.tsx src/renderer/test/workbench-responsive.test.tsx
pnpm --filter @actspace/shared exec vitest run src/test/session-selectors.test.ts src/test/session-transcript.test.ts
pnpm --filter @actspace/agent-core exec vitest run src/persistence/test/meta.test.ts src/persistence/test/session-store.test.ts
pnpm check:frontend-theme
pnpm check:docs
pnpm check:repo
pnpm build
```

如果相关测试文件最终名称不同，更新本计划为真实路径，不保留失效命令。

### 浏览器 Renderer 验证

- 使用 mock bridge 覆盖 Git、非 Git、detached、Git failure、worktree running / completed / failed。
- 在 `480 / 600 / 820 / 1120 / 1440px` 检查 initial context row、三个 popover、错误文案和 follow-up 状态行。
- 检查浅色与深色主题：selected、disabled、running、completed、error、focus 均可辨认。
- 使用键盘完成菜单打开、搜索、移动、选择和 Escape 返回。
- 检查 reduced motion 下 popover 与 running 状态没有必需动画依赖。

### Electron 真实验收

- Use Existing 选择真实目录并取消一次，确认取消不改变当前 Workspace。
- New Folder 创建真实空目录，确认不自动 Git init。
- 非 Git 项目不显示 Branch，New Worktree 显示 Requires Git。
- 干净 Git repo 选择其它 branch，发送后确认真实 checkout 与状态行一致。
- 有未提交修改时触发被 Git 拒绝的 switch，确认文件不变、输入保留、可切回当前 branch。
- 创建真实 worktree，检查：
  - 原始 Workspace 未切换 branch。
  - task branch 为 `actspace/<8位数字>`。
  - path 位于 ActSpace userData worktrees 目录。
  - Agent 工具 cwd / workspaceRoot 是 worktree path。
  - Created worktree 位于 user message 后、Thinking 前。
  - 重启应用后事件和状态行可恢复。
- 确认原目录 untracked `.env` 或测试文件不会被错误复制，并且 UI 已说明 `Environment setup: none`。

### 文件与 Git 观测

- 检查 `<dataRoot>/workspaces.json` 没有新增 worktree item。
- 检查 Session `meta.json`：`workspaceId` 是 source Workspace，`workspaceRoot` 是 worktree，`worktree` metadata 完整。
- 使用 `git worktree list --porcelain` 核对 path、branch 和 commit。
- 检查失败场景没有遗留半成品 branch/path；如果保留是为了安全恢复，错误必须明确列出恢复位置，不能静默遗留。

## 最小回退策略

- Shared 新字段全部可选；回退 renderer 或 main 时旧 Session 仍按普通 Workspace 读取。
- 如果 worktree 创建链路不稳定，可以关闭 `New Worktree` 可用态并保留 `Coming soon` / disabled 展示，同时不影响 Workspace、Branch 只读检测和 This Mac。
- 如果安全 branch switch 尚未通过真实验收，Branch 菜单可先只读展示当前 branch；不得用强制切换绕过问题。
- 不通过删除用户 worktree、branch 或修改 working tree 来回退。所有清理必须基于本次创建记录和明确目标。

## 进度记录

- [x] 完成现有 Workspace registry、Composer 静态 selector、Git Review service 和 SessionMeta 调研。
- [x] 完成产品交互、数据边界、失败恢复和视觉规范。
- [x] 生成共享契约、main service、renderer、事件、测试和验收执行计划。
- [x] 完成共享契约与 Session 兼容。
- [x] 完成 Git execution context service。
- [x] 完成 IPC、preload 与发送前 preparation 编排。
- [x] 完成 Workspace / Branch / Run on UI。
- [x] 完成 Created worktree 与 follow-up 状态展示。
- [x] 完成自动化、文档、history 和学习沉淀验收，并在后续缺陷修复轮次完成 Electron 浅深主题与三个选择器真实验收。

### 验证结果（2026-07-29）

- `pnpm --filter @actspace/shared build`：通过。
- `pnpm --filter @actspace/agent-core build`：通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/shared test`：65/65 通过。
- `pnpm --filter @actspace/desktop test`：537/537 通过。
- worktree/Git/Composer/App streaming 针对性回归：65/65 通过。
- `pnpm check:docs`、`pnpm check:repo`、`git diff --check`：通过。
- `pnpm --filter @actspace/agent-core test`：本任务相关用例通过，但全量仍有 11 个既有失败；其中 10 个为 sandbox 下 Unix socket `listen EPERM`，另 1 个为 ToolManager 既有错误文案断言不一致，均未涉及本次改动文件。
- 初版按当轮约定未自动启动 Electron；后续 2026-07-29 缺陷修复轮次已补做真实 Electron 验收。

### 缺陷修复验证（2026-07-29）

- 修复初始选择器行 `overflow-x-auto` 同时裁剪纵向 popover 的问题；三个菜单改为从按钮下方 8px 展开。
- 修复固定 `workspaces.json.tmp` 在并发读取修复时发生 rename `ENOENT`，并防止并发路径注册丢失更新。
- `workspace-registry-service.test.ts` 与 `composer.test.tsx`：29/29 通过。
- Desktop typecheck、前端主题颜色契约、Desktop production build：通过。
- Electron 真实 DOM/命中验收：Workspace、Branch、Run on 均展开在视口内，菜单中心命中元素属于菜单；浅色背景条消失，深色 surface/token 翻转正常。

## 决策记录

- 2026-07-29：选择器语义固定为 `Workspace -> Branch -> Run on`；Branch 在 This Mac 下表示目标 checkout，在 Worktree 下表示 base branch。
- 2026-07-29：Workspace 和 branch 的选择在菜单阶段不修改磁盘，首次发送时再执行 main-side preparation。
- 2026-07-29：Worktree 分支使用 `actspace/<8位数字>`，目录使用 `<userData>/worktrees/<id>/<repo>`。
- 2026-07-29：Worktree Session 的 `workspaceId` 保留 source Workspace 身份，`workspaceRoot` 表示真实 execution root；worktree 不写入 registry。
- 2026-07-29：只有成功的 workspace preparation 写入 SessionEvent；失败保留 Composer 输入并就近显示，不制造失败的已发送 turn。
- 2026-07-29：V1 不自动清理 worktree、不复制未提交内容、不安装依赖；Cloud 和 Remote SSH 只保留禁用入口。
- 2026-07-29：ContextManager 必须在本轮 user event append 前恢复历史；因此顺序收口为 prepare/update meta -> create deps -> append user/preparation -> Agent.run。
- 2026-07-29：提交用户消息前的失败会回滚本次 branch switch 或生成 worktree；一旦 user/preparation 成功落盘，不再回滚已成为 Session 事实的执行上下文。
