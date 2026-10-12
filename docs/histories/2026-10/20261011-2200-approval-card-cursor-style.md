# 工具审批卡改为 Cursor 式（D 方向）

## 用户诉求

审批弹窗不够好看，参考 Cursor 的审批 UI 先改 demo 确认样式，再落到前端；Bash 的“本会话允许前缀”由后端配合，前端只改界面并整理一份后端文档。

## 主要改动

- 统一审批卡：`ApprovalParts.tsx` 新增 `ApprovalCard` / `ApprovalActions`，移除一行审批条与原因标签；所有工具审批（读取、搜索、编辑、写入、删除、Bash、浏览器、通用工具）共用。
- Bash：头行 intent + 命令名摘要，`$ command` 简单着色（新增 `shell-highlight.ts`），底栏显示沙盒 / 真实环境与非根目录 cwd；后端给出 `command_prefix` 建议时显示「本会话允许 <前缀>」。
- 编辑 / 写入：`+N -M` 加淡色箭头作为展开按钮，点开在卡内看 diff。删除只用红色主按钮。浏览器保留一句说明托盘。
- `Button` 新增 `accent`（跟随强调色）和 `tonal`；`IconButton` 同步 `accent`。按钮全部为 xs 胶囊。
- 日志行去掉“本会话已授权”。
- mock `approval-pending` 补 intent 与执行环境。
- 文档：demo 标为 D 定稿；更新中间消息区、全局视觉语言、主题与配色、外观强调色规范；新增执行计划与后端前缀授权契约文档。

## 设计动机

原审批条 / 卡两种形态加彩色边框与标签，信息密度高但显得杂；Cursor 式卡片只保留动作、目标和必要内容，危险程度交给按钮颜色。Bash 没有真实原因文本，所以不做原因托盘，底栏换成用户更关心的执行环境。

## 受影响文件

- `apps/desktop/src/renderer/components/messages/ApprovalParts.tsx`、`BashRunBlock.tsx`、`FileDiffBlock.tsx`、`ToolLogLine.tsx`、`DeleteFileBlock.tsx`、`BrowserApprovalBlock.tsx`、`shell-highlight.ts`
- `apps/desktop/src/renderer/components/ui/Button.tsx`、`IconButton.tsx`
- `apps/desktop/src/renderer/mock/scenarios/approval-pending.ts`
- 对应测试与 `docs/design-docs/frontend/*`、`docs/exec-plans/active/20261011-approval-card-cursor-style/`

## 验证

- `pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 通过。
- 浏览器 mock 浅色、深色、480px 截图核对。Electron 实机验收待做。
