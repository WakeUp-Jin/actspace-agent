# Test support

状态：保留的测试辅助公共入口。Cordis Service 生命周期夹具已内聚到 `packages/cordis-adapter/tests/fixtures/`，避免 adapter 测试通过深路径反向依赖本包；本包当前只导出 `assertJsonSafe`。

退役条件：确认所有 workspace 测试、动态测试入口和契约矩阵都不再使用 `@actspace/test-support` 后，才可删除包及其矩阵条目。
