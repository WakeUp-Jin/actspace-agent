# 2026-07-29 Environment 与本地 Git 操作执行计划（已完成）

## 目标

在聊天态顶部实现可真实使用的编辑器选择器和 Environment 控制面：识别 This Mac / Git Worktree、展示未提交变更与当前分支、创建分支、提交当前 workspace 全部改动、按 upstream / remote 状态推送，并从当前会话提取 Sources。远程能力只到普通 Push，不实现 Pull Request。

本计划派生自 `docs/design-docs/frontend/front-environment-and-git-actions.md`。设计文档负责产品语义和长期边界，本计划负责具体文件、实现顺序、失败路径和验证方式。

## Required Reading

执行本计划前必须阅读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/frontend/front-environment-and-git-actions.md`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-基础组件封装规范.md`
- `docs/design-docs/frontend/front-icon-button-tooltip-guidelines.md`

## 范围

包含：

- `@actspace/shared` 新增 workspace environment、Git mutation、本机工具检测与打开的 IPC 契约。
- desktop main 新增 workspace environment service，受控执行 Git 状态读取、分支创建、全量 commit 和普通 push。
- desktop main 新增本机工具 service，检测并打开 VS Code、Cursor、Finder、Terminal 和 iTerm2。
- preload / `global.d.ts` 暴露最小类型化 API。
- renderer 顶栏新增编辑器分体按钮和 Environment popover。
- Create branch、Commit、Commit and push、Push、remote 选择的对话框 / 菜单状态。
- Sources 从当前 workspace 与用户消息附件中派生、去重和展开。
- Git mutation 完成后刷新 Environment、Composer Review summary，并让下一次 Review 打开读取新状态。
- main service、IPC bridge 和 renderer 关键交互测试。
- 同步前端设计文档、history；若学习沉淀门槛命中则补 learning。

不包含：

- Pull Request、Compare branch、远端 PR 检查。
- Pull、fetch、merge、rebase、force push。
- 分支切换、删除或重命名。
- 逐文件 stage / unstage、amend、跳过 hooks、签名选项。
- 自动生成 commit message。
- 新增或修改 remote、Git identity、credential helper、hooks。
- 在本任务执行期间对当前仓库做真实 commit 或 push。

## 已确认产品决定

- Commit 默认执行 `git add -A` 后 `git commit -m <message>`，包含 tracked、untracked 和 deleted changes；用户取消 `Include unstaged changes` 后只提交 staged changes。
- 普通目录 / 主工作树显示 `This Mac`；linked Git worktree 显示 `Worktree`。
- symbolic branch 存在时显示真实分支名；detached HEAD 显示 `Create branch`。
- Push 优先已有 upstream；无 upstream 时单 remote 自动选择，多 remote 必须选择，无 remote 明确失败。
- Commit and push 需要分别报告 commit 和 push 结果，不能因 push 失败掩盖本地 commit 已创建。
- 不实现 Pull Request。

## 契约设计

### Environment 查询

在 `packages/shared/src/ipc.ts` 新增：

```ts
type WorkspaceEnvironmentGetInput = { workspaceRoot?: string };

type WorkspaceEnvironmentSnapshot = {
  workspaceRoot: string;
  workspaceLabel: string;
  locationKind: "this_mac" | "worktree";
  git: {
    available: boolean;
    repository: boolean;
    branch?: string;
    detached: boolean;
    upstream?: string;
    remotes: string[];
  };
};
```

Changes 的文件数与 `+/-` 继续复用现有 `ReviewGetWorkspaceChangesResult` / renderer `reviewSummary`，避免引入第二套 diff 统计事实源。

### Git mutation

新增明确动作而不是 raw command：

```ts
type WorkspaceGitCreateBranchInput = { workspaceRoot?: string; branchName: string };
type WorkspaceGitCommitInput = {
  workspaceRoot?: string;
  message?: string;
  includeUnstagedChanges?: boolean;
  branchName?: string;
};
type WorkspaceGitPushInput = { workspaceRoot?: string; remote?: string };
type WorkspaceGitCommitAndPushInput = WorkspaceGitCommitInput & { remote?: string };
```

结果包含 `ok`、`phase`、`branch`、`commitCreated`、`commitHash`、`remote`、`upstreamSet`、可选 `remotes` 和受控 `error/message`。多 remote 且未选择时返回 `remote_required`，renderer 使用同一动作上下文继续选择，不重新 commit。

### 本机工具

新增稳定 tool id：

```ts
type WorkspaceOpenToolId = "vscode" | "cursor" | "finder" | "terminal" | "iterm2";
type WorkspaceOpenTool = { id: WorkspaceOpenToolId; label: string; available: boolean; iconDataUrl?: string };
```

renderer 只能请求 `{ workspaceRoot, toolId }`，不能传 app path、命令或 argv。

## 实现步骤

### 1. Shared 契约与类型出口

修改：

- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`（若当前不是统一 wildcard export，则补显式出口）

检查：

- 类型能够被 desktop main、preload 和 renderer 通过 `@actspace/shared` 消费。
- mutation error code 覆盖 invalid workspace、Git missing、not repository、detached、invalid branch、nothing to commit、remote required、no remote、command failed。

验证：

```sh
pnpm --filter @actspace/shared build
```

### 2. Main workspace environment service

新增：

- `packages/desktop/src/main/workspace-environment-service.ts`
- `packages/desktop/src/main/test/workspace-environment-service.test.ts`

实现要求：

- 解析 workspaceRoot，确认存在且为目录。
- 使用 `execFile("git", argv, { cwd })`，禁止 shell。
- 查询 repository、symbolic branch、git-dir / common-dir、upstream 和 remotes。
- create branch 先执行 `git check-ref-format --branch`，再执行 `git switch -c`。
- commit 依次执行 `git add -A` 与 `git commit -m`；hook 失败不 reset index。
- push 按 upstream / one remote / many remotes / no remote 分流；只允许普通 push。
- commit and push 在 push 失败时返回 `commitCreated: true` 和 commit hash。
- 设置 timeout、输出上限和 `GIT_TERMINAL_PROMPT=0`；错误返回裁剪后的语义信息。
- 不修改 remote、identity 或 hooks。

测试场景：

- 非 Git、普通 repository、linked worktree、branch、detached HEAD。
- 非法 / 合法分支创建。
- Commit 包含 tracked、untracked、deleted 文件；clean workspace 不创建 commit。
- 已有 upstream push。
- 单 remote 自动 `push -u`。
- 多 remote 返回 remote_required，选择后成功。
- 无 remote 返回 no_remote。
- commit 成功、push 失败时保留 commitCreated / commitHash。

测试远端使用本地 bare repository，不访问网络和用户凭据。

### 3. Main 本机工具 service 与 IPC

新增：

- `packages/desktop/src/main/workspace-open-service.ts`
- `packages/desktop/src/main/test/workspace-open-service.test.ts`

修改：

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`

实现要求：

- macOS 使用 `/usr/bin/open -Ra <app>` 检测第三方应用。
- 使用 `/usr/bin/open -a <app> <workspaceRoot>` 打开。
- Finder、Terminal 作为系统应用，仍通过同一受控 app 映射执行。
- 非 macOS 返回结构化 unavailable / unsupported，不接受 renderer 自定义应用。
- IPC channel 使用 `workspace-environment:*` 和 `workspace-open:*` 前缀。

验证：

```sh
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test -- workspace-environment-service workspace-open-service
```

### 4. Renderer 顶栏组件

新增：

- `packages/desktop/src/renderer/components/workspace/WorkspaceChromeControls.tsx`
- `packages/desktop/src/renderer/components/workspace/EnvironmentPopover.tsx`
- `packages/desktop/src/renderer/components/workspace/WorkspaceOpenControl.tsx`
- `packages/desktop/src/renderer/components/workspace/GitActionDialog.tsx`

修改：

- `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/App.tsx`（仅在需要传递刷新能力时修改）

实现要求：

- 只在 chat view 且存在 selectedWorkspaceRoot 时显示。
- 顶栏顺序为编辑器选择、Environment、对象 +、右侧面板。
- 编辑器主按钮使用 localStorage 中的上次选择；不可用时回退 Finder。
- Environment 打开时获取 snapshot；Changes 使用现有 reviewSummary，点击打开 Review。
- Sources 从 `MessageBlock[]` 的 user attachments 与 workspace 派生，去重、前三项、View all。
- Create branch 使用 modal；默认 `actspace/<session-title-slug>`，prefix 存 localStorage。
- Commit / Commit and push / Push 收敛在单一 action panel；Commit and push 遇多 remote 时保留同一输入并在 remote 选择后继续，不重复 commit。
- 所有 mutation 期间锁定重复动作；成功后刷新 environment 与 review summary。
- popover / menu / dialog 支持 outside click、Escape、focus restore 和可访问名称。
- 使用语义 token，不增加主题不感知颜色字面量。

### 5. Renderer 测试与响应式验证

新增或修改：

- `packages/desktop/src/renderer/test/workspace-chrome-controls.test.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `packages/desktop/src/renderer/test/workbench-responsive.test.tsx`
- `packages/desktop/src/renderer/test/fixtures/workbenchFixture.ts`（仅在需要稳定附件样例时修改）

测试场景：

- 编辑器列表、不可用状态、偏好恢复与主按钮调用。
- This Mac / Worktree、branch / Create branch、Changes 统计。
- Sources 去重与 View all。
- Commit clean 禁用、commit message 校验、commit and push partial failure。
- 多 remote 选择后只调用 push continuation。
- Escape / outside click 关闭，icon-only button 可访问名称稳定。
- `480px` 下入口仍可达且不与 panel toggle 重叠。

### 6. 文档、history 与收尾

修改：

- `docs/design-docs/frontend/front-environment-and-git-actions.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/histories/2026-07/<timestamp>-environment-and-local-git-actions.md`
- `docs/learnings/2026-07/`（仅在按写作指南判断命中门槛后新增）

收尾前阅读：

- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/learnings/WRITING_GUIDE.md`（若至少命中两条学习沉淀标准）

## 风险与缓解

- 风险：Commit 是写操作，用户可能误解提交范围。
  - 缓解：`Include unstaged changes` 默认开启并显式展示；关闭时只提交 staged changes，空 staged 状态明确失败。
- 风险：Commit and push 的第二阶段失败造成状态误报。
  - 缓解：结果显式携带 commitCreated / commitHash / phase，UI 分开报告。
- 风险：多 remote 自动猜错目标。
  - 缓解：超过一个 remote 必须选择。
- 风险：Git credential prompt 卡住 Electron main。
  - 缓解：设置 timeout 与 `GIT_TERMINAL_PROMPT=0`，失败后提示用户在外部工具完成认证。
- 风险：worktree 判断依赖路径形式。
  - 缓解：比较 realpath 后的 git-dir 与 git-common-dir，不通过 workspace 路径字符串猜测。
- 风险：顶栏控件增多导致窄窗重叠。
  - 缓解：chat-only、纯图标、现有 chrome flex 区域内排列；覆盖 `480 / 820 / 1120 / 1440px`。
- 风险：测试真实 push 污染外部仓库。
  - 缓解：仅使用临时目录和本地 bare remote；产品真实 push 留给用户手动验收。

## 验证矩阵

工程验证：

```sh
pnpm --filter @actspace/shared build
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm check:frontend-theme
pnpm check:docs
pnpm check:repo
pnpm build
git diff --check
```

浏览器 renderer：

- 使用显式 fixture/mock bridge 检查 This Mac、Worktree、detached、clean、changes、loading、error。
- 检查 Light、Dark、system-light、system-dark。
- 检查 `480 / 820 / 1120 / 1440px`。

Electron 真实验证：

- 检查 preload IPC、应用检测、Finder / 已安装编辑器打开、真实 Git 状态刷新。
- 不由自动验证执行用户仓库的真实 Commit 或 Push；这两项使用临时仓库或由用户在自己的目标仓库手动验收。

## 最小回退策略

- shared 契约、main service、preload 和 renderer 均为新增窄接口；若 Git mutation UI 不稳定，可以保留只读 snapshot 和编辑器打开能力，移除 mutation 入口而不影响现有 Review。
- 不迁移现有 ReviewChangeSet，不改 session schema，不需要数据迁移。
- localStorage 仅保存工具 id 和 branch prefix；无效值直接回退默认，不需要升级脚本。

## 进度记录

- [x] 2026-07-29：用户确认完整本地 Git 工作流、全量 commit 语义和不做 Pull Request。
- [x] 2026-07-29：完成长期设计规范并接入前端文档导航。
- [x] 2026-07-29：完成 shared IPC 契约。
- [x] 2026-07-29：完成 main environment / Git mutation / open tool service 与本地 Git 测试。
- [x] 2026-07-29：完成 preload 和 global bridge。
- [x] 2026-07-29：完成 renderer 顶栏控件、Git 对话框与交互测试。
- [x] 2026-07-29：完成工程验证和 `480 / 820 / 1440px` 浅深主题浏览器验收；真实 Electron 应用打开与用户凭据 Push 保留为人工验收边界。
- [x] 2026-07-29：完成 history、learning、质量与安全文档同步，计划可归档。
- [x] 2026-07-29：真实 Electron 验收发现 Push 菜单裁切、Composer branch 硬编码、workspace registry 固定 tmp 文件竞争。
- [x] 2026-07-29：用户确认视觉修订方向：原生 App 图标、无竖线分体按钮、紧凑 Environment、Codex-style 统一 Git action panel。
- [x] 完成原生 App 图标 IPC 与视觉密度修订。
- [x] 完成统一 Git action panel、可选 unstaged 和空 message 默认生成。
- [x] 修复 branch selector 与 registry 并发写入。
- [x] 2026-07-29：重新完成自动化检查和真实 Electron 验收；确认原生 App 图标、无竖线分体按钮、紧凑 Environment、Worktree / New branch 状态与统一 Git action panel。

## 决策记录

- 2026-07-29：Changes 统计继续复用 Review 契约，不在 Environment service 中建立第二套 diff 统计。
- 2026-07-29：Commit 默认保持全量 `git add -A`；第二阶段按用户确认增加显式 `Include unstaged changes`，关闭时只提交 staged changes。
- 2026-07-29：多 remote 必须选择，单 remote 才允许自动设置 upstream。
- 2026-07-29：首版不做分支切换和 Pull Request，把顶部能力限定为本地环境与普通 Push。
- 2026-07-29：Git 写操作和本机应用打开只接受 workspace registry / session 已登记路径，避免 renderer 将任意绝对路径提升为本机能力目标。
- 2026-07-29：Commit and push 在多 remote 场景先完成 remote preflight；push 失败则返回已创建 commit 的 hash，让 UI 显式表达部分成功。
- 2026-07-29：第二阶段将 Commit or push 从嵌套菜单改为单一 action panel；Include unstaged 默认开启以保持原有全量 commit 语义，关闭时只提交 staged changes。
- 2026-07-29：真实 Electron 验收证明直接读 `.icns` 与 `app.getFileIcon(.app)` 在当前 macOS 环境都可能返回通用文件图标；main 改为优先用 `nativeImage.createThumbnailFromPath(.app)` 获取系统解析的 App 图标，资源文件和 `app.getFileIcon()` 仅作回退。
