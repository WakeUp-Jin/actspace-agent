# Session 三类读模型统一计划 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260922-session-three-read-models.md`
- **执行过程**：`docs/exec-runs/20260922-session-three-read-models/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成，核心实现完成；Desktop App 大型 UI fixture 门禁未通过

## 核心变更清单

2026-09-22 后续清理：删除 `chat.ts` 的旧 Usage 聚合 API 及专用 helper，将原回归测试迁移到 indexed usage 生产入口。client 7 个测试、Desktop projection/Usage cache 20 个定向测试，以及 client build/typecheck、Desktop typecheck 通过。模块流程图已写入设计规范；本次定向验证不替代下文记录的全量与人工门禁。

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Canonical Todo fold | shared/runtime-v2、session/projection、core/agent | Host 与 Agent Service 对增量 Todo 写入保持一致 |
| 三类读模型契约 | shared/runtime-v2、runtime controller、desktop-app、IPC/preload | 区分 Global summary、完整 Session projection、Window presentation，并携带独立水位 |
| Global Session/Usage Index | projection-cache、runtime、client、desktop usage cache | 列表和 Usage 正常冷读从可删除索引读取，按 Session 水位增量重建 |
| Window 资源边界 | runtime controller、client session store | 事件/字节硬上限、大工具 deferred detail、equal-seq 幂等/conflict |
| 执行文档与测试 | exec-runs、history、learning | 留下实施时间线、验收指引和可迁移的 reducer/水位经验 |

## 人工验证指引

### 必须验证

1. **真实 Session cold read**
   - 验证方式：删除 `global-session-index.json`、`global-usage-index.json` 和任一 `projection-checkpoint.json`，重启 Desktop 后打开 Session 列表、Usage、Chat、Trajectory、Tool Card。
   - 预期结果：Journal replay 自动重建，列表、title/todo/usage、窗口展示与删除前一致。

2. **Electron observation/reconnect**
   - 验证方式：运行 `pnpm dev:log` 或 Electron 开发启动；打开 Session，执行一轮 Agent，再 reload 窗口并加载历史页。
   - 预期结果：projection facts 不被历史页覆盖；runtime restart、surface replacement 和 live gap 会重新读取 observation。

3. **修复并重跑大型 App 测试门禁**
   - 验证方式：`pnpm --filter @actspace/desktop test -- src/renderer/test/app-streaming-user-message.test.tsx`。
   - 当前结果：该文件 39 个测试中 8 个通过、31 个失败；失败集中在既有 workspace fallback/bridge/input fixture，未进入本轮 Session projection 变更链路。

### 建议验证

1. **超大工具详情**：构造大型 args/result/artifact，确认普通 Window 只含 deferred ref，点击详情仍能按 `sessionId + callId` 读取完整数据。
2. **真实 Provider 与长 Journal**：验证 Usage Index 水位更新、retry 去重、unknown cost 和 25+ Turn 分页性能。

## Agent 已完成的验证

- `@actspace/shared`、`session-projection`、`session-projection-cache`、`core-agent`、`client`、`runtime`、`desktop-app` typecheck 通过。
- Session projection/cache/core/client/runtime package tests 通过；新增 Todo parity、Global Index、observation、Window cap、client equal-seq tests 通过。
- Desktop typecheck 通过；Desktop 105 个 test files 中 104 个通过（719 assertions），Usage source cache 新契约测试通过。
- `pnpm run check:docs` 与 `git diff --check` 已在文档同步后通过。

## 已知风险和遗留事项

- `app-streaming-user-message.test.tsx` 的既有 fixture/bridge 失败未在本计划范围内修复。
- Global summary 当前保存 session-level usage total；更细的 daily/model/status bucket 由 Usage Index rows 聚合，首次缺失时需要 Journal replay。
- Electron packaged、真实 Provider、Browser Bridge、长 Journal 性能和手工 UI 仍需外部验收。
