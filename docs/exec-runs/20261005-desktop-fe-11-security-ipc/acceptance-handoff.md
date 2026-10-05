# 11 安全与 IPC 验收交接

- 主线提交：`refactor/desktop-frontend` @ `<squash 提交哈希>`（squash 后填写）
- 子分支：`refactor/desktop-fe-11`（`7e271f96..<收尾提交>`，每个 T 一个提交，另有一个处理复核发现的提交和一个收尾提交）
- 状态：**可以交给验收**
- 启动方式：
  - `pnpm install`（如有需要），然后 `pnpm --filter @actspace/desktop build`。
  - 在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=$(mktemp -d) node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。A1 需要模型输出链接，可以改用真实数据目录，或者用 Markdown 文件预览中的链接代替。
  - A2（Dock 重开）用上面的方式启动即可；关闭窗口后应用不会退出。

## 阶段：11 全部（T0–T10，单阶段）

### 用户能感知到的变化

- **外链改在系统浏览器打开。** 消息、Markdown 预览、工具日志里 `target="_blank"` 的链接，原来会在应用内新开一个 Electron 窗口，现在交给系统默认浏览器。只放行 `https:`、`http:`、`mailto:`，其他协议（`file:`、`javascript:` 等）点了没有反应。
- **关闭窗口会结束该窗口的终端。** macOS 上关窗后应用仍在 Dock，重新打开是一个新窗口，之前的终端会话不会恢复（已拍板：不做重新 attach）。
- 其余是看不见的收紧：renderer 只能访问已登记的工作区 root；IPC 只接受主窗口 mainFrame 的调用。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/desktop typecheck` | 通过 | — |
| test | `pnpm --filter @actspace/desktop test` | 文件 139 通过 / 1 失败 / 1 跳过；用例 1042 / 1 / 2。唯一失败是基线中已知的 `workspace-git-context-service`「hides Git controls for a non-repository workspace」。比 10 结束时多 5 个测试文件、53 个用例 | `execution-process.md`「收尾」 |
| 脚本检查 | `check:frontend-tokens`、`frontend-design-tokens.test.mjs`、`check:ipc-channels`（160 个 channel）、`ipc-channels.test.mjs`、`check:current-docs` | 通过 | — |
| sender 校验 | CDP 调用 fixed / shell / Host / performance / english-learning 五类 IPC | 全部成功，主进程日志没有拒绝记录 | `screenshots/t1-main.png` |
| 工作区访问 | CDP 直接调用桥接 | 仓库目录 list / read / stat、Git context、createSession、Review 正常；`/`、`/etc`、`/tmp` 被拒；`createWorkspaceFolder` 越界时没有建目录；右键菜单 `/etc` 返回 `invalid_target`；Skills 列表仓库目录 29 项、`/tmp` 被拒 | `execution-process.md` T5、收尾；`screenshots/t5-*.png` |
| 关窗清理终端 | CDP `window.close()` 后 `ps` | 终端 shell 进程消失，主进程仍在 | `execution-process.md` T2 |
| 退出清理 | 开终端后用 SIGTERM 正常退出，`ps` | shell、git、helper 全部消失，日志没有 `shutdown incomplete` | `execution-process.md` T3 |
| 窗口防护 | CDP | renderer 有 `--enable-sandbox`，`require` / `process` 未定义；`window.open` file: / javascript: 返回 null 且没有新窗口；file: 链接点击后地址不变 | `screenshots/t7-main-after-reload.png` |
| CSP 实验 | 独立 Electron 小程序 + 真实应用临时加 meta（未提交） | 记录结论，见执行记录 T9 | `screenshots/t9-*.png` |
| 范围复核 | Sonnet 只读子智能体 | 7 条发现：修 3 条、记技术债 2 条、1 条实测不成立、1 条不改 | `execution-process.md`「收尾」 |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| A1 | 点击消息或 Markdown 预览中的一个 https 链接 | 系统默认浏览器打开该链接；应用内没有新窗口，主窗口不跳转 | 为了不在用户机器上弹浏览器，我只验证了不安全 URL 被丢弃，没有点真实 https 链接 |
| A2 | 打开终端面板执行任意命令；关闭窗口；从 Dock 重新打开；另开一个系统终端运行 `ps -ax \| grep "zsh -l"` | 窗口重新打开且功能正常；关窗前那个终端的 shell 已不在 | 不能用 computer use 操作 Dock |
| A3 | Composer 上方的工作区选择器 →「新建文件夹」→ 输入名字 → 在系统对话框中选一个不在工作区列表里的父目录 | 文件夹创建成功，成为当前工作区并出现在侧栏 | 需要在系统对话框中点选 |
| A4 | 打开终端、触发一次 Git 操作（例如切到 Review）后 ⌘Q；`ps -ax \| grep -i actspace` | 没有残留的 shell、git、Browser Bridge 子进程 | 我用 SIGTERM 退出验证过，没有走 ⌘Q 菜单 |
| B1（建议） | 如果旧数据里有 worktree 会话，打开它的文件树、预览和 Review | 正常 | 当前版本创建不出 worktree 会话，只有单测覆盖 |
| B2（建议） | 在有远端的仓库里走一次「创建 PR」 | PR 页面在系统浏览器打开 | 需要真实远端和 gh 登录 |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review
- 本计划额外：右侧文件树和文件预览；Composer 输入 `/` 能看到 Skills

### 已知问题与未覆盖

- 主文档没有 CSP（J1 = A），dev 下控制台的 Electron CSP 安全警告仍在，不算回归。
- 测试中唯一的失败是基线中已知的那一个，与本计划无关。
- 子进程继承 Key（C1）、Browser Bridge 从源码目录安装仍接受 renderer 传的路径，都已记入技术债，本计划不处理。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
