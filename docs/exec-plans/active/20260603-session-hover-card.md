# Session Hover Card 执行计划

## 目标

在左侧会话列表中，为每条会话增加一个 hover/focus 信息卡片，帮助用户快速确认当前会话归属的完整 workspace 路径、最近使用模型和 context 使用情况。第一版只做只读展示，不加入路径操作、模型切换或 workspace 管理功能。

## Required Reading

执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/front-主题与配色规范.md`
- `docs/design-docs/core-storage-and-observability.md`

## 范围

包含：

- 左侧 `Sidebar` 会话行 hover/focus 时显示一张信息卡片。
- 卡片显示会话标题、完整 workspace path、最近模型 label、context 百分比和 token 比例。
- workspace path 使用完整绝对路径，不使用 `~/...` 或中段省略；超长路径在卡片内换行。
- 模型优先从该 session 最近一次 `llm_usage` 或 `AssistantReply` 中解析，并映射到 `MODEL_REGISTRY` 的用户可读 label。
- context 优先从该 session 最新 `context_snapshot` 或 `contextState` 读取；没有数据时隐藏 context 行。
- 支持鼠标 hover 与键盘 focus；不改变现有点击会话行为。
- 补 renderer 单测，覆盖完整路径、模型、context 和缺失数据降级。

不包含：

- 不显示截图中第一行的 repo / branch 信息。
- 不做路径复制、打开 Finder、切换 workspace、删除 workspace。
- 不做模型切换、模型配置入口或成本详情。
- 不做完整 Context 弹窗复用；hover card 只展示摘要。
- 不修复 workspace 重名本身；重名 workspace 的区分可以由完整路径解决，后续可单独做 workspace label disambiguation。

## 背景

- 触发场景：左侧 Workspaces 中可能出现两个同名 `actspace-agent`，实际路径分别是主项目目录和 Codex worktree。会话行只显示标题时，用户很难判断这个会话属于哪个 workspace。
- 目标体验：用户把鼠标移到会话行上，即可看到完整路径、模型和 context 用量，不需要先点进会话或打开右侧 Context 视图。
- 设计取舍：信息卡片保持轻量，只回答“这条会话是什么上下文”，不承担管理操作。

## 相关代码路径

- `packages/shared/src/session.ts`
  - `SessionListItem`
  - `SessionEvent`
  - `LlmUsagePayload`
  - `ContextUsageSnapshot`
- `packages/shared/src/session-selectors.ts`
  - `getLatestContextSnapshot(events)`
- `packages/shared/src/model-config.ts`
  - `MODEL_REGISTRY`
  - `resolveModelSpec`
  - `resolveModelSpecByApiModel`
- `packages/desktop/src/main/index.ts`
  - session list / session record IPC 数据来源
- `packages/desktop/src/preload/index.ts`
  - 需要时补轻量 preview IPC bridge
- `packages/desktop/src/global.d.ts`
  - `window.actspace` 类型
- `packages/desktop/src/renderer/App.tsx`
  - session list、当前 session record、workspace registry 聚合
- `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `SessionRow`
  - `CollapsibleSessionList`
  - `WorkspaceSection`
- `packages/desktop/src/renderer/components/ui/Tooltip.tsx`
  - Radix tooltip/provider 约定参考；hover card 可以新建专用组件，不强行塞进普通 tooltip。
- `packages/desktop/src/renderer/test/`
  - 新增或扩展 sidebar 相关测试。

## 展示规格

卡片内容顺序：

```text
<session title>
<full workspace path>
<model label>
Context <percent>% · <used tokens> / <max tokens> tokens
```

展示规则：

- 标题：使用会话行当前同款标题格式，最多两行。
- 路径：显示完整 `workspaceRoot`；没有 `workspaceRoot` 时使用匹配到的 default workspace path；仍取不到时隐藏路径行。
- 模型：优先显示 registry label，如 `DeepSeek V4 Pro`；无法映射时显示原始 model 字符串；仍取不到时隐藏模型行。
- Context：只在有真实 snapshot/state 时显示；百分比使用 `percentUsed`，token 使用 `totalTokens / maxTokens`。
- Context 进度条：使用一条细进度条，颜色走主题 token，不写死 hex。
- 图标：使用 lucide 图标，例如 `Folder`、`Cpu`、`CircleGauge`。

交互规则：

- hover 延迟约 `250ms`；离开后约 `120ms` 收起。
- focus 到会话主按钮时显示；blur 后收起。
- 卡片默认显示在会话行右侧；靠近窗口边界时通过 Radix collision 逻辑调整位置。
- 卡片本身不拦截会话点击，不改变右键菜单、pin、rename、archive 行为。

## 数据方案

首选方案：在 renderer 侧聚合 preview 数据。

- `SessionListItem` 已包含 `workspaceId` / `workspaceRoot`，路径可以直接从 session summary 与 workspace registry 匹配得到。
- 当前打开的 session 已有 `sessionRecord.events`、`contextSnapshot`、`contextState`，可直接拿到模型和 context。
- 非当前 session 需要轻量数据时，新增 main IPC `session:get-preview` 或扩展 session list summary；为了避免 listSessions 读取所有完整 jsonl，优先做按需 hover 拉取并缓存。

建议第一版实现：

- 当前 session：直接从已有 `sessionRecord` / `contextSnapshot` / `contextState` 生成 preview。
- 非当前 session：hover 第一次触发时调用轻量 IPC，main 读取该 session 的 `meta.json`、`context-state.json` 和 `session.jsonl` 中最后的 `llm_usage` / `context_snapshot` 相关事件，返回摘要；renderer 以 `sessionId` 缓存结果。

轻量 preview 返回类型建议：

```ts
export type SessionPreview = {
  sessionId: string;
  workspaceRoot?: string;
  model?: string;
  modelId?: ModelId;
  contextSnapshot?: ContextUsageSnapshot | null;
};
```

## 风险

- 风险：hover 时读取完整 `session.jsonl` 可能造成列表卡顿。
  - 缓解方式：hover 后延迟触发；按需读取；renderer 缓存；main 只返回摘要。
- 风险：旧 session 没有 model 或 context 数据。
  - 缓解方式：缺失行直接隐藏，保留标题和路径。
- 风险：路径过长导致卡片撑破 sidebar 或遮挡主体。
  - 缓解方式：固定卡片宽度约 `360-420px`；路径用 `break-all` / `overflow-wrap:anywhere`；最多由 viewport collision 调整位置。
- 风险：主题颜色不随浅/深主题翻转。
  - 缓解方式：所有背景、边框、文字、进度条使用现有主题 token；实现前必读主题规范，验收浅/深双主题。
- 风险：hover card 与右键菜单、rename 输入框互相干扰。
  - 缓解方式：rename 状态不显示 hover card；右键菜单打开时隐藏 hover card；卡片不放可点击操作。

## 里程碑

1. 契约与数据来源确认
   - 确认 `SessionListItem` 当前字段是否足够展示 workspace path。
   - 确认当前 session 的 model/context 可从已有 renderer state 得到。
   - 为非当前 session 设计 `SessionPreview` 获取路径，优先按需 IPC，不扩大会话列表负载。

2. Hover card 组件
   - 新增 `SessionHoverCard` 或在 `Sidebar.tsx` 内部拆出专用组件。
   - 使用 Radix hover/focus 交互或现有 tooltip primitive，但卡片样式独立于短 tooltip。
   - 实现完整路径换行、模型行、context 行和进度条。

3. Sidebar 接入
   - 在 `SessionRow` 中接入 hover/focus trigger。
   - 在 `CollapsibleSessionList` / `WorkspaceSection` 中向下传递 preview resolver。
   - rename、context menu、archive disabled 等状态保持现有行为。

4. 测试与视觉验证
   - 单测覆盖完整路径展示、第一行 repo/branch 不出现、模型 label 映射、context 展示、缺失数据降级。
   - 浏览器 mock 或 Electron 真实窗口验证 hover/focus、浅/深主题、长路径换行、边界位置。

5. 文档、history 与收尾
   - 如新增 IPC 或 session preview 类型，同步更新相关设计文档。
   - 记录 `docs/histories/2026-06/`。
   - 执行前端验证并在 history 中写明结果。

## 验证方式

命令：

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/sidebar.test.tsx`
- 如果新增 preview IPC/main service：
  - `pnpm --filter @actspace/desktop exec vitest run src/main/test/session-preview-service.test.ts`
- `pnpm --filter @actspace/desktop typecheck`

手工检查：

- 在 Electron 窗口中 hover 当前会话，卡片显示完整 workspace path。
- hover 属于两个同名 `actspace-agent` workspace 的会话，能通过完整路径区分主项目目录和 Codex worktree。
- 卡片不显示 repo / branch 第一行。
- 有真实 context 的会话显示百分比和 token 比例；无 context 的旧会话不显示空壳 context 行。
- hover、focus、右键菜单、rename、pin、archive 互不干扰。
- 浅色主题和深色主题下背景、边框、文字、进度条都随主题变化。

观测检查：

- hover 非当前 session 时不会连续重复读取同一个 session preview。
- main/renderer console 没有 preview 读取失败造成的未处理异常。

## 进度记录

- [x] 2026-06-03：确认用户诉求：会话 hover 卡片显示完整路径、模型、context，不显示截图第一行 repo/branch 信息。
- [x] 2026-06-03：确认当前问题背景：同名 `actspace-agent` workspace 对应不同绝对路径，UI 需要让用户可辨识。
- [ ] 完成数据来源确认和 preview 契约。
- [ ] 完成 hover card 组件。
- [ ] 完成 Sidebar 接入。
- [ ] 完成单测、类型检查和真实窗口验收。
- [ ] 完成文档/history 收尾。

## 决策记录

- 2026-06-03：第一版 hover card 只做只读摘要，不放路径操作、模型切换或 workspace 管理。原因是这个入口的主要目标是辨识会话上下文，操作能力会扩大交互复杂度。
- 2026-06-03：不显示 repo / branch 行。原因是用户明确要求“第一不要”，并且当前待解决问题是 workspace path、模型和 context 信息不足。
- 2026-06-03：完整路径不做中段省略。原因是同名 workspace 的关键差异通常在父级路径或 worktree 前缀，省略会重新制造歧义。
