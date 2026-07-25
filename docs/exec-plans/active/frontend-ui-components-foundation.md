# 前端基础组件层建设计划

## 目标

为 `packages/desktop` renderer 建立一层稳定的基础 UI 组件 wrapper，减少 Composer、Sidebar、ConversationView、RightPanel 等业务组件中重复的按钮、菜单、浮层、开关、输入框和状态样式实现。

最终目标是形成：

```txt
Radix primitives / 原生 HTML
  -> packages/desktop/src/renderer/components/ui/*
  -> actspace 业务组件
```

当前阶段参考 `shadcn/ui` 的 Radix wrapper 模式，但不直接引入完整 `shadcn/ui` 生成体系或默认视觉系统。

## 范围

- 包含：
  - 新增 `packages/desktop/src/renderer/components/ui/*` 基础组件层。
  - 首批封装 `Button`、`IconButton`、`Tooltip`、`DropdownMenu`、`Switch`、`Textarea`、`Tabs`。
  - 逐步迁移 Composer mode/model 菜单、Thinking toggle、消息操作菜单、右侧 tabs 和常见 icon button。
  - 抽出必要的业务组合组件，例如 `ModelSelector`、`ModeSelector`、`MessageActionsMenu`。
  - 同步维护前端设计文档、history 和必要测试。
- 不包含：
  - 不全量接入 `shadcn/ui` CLI 生成体系。
  - 不迁移 `SplitView`。
  - 不重写消息块视觉系统。
  - 不重新设计全局视觉语言。
  - 不在本计划中处理设置页完整信息架构。

## 背景

- 相关文档：
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/design-docs/frontend/front-全局视觉语言规范.md`
  - `docs/design-docs/frontend/front-基础组件封装规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/HISTORY_GUIDE.md`
  - `docs/QUALITY_SCORE.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/renderer/components/SplitView.tsx`
  - `packages/desktop/src/renderer/styles/index.css`
  - `packages/desktop/src/renderer/styles/tokens.css`
  - `packages/desktop/src/renderer/styles/base.css`
  - `packages/desktop/src/renderer/test/`
- 已知约束：
  - 仓库架构文档当前倾向 `Radix UI` primitives，而不是直接依赖重样式组件库。
  - 前端视觉规范要求不引入完整第三方设计系统。
  - 代码变更前需要先描述方案并获得批准。
  - 每次实质代码变更都要同步检查文档、history 和验证结果。

## 风险

- 风险：基础组件抽象过早，导致 variant 膨胀或反而难用。
  - 缓解方式：只从重复出现的控件抽象，保留业务组件中的业务语义。
- 风险：迁移 DropdownMenu、Popover 后破坏键盘、ESC、外部点击或 focus 行为。
  - 缓解方式：优先基于 Radix primitives 封装，并补充交互测试或手工验证清单。
- 风险：组件封装引入与现有视觉规范不一致的默认样式。
  - 缓解方式：基础组件只消费现有语义 token；需要新增 token 时先更新设计文档。
- 风险：一次性迁移范围过大，影响 Composer 和消息流稳定性。
  - 缓解方式：按组件和页面切片推进，每个切片单独 typecheck、test、视觉验收。

## 里程碑

1. 调研与方案收敛。
   - 盘点现有重复控件和手写浮层逻辑。
   - 确认 `components/ui/*` 的组件边界和命名。
2. 建立基础组件层。
   - 新增 `Button`、`IconButton`、`Tooltip`。
   - 新增 `DropdownMenu`、`Switch`。
   - 新增 `Textarea`、`Tabs`。
3. 低风险迁移。
   - 迁移消息操作菜单。
   - 迁移右侧 panel tabs。
   - 迁移 Composer mode/model 菜单和 Thinking toggle。
4. 业务组合组件收口。
   - 抽出 `MessageActionsMenu`。
   - 抽出 `ModeSelector`、`ModelSelector`。
   - 视重复情况抽出 `ContextUsageButton` 或 `SessionRow`。
5. 验证、交付与收尾。
   - 跑类型检查和测试。
   - 按前端验证规范完成浏览器或 Electron 验收。
   - 更新 history；如果产生可迁移学习，再补 learning 文档。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`
- 手工检查：
  - Composer 可以输入、发送、停止、打开 mode/model 菜单。
  - Thinking toggle 可切换。
  - 消息操作菜单可以打开、复制、关闭。
  - 右侧 tabs 状态和视觉没有回退。
  - 所有 icon-only button 有可理解的 accessible name。
- 观测检查：
  - 按 `docs/FRONTEND_VERIFICATION.md` 选择本地 browser mock 或 Electron 实机验收。
  - 检查菜单、popover、tooltip 的 ESC、外部点击、键盘导航和 focus-visible。

## 进度记录

- [x] 确认基础组件层采用 Radix primitives / 原生 HTML -> 项目 UI wrapper -> 业务组件的分层。
- [x] 新增 `docs/design-docs/frontend/front-基础组件封装规范.md`。
- [ ] 盘点现有重复控件和第一批迁移目标。
- [ ] 新增 `components/ui/Button.tsx`、`IconButton.tsx`、`Tooltip.tsx`。
- [ ] 新增 `components/ui/DropdownMenu.tsx`、`Switch.tsx`。
- [ ] 新增 `components/ui/Textarea.tsx`、`Tabs.tsx`。
- [ ] 迁移消息操作菜单和右侧 tabs。
- [ ] 迁移 Composer mode/model 菜单和 Thinking toggle。
- [ ] 抽出必要业务组合组件。
- [ ] 完成验证、history 和收尾文档。

## 决策记录

- 2026-05-26：当前阶段不全量采用 `shadcn/ui`，但参考其 Radix wrapper 模式，在项目内建设基础 UI 组件层。这样既保留仓库已确认的 Radix primitives 方向，也能降低业务组件重复实现基础交互和样式的成本。
- 2026-05-26：`SplitView` 暂不纳入第一批基础组件迁移。它承载工作台布局和 resize 行为，应在基础控件层稳定后单独评估。
