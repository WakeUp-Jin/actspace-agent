# actspace Usage Statistics from session.jsonl

## 目标

把 Usage Statistics 页面从静态原型推进为真实可用的桌面端统计页：renderer 通过 IPC 获取由 `session.jsonl` 聚合出的统计快照，展示 token、成本、缓存、工具调用、热力图、趋势和每日明细，并保留成本弹窗与工具详情弹窗交互。

本计划只做统计页的数据聚合、IPC 契约、renderer 接入和页面落地，不重写 session 持久化底座，不改上下文控制数据模型，也不引入自定义时间选择器或导出能力。

## Required Reading

新会话或子 Agent 执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
- `docs/design-docs/agent-core/token-usage-and-context-state.md`
- `docs/design-docs/storage-and-observability.md`
- `docs/design-docs/agent-core/backend-agent-testing.md`

不要读取 `.env` 文件内容；只允许检查字段名、默认值、示例值和运行时错误信息。

## 背景

当前仓库已经有：

- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`：统计页视觉与结构规范。
- `docs/design-docs/frontend-ui/usage-statistics/prototype.html`：当前高保真单文件原型。
- `session.jsonl` / `meta.json` / `context-state.json` 的会话存储边界。
- `packages/desktop` 的 Electron 主进程、preload 与 renderer 骨架。

当前缺口是：

- 还没有把统计页真正接到会话事实数据。
- 还没有独立的统计聚合层。
- 还没有专用 IPC 来让 renderer 拿到统计快照。
- 还没有把当前原型页面接入真实应用态。

## 范围

包含：

- 定义统计页所需的只读数据快照类型。
- 从 `session.jsonl` 聚合 token、成本、模型、工具、缓存、热力图、趋势和明细数据。
- 在 `packages/agent-core` 新增统计聚合能力或共享读取 helper。
- 在 `packages/shared` 增加统计页 IPC 契约与共享类型。
- 在 `packages/desktop/src/main` 注册统计页 IPC。
- 在 `packages/desktop/src/preload` 暴露统计页读取接口。
- 在 `packages/desktop/src/renderer` 把现有统计页原型接入真实数据。
- 补足统计聚合与 renderer 的测试。
- 更新统计页设计文档、入口索引、history。

不包含：

- 不修改 `session.jsonl` 的事件模型。
- 不重写 token / context 控制底层地基。
- 不实现导出 CSV / PDF。
- 不实现自定义时间范围选择器。
- 不做实时更新或流式刷新。
- 不引入云端统计或账号级汇总。

## 设计原则

### 1. 统计页只消费事实，不自己猜数据

统计页的所有图表和表格都来自 `session.jsonl` 聚合后的视图模型。renderer 不读文件系统，不解析 JSONL。

### 2. 聚合层和展示层分离

`agent-core` 负责把 session 事件转成统计快照。`desktop` 负责通过 IPC 读取并展示。UI 不掺杂聚合规则。

### 3. 先做单会话视图，再做会话列表级联动

第一版只要求当前选中会话的统计视图可用，不做跨会话总览页。

### 4. 保持原型外观

当前 `prototype.html` 已经被验证为比较合适的视觉基线。实现时应尽量保持它的布局、密度和弹窗交互。

## 相关代码路径

- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
- `docs/design-docs/frontend-ui/usage-statistics/prototype.html`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/index.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/jsonl.ts`
- `packages/agent-core/src/persistence/recovery.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/*`
- `packages/desktop/src/renderer/fixtures/*`
- `packages/desktop/src/renderer/test/*`

## 数据契约草案

### `UsageStatisticsSnapshot`

```ts
export type UsageStatisticsSnapshot = {
  sessionId: string;
  title: string;
  updatedAt: string;
  range: "day" | "week" | "month" | "total";
  totalTokens: number;
  totalCost: number;
  currency: "USD" | "CNY";
  breakdown: {
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    reasoningTokens: number;
  };
  modelDistribution: Array<{
    modelId: string;
    label: string;
    tokens: number;
    percent: number;
    callCount: number;
  }>;
  toolDistribution: Array<{
    toolName: string;
    tokens: number;
    callCount: number;
    percent: number;
  }>;
  cacheEfficiency: {
    hitTokens: number;
    missTokens: number;
    percent: number;
  };
  heatmap: {
    days: Array<{ date: string; tokens: number; level: 0 | 1 | 2 | 3 }>;
    monthLabels: string[];
  };
  trend: Array<{ date: string; tokens: number }>;
  dailyRows: Array<{
    date: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    reasoningTokens: number;
    conversationCount: number;
  }>;
};
```

## 风险

- 风险：`session.jsonl` 的事件字段不完全齐全，导致聚合时出现空值或口径不一致。
  - 缓解方式：聚合层显式容错，缺失字段归零，不让 renderer 自己补逻辑。
- 风险：热力图、趋势和表格的聚合口径不同步。
  - 缓解方式：先统一同一份 snapshot 计算入口，再派生各个视图段。
- 风险：统计页与原型在交互上偏离。
  - 缓解方式：把当前原型作为视觉和交互基线，先做只读展示。
- 风险：统计聚合读盘性能影响启动或页面切换。
  - 缓解方式：第一版只在显式进入统计页时读取，必要时缓存当前 session 的 snapshot。

## 里程碑

1. 统计快照契约和聚合规则收敛。
2. agent-core 读取 `session.jsonl` 并产出快照。
3. shared / main / preload / renderer IPC 串起来。
4. 统计页 UI 接入真实数据并完成弹窗交互。
5. 测试、文档、history、桌面验证收尾。

## 实施任务

### Task 1: 定义统计快照契约

修改目标：

- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/index.ts`
- 必要时新增共享类型文件

步骤：

1. 定义 `UsageStatisticsSnapshot` 和其子结构。
2. 明确 `range`、`currency`、`dailyRows`、`heatmap` 的字段。
3. 让 IPC 契约能返回统计页只读快照。

验证：

- `pnpm typecheck`
- 共享类型能被 desktop 与 agent-core 正常引用。

状态：已完成。

### Task 2: 实现 session 聚合层

修改目标：

- `packages/agent-core/src/persistence/*`
- `packages/agent-core/src/context/*`
- 新增统计聚合模块或 helper
- 相关测试

步骤：

1. 从 `session.jsonl` 读取 `llm_usage`、`tool_call`、`context_snapshot`、日期信息。
2. 聚合 token、成本、模型分布、工具分布、缓存效率、热力图、趋势、每日表。
3. 对空会话、旧事件、缺字段做容错。

验证：

- `pnpm --filter @actspace/agent-core test`
- 单测覆盖空 session、普通 session、cache hit/miss、tool call 聚合。

状态：进行中。

### Task 3: 连接 desktop IPC

修改目标：

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/shared/src/ipc.ts`

步骤：

1. 注册统计页读取 IPC。
2. preload 暴露只读接口。
3. main 进程按 sessionId 或当前选中会话返回统计快照。

验证：

- `pnpm typecheck`
- 桌面端能通过 IPC 取到统计页快照。

### Task 4: 接入 renderer 页面

修改目标：

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/*`
- `packages/desktop/src/renderer/fixtures/*`

步骤：

1. 增加统计页页面态或路由入口。
2. 把现有原型布局接成真实数据。
3. 保留成本弹窗与工具弹窗。
4. 缺少 bridge 或真实 snapshot 时展示空态，不回退到 mock 业务数据。

验证：

- 浏览器环境里能看到统计页空态；完整统计图表只在有真实 snapshot 或测试 fixture 时渲染。
- 弹窗与 tab 交互正常。

### Task 5: 验证、文档、收尾

修改目标：

- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
- `docs/design-docs/frontend-ui/index.md`
- `docs/histories/2026-05/*`
- 必要时补 learning 文档

步骤：

1. 更新设计文档与入口索引。
2. 按结果补 history。
3. 如果实现中出现可迁移、带陷阱或有模式的知识点，再补 learning。

验证：

- `pnpm typecheck`
- `pnpm build`
- 浏览器 mock 验证统计页
- Electron 真实窗口验证统计页入口和数据加载

## 验证方式

- 命令：
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm --filter @actspace/agent-core test`
- 手工检查：
  - 浏览器中打开统计页原型或 renderer 页面，确认密度、弹窗和表格布局。
  - 检查工具弹窗、成本弹窗、tab 切换。
- 观测检查：
  - Electron 窗口加载正常。
  - `session.jsonl` 中的统计字段可被聚合并映射到页面。

## 进度记录

- [ ] 确认统计页契约和边界。
- [ ] 完成 session 聚合层。
- [ ] 接通 IPC / preload / renderer。
- [ ] 完成浏览器 mock 与 Electron 验证。
- [ ] 更新文档与 history。

## 决策记录

- 2026-05-26：统计页采用 `session.jsonl` 作为事实源，不直接让 renderer 解析文件；原因是保留桌面端边界、避免 UI 与持久化耦合。
- 2026-05-26：以当前 `prototype.html` 作为视觉基线，页面优先保持蓝色产品仪表盘密度，而不是回到旧绿色草稿。
