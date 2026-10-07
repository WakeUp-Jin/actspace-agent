## 2026-10-06 10:45 | Task: Desktop 前端重构 15：运行目标

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-15`。
- 状态：完成，已交给验收。
- Runtime 补充：
  - 子分支 `refactor/desktop-fe-15`，squash 回 `refactor/desktop-frontend`。
  - 收尾验收用两种方式：
    - 浏览器 mock：vite + headless Chrome + CDP，注入假的 `host.describe`；
    - Electron：临时数据目录 + CDP。
  - 本文件应在计划开始时创建，漏了，收尾时补建。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第六份是 15：把「会话跑在哪里」收成一个 `RunTarget`（本机 / 远端 / 标识损坏），会话 key 的编解码只留 shared 一份，Host 列表与 describe 全窗口只订阅一次，未就绪给出具体原因，远端会话的工作区和模型跟着会话走，审批按 `hostId` 路由，本机与远端的分流集中到两个 gateway，main 的 git 子进程统一入口。

### 主要改动

- **会话定位**：shared `session-locator` 严格编解码并做 round-trip 检查；renderer `locateSession` 返回 `local` / `remote` / `invalid`，损坏的 key 显示错误态。
- **HostDirectory**：Host 列表、连接事件、describe 结果和失败原因集中到一个 store。每次连接 describe 一次，失败的下次列表变化时重试。Host 被移除时 evict 它的会话。
- **RunTarget**：`useRunTarget` + `RunTargetContext`。WorkbenchLayout、ConversationView、TurnOutputArtifacts、Composer 按 `target.kind` 和 `capabilities` 判断。两个大组件的 prop 降到 9 个。
- **readiness**：11 种状态（含 `pauses.md` P1 新增的 `host-unavailable`），只有 `ready` 能发送，每种都有原因文案。
- **远端会话记录**：工作区和模型存 `actspace:remote-session-prefs`；新建页按 Host 记模型；旧的 `actspace:remote-models` 启动时迁移。
- **gateway**：main 侧分流从 `fixed-renderer-ipc` 搬出；renderer 侧建会话和提交从 App 搬出。
- **审批**：事件和待审批列表带 `hostId`，按 `hostId` 路由，renderer 不再拆 id 字符串。
- **run-git**：git 子进程统一入口，三个 service 迁移。`review-pr-service` 语义不同，不并入。
- **删除 `useRemoteTarget`**：远端选择由 `RunTargetState.choices` 提供。
- **文档**：`front-workspace-git-worktree-context.md` 新增「运行目标（本机与远端）」；03 标注已实施，列 10 条更正。

### 设计动机

「是不是远端」原来散在 App、Composer、WorkbenchLayout 等处，靠 `startsWith("host:")` 和可选的 `remote` 对象判断；Host 列表有 5 处各自订阅；未就绪只有一句「Host 未就绪」；远端模型按会话 key 存在一个从不清理的 Map 里；审批靠拆 id 字符串找 Host。

### 学习沉淀

- [命令行工具的输出随系统语言变化：判断结果不要匹配给人看的文字](../../learnings/2026-10/20261006-cli-output-locale.md)：基线里一直红的那个用例，根因是中文系统下 git 输出中文错误，英文正则匹配不上。
- 另一个踩到的坑：根目录 `.gitignore` 的 `target/`（本意是 Rust 构建目录）同时忽略了 `apps/desktop/src/renderer/target/`，新文件在工作区里一直在，测试和 typecheck 都通过，只有 `git status` 看不见。已加否定规则。这条一句话能说清，没有单独写。

### 文件

- `packages/shared/src/`：`session-locator.ts`，审批相关类型的 `hostId`
- `apps/desktop/src/renderer/target/`：locate-session、host-directory、run-target、use-run-target、run-target-context、readiness、remote-session-prefs、use-model-catalog
- `apps/desktop/src/renderer/session/session-gateway.ts`，以及 App、Composer、WorkbenchLayout、ConversationView、TurnOutputArtifacts、ApprovalParts、HostConnectionsSettings
- `apps/desktop/src/main/`：`session-gateway.ts`、`git/run-git.ts`、`remote-hosts/desktop-adapter.ts`、3 个 git service、`runtime-v2/fixed-renderer-ipc.ts`
- 测试：
  - renderer 新增 locate-session、host-directory、run-target、remote-session-prefs、readiness、model-catalog、session-gateway、run-target-choices；
  - main 新增 session-gateway、remote-host-approval、run-git。
- `.gitignore`
- 文档：`docs/design-docs/frontend/front-workspace-git-worktree-context.md`、`docs/desktop-frontend-refactor/03-*.md`、`docs/exec-runs/20261005-desktop-fe-15-run-target/`
