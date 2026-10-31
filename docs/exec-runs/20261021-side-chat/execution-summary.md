# 侧边对话执行摘要

状态：2026-10-21 实现完成，自动化测试和浏览器 mock 检查通过；未提交、未推送（worktree `../actspace-agent-side-chat`，分支 `feat/side-chat`）。计划里的 Electron 实机 1–7 未执行，不声明通过。

## 交付

| 范围 | 内容 |
| --- | --- |
| Journal | `lineage.origin` 增加 `"side-chat"` |
| 插件 `@actspace/side-chat` | `resolveSideChatBoundary`（截到最后一个平衡的 `turn/end`）；侧边会话的边界提示词注册与移除 |
| agent-service | `AgentApplication.openSideChat`：flush 父会话 → 算边界 → fork → 有工作区时切 Plan；拒绝嵌套分出 |
| Desktop main | IPC `sessions.openSideChat` / `sessions.listSideChats`；会话目录 `side_chat_parent_id` 列（旧库打开时补列），分页排除侧边对话并带数量 |
| Renderer | `sendToSession` / `abortSession` / `useSessionTranscript`；`SessionProjectionScope`；右栏 `sideChat` tab 与 `SideChatView`；启动列表、`+` 菜单与「已收起」列表；`/side [问题]`；左侧会话栏隐藏侧边对话并显示数量；第一条问题写成标题 |
| Mock | `?mock=side-chat`：主会话第 4 轮运行中，两个已收起的侧边对话 |
| 文档 | 设计文档、右侧面板 / slash / 输入框 / 侧栏 / bridge 与 mock 规范、`FRONTEND_VERIFICATION.md`、契约矩阵 |

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `@actspace/side-chat` / runtime / agent-service / boot / journal / persistence | 5 / 64 / 34 / 22 / 20 / 46 项通过 |
| desktop `tsc`（renderer 与 electron 两个 tsconfig） | 通过 |
| `pnpm --filter @actspace/desktop test` | 245 文件；1986 项通过、7 跳过 |
| `check:frontend-tokens` / `check:frontend-theme` / `check:renderer-bridge` / `check:ipc-channels` | 通过 |
| `check:packages` / `check:desktop-build-graph` | 通过 |
| `check:current-docs` | 本轮改动的文档没有新增失败；仓库已有的截图链接失败与本轮无关 |

## 浏览器 mock 截图

`screenshots/`：浅色启动列表、空侧边对话、已回答、收起后列表；深色已回答；480px 窄窗。浏览器只加载 renderer，不证明真实 fork、边界提示词或 Plan 工具限制。

## 与计划的偏差

见 `execution-process.md`「与计划的偏差」。要点：

- 只读 = Plan 模式（Plan 标签 + 现有权限控件）；
- 远端运行目标用 `isLocalTarget` 隐藏入口；
- 重开的 tab 分隔线不带「不含进行中」；
- 计划外新增标题写回；
- 计划里的组件测试改成 App 级集成测试。

## 未覆盖

- Electron 实机 1–7（运行中分叉文案、侧边对话知道之前内容、Plan 下没有写工具、两个侧边对话同时流式、收起后重开、重启后仍在且边界提示生效、左侧会话栏只显示数量）。
- `+` 菜单 Esc 与焦点回到触发器的手工键盘检查。
