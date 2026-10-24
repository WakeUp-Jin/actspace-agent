# 执行摘要

- **计划**：`docs/exec-plans/completed/20261021-subagent-trajectory.md`
- **分支**：`fix/settings-model-select`，未提交（分支上还有其他计划的未提交改动）
- **日期**：2026-10-21

## 交付内容

- **父轨迹**：子智能体只占 `agent` 工具调用一行。
  - 删除 `attachSubagentTools`、`use-subagent-trajectories.ts`、子工具提示条和 `TrajectoryRecord.childSessionId`。
  - 「子工具」只指同会话里带 `parentCallId` 的嵌套调用。
- **详情入口**：委派调用的「概述」在「状态」下面显示「子智能体」一栏，包括名称和「查看轨迹」按钮（可读名称「在右侧查看子智能体轨迹」）。
- **右侧面板**：
  - 「子 Agent」Tab 支持 `focus`，按子会话 id 定位；列表加载中显示「正在加载子智能体…」，找不到时显示「找不到这个子智能体。」。
  - 详情头部依次是：返回 → `SessionViewToggle` → 头像 → 标题。
  - 轨迹页渲染 `<TrajectoryView sessionId variant="panel" />`，对话页的轮询只在对话页运行。
- **TrajectoryView**：
  - 可以读取指定会话：`bridge.watch` 加 `store.peek`。
  - 面板变体：
    - 不处理 Context 面板跳转。
    - 重试走 `refreshRelated`。
    - 详情纵向弹出、不能拖宽，在 ≤760px 窗口里也一样。
    - 点击行会滚到可见区域。
- **mock**：新增 `?mock=subagent-trajectory`，子会话不进侧栏。

## 自动化证据（2026-10-21）

| 检查 | 结果 |
|---|---|
| `apps/desktop`：`npx vitest run` | 244 个文件通过，2 个跳过；1920 项通过，7 项跳过 |
| `apps/desktop`：`tsc --noEmit -p tsconfig.json` | 只剩 `src/renderer/test/markdown-blocks.test.tsx` 中早已存在的 `NodeListOf` 迭代报错，与本计划无关 |
| `check:frontend-tokens` / `check:frontend-theme` / `check:renderer-bridge` | 通过 |
| `check:current-docs` | 1 处失败，早已存在：`completed/20261005-desktop-frontend-refactor/00-总执行计划.md` 链接的 `demo/` 已迁出 |
| `rg "attachSubagentTools\|useSubagentTrajectories"` | renderer 中零命中 |

浏览器 mock 截图见 `screenshots/`：

- `1-light-trajectory`：父轨迹。
- `2-light-detail`：详情入口。
- `3-light-panel`：右侧子轨迹。
- `4-light-sheet`：子轨迹详情从下半部分弹出。
- `6-dark-sheet`：深色主题。
- `7-light-480`：480px 窗口。
- `8-dark-1100`：320px 面板。

## 未覆盖与已知限制

- **Electron 真实会话（待验收，步骤见 [acceptance-handoff.md](acceptance-handoff.md)）**：真实运行一次 Explore 子智能体，在运行中和完成后各看一次：
  - 父轨迹只有一行 `agent`。
  - 详情「查看轨迹」打开右侧面板并停在轨迹页。
  - 运行中子轨迹实时增长。
  - 切回对话页，执行记录正常。
  - 关闭面板或切换子智能体后不再订阅。
- **mock 的子 Agent 对话页**：`getSubAgentTranscript` 返回空，约 20 秒后退回摘要。这是原有的重试行为，没有改。
- **矮窗口**：子轨迹详情高 56%，概述各分区按比例压缩（与主轨迹、DSH 一致）。
- **范围外**：孙级委派（子智能体不能再委派），以及侧栏显示子会话、会话层级面包屑。
