# Context 面板前端重做 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261011-context-panel-frontend.md`
- **执行过程**：`docs/exec-runs/20261011-context-panel-frontend/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（自动化部分）；浏览器截图与 Electron 实机转人工验收。改动未提交。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 面板数据契约 | `packages/shared/src/context-panel.ts`（新）、`index.ts`、`runtime-v2/fixed-renderer.ts`、`desktop-bridge/contract.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts` | `sessions.describeContextPanel` 契约成员与 channel；main 返回 `null`，由 Context 引擎 V2 替换实现 |
| mock 数据 | `R/mock/context-panel-fixture.ts`（新）、`R/mock/handlers.ts` | 按 demo 构造完整数据，最新几条会话条目用 mock 会话真实 id |
| 格式函数 | `R/context-format.ts`（新） | 面板与 Composer 弹层共用 ≈ / 千位 / 占比 / 带符号格式 |
| 面板 | `R/components/right-panel/context/`（新目录，11 个文件） | 当前上下文、会话统计、上下文明细（对比上次请求、会话内容跳轨迹）、趋势、事件；`null` 时退回过渡视图 |
| 接入 | `R/components/RightPanel.tsx`、`R/components/WorkbenchLayout.tsx`；删除 `ContextRenderView.tsx` 及其测试 | Context Tab 改渲染新面板 |
| 轨迹定位 | `R/trajectory/reveal.ts`（新）、`R/components/trajectory/TrajectoryNavigation.tsx`（新）、`R/components/TrajectoryView.tsx` | 按 messageId / callId / 最新某类型定位并选中记录，找不到显示可关闭说明 |
| Composer 弹层 | `R/components/ContextPopup.tsx` | 共享格式函数，补占比列，压缩次数读 projection |
| 原生按钮基线 | `scripts/native-button-baseline.json` | 删 `ContextRenderView`，加面板 4 个文件（列表行交互） |
| 文档 | 右侧面板规范、数据需求 §6、模型事实规范、V2 设计 01/04、V2 执行计划与测试验收计划、`docs/FRONTEND_VERIFICATION.md`（mock 场景表）、`docs/exec-plans/README.md` | 旧 `ContextRenderView` 引用改为新面板；数据需求写明后端只需替换 handler |

## 人工验证指引

### 必须验证

1. **浏览器 mock 下五个区块**
   - 验证方式：运行 `pnpm --filter @actspace/desktop dev:renderer`，打开 `http://127.0.0.1:5173/?mock=long-session`，选中长会话，右侧切到 Context Tab。分别看浅色、深色和约 480px 窄窗。
   - 预期结果：
     - 当前上下文：条带、自动压缩线和斜纹、两列图例。点图例后其他分类变淡，再点恢复。
     - 会话统计：6 格，包括费用。
     - 上下文明细：对比下拉框默认选中「对比上次请求（第 8 轮 · 步 47）」。工具分类显示新增和已移除的条目，切到「不对比」后这些标记消失。
     - 趋势：右端是最新的柱，有压缩分隔线，悬停时顶部信息跟着变。
     - 事件：列表正常显示。
2. **会话内容跳轨迹**
   - 验证方式：展开「会话内容」，点最上面几行；再选「工具调用」chip，点「在轨迹中打开最新工具调用」。
   - 预期结果：主区切到轨迹，选中对应记录并打开详情。fixture 里构造的较早条目找不到对应记录时，轨迹顶部显示可关闭的说明。
3. **Electron 过渡视图**
   - 验证方式：Electron 里打开一个已有请求的会话，看 Context Tab 和 Composer 上方的弹层。
   - 预期结果：
     - 面板显示当前上下文、会话统计和当前明细，没有「新增 / 已移除」标记。
     - 底部提示「趋势和事件需要后端数据，暂未提供」。
     - 会话行不可点（过渡数据没有 `trajectoryRef`）。
     - 弹层显示「≈X / Y Token」，分类行有占比。

### 建议验证

1. **新会话空态**：没有会话时显示「开始对话后，这里会列出喂给模型的上下文。」。
2. **键盘操作**：Tab 能依次走到图例、分类行、条目行、会话行，焦点轮廓可见。

## Agent 已完成的验证

- `tsc --noEmit`（desktop 的 `tsconfig.json`、`tsconfig.electron.json`）：通过。
- `check-frontend-design-tokens`、`check-frontend-theme-colors`、`check-renderer-bridge-access`、`check-ipc-channels`：通过。
- 新增或改动的单测全部通过：context-format、trajectory-reveal、context-panel-model、context-panel（8 条）、trajectory-render-view（10 条）、context-popup、composer、workbench-responsive、right-panel-workspace。
- desktop 全量 vitest：1723 通过，7 条失败。失败的都是应用级集成测试在并行负载下超时（app-message-queue、app-streaming-user-message ×3、main-bridge-install ×2、session-ipc-budget），单独运行全部通过。

## 已知风险和遗留事项

- **后端未实现**：Electron 下只有过渡视图。后端按 [Context 面板后端数据需求](../../design-docs/frontend/front-Context面板后端数据需求.md) §2 替换 `fixed-renderer-ipc.ts` 里的 null handler 即可，前端不用改。
- **「展开全文」没有接线**：数据需求里的 `fullTextAvailable` / `readContextEntry` 还没有后端，前端目前只显示截断预览。
- **全量测试的负载超时**：与本次改动无关，但在并行全量运行时会出现，建议另开任务调整这几条集成测试的超时或并发。
- **与 V2 后端的合并**：两边都改 `fixed-renderer-ipc.ts` 的同一位置时，以后端实现为准，删掉本计划的 null handler。

## 后续建议

- 后端就绪后，复查 trend 截断（超过 500 点）的提示是否需要在前端显示。
- 需要时再加回导出 .md / .json。
