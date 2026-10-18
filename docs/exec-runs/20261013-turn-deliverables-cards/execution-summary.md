# 轮尾改动卡与交付文件卡 — 执行摘要

> 2026-10-18 状态校准：实现已合入；真实文件写入及 present 结果见 20261018 近期验收，本轮另修复别名工作区的相对路径缺陷；原生应用/远端下载边界继续保留。

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261013-turn-deliverables-cards.md`
- **执行过程**：`docs/exec-runs/20261013-turn-deliverables-cards/execution-process.md`
- **执行模式**：交互
- **执行结果**：T1–T11 代码与文档完成；浏览器核对完成，Electron 实机验收留给用户

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `present` 工具 | `packages/tools/filesystem-read` | 只在 Agent 模式可用，最多 4 个文件，只接受工作区内相对路径；提示词加「输出方式选择」 |
| `present` 投影 | `packages/shared/src/session.ts`、`packages/client/src/sessions/tool-card.ts`、`session-selectors.ts` | 新增 `PresentedFile`、`present` 预览与 MessageBlock |
| 关联应用 IPC | `apps/desktop/src/main/file-applications-service.ts` | macOS JXA 查关联应用（含图标），`workspaces.listFileApplications` / `workspaces.openFile`（open / reveal） |
| 文件类型图标 | `apps/desktop/src/renderer/components/files/` | 移植 DSH 的 `FileTypeIcon`、`CodeFileIcon` 与 48 个代码图标；附 `DEEPSEEK_HARNESS_LICENSE.txt` 并记入 `NOTICE` |
| 轮尾数据推导 | `apps/desktop/src/renderer/components/turn-tail/turn-tail-data.ts` | 只读本轮 write/edit/delete/present 事件；新建文件去掉幽灵空行；本轮新建又删掉的文件不计 |
| 改动卡与悬停 diff | `.../turn-tail/TurnChangesCard.tsx` | 单文件 / 多文件头部、折叠、悬停 500ms 浮层（宽 = 卡片宽 − 48，最高 420px） |
| 每轮 Review 标签 | `.../turn-tail/TurnReviewView.tsx`、`right-panel/RightPanelContext.ts` | 右侧「第 N 轮改动」：左右对比 / 单栏、换行、文件菜单、打开整个文件 |
| 交付卡与打开方式 | `.../turn-tail/TurnDeliverables.tsx`、`OpenWithButton.tsx`、`open-turn-file.ts` | 卡片网格、折叠、预览、默认应用 + 关联应用下拉（末项「显示文件位置」） |
| 设置开关 | `apps/desktop/src/main/settings/`、`.../turn-tail/useShowTurnCodeChanges.ts` | `general.showTurnCodeChanges` 默认开，只隐藏改动卡；模块级共享订阅，切换即时生效 |
| 图片列表收缩 | `.../messages/TurnOutputArtifacts.tsx` | 只收录生成图片，文件改由两张新卡承载 |
| TurnView 接线 | `.../conversation/TurnView.tsx`、`ConversationView.tsx` | 最终回复下依次是改动卡、交付卡、图片列表；历史未加载完时不显示轮号 |
| mock 与测试 | `renderer/mock/scenarios/turn-deliverables.ts`、`renderer/test/turn-tail*.tsx` | 两轮场景数据；`mock-db` 支持按轮工具事件 |

## 验证结果

- `turn-tail.test.tsx` 10 项、`turn-tail-data.test.ts` 10 项、`turn-output-artifacts.test.tsx` 15 项、`mock-bridge.test.ts` 20 项通过。
- filesystem-read、prompt、core/agent、runtime 组合、selector / tool-preview 测试通过。
- `check:frontend-theme`、`check:frontend-tokens`、`check:ipc-channels`、`check:renderer-bridge` 通过。
- desktop renderer / main typecheck 通过。
- 浏览器截图：`screenshots/`（亮色、暗色、悬停浮层、480px 亮 / 暗，`?mock=turn-deliverables`）。

## 人工验证指引

### 必须验证

1. **真实模型调用 `present`**
   - 验证方式：Electron 里让 Agent 交付 1–4 个文件。
   - 预期结果：最终回复下方出现交付卡，文件名、描述、图标正确，点击在右侧预览。

2. **原生打开方式**
   - 验证方式：对 `.docx` / `.xlsx` 之类的文件点默认应用按钮，并展开下拉选择 Word / Excel，再用末项「显示文件位置」。
   - 预期结果：按选择的应用打开；「显示文件位置」在 Finder 中选中该文件；下拉里每个应用带图标和本地化名称。

3. **关联应用查询耗时**
   - 验证方式：首次打开含交付卡的历史会话。
   - 预期结果：卡片不卡顿（本机实测 JXA 约 0.44 秒，按路径缓存）。

### 可延后验证

1. **远端会话的交付卡**
   - 验证方式：连一台真实 Host，对远端会话交付文件后点击预览、右键下载。
   - 预期结果：走 Host 读取与下载，不出现原生应用按钮；失败时给出中文说明。

2. **设置开关的持久化**
   - 验证方式：关掉「显示本轮代码改动」后重启应用。
   - 预期结果：改动卡保持隐藏，交付卡和图片列表不受影响。

## 已知边界

- diff 没有语法高亮（第一版不做）。
- 同一文件多次编辑时，各段 hunk 行号以各自编辑时的文件为准，不合并。
- 关联应用列表只在 macOS 提供；Windows / Linux 只有默认打开和在文件夹中显示。
- 本轮未改动另一会话正在编辑的 `ProviderSettings.tsx`、`CustomConnectionModels.tsx`、`styles/index.css`、`model-connection.css`、`composer/composer-stats.ts`；这些文件当时的 typecheck 与 token 报错与本计划无关。
