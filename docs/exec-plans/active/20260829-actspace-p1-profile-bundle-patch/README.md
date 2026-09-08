# P1-C：Profile / Bundle / Patch 唯一组合与 BootManifest

状态：实施中；schema、digest、loader transport parity 已交付，restart-only/one-shot 仍待 G1。

## 目标与依赖

把现有 `@actspace/bundle`、`@actspace/composition`、Runtime profile 和 Cordis Loader 收敛为一条解析链：`Profile → ordered Bundles → Profile/Home/Invocation Patch → Host Capability Ceiling → ResolvedComposition → BootManifest → Loader`。依赖 P0 DSH Boot 基线；纯 composer/schema 可先做，生产 Boot 接线依赖 P1-A/P1-B public metadata。

设计真源：[Profile / Bundle / Patch 分层规范](../../../design-docs/agent-plugin-runtime/agent-spec-profile-bundle-patch-layering.md)。

## 范围和文件所有权

允许修改：

- `packages/bundle/src/**`、`packages/bundle/tests/**`；
- `packages/composition/src/**`、`packages/composition/tests/**`；
- `packages/runtime/src/profiles/**`、`packages/runtime/src/runtime/boot.ts`、`config-path.ts`、composition/boot tests；
- `packages/runtime/cordis.yml`、`apps/cli/cordis.yml` 和明确标注 authoring/transport 角色的 fixtures；
- `apps/cli/src/runtime-v2/host-adapter.ts` 以及 composition-related tests；
- 相关 manifest、exports、diagnostics 和 current design docs。

禁止修改 Session event schema、JSONL writer、具体 Tool executor、Agent Loop 9/5 事件语义或 CLI chat；不引入在线 reconcile/HMR。

## 实施步骤

1. **Schema and digest**：冻结 Profile、Bundle、Patch、`ResolvedComposition`、`BootManifest`、PatchResult、Service/Codec admission 和 Host ceiling 类型；digest 覆盖所有影响 Loader 的输入，结果创建后 immutable。
2. **Ordered composer**：实现 Profile 展开、Bundle provenance/schema 校验、稳定 Entry ID Patch（insert/replace-config/disable/remove）、required/optional target 行为、capability monotonicity、Service/Codec conflict 和 dependency cycle 检查。
3. **Loader materialization**：使 Composer 不创建 Service/Codec 实例，只生成 admission；当 Cordis Loader 需要文件路径时，由 Boot 从同一结果生成一次受控 transport config，并在 diagnostics 标识 authoring/transport。
4. **Runtime/CLI unification**：让 CLI、Runtime fixture、Desktop host adapter（若本轮触及）均消费同一 `ResolvedComposition/BootManifest`；默认生产路径移除 `serviceValues`、手工 core activation 和第二份插件列表。显式 diagnostic legacy path 不能被默认 fallback 调用。
5. **Restart-only lifecycle**：验证 Profile/Bundle/Patch/provider/code 变化通过 abort/drain/flush/dispose/recompose/reboot 生效；失败时不发布可用的 Profile 启动结果，不留下旧 Loader/Context/Fiber。
6. **交接**：输出最终 manifest schema、digest fixture、Host ceiling matrix 和供 P2 读取的 immutable composition metadata。

## 验收标准

- CLI、Runtime fixture 和 Desktop 默认 Boot 使用同一 `BootManifest`，不存在 Composition digest 与 Loader entries 分裂。
- 任一 Profile、Bundle、Patch、Host ceiling、Service/Codec admission 或 loader config 变化都会改变 digest。
- required/optional capability、frontend、Patch target、duplicate provider、codec discovery 和 cycle 行为有正/负向测试。
- Patch 不能扩大 Host capability；required target 缺失 fail closed，optional target 记录 skipped diagnostic。
- restart-only、quiescent shutdown、生产 Profile 进程内单实例和 CLI one-shot boot/followup/flush/dispose 回归通过。

## 定向验证

```bash
pnpm --filter @actspace/bundle typecheck
pnpm --filter @actspace/bundle test
pnpm --filter @actspace/composition typecheck
pnpm --filter @actspace/composition test
pnpm --filter @actspace/runtime typecheck
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/agent-cli typecheck
pnpm --filter @actspace/agent-cli test
pnpm run check:package-cutover
```

完成后由 G1 执行 `pnpm test:agent-cli:process`、`pnpm -r typecheck`、`pnpm -r test` 和 `pnpm run check:v2-legacy-removal`。

## 回退

若 Loader 暂时只能接收文件路径，保留 Boot 生成的受控 transport config 作为回退；不得恢复第二套生产插件 activation。若 composition 接线失败，回退 Boot/host adapter 的选择，不删除 Bundle、Profile、Patch 数据，也不改变 Session/Tool 行为。

## 交接给下游

P2 需要消费 `ResolvedComposition` 的 entries、services、codecs、hostCapabilities、patchResults、digest、diagnostics 和 sourceRefs；G1 需要消费唯一 BootManifest 的创建/销毁 API。

## 进度

- [x] 冻结 Profile/Bundle/Patch/BootManifest schema 与 digest fixture。
- [x] 完成 ordered composer 和 Host ceiling 验证。
- [x] 完成 Loader transport 与默认 Runtime/CLI 的同源校验。
- [ ] 完成 restart-only、failure cleanup 和 one-shot regression。
- [ ] 通过 C 门验收并向 G1/P2 交接；当前已完成 composition/Boot 定向门和 P2 metadata 交接。
