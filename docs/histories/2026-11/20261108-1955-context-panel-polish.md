## [2026-11-08 19:55] | Task: 上下文面板整理：事件有意义、明细分页并入「再显示」、去重复边框

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI (macOS)`

### 📥 User Query

> 上下文事件只显示「注入 · 上下文补充」看不出变了什么；「加载更多明细」看不懂；Bash 卡片不好看；边框叠在一起。在 demo 里选边框 B、Bash 一行总览 + 展开子命令、路径原样只平铺。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`apps/desktop`（main + renderer）、文档

**Key Actions:**

- **事件投影**（`CONTEXT_PROJECTOR_VERSION` 5）：
  - 补充事件按 owner 解析成「文件 / 运行 / 子 Agent / 后台」，写说明（新增、移除、模式变化、运行中条目），增减 = 同一 owner/id 前后估算之差。
  - 压缩增减 = 结束时总量 − 开始时总量。工具、模型、模式切换写「旧 → 新」或名单差异。
  - 事件带「第 N 轮 · 步 M」。同轮同来源连续更新合成一行 ×N。
- **明细分页**：非会话条目全在首页，会话条目从新到旧翻页；`entriesPage.bucketCounts` 给出每类总数。面板去掉「加载更多明细」，「再显示」在本地读完时顺带读下一页。
- **前端**：
  - 区块去卡片边框，只用横线分隔；统计格不画格线。
  - 事件改为列表：标签、标题、说明、增减、位置。
  - Bash 改为一行总览、无底色的值得注意、按程序（子命令摘要、浅底展开、只看失败）。
  - 路径去掉「按目录」，只平铺。

### 🧠 Design Intent (Why)

- 本地日志里补充事件全是文件清单和运行状态，全文就在 `data.text`。解析固定格式就能说清「变了什么」；解析不出来时退回「上下文补充 · id」，不报错。
- 分页按钮和「再显示」是两层翻页，合成一层；每类总数必须由后端给，否则「N 项」只等于已读的条数。

### 📁 Files Modified

- `packages/util/shared/src/context-panel.ts`
- `apps/desktop/src/main/runtime-v2/{context-history-events.ts(新),context-history-projection.ts,context-history-version.ts,context-panel-service.ts}`
- `apps/desktop/src/renderer/components/right-panel/context/*`（Panel、Parts、Stats、Events、Bash、bash-model、Paths、PathList、paths-model、Browser、ConversationList、use-context-panel）
- mock：`renderer/mock/context-panel-fixture.ts`、`mock/scenarios/context-pagination.ts`
- 测试：`main/test/{context-history-events(新),context-paths}.test.ts`、`renderer/test/{context-bash,context-paths,context-panel}.test.tsx`
- `scripts/native-button-baseline.json`
- 文档：`front-Context面板规范.md`、`context-panel-polish-demo.html`、前端与 exec-plans README、`exec-plans/active/20261108-context-panel-polish.md`
