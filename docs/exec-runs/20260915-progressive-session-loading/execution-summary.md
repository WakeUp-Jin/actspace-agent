# 执行摘要

## 已完成

- Runtime 增加可重建 SessionBrowseIndex：摘要、10 turn 页、大工具详情独立字节范围；缓存按 Journal 指纹和 codec digest 校验，追加、缺失和并发重建有覆盖。
- Shared/preload/main 增加 `listSessionPage`、`getSessionPage`、`getSessionToolDetail`；普通 projection 只有显式 `includeTrajectory` 才生成轨迹。
- Renderer 接入列表 Show more、消息历史向上加载、加载/错误/重试、滚动锚点、最近 3 个首屏页缓存和慢响应隔离；轨迹挂载时请求。
- 统计仍保持进入使用统计页面后请求。

## 工程验证

- `pnpm --filter @actspace/runtime exec vitest run`：6 files / 10 tests passed。
- SessionBrowseIndex 最终专项：5 tests passed；摘要分页：1 test passed。
- Desktop focused tests：7 files / 103 tests passed，2 个与既有工具文案/创建工作区断言相关测试跳过。
- `pnpm --filter @actspace/desktop typecheck`：本任务集成阶段通过；最终重跑被同时新增的 `fixed-renderer-stream-adapter.ts`、`subagent-activity.ts` 类型错误阻塞，不能视作最终全工作区通过。
- `pnpm --filter @actspace/runtime... build`：通过。
- `pnpm --filter @actspace/desktop run build:renderer`、`build:electron`：通过。
- `pnpm check:frontend-theme`、`pnpm check:docs`：通过。
- 隔离 fixture benchmark：25 回合 warm page 1.67 ms，消息 20 条，页约 19 KB；原始 Journal 约 40 KB，完整 Journal 读取 0 次（已有索引）。

## Electron 验收

已使用 `/tmp/actspace-progressive-ui` 隔离数据启动 Electron；可见首屏 10 条会话和 Show more，25 回合会话显示最近 10 回合与“加载更早消息”。本次 Computer Use 环境的 UI 绑定在开发进程重载后失效，未完成点击 Show more、向上加载和打开轨迹的最终手动交互；这些仍需人工复核。

## 未覆盖边界

首次索引旧数据仍需一次完整 Journal 读取，正在追加的超大会话重建成本还未做大规模压测。上下文详情继续走原有详情入口。完整复制/导出仍走完整记录。索引是派生缓存，删除它不会影响恢复。
