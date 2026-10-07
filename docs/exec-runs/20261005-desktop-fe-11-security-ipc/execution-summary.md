# 11 安全与 IPC — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/11-安全与IPC执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-11-security-ipc/execution-process.md`
- **执行模式**：交互，连续执行
- **执行结果**：完成（T0–T10 全部完成，另有一个处理只读复核发现的提交；Dock 重开、真实外链、新建文件夹对话框等需要人工操作的项交给验收）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| sender 校验统一、fail-closed（S1，T1） | 新增 `M/ipc/trusted-sender.ts`；`desktop-shell-ipc.ts`、`fixed-renderer-ipc.ts`、`remote-hosts/ipc.ts`、`english-learning-ipc.ts`、`performance-ipc.ts` | 没有窗口、窗口已销毁、非主窗口 webContents、非 mainFrame 一律拒绝；原来 desktop-shell 没有窗口时整段跳过 |
| 关窗销毁终端（S5，T2） | 新增 `M/main-lifecycle.ts`；`M/index.ts` | 创建窗口时保存 webContents id，`closed` 时 `closeOwner(id)` |
| 退出清理和异常日志（S5，T3） | `browser-bridge-service.ts`、`local-update-service.ts`、`main-lifecycle.ts`、`index.ts` | Browser Bridge 跟踪并终止在途子进程；更新服务只清定时器（更新脚本必须比应用活得久）；`uncaughtExceptionMonitor` / `unhandledRejection` 写日志 |
| 工作区访问入口（S2，T4、T5） | 新增 `M/workspace-access.ts`；`workspace-fs-service.ts`、`fixed-renderer-ipc.ts`、`desktop-shell-ipc.ts`、`artifact-context-menu-service.ts`、`index.ts` | renderer 传来的 root 必须精确等于 registry 或会话 root 的 realpath；文件 list / read / stat、Git context、右键菜单、Skills 列表接入；`toInsideRoot` 改为 realpath 加 `path.relative`，修正 `..foo` 误判和 symlink 逃逸；`createSession` 只认 registry；`createWorkspaceFolder` 的父目录要么是最近一次对话框选择，要么通过校验 |
| 外部打开白名单（S3，T6） | 新增 `M/platform-actions.ts`；`desktop-shell-ipc.ts`、`artifact-context-menu-service.ts` | 只放行 `https:`、`http:`、`mailto:`；「在 Cursor 中打开」收进同一文件 |
| 窗口防护（S3，T7） | 新增 `M/window-security.ts`；`index.ts`；`runtime-v2-preload-bundle.test.ts` | 显式 `sandbox: true`、`webviewTag: false`；新窗口一律拒绝、外部顶层导航取消，安全 URL 交给系统浏览器；禁止 `<webview>` |
| IPC channel 审计（S4，T8） | 新增 `scripts/check-ipc-channels.mjs` 及测试；根 `package.json` | `pnpm check:ipc-channels`：常量、main 注册 / 发送、preload 引用三者一致，160 个 channel 通过 |
| CSP 实验（J1 = A，T9） | 只有执行记录 | 不提交 CSP。实测 srcdoc 预览会继承主文档 CSP，mermaid `<style>` 会被拦；`onHeadersReceived` 对 file:// 有效 |
| 文档（T10） | `docs/SECURITY.md`、`tech-debt-tracker.md`、01 设计文档 | 补充安全约束；技术债新增 C1（子进程继承 Key）、CSP、Browser Bridge 源码安装、审计脚本局限四条 |

## 人工验证指引

### 必须验证

1. **外链在系统浏览器打开**（用户可感知的变化）
   - 验证方式：在对话中让模型输出一个 https 链接（或打开含链接的 Markdown 文件预览），点击它。
   - 预期结果：系统默认浏览器打开该链接；应用内不再新开 Electron 窗口，主窗口不跳转。
2. **关窗再从 Dock 打开**
   - 验证方式：打开终端面板，执行任意命令；关闭窗口（⌘W 或红色按钮），从 Dock 重新打开；在另一个终端运行 `ps -ax | grep -- "-zsh\|zsh -l"` 对比。
   - 预期结果：窗口能重新打开且功能正常；关窗前的终端 shell 已经不在。
3. **新建文件夹工作区**
   - 验证方式：Composer 上方的工作区选择器 →「新建文件夹」→ 输入名字 → 在系统对话框中选一个**不在工作区列表里**的父目录（例如桌面上新建的空目录）。
   - 预期结果：文件夹创建成功，成为当前工作区，并出现在侧栏工作区列表中。父目录不在 registry 里，这一步依赖「最近一次对话框选择」放行。
4. **退出后无残留子进程**
   - 验证方式：打开终端、触发一次 Git 操作后 ⌘Q 退出；`ps -ax | grep -i actspace`。
   - 预期结果：没有残留的 shell、git、Browser Bridge 子进程。
5. **回归冒烟**
   - 验证方式：新建会话发一条消息；切换会话；打开右侧文件树和文件预览、Review、终端；打开设置任意两页；在 Composer 输入 `/` 查看 Skills。
   - 预期结果：都正常，没有「workspace_not_registered」之类的报错。

### 建议验证

1. **worktree 会话**：如果手头有旧数据里的 worktree 会话，打开它的文件树和 Review。预期正常（当前版本创建不出 worktree 会话，只有单测覆盖）。
2. **创建 PR 后打开**：在一个有远端的仓库里走一次「创建 PR」，预期 PR 页面在系统浏览器打开。

## Agent 已完成的验证

- shared / desktop typecheck 通过；desktop test 文件 139 通过 / 1 失败 / 1 跳过，用例 1042 / 1 / 2，唯一失败是基线中已知的 `workspace-git-context-service`。
- `check:frontend-tokens`、`frontend-design-tokens.test.mjs`、`check:ipc-channels`、`ipc-channels.test.mjs`、`check:current-docs` 通过。
- Electron CDP（完整 build，临时数据目录）：
  - 五类 IPC（fixed、shell、Host、performance、english-learning）在 sender 收紧和 sandbox 显式化后都正常；
  - 工作区允许 / 拒绝集合按预期（`/`、`/etc`、`/tmp` 被拒，仓库目录正常），`createWorkspaceFolder` 越界时没有建目录；
  - 关窗后终端 shell 消失；退出后 shell、git 子进程全部消失，日志没有 `shutdown incomplete`；
  - `window.open` 和 file: 导航被拦，没有新窗口；
  - Skills 列表：仓库目录 29 项（其中 3 项 project 级），`/tmp` 被拒；
  - 严格 CSP 实验结果见执行记录 T9。
- Sonnet 只读复核：7 条发现，修 3 条、记技术债 2 条、1 条实测不成立、1 条范围内不改（见执行记录「收尾」）。

## 已知风险和遗留事项

- 主文档仍然没有 CSP（J1 = A），dev 下 Electron 的 CSP 安全警告还在。前置条件见技术债。
- 子进程继承 `applyToEnv` 写入的 Key（C1），本轮只核实不改。
- `installBrowserBridgeFromRepo` 仍接受 renderer 传来的目录。
- worktree 会话、Browser Bridge 在途子进程的终止只由单测覆盖。

## 后续建议

- 进入 12（测试整理）。
- 13 落地统一注册器时，把 sender 校验和入参 guard 放进注册器，审计脚本改为以 contract 为来源。
