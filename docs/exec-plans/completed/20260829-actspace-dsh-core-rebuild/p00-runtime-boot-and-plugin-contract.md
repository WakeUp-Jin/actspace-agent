# P00：Trusted Context 与 `cordis.yml` Boot Contract

状态：完成候选（P00 已实施，待计划归档）

## 目标与依赖

把当前手工 `root.mount`/`activateBehavior` 启动改造成 DSH-native 的可信同进程 Boot：Host 准备能力，Boot 创建 root Cordis Context，Loader/Include 读取 `cordis.yml`，Behavior 通过 `apply(ctx, config)` 激活，settlement 成功后才发布 RuntimeHandle。

依赖：无。必须先读 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md` 和 [DSH-native 启动规范](../../../design-docs/agent-plugin-runtime/agent-decision-dsh-native-plugin-runtime.md)。Session 13-event 实现和 Tool Runtime 实现不是本包依赖；这里只定义它们被 Context 注入的 seam。

## 文件范围

- `packages/boot/src/index.ts`
- `packages/boot/src/trusted-boot.ts`
- `packages/boot/src/types.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/src/plugin-contract.ts`
- `packages/cordis-adapter/src/index.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/runtime/src/runtime/shutdown.ts`
- `packages/boot/tests/`、`packages/cordis-adapter/tests/`、`packages/runtime/src/test/`
- 新增一个最小可信 fixture plugin 和对应 `cordis.yml` fixture；不得改 Session 或具体 Tool executor。

## 步骤

1. 定义 Host services、`configPath`、invocation metadata、Boot result 和 RuntimeHandle 的内部 TypeScript contract；Context 不穿过 Host/IPC。
2. 在 root Context 安装 Cordis Loader、Include、Group、Timer；由 Loader 读取显式 `cordis.yml`，禁止目录扫描和隐式 plugin import。
3. 将 behavior activation contract 改为 `apply(ctx, config)`；fixture 在 apply 内调用 `ctx.plugin()`、`ctx.on()`、`ctx.emit()`、`ctx.effect()` 并验证 disposer。
4. 保留 `package.json`/exports 和受信任 package/local module 的版本 provenance，但不再把 Static Manifest 作为 activation prerequisite。
5. Loader settlement、required Service 缺失、apply 抛错或依赖环必须 fail closed，并在失败路径 dispose root；不发布半成品 RuntimeHandle。
6. CLI/desktop adapter 只向 Boot 提供 Host services + configPath，不读取 `runtime-v2/plugins.json`，不手工 mount 外部插件。

## 验证命令

```bash
pnpm --filter @actspace/boot test
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/boot typecheck
pnpm --filter @actspace/cordis-adapter typecheck
pnpm --filter @actspace/runtime typecheck
```

通过标准：fixture 能在 `apply(ctx)` 内完成嵌套组装、事件监听和资源 cleanup；settlement 前没有 RuntimeHandle；启动失败后无活动 Fiber/Effect；默认 Boot 不读取旧 plugins.json。

## 失败与回退

若 Cordis API 与当前 adapter 不匹配，只增加 `packages/cordis-adapter` 内的薄适配层；不把私有 Context 类型暴露给 Host。若新 Boot 无法启动，Host 仍可选择现有 legacy boot（由 P04 明确保留），不删除 Session 数据、不改工具实现。
