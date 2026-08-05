# 修复窄窗口审批卡片被裁切

## 用户诉求

在 480px 窄窗口中，Bash 审批卡片仍保持宽屏宽度，右侧操作按钮被窗口裁掉；宽窗口显示正常。

## 主要改动

- 为对话根 Grid 显式声明 `minmax(0, 1fr)` 单列，允许内容列突破默认的 min-content 下限。
- 在消息 viewport、消息栈、turn、正文组和 Composer 区补齐 `min-width: 0` 收缩链路。
- 增加包含用户消息和待审批 Bash 卡片的 480px 响应式回归测试。

## 设计动机

审批卡本身已经使用 `width: 100%` 和 `max-width: 800px`。真正的问题是外层 Grid 的隐式 `auto` 列会服从内部内容的固有最小宽度；SplitView 再把横向溢出裁掉，使问题看起来像单个卡片无法缩小。修复应落在拥有列尺寸的对话容器，而不是给审批卡增加更小的固定宽度或继续隐藏溢出。

## 影响文件

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/test/workbench-responsive.test.tsx`
- `docs/learnings/2026-08/css-grid-auto-minimum-needs-zero.md`

## 验证

- 480px Workbench 响应式定向测试 9/9 通过，覆盖用户消息、待审批 Bash 和 Composer 的共同收缩链路。
- Bash 审批组件定向测试 13/13 通过。
- Desktop renderer / Electron TypeScript 检查通过。
- Desktop renderer 生产构建通过，仅保留既有的大 chunk 提示。
- 前端主题契约、文档骨架和 `git diff --check` 通过。
- 仓库基础卫生检查通过。
- 真实 Dev Electron 窗口缩到约 480px 后，用户消息、消息正文、文件结果块和 Composer 右边界完整可见；当前会话没有 pending 审批，审批卡精确状态由 fixture 回归覆盖。
- Desktop 全量测试触发了 `app-streaming-user-message.test.tsx` 两项既有的文件顺序状态污染：完整文件为 25/27，通过测试名隔离运行时两项均为 1/1 通过；本轮未扩大范围修改该测试隔离问题。
