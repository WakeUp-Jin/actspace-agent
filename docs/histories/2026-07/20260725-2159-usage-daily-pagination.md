## [2026-07-25 21:59] | Task: 收紧 Usage 每日明细高度

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 每日明细只展示 5 条并增加分页，让 Usage 左右栏高度更协调，减少工具调用卡下方的大块留白。

### 🛠 Changes Overview

**Scope:** `packages/desktop` + Usage frontend docs

**Key Actions:**

- **每日明细本地分页**: 每页固定展示 5 天，支持上一页、下一页、行号范围和页码反馈。
- **范围切换复位**: 切换日 / 周 / 月 / 总计时，每日明细自动回到第一页；数据减少时当前页自动收敛到有效页。
- **表格密度优化**: 收紧单元格横向间距和最小宽度，取消内部纵向滚动，只在窄窗口保留横向滚动。
- **回归保护**: 增加 5 行分页、翻页和范围切换复位的 renderer 测试。

### 🧠 Design Intent (Why)

每日明细的完整数据已经随 Usage snapshot 返回，不需要为纯展示分页增加新的 IPC 状态。固定 5 行能直接控制右栏高度，让左侧工具调用卡不再被整列高度拉出大块空白，同时保留完整日期数据的可查询性。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `docs/design-docs/frontend/front-usage-statistics.md`
