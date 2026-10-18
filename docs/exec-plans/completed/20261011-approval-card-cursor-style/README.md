# 工具审批卡 · Cursor 式（D 方向）

> 2026-10-18 状态校准：前端与 Bash 前缀授权已实现；真实审批行为的分项覆盖见近期验收。 下文保留原始实施决策与过程；最新分项证据见 [近期验收](../../../exec-runs/20261018-recent-features-acceptance/acceptance.md)。
## 目标

把消息区所有工具审批统一成参考 Cursor 的极简卡片：上方淡色“等待确认”，白色圆角卡，一行动词 + 目标；Bash 卡带命令着色和执行环境底栏；按钮为胶囊，主按钮跟随外观强调色。

## 范围

- 包含：renderer 审批组件（`ApprovalParts`、`BashRunBlock`、`FileDiffBlock`、`ToolLogLine`、`DeleteFileBlock`、`BrowserApprovalBlock`）、`Button` 新增 `accent` / `tonal`、shell 着色工具、demo 与前端规范更新、Bash 命令前缀会话授权的后端契约文档。
- 前端原任务不包含后端实现；用户随后批准 [Bash 前缀授权方案](backend-bash-command-prefix-grant.md)，实现与验证单独记录。键盘快捷键仍不包含（Enter 与 Composer 发送冲突）。

## 背景

- 设计稿：`docs/design-docs/frontend/approval-card-redesign.html`（D 方向）。
- 规范：`docs/design-docs/frontend/front-中间消息区规范.md`「工具审批」「Bash · 审核态」。
- 约束：Bash 当前没有模型给出的真实原因；权限模式不影响 Bash 审批，所以底栏展示执行环境而非模式。

## 进度记录

- [x] demo 迭代并由用户拍板（读取/搜索无提示、编辑/写入点统计看 diff、删除只红按钮、Bash 无托盘、保留「拒绝」、胶囊 + 强调色）。
- [x] 前端实现与测试更新：typecheck、desktop 全量测试、`check:frontend-tokens`、`check:frontend-theme` 通过。
- [x] 浏览器 mock（`?mock=approval-pending`）浅色、深色、480px 截图核对；mock 补上 intent 与执行环境。
- [x] 后端契约文档：`selector.kind = "command_prefix"`、`prefix: string[]`，前端已按此解析。
- [x] 后端完整方案已按用户确认方向重写：程序级简单命令授权、复用现有 Grant、不扩展沙箱；见 [设计与执行方案](backend-bash-command-prefix-grant.md)。已进入实现和验证，过程见 `docs/exec-runs/20261011-bash-command-prefix-grant/`。
- [ ] 后端实现前缀授权后，在真实会话里核对「本会话允许 <前缀>」。
- [ ] Electron 实机验收：Bash、编辑、写入、删除、浏览器审批各走一遍，含强调色切换。

## 决策记录

- 2026-10-11：主按钮用 `Button variant="accent"`，默认调色板下与 primary 一致；删除用 `danger-solid`。“本会话允许”用无描边浅灰底 `tonal`。
- 2026-10-11：前缀授权的类型在前端用 unknown 守卫收窄（`getCommandPrefixGrant`），等后端合入后再考虑进 shared 类型。
- 2026-10-11：后端方案明确实施时切换为正式 shared 类型；复杂命令不复用前缀授权，仍由已有规则决定拒绝或单次审批。已收到实现批准，后端接入正式 shared 类型。

## 执行模式

- **交互模式**。
