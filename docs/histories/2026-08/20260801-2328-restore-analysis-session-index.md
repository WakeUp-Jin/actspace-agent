## [2026-08-01 23:28] | Task: 恢复分析观测会话索引

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> 分析观测应该先出现类似首页的会话列表，再进入具体会话；恢复已确认的 Demo 首页，并让返回按钮与设置页保持一致。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`、`docs`

**Key Actions:**

- **轻量会话索引**：新增跨 Session 分析摘要契约与 IPC，只读取未归档 Session 元数据和 Trace summary sidecar，不为首页解析完整 JSONL。
- **两阶段工作区**：设置入口先展示会话汇总、搜索、状态与模型筛选；当前会话只标记，用户选择后再钻取原有 Agent Run / Turn / LLM Call 详情。
- **统一返回语法**：首页返回设置，详情返回会话列表，两处复用无边框箭头加文字的返回控件。
- **故障隔离**：暂无 Trace 的会话仍进入列表；单个 Trace summary 损坏不会阻断其他会话。
- **首页视觉收口**：根据真实界面反馈缩窄阅读宽度、精简一级指标、把筛选并入列表工具栏，并以小圆点替代当前会话的整行灰色选中态。
- **标题层级收口**：移除会话索引首页重复的页面级标题栏，把纯箭头返回动作并入「会话记录」内容标题行；保留无障碍名称、窗口拖拽区域与详情页顶部汇总栏。

### 🧠 Design Intent (Why)

会话索引负责帮助用户选择分析对象，单会话详情负责解释执行证据。把两者拆成页面状态可以恢复原始 Demo 的核心流程，同时避免在详情页增加常驻第三栏。首页使用派生摘要而非完整事件流，保证会话数量增长后仍能保持可预测的加载成本；视觉上采用克制的单列开发工具布局，避免少量数据被拉成普通后台管理表格。

### ✅ Validation

- Shared build 通过。
- Agent Trace service、分析详情与会话工作区定向测试：3 个测试文件、13 个测试通过。
- Electron 与 Renderer TypeScript 检查通过。
- 首页视觉收口后，分析首页与详情定向测试：2 个测试文件、6 个测试通过。
- 索引标题层级收口后，分析首页与详情定向测试仍为 2 个测试文件、6 个测试通过；Renderer TypeScript、前端主题契约与文档骨架检查通过。
- 前端主题契约、文档骨架、Desktop 生产构建与 `git diff --check` 通过；构建仅保留既有的大 chunk 提示。
- Electron 视觉与交互验收按用户要求留给手动验证。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/agent-trace-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/analysis/AgentAnalysisWorkspace.tsx`
- `packages/desktop/src/renderer/components/analysis/AnalysisBackButton.tsx`
- `packages/desktop/src/renderer/components/analysis/AgentAnalysisPage.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `docs/design-docs/frontend/front-agent-analysis-observability.md`
