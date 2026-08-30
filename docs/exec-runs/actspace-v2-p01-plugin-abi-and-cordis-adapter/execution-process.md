# P01 执行过程

日期：2026-08-25

## 实施边界

- 将 Plugin Manifest、Identity、Codec Discovery、Behavior Loader、Source Loader 从旧 Runtime 的内部实现提炼为 `@actspace/cordis-adapter` 的稳定包级 ABI。
- 将 Profile / Bundle / Patch 组合和 config dump 放入 `@actspace/composition`，把 Trusted Boot 与 Startup Validation 放入 `@actspace/boot`，诊断模型放入 `@actspace/diagnostics`。
- 只使用精确锁定的已发布 Cordis family 包；没有引入 `vendor/`、HMR 或私有 deep import。
- 为 fake lifecycle 和真实 Cordis lifecycle 保留两条测试路径，真实路径通过 `ACTSPACE_REAL_CORDIS=1` 显式开启。

## 验证命令

```text
pnpm install --frozen-lockfile
pnpm --filter @actspace/cordis-adapter test
ACTSPACE_REAL_CORDIS=1 pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/composition test
pnpm --filter @actspace/boot test
pnpm typecheck
pnpm check:packages
pnpm check:docs
pnpm check:repo
git diff --check
pnpm --filter @actspace/cordis-adapter build
pnpm --filter @actspace/composition build
pnpm --filter @actspace/boot build
pnpm --filter @actspace/diagnostics build
```

构建后在 workspace package 上执行 ESM import smoke test，确认 package exports 指向可加载的 `dist` 入口。

## 重要取舍

- Loader、Include、Group、Timer 和异步 dispose 类型只在 adapter / boot 边界出现；上层包只依赖稳定的 package contract。
- `frontend.required=true` 在固定 renderer 下 fail-closed；optional frontend contribution 进入告警而不是隐式激活。
- required Entry 的 PENDING、FAILED、fiberless 等非 ACTIVE 状态阻止 RuntimeHandle 发布；optional patch miss 只产生诊断。
