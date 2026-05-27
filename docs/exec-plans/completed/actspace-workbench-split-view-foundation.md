# actspace 工作台 SplitView 底座计划

## 目标

把聊天态工作台从固定列宽布局升级为 `actspace` 自研的 SplitView 底座，先解决左侧会话栏和右侧对象面板可调宽、中间聊天区受保护的问题，并为后续接近 IDE 的拖动与区域编排保留清楚边界。

## 范围

- 包含：
  - 自研横向 SplitView 首版能力
  - 左侧会话栏 resize 与 icon rail
  - 右侧对象面板 resize、关闭与宽度恢复
  - 中间聊天区最小可用宽度保护
  - 布局偏好本地恢复
  - 前端文档、验证和 history 同步
- 不包含：
  - tab 拖动换区
  - dock layout tree
  - 底部 terminal / panel region
  - 多编辑区 grid
  - 左侧完全隐藏
  - 右侧 rail
  - 真实文件预览渲染器扩展

## 背景

- 相关文档：
  - `AGENTS.md`
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/FRONTEND.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/CODING_BEHAVIOR.md`
  - `docs/design-docs/frontend-ui/前端设计文档.md`
  - `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
  - `docs/design-docs/frontend-ui/左侧会话栏规范.md`
  - `docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/renderer/styles.css`
- 已知约束：
  - 当前 renderer 使用固定 grid 列宽，右侧面板打开后会压缩中间聊天区。
  - `actspace` 当前仍是 Electron + React 工作台骨架，SplitView 首版应保持 renderer 内聚，不新增 IPC 契约。
  - 本次决策把布局底座留在仓库中维护，避免未来面板语义被一次性的固定三栏样式或通用 splitter 抽象锁死。

## 方案约束

### 底座分层

- 把通用 SplitView 交互和聊天态工作台产品策略分开：
  - SplitView 管 separator、pointer resize、尺寸约束、折叠恢复、窗口 resize 校正。
  - Workbench 管左侧 rail、右侧 open/closed、聊天主区优先级和具体区域内容。
- SplitView 不把 panel 内容写死为 session sidebar 或 preview panel。
- 当前 resize 偏好只描述首版面板尺寸和展示态，不提前伪造未来 dock layout tree。

### 首版行为

- 默认仍为两栏：左侧会话栏 + 中间聊天区。
- 左侧默认展开，可调整宽度，低于折叠策略阈值后可进入 rail。
- 左侧 rail 只保留高频图标入口，不先做完全隐藏。
- 右侧沿用当前对象面板入口打开；打开后可调整宽度，关闭后空间回到聊天区。
- 用户上次有效左侧状态与左右面板宽度先保存在 renderer 本地，恢复时按当前窗口重新 clamp。
- 中间聊天区保留最低可用宽度；空间不足时优先让左侧退到 rail、右侧收敛或关闭。

### 未来拖动预留

- 首版不实现 tab 拖动、region swap 或 docking。
- 面板内容、面板所在区域和面板展示状态保持可分离，避免未来拖动时重写 SplitView 原语。
- 若后续要支持类似 IDE 的面板拖动，应另起 workspace layout model 设计，而不是把拖动规则塞进当前宽度状态。

## 风险

- 风险：自研 resize 只修鼠标拖拽，留下 separator、窗口 resize 和折叠恢复缺口。
  - 缓解方式：先把 SplitView 首版能力写成明确底座，验收覆盖拖拽、折叠、恢复和窄窗口。
- 风险：左侧 rail 和右侧对象面板规则侵入底层，导致后续布局复用困难。
  - 缓解方式：在组件分层和状态命名上区分通用 split 状态与工作台区域策略。
- 风险：为未来拖动过度设计。
  - 缓解方式：只保留边界和数据分层，不在本轮实现 docking 或 layout tree。
- 风险：浏览器 mock 正常但 Electron 桌面窗口行为不一致。
  - 缓解方式：按 `FRONTEND_VERIFICATION.md` 跑浏览器和 Electron 两层验收。

## 里程碑

1. 收敛 SplitView 首版接口和尺寸策略。
   - 验证：固定列宽问题能映射到明确面板状态、最小宽度和折叠规则。
2. 实现可复用的横向 SplitView 交互底座。
   - 验证：左右 resize handle、宽度 clamp、窗口 resize 校正和本地恢复可单独检查。
3. 把聊天态工作台接到 SplitView。
   - 验证：左侧 expanded/rail、右侧 open/closed 和中间消息区保护都符合设计文档。
4. 完成前端回归和文档收尾。
   - 验证：工程命令、浏览器 mock、Electron 真实窗口和 history 都记录结果。

## 验证方式

- 命令：
  - `pnpm typecheck`
  - `pnpm build`
- 浏览器 mock：
  - 打开 `http://127.0.0.1:5173/`
  - 验证右侧关闭和打开两种布局。
  - 拖动左侧分隔条到展开最小、默认和最大范围。
  - 折叠左侧到 rail，再恢复展开态。
  - 拖动右侧分隔条到最小和最大范围，再关闭和重新打开。
  - 缩小窗口宽度，确认中间标题、消息区、diff 卡片和 Composer 不复现被三栏挤坏的问题。
  - 刷新页面，确认有效宽度和左侧状态按本地偏好恢复。
- Electron 真实验证：
  - 运行 `pnpm dev`
  - 观察桌面窗口中的 separator 拖拽、左侧 rail、右侧开关和消息滚动。
  - 确认 preload、IPC 和 session 恢复没有被布局改动破坏。

## 进度记录

- [x] 确认固定列宽布局是当前右侧面板挤压主区的直接原因。
- [x] 确认本轮选择自研 SplitView，并把未来拖动留作明确后续边界。
- [x] 同步工作台布局设计文档与计划入口。
- [x] 实现 SplitView 首版底座。
- [x] 接入左侧 rail 与右侧可调对象区。
- [x] 完成工程验证和浏览器 mock 验收。
- [ ] 完成 Electron 真实验收。
- [x] 记录实现 history，必要时补学习沉淀。

## 2026-05-22 实现记录

- 新增 renderer 内的横向 `SplitView`，由底座负责 ResizeObserver 宽度观测、pointer resize、separator 键盘 resize、尺寸 clamp 和 handle 视觉状态。
- `WorkbenchLayout` 持有面板策略状态：左侧 expanded/rail、右侧 open/closed、本地尺寸恢复、中间区最小宽度保护和窄空间下的左栏/右栏让位。
- 左侧 sidebar 增加 rail 展示和显式折叠按钮；右侧对象区继续沿用原打开入口，由 SplitView 提供可调宽边界。
- 浏览器 mock 已验证：右侧面板打开时左栏可退到 rail、中间区保持最小可用宽度；宽屏可拖动右栏 resize；rail 上通过 separator 键盘 ArrowRight 可恢复左栏展开态。

## 决策记录

- 2026-05-22：工作台布局不继续依赖固定三栏 grid，改为以中间聊天区为优先级中心的可调面板布局。
- 2026-05-22：本轮选择自研 SplitView 底座。原因是工作台面板未来可能演进到更接近 IDE 的交互，需要先把 `actspace` 的 resize、collapse 和区域策略边界留在仓库内。
- 2026-05-22：未来拖动与 docking 只在首版保留边界，不提前实现 layout tree，避免 resize 任务扩成未定义的工作台重构。
