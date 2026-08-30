# P04：Legacy Boot Cutover

状态：完成候选（P04 已实施，待计划归档）

## 目标与依赖

在 P03 的 CLI run 已能通过 DSH-native Boot 完成一次无头任务后，把 CLI 和 Desktop 的默认启动路径切换到 `cordis.yml` + Loader，并把 Static Manifest/`plugins.json`/手工 mount 保留为明确、短期、可回退的 legacy 入口。依赖 P03；Session 和 Tool 不在本包改造。

## 文件范围

- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- `packages/runtime/src/profiles/composition.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/cordis-adapter/src/source-loader.ts`
- `packages/cordis-adapter/src/behavior-loader.ts`
- `packages/cordis-adapter/src/manifest.ts`
- 相关 runtime/CLI/desktop docs、fixtures 和 tests

## 步骤

1. CLI 和 Desktop adapter 默认只调用 `bootActSpaceRuntime({ host, configPath })`；`loadConfiguredPlugins`、`createDefaultComposition`、`activateBehavior` 和手工 Agent 创建不再出现在默认生产调用链。
2. 将 `source-loader.ts`、`behavior-loader.ts`、`manifest.ts` 的剩余代码标为 legacy compatibility layer；legacy 入口必须显式选择，不能被默认 Boot 发现或隐式 fallback。
3. `composition.ts` 只保留迁移期 config dump/provenance 所需能力；不能继续决定生产插件 activation 顺序。
4. 保留一个可验证的 legacy 回退开关/fixture，验证它只切换启动代码路径，不删除 Session 数据、不改工具 executor、不与新 Runtime 并行。
5. 更新当前设计/README/CLI 帮助，明确“完全信任同进程插件、restart-only、无不可信插件沙箱”三项边界。

## 验证命令

```bash
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/agent-cli test
pnpm run check:current-docs
pnpm run check:package-cutover
```

通过标准：默认 boot 路径只有 Cordis Loader；旧 manifest/source loader 没有隐式读取；新/legacy 双路径 smoke 均能明确报告使用的路径；回退不产生数据破坏。

## 失败与回退

如果默认切换导致 CLI/desktop 启动失败，只恢复 Host 的 legacy 选择并保留失败诊断；不删除旧代码、不回滚无关 dirty-worktree，不把 legacy 路径悄悄留在默认分支。
