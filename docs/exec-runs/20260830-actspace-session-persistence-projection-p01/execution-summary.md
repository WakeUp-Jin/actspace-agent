# P01 执行摘要

状态：完成候选，已交接 P02/P03。

## 交付

- Registry 只有一套事件推进入口，按 `sessionId` 隔离 projection cell。
- 不相关事件保留 state reference，不发布 change。
- Cache checkpoint 身份包含 `sessionId`、`projectionKey`、`stateVersion` 和 `throughJournalSeq`。
- Cache 删除、Journal 缩短和版本失效都回退到 Journal replay。

## 验证结果

- P01 初始定向验证为 4 个测试文件、7 个测试通过；当前 projection package 共 5 个测试文件、9 个测试通过。
- session-projection-cache 3 个测试通过。
- session-persistence 34 个测试通过。
- runtime、headless typecheck 通过。

## 外部门禁

- 尚未接入真实生产 cache provider，也未完成 Electron 手工验收。
