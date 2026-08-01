## [2026-08-01 19:52] | Task: 收口分析观测与工作台交互

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> 修复 Workspace 左键误触菜单，减轻右侧 Tab 选中态，精简分析观测标题与删除操作，改为相邻 Turn 翻页比较，并让 Tools 只显示实际调用过的工具。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs`

**Key Actions:**

- **工作台交互**：Workspace 菜单仅响应右键和键盘菜单键，右侧激活 Tab 改用轻量主题底色。
- **分析观测**：标题只保留页面名称，移除顶部删除按钮和任意比较对象下拉，增加相邻调用前后翻页。
- **Tools 语义**：从真实 `toolCall` 构建筛选索引；旧 summary 通过版本标记从 JSONL 重建并原子回写。
- **验证能力**：增加菜单、Tab、比较翻页、动态工具筛选和旧 sidecar 迁移回归测试。

### 🧠 Design Intent (Why)

减少低频或破坏性控制对高频分析路径的干扰，并确保筛选索引表达真实 Agent 行为，而不是模型可用能力清单。

### ✅ Validation

- `pnpm --filter @actspace/desktop test`：90 个测试文件、705 个测试通过。
- `pnpm --filter @actspace/agent-core test`：108 个测试文件、903 个测试通过。
- `pnpm typecheck`、`pnpm build`、`pnpm check:frontend-theme` 通过。
- 真实 Electron + Computer Use：验证 Workspace 左键无菜单、右键菜单可用、Review Tab 选中态、分析页信息收口、实际工具筛选与相邻 Turn 前后翻页。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/analysis/AgentAnalysisPage.tsx`
- `packages/agent-core/src/observability/agent-trace.ts`
- `packages/desktop/src/main/agent-trace-service.ts`
- `packages/shared/src/ipc.ts`
