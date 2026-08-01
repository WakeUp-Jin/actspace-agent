## [2026-07-29 23:24] | Task: 对齐 Agent 分析观测数据层级

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 将前端和持久化中误称为 `turnId` 的一次用户输入运行标识对齐为 `agentRunId`，保留后端真实 Turn 与 LLM 调用层级；开发阶段允许直接升级数据格式，并先用独立 HTML Mock 确认分析观测页面的两栏布局。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、本地数据脚本、架构与前端设计文档

**Key Actions:**

- **[Session V2]**: 用 `agentRunId → turnId → llmCallId` 统一一次用户输入、内部推理/工具步骤和真实 provider 请求的身份；旧 Session Schema 不再兼容读取。
- **[Runtime Lifecycle]**: Agent Loop 为每个内部 Turn 和每次 LLM 尝试生成稳定关联 ID，重试留在同一 Turn 但产生新的 LLM Call，并逐调用记录 usage、attempt 与耗时。
- **[Analysis Trace]**: 新增每个 Agent Run 一份 append-only Trace，记录脱敏后的系统提示词、消息、工具定义、响应、重试与层级事件；写入失败不影响主 Agent 流程。
- **[Desktop Alignment]**: Main、Preload、Renderer、Abort、Approval、Kairos 通知与 Session metadata 改用 Agent Run 语义，并新增受控的 Trace list/read IPC。
- **[Development Reset]**: 新增 dry-run 默认的 Session 数据清理脚本，只允许在显式绝对 data root 下删除 `sessions` 和 `cache-audit`。
- **[UI Prototype]**: 新增分析观测单文件 HTML Mock，采用两栏布局，支持搜索、Tools 筛选、用户输入折叠、Turn/LLM Call 切换、请求对比、JSON、cURL 和浅深主题。
- **[UI Prototype Refinement]**: 工具定义改为说明与参数卡片；消息按 User、Assistant、Tool Result 区分背景；响应改为结构化的思考、正文与工具调用展示；顶部补齐 In、Out、Cache Read、Cache Hit 等会话统计，并移除重复的用户输入预览。
- **[Context Comparison]**: 将简化 diff 卡片升级为大尺寸上下文增量查看器，支持在当前 Agent Run 内选择历史 LLM Call、使用前后按钮切换对比对象、折叠未变化消息，并以完整角色卡片展示新增与删除内容；同一 Turn 自动重试会明确提示请求上下文未变化。
- **[Ink & Emerald Alignment]**: 移除对比标题中的底层 LLM Call ID，并将原型从大面积角色色收敛为 ActSpace 暖中性灰阶；选中态、普通按钮、消息、工具和 Token 变化保持中性，翡翠绿与 Danger 红只用于运行状态、真实错误及低面积 Diff 新增/删除提示。
- **[Bright Analysis Palette]**: 根据视觉复核将浅色主题调整为亮白工作区与更轻的冷灰层级，降低弹窗遮罩浓度；浅蓝用于选择/User，浅绿用于当前调用/Assistant，浅紫用于 Tool Result，同时通过深色主题覆盖保持原有暗色表现。
- **[Production UI Specification]**: 在原型定稿后新增正式分析观测页面规范与 active execution plan，明确与 Agent 评估的边界、Settings 一键入口、两栏布局、Turn/LLM Call 交互、工具/消息/响应渲染、上下文对比、三态主题以及生产 Trace 索引、上限、保留和清理要求。
- **[Production Analysis Workspace]**: 设置导航新增「分析观测」直接入口，打开后整页接管为两栏工作区；左栏按用户输入 / Agent Run 折叠 Turn 并支持工具筛选，右栏按 LLM Call 展示工具定义、系统提示词、角色消息、Thinking / Text / Tool Call / Error、完整 JSON、请求 JSON、规范化 cURL 和相邻请求差异。
- **[Trace Summary & Bounded Reader]**: 每个 Agent Run 维护原子 `summary.json` sidecar；Main 通过 Session V2 + sidecar 构建轻量索引，完整 JSONL 只在选中 Run 时懒加载，并限制为 64 MiB / 100,000 事件、拒绝符号链接和中间坏行、隔离单个损坏 Run。
- **[Retention & Cleanup]**: 应用启动后异步执行 30 天 / 512 MiB 全局保留清理，只删除最旧终态 Trace、保护 recording Run；清理 IPC 仅删除 `traces/`，不删除 `session.jsonl`。
- **[Theme & Accessibility]**: 新增 Analysis 三态主题 token、亮白浅色工作区、浅蓝 / 浅绿 / 浅紫低面积数据编码、820px 覆盖式导航，并补运行状态文字、Dialog Escape / focus trap / opener focus restore。

### 🧠 Design Intent (Why)

一次用户输入、一次内部推理步骤和一次真实网络请求具有不同生命周期。继续复用 `turnId` 会让聊天渲染、终止、usage、重试与分析页面产生错误归属。Session 负责可靠恢复，Trace 负责可删除的深度分析，两者拆开后既能保留完整观测证据，也不会让恢复事实日志因完整上下文快照而失控膨胀。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/observability/agent-trace.ts`
- `packages/desktop/src/main/agent-run.ts`
- `packages/desktop/src/main/agent-trace-service.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `scripts/reset-session-data.mjs`
- `docs/design-docs/agent-runtime/agent-observability-trace-model.md`
- `docs/design-docs/frontend/front-agent-analysis-observability-prototype.html`
- `docs/design-docs/frontend/front-agent-analysis-observability.md`
- `docs/exec-plans/active/20260730-agent-analysis-observability-page.md`

### ✅ Validation

- shared build、typecheck 和 tests 通过。
- agent-core 本次相关 engine、bridge 和 observability tests 通过；完整测试中的既有工具断言差异与沙箱 Unix socket `EPERM` 单独记录，不归因于本次迁移。
- desktop typecheck 与完整 tests 通过。
- 清理脚本在临时目录验证 dry-run、显式确认删除与根路径拒绝。
- HTML 原型在 1440×900、900×900 下完成浏览器验证；搜索、筛选、折叠、调用切换、对比弹窗和主题交互正常，控制台零错误。
- 根据页面批注完成第二轮视觉调整；内联脚本语法和主题颜色契约通过，当前环境的浏览器安全策略不允许 Agent 刷新 `file://` 页面，因此最终视觉状态由用户在现有页面手动刷新确认。
- 对比弹窗完成第三轮交互调整，覆盖跨 Turn 上下文增量、同 Turn 重试、对比对象切换、Token 差值及系统提示词、工具定义、模型变化展示。
- Agent Trace writer 与 Main service 定向测试通过，覆盖 failed summary、损坏 sidecar 回退、损坏 Run 隔离、过期终态清理和 active Trace 保护。
- Production Renderer 测试通过，覆盖设置入口、独立工作区、两级导航、结构化工具 / 消息 / 响应和不暴露 LLM Call ID 的请求对比。
- shared / agent-core build、desktop typecheck、renderer production build、三态主题契约与 `git diff --check` 通过；Vite 仅保留既有大 chunk 警告。
- 在当前 Codex worktree 的独立 Vite 端口验证 Settings → 分析观测入口和无 Electron bridge 空状态，控制台没有该端口的新错误；真实 Electron 历史 Trace、Retina、长内容滚动与真实 provider 仍由用户人工验收。
- 当前请求 JSON / cURL 基于 ActSpace provider-neutral request snapshot，不等同于供应商原始 HTTP wire payload；UI 与文档均明确这一边界，原始网络层捕获留作后续独立能力。
- 全量测试审计中，Desktop 并行套件唯一 Sidebar “See more” 失败在单文件复跑 34/34 通过；Agent Core Browser Unix socket 的沙箱 `EPERM` 在沙箱外复跑 13/13 通过。剩余一个 ToolManager 权限拒绝文案断言为本任务前已存在的稳定差异，未在本次观测范围内修改。
