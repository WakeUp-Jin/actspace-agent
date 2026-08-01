# Agent 分析观测生产页面执行计划

> 状态：2026-08-01 实现完成并归档。自动化验证已完成；真实 Electron 长会话、Retina 与多 provider 人工验收仍由发布验收单独执行，不影响计划生命周期。

## 目标

在现有 Session V2 与 Agent Trace 基础上，实现一个从设置页进入、整页接管的生产级分析观测工作区，使开发者能够按“用户输入 / Agent Run → Turn → LLM Call”查看当前 Session 的真实请求上下文、响应、工具定义、token、缓存、耗时和相邻请求差异；同时补齐轻量索引、体积上限、保留与清理能力，避免生产 UI 通过读取全部 JSONL 才能工作。

## 范围

- 包含：
  - 正式页面规范与原型对齐。
  - 设置页「分析观测」入口和 `analysis` 独立 view。
  - 当前活动 Session 的两栏分析页面。
  - Trace summary sidecar 与分析索引 IPC。
  - 选中 Agent Run 的完整 Trace 懒加载与视图模型适配。
  - 搜索、Tools 筛选、Agent Run 折叠、Turn/LLM Call 切换。
  - 工具定义、系统提示词、消息、响应与完整 JSON 展示。
  - Request JSON、脱敏 cURL 和“对比上次”大弹窗。
  - Trace 单文件上限、全局保留策略和显式清理。
  - 浅色、深色、跟随系统、紧凑窗口与键盘访问。
  - 单元测试、Renderer 测试、Main 测试、浏览器 Mock 与真实 Electron 人工验收清单。
- 不包含：
  - 数据集执行、Eval 评分、排行榜或回归报告。
  - 多供应商本地代理、TLS 中间人或外部应用流量抓取。
  - 独立工具执行详情面板。
  - 跨 Session 常驻导航与全局 Trace 搜索。
  - Trace 云同步、分享、导出包或请求重放。
  - 兼容旧 Session V1 或迁移旧开发 Trace。
  - 真实 provider 付费调用的自动验收。

## 背景

- 相关文档：
  - `docs/design-docs/frontend/front-agent-analysis-observability.md`
  - `docs/design-docs/frontend/front-agent-analysis-observability-prototype.html`
  - `docs/design-docs/agent-runtime/agent-observability-trace-model.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
  - `docs/design-docs/frontend/front-设置页规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/RELIABILITY.md`
- 相关代码路径：
  - `packages/shared/src/{session,ipc}.ts`
  - `packages/agent-core/src/observability/agent-trace.ts`
  - `packages/agent-core/src/engine/bridge.ts`
  - `packages/desktop/src/main/agent-trace-service.ts`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/preload/index.ts`
  - `packages/desktop/src/global.d.ts`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/settings/{SettingsNav,SettingsPage}.tsx`
  - `packages/desktop/src/renderer/styles/{tokens,tailwind}.css`
- 已知基础：
  - Session V2 已区分 `agentRunId`、`turnId`、`llmCallId`。
  - 每个 Agent Run 已写入独立脱敏 JSONL Trace。
  - Main/Preload 已有 `listAgentTraces/readAgentTrace`，但列表实现会完整读取每个 JSONL 才生成摘要。
  - 当前 `AgentTraceSummary` 只有时间、Turn/Call/Retry/Event 数，无法直接渲染用户输入分组、工具筛选、模型、Token 和 Turn 行。
  - 当前 Trace 没有自动保留、单文件上限或产品内清理入口。
  - `WorkbenchLayout` 已支持 Settings 整页接管，可以复用相同 view 切换边界。
- 已知约束：
  - Renderer 不直接读取文件系统。
  - Trace 丢失、损坏或写入失败不能影响聊天恢复与 Agent Run。
  - 页面颜色必须使用主题感知 token，并通过浅色、深色、system-dark 三分支。
  - 自动测试不等于真实 Electron / Retina / provider 验收。

## 目标架构

```text
SettingsNav "分析观测"
        │
        ▼
WorkbenchLayout view="analysis"
        │ activeSessionId
        ▼
AgentAnalysisPage
  ├─ getAgentAnalysisIndex(sessionId)
  │    ├─ Session V2 user_message / run status
  │    └─ traces/*.summary.json
  └─ readAgentTrace(sessionId, agentRunId) 仅选中 Run
        │
        ▼
buildAgentAnalysisViewModel(events)
  ├─ Turn / LLM Call 导航
  ├─ request / response panels
  ├─ normalized request diff
  └─ sanitized cURL
```

### 建议新增契约

```ts
type AgentAnalysisIndexInput = { sessionId: string };

type AgentAnalysisRunSummary = {
  sessionId: string;
  agentRunId: string;
  userMessagePreview: string;
  startedAt: string;
  endedAt?: string;
  status: "recording" | "completed" | "failed";
  truncated: boolean;
  turnCount: number;
  llmCallCount: number;
  retryCount: number;
  toolNames: string[];
  modelNames: string[];
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  durationMs?: number;
  turns: AgentAnalysisTurnSummary[];
};

type AgentAnalysisIndexResult = {
  sessionId: string;
  title: string;
  totals: AgentAnalysisTotals;
  toolNames: string[];
  runs: AgentAnalysisRunSummary[];
};
```

每个 `traces/<agentRunId>.summary.json` 只记录脱敏导航元数据，不复制 system prompt、完整 messages 或响应正文。完整内容仍只存在对应 JSONL。

## 风险

- 风险：列表页继续完整读取所有 Trace，长会话打开速度和内存不可控。
  - 缓解方式：每个 Run 写独立 summary sidecar；索引 IPC 只合并 Session V2 关联与 sidecar，完整 JSONL 仅选中时读取。
- 风险：sidecar 与 JSONL 因崩溃或写失败不一致。
  - 缓解方式：JSONL 仍是证据事实源；sidecar 原子写并带 schemaVersion。sidecar 缺失或失效时只对单个 Run 做受限回退重建；不可读 Run 隔离，不阻断其余索引。
- 风险：Trace 体积不断增长，页面功能反而放大磁盘和隐私风险。
  - 缓解方式：首版同时实现 64 MiB/Run、30 天、512 MiB 全局上限和显式清理；活跃 Trace 不自动删除。
- 风险：一个活动 Agent Run 正在追加，读取到半行或不完整响应。
  - 缓解方式：writer 始终以完整 JSON 行追加；reader 忽略文件末尾唯一不完整行并标记 recording，不容忍中间坏行。
- 风险：差异算法把 ID、时间戳等易变字段当作上下文变化。
  - 缓解方式：建立独立 canonicalizer，按角色、内容、工具参数和安全请求选项比较，显式排除易变字段。
- 风险：工具定义、消息和响应组件分别解析原始 payload，产生三套不一致逻辑。
  - 缓解方式：建立单一 `AgentAnalysisLlmCallView` 适配层；组件只渲染，不推断事件语义。
- 风险：浅蓝、浅绿、浅紫大面积使用后与 ActSpace 现有 Ink & Emerald 冲突。
  - 缓解方式：颜色只作为低面积分析数据编码并抽成页面级 token；主操作、全局导航、focus 和运行状态继续消费既有语义 token。
- 风险：设置入口直接切页后丢失用户原来的设置位置。
  - 缓解方式：`SettingsPage` 把当前 section 提升或通过回调保存，返回时恢复原 section。
- 风险：Mock 测试通过但真实 Electron bridge、滚动和窗口尺寸异常。
  - 缓解方式：自动测试、浏览器 Mock、真实 Electron 人工验收分别记录，不互相替代。

## 里程碑

### 1. 契约与 Trace summary

- 扩展 Shared IPC：新增分析索引、Trace 清理结果、summary schema 和 `truncated` 状态。
- 在 Agent Trace writer 中维护当前 Run 的轻量统计：Turn、LLM Call、模型、工具名、usage、cache、duration、retry 和状态。
- 每次关键事件后原子更新 `<agentRunId>.summary.json`；高频 token delta 不参与 summary 写入。
- `agent_run_end` 完成最终 summary；异常关闭时保留 recording 状态，读取层可根据活动运行或文件时间判断 stale。
- JSONL 保持现有请求/响应事实格式，必要时新增 `trace_truncated` 事件。
- 验证：
  - writer summary 单元测试。
  - 崩溃前 recording summary、正常结束、重试、多模型、多 Turn、脱敏字段测试。
  - `@actspace/shared` build/typecheck/test。
  - `@actspace/agent-core` 定向 observability/bridge test。

### 2. Main 索引、读取上限、保留与清理

- 新增 `getAgentAnalysisIndex(sessionId)`：
  - 读取 Session V2 的用户输入与 Agent Run 关联。
  - 读取每个 Run 的 summary sidecar。
  - 生成顶部 totals、Tools 集合和按用户输入排序的 Run 列表。
- 重构 `listAgentTraces`，不再默认读取全部 JSONL。
- `readAgentTrace` 增加普通文件、符号链接、最大字节数、最大事件数和末尾半行处理。
- sidecar 缺失或损坏时对单个 Trace 做受限重建；中间坏行返回明确错误，不吞掉证据损坏。
- 新增 Trace retention service：
  - 单 Run 64 MiB。
  - 全局 30 天。
  - 全局 512 MiB。
  - 只清理最旧已完成 Trace 与 sidecar，不删除活动 Trace 或 `session.jsonl`。
- 新增“清除当前 Session”和“清除全部 Trace”IPC；Main 返回删除文件数与释放字节数。
- 在应用启动后异步执行一次保留清理，失败只记日志。
- 验证：Main service tests 覆盖 traversal、symlink、坏行、缺失 sidecar、上限、清理范围、活跃文件保护和 fail-soft。

### 3. Analysis view 外壳与设置入口

- 将 `SidebarView` 扩展为 `analysis`。
- `SettingsNav` 在「归档会话」与「更新」之间增加直接操作项「分析观测」。
- `SettingsPage` 新增 `onOpenAnalysis`，并保存当前设置 section；该入口不是普通 SettingsContent 分区。
- `WorkbenchLayout` 在 `view === "analysis"` 时整页渲染 `AgentAnalysisPage`，传入 `activeSessionId`、Session title 和返回设置回调。
- 返回设置时恢复之前的设置 section；没有活动 Session 时传入最近未归档 Session 或展示空状态。
- Analysis 不渲染聊天 Sidebar、RightPanel 或 SettingsNav。
- 验证：SettingsPage 与 WorkbenchLayout 测试锁定一键进入、两栏接管、返回恢复和无 Session 空状态。

### 4. 视图模型与页面两栏

- 新增建议目录：
  - `packages/desktop/src/renderer/components/analysis/AgentAnalysisPage.tsx`
  - `packages/desktop/src/renderer/components/analysis/AgentAnalysisSidebar.tsx`
  - `packages/desktop/src/renderer/components/analysis/AgentAnalysisDetail.tsx`
  - `packages/desktop/src/renderer/components/analysis/analysis-view-model.ts`
  - `packages/desktop/src/renderer/components/analysis/analysis-types.ts`
- 页面初始化只请求分析索引，默认选择最近 Run 的最后一个 Turn 和最后一个成功/可见 LLM Call。
- 切换 Run 时懒加载完整 Trace，并在当前页面生命周期缓存已读取 Run；切换同 Run 的 Turn/Call 不重复 IPC。
- 实现顶部统计、搜索、单选 Tools 筛选、Agent Run 折叠和 Turn 行。
- 搜索与 Tools 筛选使用 AND；过滤后自动选择第一个可见 Turn，若无结果进入筛选空状态。
- 活跃 Run 不做高频 tail；重新进入页面时读取最新 index 和当前 Trace。
- 验证：纯函数测试覆盖乱序防御、缺字段、重试、多模型和筛选；Renderer 测试覆盖选择与缓存行为。

### 5. LLM Call 详情渲染

- Turn 内调用数大于 1 时显示 LLM Call 切换器。
- 实现调用元数据条，并确保所有 Panel 绑定同一个选中 Call。
- 工具定义：description + 参数列表 + 嵌套 schema 展开；不默认显示 raw JSON。
- 系统提示词：长文本、复制、字符计数和内部滚动。
- 消息：User / Assistant / Tool Result / System 角色卡片，支持长输出展开。
- 响应：Thinking 灰色块、Assistant Markdown、Tool Call 卡片、Error 块。
- 完整 JSON：默认收起、格式化、复制。
- provider 未返回字段时采用隐藏或 `—`，不推导伪数据。
- 验证：组件测试覆盖仅文本、thinking + 文本、toolUse、错误、无 usage、超长 Tool Result 和未知 content block。

### 6. Request JSON、cURL 与请求差异

- Request JSON 弹窗读取当前 Call 的脱敏 request snapshot。
- cURL 生成器使用 provider-neutral 请求快照和凭据占位符，并明确提示它不是原始 HTTP wire payload。
- 新增 `normalizeLlmRequestForDiff` 与 `diffLlmRequests` 纯函数：
  - 识别完全相同的消息前缀。
  - 按完整角色卡片输出 added/removed messages。
  - 分开比较 system prompt、tools、model 和请求选项。
  - 忽略 ID、时间戳和其他易变字段。
- 对比弹窗默认选择当前 Run 内前一 Call；支持更早 Call 选择和前后切换。
- 跨 Turn 标题与同 Turn 重试标题按规范显示；不展示 LLM Call ID subtitle。
- 验证：diff 测试覆盖跨 Turn 新 Tool Result、同 Turn重试无上下文变化、工具 schema 变化、system prompt 变化、模型变化和删除消息。

### 7. 主题、响应式与可访问性

- 在 `tokens.css` 定义或映射 Analysis 页面语义 token，并补 light、dark、system-dark。
- 在 `tailwind.css` 暴露必要语义类；组件禁止 `bg-white`、`text-black`、hex 或 rgba 主题字面量。
- 浅色主题以白色 surface 和低饱和角色背景为主；Dark 主题重新校准而非简单反相。
- `<= 820px` 时左栏改覆盖式 Sheet，右栏全宽；弹窗占满可用区域。
- 补键盘 focus、`aria-expanded`、Dialog focus trap、Escape、焦点恢复和非颜色状态标签。
- 验证：
  - `pnpm check:frontend-theme`
  - Renderer 颜色防回流测试。
  - 1440×900、900×900、480px 宽浏览器 Mock。
  - Light、Dark、System 三态截图与键盘走查。

### 8. 文档、History 与完整验证

- 同步：
  - `docs/design-docs/agent-runtime/agent-observability-trace-model.md`
  - `docs/design-docs/frontend/front-设置页规范.md`
  - `docs/design-docs/frontend/README.md`
  - `docs/RELIABILITY.md`
  - `docs/QUALITY_SCORE.md`
- 继续更新 `docs/histories/2026-07/20260729-2324-align-agent-observability-data.md`，不重复新建同任务 history。
- 检查是否命中新学习文档条件；若实现中形成可迁移的“append-only trace + sidecar index + bounded reader”模式，则按指南补学习文档。
- 完成全量验证并记录真实结果，不把浏览器 Mock 写成 Electron 已验收。

## 验证方式

### 自动命令

```sh
pnpm --filter @actspace/shared build
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/shared test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/agent-core exec vitest run src/observability/test/agent-trace.test.ts src/engine/test/bridge.test.ts
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:frontend-theme
pnpm check:docs
pnpm check:secrets
pnpm build
git diff --check
```

若 shared 声明有变化，必须先 build `@actspace/shared`，再运行 agent-core 与 desktop 的类型检查。

### 浏览器 Mock

- 使用真实 React 页面配 Mock bridge 数据，不只复查独立 HTML 原型。
- 检查搜索、Tools 筛选、折叠、Turn/Call 切换、五个详情区和三个顶部操作。
- 检查 1440×900、900×900、480px；Light、Dark、System。
- 检查控制台零错误、无横向页面溢出、长 JSON/Prompt/Tool Result 只在各自容器滚动。

### Electron 人工验收

- 从 Settings 一键进入 Analysis，Settings 侧栏消失；返回后恢复原设置分区。
- 当前 Session 的用户输入、Turn、LLM Call 数与真实运行一致。
- 制造一次 MockLLM 重试，确认同 Turn 出现多个 Call 且请求对比显示上下文未变化。
- 运行一次工具链，确认工具调用在响应、工具结果在下一请求消息与 Diff 中出现。
- 确认 Request JSON 与 cURL 已脱敏。
- 确认清理 Trace 后聊天会话仍可恢复。
- 真实 provider / Retina / 原生滚动条由用户手动验收；本计划不授权自动发起付费调用。

### 观测检查

- 打开长 Session 时，Main 日志不出现“读取全部 Trace 才生成列表”的行为。
- 单 Trace 超限后 Agent Run 继续完成，summary 标记 truncated，页面显示裁剪提示。
- retention 删除最旧 completed Trace，不删除 active Trace、settings、keys、workspace 或 `session.jsonl`。
- 单个坏 Trace 不阻断其余 Run 的索引和查看。

## 进度记录

- [x] 2026-07-30：确认产品边界、两栏信息架构、工具展示、响应展示、请求对比与视觉方向。
- [x] 2026-07-30：完成正式页面规范与生产执行计划草案。
- [x] 审核设计规范、首版范围与 Trace 默认保留数值。
- [x] 完成 Shared 契约与 Trace summary sidecar。
- [x] 完成 Main 分析索引、读取上限、保留与清理。
- [x] 完成 Settings 入口与 Analysis 独立 view。
- [x] 完成两栏页面、筛选、Turn/LLM Call 导航与详情区。
- [x] 完成 JSON、规范化 cURL 与请求差异。
- [x] 完成三态主题、响应式和可访问性。
- [x] 完成自动验证、当前 worktree 浏览器入口/空状态验证与文档收尾。
- [ ] 用户在真实 Electron 中验收历史 Trace、长内容滚动、Retina 与真实 provider；不由自动测试替代。

### 2026-07-30 实现验证记录

- `pnpm build`、desktop typecheck、Shared 全量 64 tests、Analysis/Trace/Settings/Workbench 定向 tests、主题、docs、secrets 与 `git diff --check` 通过。
- Desktop 全量 543 tests 中 Analysis 新增测试全部通过；并行运行时 `sidebar.test.tsx` 有 1 个既有 “See more” 状态抖动，单文件复跑 34/34 通过。
- Agent Core 全量 871 tests 中 Browser Unix socket 的 10 个沙箱 `EPERM` 在沙箱外复跑 13/13 通过；另有 1 个既有 ToolManager 权限拒绝文案断言稳定失败，与本功能无关。
- 当前 worktree 在独立 Vite 端口完成 Settings → Analysis 入口、整页接管和无 bridge 空状态验证；未启动 Electron、未发起真实 provider 调用。

## 决策记录

- 2026-07-30：分析观测只读真实 Session Trace；Agent 评估继续独立负责数据集运行和评分。
- 2026-07-30：Settings 增加一键入口，Analysis 采用整页接管；不保留 Settings 侧栏。
- 2026-07-30：首版只分析当前活动 Session，不增加常驻 Session 导航。
- 2026-07-30：左栏按用户输入 / Agent Run 分组 Turn，右栏在 Turn 内切换 LLM Call。
- 2026-07-30：不增加独立工具执行面板；执行结果通过后续消息与请求差异观察。
- 2026-07-30：生产列表使用每 Run summary sidecar，禁止为生成导航读取全部 JSONL。
- 2026-07-30：首版建议 Trace 默认上限为 64 MiB/Run、30 天、512 MiB 全局；审核后再进入实现。
- 2026-07-30：浅蓝、浅绿、浅紫只作为 Analysis 页面数据编码，所有颜色通过三态主题 token 接入。
- 2026-07-30：生产实现完成；请求 JSON 与 cURL 当前基于 provider-neutral snapshot，原始 HTTP wire 捕获留作后续独立能力。
