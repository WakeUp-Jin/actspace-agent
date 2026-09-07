# P03 执行摘要：Context、Composer 与 Trajectory Projection

日期：2026-08-31

## 已完成

- `@actspace/session-projection` 提供 provider usage、request context estimate、composer phase 和 trajectory projection contract。
- Trajectory 支持连续 Journal 的 replay 与 incremental apply，节点 key 稳定且携带 Session identity、event seq、kind、state、callId/data。
- `@actspace/client` 提供 projection value/revision 接收和 Context、Composer、Trajectory、Usage selectors。
- Desktop main/preload projection snapshot envelope 已携带上述 values，且继续使用 `sessionId + throughJournalSeq`。
- P03 相关定向测试通过：projection package 5 个 test files、9 tests；client package 2 个 test files、4 tests；Desktop projection/bridge 2 个 test files、4 tests。
- 新增 Desktop `SessionProjectionProvider`，Workbench 的 Composer phase、Context snapshot、durable Surface message count 与 Trajectory 由 Client selectors 驱动。
- Right Panel 已启用只读 Trajectory tab/菜单入口；Context view 支持 revision-bound projection fallback；新增 Trajectory renderer tests（2 tests）和 Context projection fallback coverage。
- `pnpm --filter @actspace/desktop typecheck` 通过。
- Desktop 定向回归通过：Trajectory、Context、Composer、Client SessionStore 共 4 个文件、50 个 tests；`check:frontend-theme` 通过。
- Desktop 全量回归通过：80 个测试文件、529 个 tests；Usage activity 测试中的“失败”断言已改为允许筛选 option 与活动行同时出现的 `getAllByText` 语义。

## 尚未完成

- Conversation 富消息 `MessageBlock[]` 仍由 App 作为兼容显示 adapter 提供；其 Composer 生命周期、durable Surface 计数和 Context/Trajectory 数据已由 Session-bound selectors 驱动。
- Context popup/Session hover 仍保留既有 props/resolver 形态以维持兼容，但在当前 Session provider 存在时可直接读取 provider usage/request context selectors；非当前 Session 的 hover resolver 仍需后续统一到完整 projection envelope。
- 真实 Electron 已启动并保持开发实例；reload/quit/flush、Session 切换、真实 Provider 和人工截图验收仍需单独执行。

## 验证证据

```text
pnpm --filter @actspace/session-projection typecheck
pnpm --filter @actspace/session-projection test       # 5 files, 9 tests passed
pnpm --filter @actspace/client typecheck
pnpm --filter @actspace/client test                  # 2 files, 4 tests passed
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop exec vitest run \
  src/renderer/test/session-store.test.ts \
  src/main/test/runtime-v2-fixed-renderer-projection.test.ts # 2 files, 4 tests passed
pnpm run check:current-docs
pnpm run check:docs
git diff --check
```

真实开发启动：`pnpm dev:log` 已启动 Electron 实例；Vite 地址为 `http://127.0.0.1:5173/`，watch 编译最终回到 0 errors。该进程保持运行，供人工验收。

## 交接

P03 的基础 projection contract、首批 selector consumers 和只读 Trajectory UI 已交接给 G1。完成 G1 前仍必须补齐 Conversation 富消息的最终 durable Surface adapter、非当前 Session hover 的统一 envelope、Electron reload/quit/flush、真实 Provider 和人工 UI 验收记录。
