# 12 测试整理 验收交接

- 主线提交：`refactor/desktop-frontend` @ `<squash 提交哈希>`（squash 后在 13 的 T0 中登记）
- 子分支：`refactor/desktop-fe-12`（`06c625e3` 起，共 11 个提交：T0–T8 各一个，另有一个处理复核发现的提交和一个收尾提交）
- 状态：**可以交给验收**
- 启动方式：
  - `pnpm install`（如有需要），然后 `pnpm --filter @actspace/desktop build`。
  - 在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=$(mktemp -d) node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。

## 阶段：12 全部（T0–T8，单阶段）

### 用户能感知到的变化

- 无。本计划只改测试和检查脚本，另外给侧栏会话状态点和设置页状态点加了 `data-state` 属性（类名、颜色不变）。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/desktop typecheck` | 通过 | — |
| test | `pnpm --filter @actspace/desktop test` | 文件 138 通过 / 1 失败 / 1 跳过；用例 1041 / 1 / 2。唯一失败是基线中已知的 `workspace-git-context-service`。比 11 结束时少 1 个文件、1 个用例（删 3 加 2；删 6 加 5） | `execution-process.md`「收尾」 |
| 脚本检查 | `check:frontend-tokens`、`frontend-design-tokens.test.mjs`（10/10）、`check:frontend-theme`、`check:ipc-channels`、`ipc-channels.test.mjs`、`check:current-docs` | 通过 | — |
| 规则与测试有效 | 变异验证：制造违规后确认报错 / 失败，再恢复 | 每条新规则、每个新测试都会失败 | `execution-process.md` T1–T7 |
| 真实 DOM | Electron CDP | 侧栏状态点 `data-state`、`aria-current` 只有一个；设置四页导航 `aria-current` 跟随，`StatusDot` `data-state="off"`，开关 `aria-checked` 正常 | `screenshots/smoke-*.png` |
| 范围复核 | Sonnet 只读子智能体 | 无 high 级发现；修 4 条，3 条说明后不改 | `execution-process.md`「复核处理」 |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| — | 无专项验收项 | — | 本计划没有用户可感知的变化 |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review
- 本计划额外：看一眼侧栏运行中 / 失败会话的状态点，以及设置页「通用」里的「未配置」状态点，颜色与之前一致

### 已知问题与未覆盖

- 测试中唯一的失败是基线中已知的那一个，与本计划无关。
- 放弃了正向类名快照（例如选中行、开关、主按钮的完整类名）：换成其他语义色不会被脚本拦，只能靠视觉验收发现。这是计划决策记录中有意接受的取舍。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
