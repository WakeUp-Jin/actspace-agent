# P2：Agent Contract Matrix 自动生成与漂移门禁

状态：部分实施，保留 active。generator、双产物、字节漂移检查与 CI wiring 已交付；2026-09-09 复核发现原计划要求的语义 validator 和负向 fixtures 尚未完整实现。

## 目标与依赖

建立只读的契约矩阵生成器，统一列出 Session 事件、Agent Loop 插入/通知事件、Service 三层、Plugin/Bundle/Composition、capability、package exports 和验证证据。生成器可以在 P1-A/B/C 实施期间先用 fixture 开发，但最终 `--check` 门禁依赖三项 P1 的 public metadata 和 immutable `BootManifest`。

设计真源：[Agent Contract Matrix 自动生成规范](../../../design-docs/agent-plugin-runtime/agent-spec-contract-matrix-generation.md)。

## 范围和文件所有权

允许修改：

- `scripts/contract-matrix/**`（读取 allowlist、normalizer、validator、renderer、CLI）；
- `artifacts/agent-contract-matrix.json`；
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`；
- 根 `package.json` 的 `gen:contract-matrix` script、相关 CI/check wiring；
- generator fixtures、负向 drift fixtures 和 tests。

禁止修改 Runtime activation、Session 数据、Cordis dispatch、Tool executor、Profile/Bundle/Patch 业务实现；不得通过生成器增加运行时例外映射。

## 输入和输出

输入只来自显式 allowlist：plugin manifests/entries、Service Definition/Provider/Consumer metadata、Session Journal registry、Agent Loop 9/5 surface、最终 `ResolvedComposition/BootManifest`、package exports/dependency metadata 和 verification metadata。禁止扫描用户 Session、`.env`、凭据、workspace 文件或外部网络。

输出固定为：

- `artifacts/agent-contract-matrix.json`：`schemaVersion`、`generatorVersion`、`sourceDigest`、services、events、sessions、capabilities、plugins、packages、verification、diagnostics；
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`：带 generated header、owner/sourceRefs/tests/status 的人读视图。

不写当前时间、随机 id、本机绝对路径；同一输入必须得到字节稳定结果。事件行必须区分 `codec present`、`producer none`、`producer not-implemented`。

## 实施步骤

1. **Input registry**：定义显式 source allowlist 和 sourceRef 解析器，读取 public exports/metadata，不使用全仓库文件名猜测。
2. **Normalizer/schema**：实现 Service、Event、Session、Capability、Plugin、Package、Verification 行的统一 schema 和稳定排序；将 P0 的 13+9+5 事件分类、scope、mode、containment、producerStatus 固化。
3. **Validator**：实现 duplicate id、missing owner/codec/provider、provides/inject mismatch、consumer→private provider、cycle、composition digest mismatch、Host ceiling 扩大、missing export、bad sourceRef 和 secret/absolute path 检查；error fail closed，warning/info 可写入。
4. **Render/CLI**：实现 `pnpm run gen:contract-matrix` 和 `pnpm run gen:contract-matrix --check`；生成 JSON/Markdown，`--check` 不写文件，只比较重新生成字节。
5. **Fixtures/CI**：为每种漂移建立最小正/负向 fixture；接入 `check:packages`、`check:current-docs` 和 CI，验证手改产物、漏更新、P1 metadata 变化都会失败。
6. **交接**：记录生成器版本、输入 digest、产物校验结果和外部人工门禁边界；生成器不被 Runtime 反向依赖。

## 验收标准

- 同一输入重复生成 JSON/Markdown 完全一致，`--check` 能发现手工修改和输入变化。
- 13 个 Session 核心事件、9 个 Loop 插入事件、5 个通知事件全部出现且分类正确；`goal/*`、`schedule/*` 等无 producer 事件显示 `unimplemented/not-implemented`。
- Definition/Provider/Consumer、Profile/Bundle/Patch、Host ceiling、package export 漂移可由 fixture 触发并 fail closed。
- 每行有 owner、sourceRefs、tests 和 status；产物不含绝对路径、凭据、Session 内容或随机时间。
- 生成器只读审计，不改变 Runtime、Session、Tool、Cordis Loader 或 CLI run 行为。

## 定向验证

```bash
pnpm run gen:contract-matrix
pnpm run gen:contract-matrix --check
pnpm run check:packages
pnpm run check:current-docs
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/runtime test
```

G2 还需运行 `pnpm -r typecheck`、`pnpm -r test`、`pnpm test:agent-cli:process`；若本地 CI 脚本尚未包含新命令，必须在本计划内接入后再宣称门禁通过。

## 回退

P2 回退只删除生成脚本、产物和 CI 门禁，不触碰 P1 Runtime/Session/Tool 实现或数据。误报应修正 source allowlist/normalizer/fixture；不得在生成器里硬编码单个路径例外。

## 进度

- [x] 建立输入 allowlist 和 schema fixture。
- [x] 完成 normalizer、validator 和稳定 sourceDigest。
- [x] 生成 JSON/Markdown 并提供 `--check`。
- [x] 完成现有确定性、事件计数、重复 ID 与 notification veto 测试及 CI wiring。
- [ ] 补齐原计划中的语义 validator 与负向 drift fixtures：manifest/inject/provide 一致性、依赖环、Consumer 私有 Provider 依赖、Host ceiling、composition digest 和 sourceRef/public export 有效性。
- [ ] 完成上述语义门禁后再向 release/review 最终交接；真实 Provider/宿主与 CLI G1 仍独立跟踪。

## 2026-09-09 实施范围复核

- [P1/P2 联合执行摘要](../../../exec-runs/20260829-actspace-p1-session-core-persistence/execution-summary.md)记录了当时 G2 通过；该历史记录保持原样。本次不能仅依据旧摘要和已勾选清单归档。
- 本次 `pnpm test:contract-matrix` 2/2 通过。首次 `--check` 发现后续 7 个 package 的 exports/dependencies 已变化；使用现有生成器刷新 JSON/Markdown 后，`pnpm run gen:contract-matrix --check` 通过。未修改生成器、allowlist 或产品代码。
- `validateRows()` 当前只覆盖重复 ID、缺 owner/sourceRefs、绝对路径、缺 provider ID、13/9/5 计数和 notification veto 等基础检查；`parseComposition()` 主要提取声明与固定 Profile 结构，尚未验证最终 ResolvedComposition/BootManifest 的全部语义。
- 只读内存负向探针将 plugin 的 inject/provide 改为未声明 Service、将 sourceRef 改为不存在的相对路径、加入无效 composition digest，`validateRows()` 均返回 0 个 error。这些探针不是新增仓库测试，也不能证明未探测场景通过。
- 下一步按上方未完成清单逐项补 validator 与最小负向 fixture，明确哪些校验复用领域 verifier、哪些由 generator 执行；随后重跑 `--check` 和 G2。不能用 sourceDigest 字节变化检测代替语义合法性验证。
- 当前矩阵只覆盖显式 allowlist；新增包/插件需要同步维护输入。完成后再按生命周期移入 completed，G1 仍由 [总计划](../20260829-actspace-p1-p2-contract-and-composition/README.md)负责。
