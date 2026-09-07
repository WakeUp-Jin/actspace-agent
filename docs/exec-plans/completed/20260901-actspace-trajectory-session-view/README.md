# ActSpace 会话内轨迹视图切换

## 目标

将 Trajectory 从右侧对象面板迁移为会话主视图内的第二种视图，通过会话标题左侧的单个图标按钮在 Chat 与 Trajectory 之间切换；切换不卸载会话 Shell，因此 Composer 草稿、滚动容器、会话投影和右侧工作区面板保持稳定。

## 范围

- 包含：会话标题行的图标切换按钮、中心视图切换、现有 Journal Projection 轨迹列表复用、右侧面板 Trajectory launcher/tab 分支移除、Phase B 的轻量时间带/搜索/收起展开/只读详情、相关测试与前端规范记录。
- 不包含：新的 IPC/后端事件协议、Trajectory 数据模型迁移、完整虚拟化 ledger/真实时间缩放/复杂详情 pane（留作 Phase C）、右侧 Files/Review/Context/Terminal/Reply 行为调整。

## 背景

- 相关文档：`docs/design-docs/frontend/front-工作台布局与面板交互规范.md`、`docs/design-docs/frontend/front-主题与配色规范.md`、`docs/FRONTEND_VERIFICATION.md`。
- 相关代码路径：`apps/desktop/src/renderer/components/WorkbenchLayout.tsx`、`WindowChromeBar.tsx`、`ConversationView.tsx`、`RightPanel.tsx`、`components/right-panel/RightPanelContext.tsx`、`components/right-panel/TrajectoryRenderView.tsx`。
- 已知约束：窗口 chrome 保持 44px 与现有三栏对齐；颜色只能使用语义 token；不得把主切换藏进三点菜单；Session Projection 是唯一轨迹数据来源。

## 风险

- 风险：切换主视图时若卸载 ConversationView，会丢失 Composer 草稿或滚动状态。
  - 缓解方式：ConversationView 保持挂载，只在消息 viewport 内隐藏 Chat 内容并显示 Trajectory。
- 风险：移除右侧轨迹类型可能影响现有对象 Tab 类型收窄。
  - 缓解方式：全仓扫描并同步清理 union、launcher、object menu 与 body 分支，执行 renderer 类型检查和针对性测试。
- 风险：紧凑窗口或非 Chat 页面出现无效按钮。
  - 缓解方式：按钮仅在 `view === "chat"` 时传入，Settings/Analysis/Lab 维持原有 chrome。

## 里程碑

1. 调研与方案收敛已完成。
2. 标题行按钮、稳定主视图切换与轨迹投影渲染已完成。
3. 右侧轨迹入口移除、测试、文档、构建与浏览器 renderer 验收已完成。
4. Phase B 中心轨迹密度与交互增强、真实 Electron 验收已完成。

## 验证方式

- 命令：针对性 Vitest、renderer `tsc`、`pnpm build`、主题契约和 `git diff --check`。
- 手工检查：Chat/Trajectory 图标按钮位置、动态 aria/tooltip、切换后 Composer 草稿与右侧 Files/Review 面板、480px 窄屏布局。
- 观测检查：renderer 不再存在右侧 Trajectory launcher/menu/tab 分支，仅保留中心组件与 Projection selector。

## 进度记录

- [x] 确认范围和约束。
- [x] 完成标题行与中心视图实现。
- [x] 完成右侧轨迹入口移除。
- [x] 完成测试、文档和构建验收。
- [x] 完成 Phase B 工具条、Overview、搜索、收起/展开和事件详情。
- [x] 完成真实 Electron 窗口切换与右侧面板边界验收。

## 决策记录

- 2026-09-01：采用标题左侧 icon-only 单按钮，Chat 显示轨迹图标、Trajectory 显示返回 Chat 图标；不使用持久化 tabs，也不把主入口放入三点菜单，以保持标题栏干净且一键可达。
- 2026-09-01：Trajectory Phase A 复用现有 `RuntimeV2TrajectorySnapshot` 列表，时间线/筛选/虚拟化工具栏推迟到独立增强阶段。
- 2026-09-02：通过隐藏而非卸载 Chat viewport 保持 Composer 与输入状态稳定；真实 Electron/preload/IPC 验收保留为宿主环境人工门禁。
- 2026-09-03：参考 DeepSeek Harness 的三层轨迹结构（工具条 → Overview → Turn ledger），在不改变 Projection 契约的前提下落地 Phase B；完整虚拟化与真实持续时间交互推迟到 Phase C。
- 2026-09-03：使用本次 dev-runtime 专属 Electron 窗口完成 Chat / Trajectory 切换、轨迹控件与右侧对象面板边界检查。

## 执行模式

- **交互模式**：人在线，已获用户批准后逐步实施。

## 执行文档

- `docs/exec-runs/20260901-actspace-trajectory-session-view/execution-process.md`
- `docs/exec-runs/20260901-actspace-trajectory-session-view/execution-summary.md`
