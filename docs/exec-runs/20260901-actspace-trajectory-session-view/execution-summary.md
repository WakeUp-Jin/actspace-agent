# ActSpace 会话内轨迹视图切换 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260901-actspace-trajectory-session-view/README.md`
- **执行过程**：`docs/exec-runs/20260901-actspace-trajectory-session-view/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Phase A + Phase B renderer/UI 与 Electron 验收）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 标题行单按钮 | `SessionViewToggle.tsx`, `WindowChromeBar.tsx`, `electron.css` | 在会话标题左侧用 icon-only 按钮切换 Chat / Trajectory，提供动态 tooltip 和 aria 状态。 |
| 中心 Trajectory 视图 | `TrajectoryView.tsx`, `ConversationView.tsx`, `WorkbenchLayout.tsx` | 复用 Session Projection 列表，保持 ConversationView 与 Composer 外壳稳定，并按 session id 记忆模式。 |
| Phase B 轨迹密度与交互 | `TrajectoryView.tsx`, `trajectory-render-view.test.tsx` | 增加轻量工具条、概览时间带、Turn 分组、搜索、收起/展开、选中态和只读事件详情；仍只读现有 Journal Projection。 |
| 右侧入口收口 | `RightPanel.tsx`, `RightPanelContext.tsx`, `RightPanelObjectMenu.tsx` | 移除 Trajectory launcher、menu、tab union 与 body 分支；其他右侧对象不变。 |
| 规范与记录 | `front-工作台布局与面板交互规范.md`, `docs/histories/`, `docs/learnings/` | 明确 Trajectory 属于会话中心派生视图，并记录稳定 Shell 模式。 |

## 人工验证指引

### 必须验证

1. **会话内切换与输入状态**
   - 验证方式：打开任一会话，在 Composer 输入未发送文本，点击标题左侧的轨迹图标，再点击消息图标返回。
   - 预期结果：中心内容在 Chat / Trajectory 间切换，Composer 文本仍在；按钮的 tooltip 与 aria-label 随状态变为「查看 Trajectory」/「返回 Chat」。

2. **右侧对象面板边界**
   - 验证方式：打开右侧面板，确认启动页和右侧对象菜单。
   - 预期结果：不再出现 Trajectory 项；Files、Review、Context、Terminal、Reply 仍可用。

3. **响应式布局**
   - 验证方式：在 480px、820px、1120px 宽度检查标题行和中心视图。
   - 预期结果：窄屏隐藏长标题但保留单按钮；右侧面板仍走覆盖层，不与主按钮重叠。

4. **Phase B 轨迹交互**
   - 验证方式：进入 Trajectory，检查顶部工具条、Overview 时间带、Turn 分组；切换收起/展开、搜索事件、点击事件查看 payload，再关闭详情。
   - 预期结果：轨迹仍是只读中心视图，筛选与详情不改变 Session 数据；空态和无 payload 状态可读。

## Agent 已完成的验证

- 针对性 Vitest：`sidebar.test.tsx`、`workbench-responsive.test.tsx`、`trajectory-render-view.test.tsx` 共 55 tests 通过。
- renderer 构建：`pnpm --filter @actspace/desktop build:renderer` 通过。
- 根构建：`pnpm build` 通过（CLI、workspace 依赖、renderer、Electron main/preload）。
- 主题契约与 diff 空白检查：`pnpm run check:frontend-theme`、`git diff --check` 通过。
- 本轮单独 renderer TypeScript 检查被工作区已有 `ProviderSettings` 类型/符号错误阻断；不属于 Trajectory 改动。
- 之前已完成的全仓 `pnpm typecheck` 与 `pnpm build` 结果保持在本任务记录中；Phase B 新增文件通过 Vite 构建和目标测试。
- 全仓构建：`pnpm build` 通过（含 shared/client/session-projection/runtime/main/preload）。
- 主题契约与 diff 空白检查：`pnpm run check:frontend-theme`、`git diff --check` 通过。
- 浏览器 renderer：桌面与 480px 窄屏手工检查通过；Phase B 工具条和空态可见。
- 真实 Electron：使用本次 dev-runtime 专属应用窗口完成切换、轨迹工具条/空态、返回 Chat、右侧对象面板边界检查；未发送消息、未修改会话数据。

## 已知风险和遗留事项

- 本轮 Phase B 已包含轻量工具条、Overview、搜索和收起/展开；完整虚拟化 ledger、真实持续时间缩放和复杂详情 pane 仍留给 Phase C。
- 全量 Vitest 仍有既有 Context/Settings 失败，详见执行过程；本轮未修改这些不相关区域。
- 打包制品、签名/公证、真实 Provider/Browser 外部能力仍未在本轮签收。
