# 10 冗余清理 验收交接

- 主线提交：`refactor/desktop-frontend` @ `f08802ed`
- 子分支：`refactor/desktop-fe-10`（`e4e2d1af..165c038c`，共 13 个提交，每个 T 一个，最后一个是收尾提交）
- 状态：**可以交给验收**
- 启动方式：
  - `pnpm install`（如有需要），然后 `pnpm --filter @actspace/desktop build`。
  - 在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=$(mktemp -d) node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。A1 需要可用的模型连接，可以改用真实数据目录，或在临时目录里配置一个服务商。
  - 建议项 B1 用 `pnpm --filter @actspace/desktop dev`。

## 阶段：10 全部（T0–T12，单阶段）

### 用户能感知到的变化

- 无可见变化，只需回归。
- 删除的都是没有使用方的文件、prop、IPC handler 和 channel。生产包里不再有 70KB 的轨迹 fixture，主 chunk 约小 42KB。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/desktop typecheck` | 通过 | — |
| test | `pnpm --filter @actspace/desktop test` | 文件 134 通过 / 1 失败 / 1 跳过；用例 989 / 1 / 2。唯一的失败是基线中已知的 `workspace-git-context-service`「hides Git controls for a non-repository workspace」。比基线少 4 个已删除的测试文件 | `execution-process.md`「收尾」 |
| 脚本检查 | `check:frontend-tokens`、`node --test scripts/test/frontend-design-tokens.test.mjs`、`check:current-docs` | 通过 | — |
| grep 门槛 | 计划中每个 T 的 grep；旧 channel 前缀 `runtime-v2:shell:` 等字面量 | 全部为 0 | `execution-process.md` T1–T9 |
| 生产包 | `build:renderer` 后 grep `mock-trajectory-session` | 主 chunk 1,802,434 → 1,759,896 字节；没有任何 chunk 命中 | `execution-process.md` T11 |
| 终端 | CDP，通过 `window.actspace` 执行 create → attach → write `echo FE10_FINAL_$((40+2))` | 收到 `attached`、`data`，输出包含 `FE10_FINAL_42` | `execution-process.md`「收尾」 |
| Review 通知 | CDP，执行 `getReviewSnapshot` / `refreshReviewSnapshot` + `onReviewChanged` | `ok: true`，通知收到 1 次（只保留 FIXED 那一次发送后仍能收到） | 同上 |
| 界面 | CDP 截图 | 主窗口、轨迹面板空状态、设置页正常 | `screenshots/final-main.png`、`final-trajectory.png`、`final-settings.png`、`t7-after-reload.png` |
| 轨迹 fixture 懒加载 | 新单测 | `?trajectoryFixture=complete&trajectoryTheme=dark` 能加载，主题能覆盖，卸载时还原 | `test/trajectory-render-view.test.tsx` |
| 范围复核 | Sonnet 只读子智能体 | 没有阻塞项，建议项已处理 | `execution-process.md`「收尾」 |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| A1 | 连接模型，在会话中让 Agent 执行一个需要审批的工具调用（例如要求运行一个需要确认的 shell 命令）。分别试一次批准、一次拒绝 | 审批卡片出现；批准后继续运行，拒绝后这一轮正常结束；控制台没有 IPC 报错 | 需要模型 key。T6 删掉了 `approvalRequired` 的发送端（它没有监听者），审批流走的是 RuntimeStreamEvent，仓库里没有端到端测试 |
| A2 | 打开终端面板，输入 `echo hi`；关闭终端再新开一个 | 有输出，不报错 | 我只通过桥接调用验证过，没有在界面中操作 |
| A3 | 在工作区里修改一个文件，观察 Review 面板 | 改动自动出现 | 同上，我只验证了桥接通知 |
| B1（建议） | 运行 `pnpm --filter @actspace/desktop dev`，在渲染页 URL 上加 `?trajectoryFixture=complete&trajectoryTheme=dark`，打开轨迹面板 | 显示 fixture 轨迹，主题为深色 | dev 模式下的 Electron 我没有启动，只用单测覆盖了这条路径 |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review

### 已知问题与未覆盖

- 侧栏没有 Lab 入口按钮。S0 时就是这样，本计划没有改动 Sidebar，不算回归。
- 测试中唯一的失败是基线中已知的那一个，与本计划无关。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
