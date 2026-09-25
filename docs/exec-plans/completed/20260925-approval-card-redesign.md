# 工具审批卡重设计

> 状态：2026-09-25 已完成实现与自动化验证；真实 Electron 验收见 `docs/exec-runs/20260925-approval-card-redesign/execution-summary.md`。

## 目标

把桌面端对话流里的 5 类工具审批组件统一成设计稿 B 方向（按风险分密度）：读取、搜索、匹配、编辑、写入、删除收成一行审批条，按钮在行尾；Bash 与浏览器保留卡片，先读命令或说明，按钮在底部右侧。去掉灰色标题栏、`Reason:` 行、中英混排标题和 Bash 的 `Allowlist` 折叠，让审批在对话流里和工具日志行的节奏一致。

## 范围

- 包含：
  - 新增共享审批部件 `apps/desktop/src/renderer/components/messages/ApprovalParts.tsx`。
  - 改造 `ToolLogLine.tsx` 中的 `FileReadApprovalLine`（read / grep / glob pending）。
  - 改造 `FileDiffBlock.tsx` 中的 `FileDiffApprovalCard`（edit_diff / write_diff pending）。
  - 改造 `DeleteFileBlock.tsx`（delete pending）。
  - 改造 `BashRunBlock.tsx` 中的 `BashApprovalBlock`（bash pending）。
  - 改造 `BrowserApprovalBlock.tsx`（browser_session pending）。
  - 更新受影响的 renderer 测试，新增共享部件测试。
  - 同步前端设计文档与 history。
- 不包含：
  - 键盘快捷键（⏎ / ⌘⏎ / Esc），会与 Composer 焦点冲突，另议。
  - Bash 命令前缀授权（`TODO.md` 规划项），不渲染占位按钮。
  - 通过 IPC 传递 reason code、risk 分级（后端改动）；本轮只在 renderer 映射已知 reason 文本。
  - 设计稿 C 方向的底部审批托盘、“拒绝并说明”。
  - 设计稿中 `git push --force` 的“高风险”标签：当前 Bash 审批一律 `risk: "high"`，没有可区分的数据来源。
  - 审批通过或拒绝后的收起行为（沿用现状）。
  - 后端权限判断、授权建议（grant suggestion）生成逻辑。

## 背景

- 设计稿：`docs/design-docs/frontend/approval-card-redesign.html`（B 方向为定稿，读取行、Bash 卡片按用户反馈调整后版本）。
- 相关文档：`docs/design-docs/frontend/front-主题与配色规范.md`、`front-中间消息区规范.md`、`front-tool-stream-typography.md`、`front-icon-button-tooltip-guidelines.md`、`docs/FRONTEND_VERIFICATION.md`。
- 相关代码路径：
  - `apps/desktop/src/renderer/components/messages/{ToolLogLine,FileDiffBlock,DeleteFileBlock,BashRunBlock,BrowserApprovalBlock}.tsx`
  - `apps/desktop/src/renderer/components/ConversationView.tsx`（路由，不改）
  - `apps/desktop/src/main/runtime-v2/approval-broker.ts`（reason 以 `\n` 拼接的 message 文本到达 renderer，不改）
  - `packages/tools/runtime/src/permission/{engine,file-resource}.ts`、`packages/tools/core-tools/src/plugin.ts`（reason 文本来源，只读参考）
- 已知约束：
  - 工作区里这 5 个组件已有未提交的“统一审批界面”改动（见 `docs/histories/2026-09/20260925-1730-unified-approval-ui.md`），本计划在其之上继续，不回退。
  - 基线有 8 个测试失败，均因上述未提交改动后测试未同步（按钮名 `Skip`/`Allow`/`本会话允许此文件`、`Open approval actions`、`Run` 等），本计划一并修正。
  - 颜色只用语义 token，浅/深双主题都要验证；`pnpm check:frontend-theme` 必须通过。

## 设计契约

### 两种形态

| 形态 | 适用 | 结构 |
|---|---|---|
| `ApprovalRow` 一行审批条 | read、grep、glob、edit_diff、write_diff、delete | 图标 · 动词 · 目标 · 标签 ······ 拒绝 · 本会话 · 主动作 |
| `ApprovalCard` 卡片 | bash、browser | 头行：图标 · 动词 · 意图 · 标签；内容块；底部：左侧元信息，右侧按钮 |

- 容器：`rounded-act-md border bg-surface`，pending 描边 `border-warning/30`；删除用 `border-danger/35`。无灰色标题栏、无分隔线。
- 一行审批条最小高度 38px；按钮 26px 高。卡片按钮 28px 高。
- 目标路径：目录 `text-text-faint`，文件名 `text-text-main font-medium`，等宽字体；目录段过长时中段折叠为 `…`，目录可被 CSS 截断，文件名不截断；`title` 保留完整路径。

### 动词与按钮

| 工具 | 图标 | 动词 | 目标 | 主按钮 | 本会话 |
|---|---|---|---|---|---|
| read | `File` | 读取 | 文件路径 | 允许 | exact 建议存在时显示 |
| grep | `Search` | 搜索 | `pattern 于 scope` | 允许 | 同上 |
| glob | `Search` | 匹配 | `pattern 于 scope` | 允许 | 同上 |
| edit_diff | `Pencil` | 编辑 | 文件路径 + `+N −M` | 应用 | 同上 |
| write_diff | `FilePlus` | 写入 | 文件路径 + `+N` | 写入 | 同上 |
| delete | `Trash2` | 删除 | 文件路径 | 删除（danger 实心） | 不显示 |
| bash | `TerminalSquare` | 运行 | intent，缺省“Bash 命令” | 运行 | 不显示 |
| browser | `Globe2` | 使用浏览器 | Chrome | 本会话允许 | 不显示（主按钮即会话级） |

- 按钮三层固定顺序：拒绝（ghost）→ 本会话（描边 quiet，`title` 为建议的 `label`）→ 主动作（`bg-action` 实心；删除为 `bg-danger`）。
- 提交中：被点按钮前加 `Loader2` 旋转图标，全部按钮 disabled；提交失败恢复可点（保持现有行为）。
- 按下反馈：按钮 `active:scale-[0.97]`，只过渡 `transform` 与颜色。

### 原因映射

`getApprovalReasonChips(reason?: string)` 按行拆分 reason 文本：

| reason 文本 | 呈现 |
|---|---|
| `The requested file is outside the workspace.` | 标签“工作区外”（warning） |
| `This file may contain credentials and requires one-time approval.` | 标签“敏感文件”（danger） |
| `Allow Bash to run this command once?`、`Allow this file to be deleted once?`、`Bash command requires approval`、`delete_file is a destructive file operation and requires approval.` | 不显示（通用审批提示） |
| 其他非空文本 | 行尾一个 `Info` 图标，`title` 为原文，`aria-label="审批原因"` |

Bash 环境标签沿用 `EnvironmentBadge`（沙盒 / 真实环境）。浏览器固定标签“整个会话”（info）。

### 编辑与写入的改动

不默认展示 diff。`+N −M` 统计渲染为按钮（`aria-expanded`），点击后在审批条下方展开现有 `file-diff-content` 样式的 diff，再次点击收起。`diff` 为空或统计均为 0 时统计不可点。设计稿里写的是“在右侧面板查看”，但当前消息流没有把 pending diff 送到右侧面板的通道，内联展开复用已完成编辑卡的现有行为，改动更小；右侧面板方案留作后续。

## 风险

- 风险：未提交改动与本计划改同一批文件，容易覆盖用户在做的事。
  - 缓解：每个文件先读当前内容，只替换审批渲染部分；执行过程文档逐文件记录。
- 风险：一行审批条在 480px 窄窗口挤压。
  - 缓解：目录段 `min-w-0` 可截断、按钮 `flex-none`；保留 `workbench-responsive` 测试并在 480px 截图检查。
- 风险：reason 文本映射依赖英文字符串，后端改文案会退回 Info 图标。
  - 缓解：未知文本不丢失（Info 图标 + title）；reason code 透传列为后续事项。
- 风险：Bash 审批 `submitApproval` 目前忽略 `result.ok`。
  - 缓解：统一用共享 `submitApprovalDecision`，`ok: false` 时恢复按钮，并补测试。

## 里程碑与任务

1. **T1 共享部件**：新建 `components/messages/ApprovalParts.tsx`，导出 `ApprovalRow`、`ApprovalCard`、`ApprovalButton`（`ghost | quiet | primary | danger`，`busy`）、`ApprovalChip`（`neutral | warning | danger | info`）、`ApprovalPath`、`ApprovalReason`、`getApprovalReasonChips`、`compactApprovalDir`、`submitApprovalDecision`、`useApprovalDecision`、`useExactGrantSuggestion`。新增 `test/approval-parts.test.tsx`：目录折叠、四类 reason 映射、`ok: false` 返回 false。
2. **T2 读取/搜索/匹配**：`FileReadApprovalLine` 改用 `ApprovalRow`。更新 `tool-stream-typography.test.tsx` 中 pending read 用例：出现“工作区外”、按钮“拒绝 / 本会话 / 允许”，点击“本会话”提交 `{ decision: "session", suggestionId }`，不出现目录树建议。
3. **T3 编辑/写入**：`FileDiffApprovalCard` 改用 `ApprovalRow` + 可展开统计。更新 `file-diff-block.test.tsx` 审批用例：`应用`/`写入`、`拒绝`、`本会话`，统计按钮展开 diff。
4. **T4 删除**：`DeleteFileBlock` 改用 `ApprovalRow`（danger）。更新 `delete-file-block.test.tsx`：按钮“删除”/“拒绝”，不再断言英文标题。
5. **T5 Bash**：`BashApprovalBlock` 改用 `ApprovalCard`，底部左侧 `cwd`，移除 `Allowlist` 折叠与 `Reason:` 行。更新 `bash-run-block-tooltip.test.tsx`（拒绝后切为未执行、真实环境标签仍在、移除三点菜单用例）和 `workbench-responsive.test.tsx`（按钮名改为“运行”）。
6. **T6 浏览器**：`BrowserApprovalBlock` 改用 `ApprovalCard`，主按钮“本会话允许”。更新 `browser-approval-block.test.tsx`。
7. **T7 文档与收尾**：`front-中间消息区规范.md` 新增“工具审批”小节（两种形态、动词表、原因映射、按钮层级）；`front-icon-button-tooltip-guidelines.md` 删除“Bash 审批三点”条目；设计稿顶部注明定稿方向；写 history、执行过程与执行摘要；计划移入 `completed/`，更新 `docs/exec-plans/README.md`。

T1 先做，T2–T6 依赖 T1、彼此独立，T7 最后。

## 验证方式

- 命令（在仓库根目录）：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/approval-parts.test.tsx src/renderer/test/tool-stream-typography.test.tsx src/renderer/test/file-diff-block.test.tsx src/renderer/test/delete-file-block.test.tsx src/renderer/test/bash-run-block-tooltip.test.tsx src/renderer/test/browser-approval-block.test.tsx src/renderer/test/workbench-responsive.test.tsx src/renderer/test/app-streaming-user-message.test.tsx src/renderer/test/permission-mode-control.test.tsx`，预期全部通过（基线 8 个失败清零）。
  - `pnpm --filter @actspace/desktop build:renderer`
  - `pnpm check:frontend-theme`
- 手工检查：临时 Vite harness 页面（`apps/desktop/approval-harness.html` + `src/renderer/approval-harness.tsx`，验证后删除）渲染 8 种审批，headless Chrome 截图浅色、深色、480px 宽三组，与设计稿 B 方向对照。
- 真实桌面：Electron 中触发工作区外读取、编辑、删除、Bash、浏览器审批各一次，由用户验收（写入执行摘要）。

## 回退策略

每个组件改动独立；某一类出问题时，用 `git diff` 找到该文件的审批渲染段落，单独回退到本计划开始前的内容，`ApprovalParts.tsx` 可保留不影响其他组件。

## 进度记录

- [x] T1 共享部件与测试
- [x] T2 读取 / 搜索 / 匹配
- [x] T3 编辑 / 写入
- [x] T4 删除
- [x] T5 Bash
- [x] T6 浏览器
- [x] T7 文档、history、执行文档、归档

## 决策记录

- 2026-09-25：选定设计稿 B 方向。一行时按钮在行尾；多行卡片按阅读顺序把按钮放在底部右侧（用户反馈）。
- 2026-09-25：编辑/写入不默认展示 diff，删除与 Bash 不写解释句，风险只靠标签与颜色表达（用户反馈）。
- 2026-09-25：统计点击改为内联展开 diff，而非设计稿中的右侧面板，因为右侧面板没有 pending diff 的数据通道。
- 2026-09-25：不渲染 Bash 前缀授权占位按钮和“高风险”标签，避免出现没有真实能力支撑的界面。
- 2026-09-25：执行中发现文件名分到约 1% 的收缩量，少 0.6px 就出省略号；改为文件名 `shrink-0 max-w-full`、目录独自收缩。

## 执行模式

- **交互模式**：用户在线，按任务顺序推进。

## 执行文档

`docs/exec-runs/20260925-approval-card-redesign/execution-process.md` 与 `execution-summary.md`。
