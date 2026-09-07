# P01：随包模型目录与请求费用

> 状态：2026-09-07 实现完成；下方清单保留未通过的宿主验收项，实际证据见执行摘要。依赖：无。产物供 P02/P03 消费；本阶段完成后新请求可独立离线计价。

## 必读与范围

先读 `AGENTS.md`、[总计划](README.md)、[目录与费用设计](../../../design-docs/model-context/agent-model-catalog-and-usage-cost.md)，以及 `packages/llm/service/src/usage.ts`、`adapter.ts`、`packages/shared/src/model-config.ts`、`model-resolver.ts`。本阶段不做后台联网刷新或 Usage 布局重构。

## 文件与实施任务

1. 在 `packages/shared/src/model-catalog.ts` 定义目录与价格快照契约，在 `packages/shared/src/index.ts` 导出；扩展 `model-config.ts` 的目录来源元数据，保留现有配置兼容。纯身份匹配以 provider、实际 apiModel、区域和连接配置为输入，拒绝模糊名称匹配。
2. 新增 `scripts/generate-model-catalog.mjs`，生成 `packages/shared/src/generated/model-catalog.generated.ts`，根 `package.json` 增加 `models:generate` 与离线 fixture 校验入口。生成动作显式运行；普通 build/typecheck 不访问网络。来源失败或校验错误返回非零且不覆盖上次有效产物；排序、hash 与字段归一化确定性可复现。生成文件记录来源和时间，不要求把原始全量响应提交仓库。
3. 在 `packages/llm/service/src/usage.ts` 增加可选 costProvenance，在同包新增 `usage-cost.ts` 纯计算器。完善 `adapter.ts` 的请求价格事实传递；通过公开 exports 暴露，禁止 Host 直接引用包内 src。
4. 修改 `apps/desktop/src/main/model-runtime-service.ts`、`runtime-v2/legacy-llm-adapter.ts` 与 `apps/cli/src/runtime-v2/llm-adapter.ts`，从实际最终模型解析价格。沿用现有 reasoning model 路由，冻结时记录价格倍率，避免 runtime service 和引擎二次乘算。CLI 使用随包与显式配置，不要求桌面目录服务存在。
5. 修改 `packages/llm/pi-ai/src/pi-ai-wire-engine.ts`、`legacy-proxy-wire-engine.ts`，按各协议归一化互斥 token 桶并使用纯计算器；不将 SDK 默认 cost 当作 provider 报价。真实费用字段仅在该协议确实返回时采用，未知币种/动态价格不猜测。
6. 检查 `packages/core/agent-loop/src/loop.ts` 的 usage 透传及 `packages/session/projection/src/` 消费者，新增字段完整写入并回读。只有测试证明字段丢失才修改通用循环；不创建第二条持久化通道。新旧记录均能解析。

## 验证

- 新增 `packages/shared/src/test/model-catalog.test.ts`：两源单位、missing/negative/zero、错误 schema、稳定排序、失败不覆盖、直连与 OpenRouter 同名不同价、区域别名。
- 新增 `packages/llm/service/src/test/usage-cost.test.ts`：固定输入/缓存/输出的手算值，零价、缺价格、零 token 缺价桶、倍率一次、推理包含于输出、阶梯无法识别、取消但有 usage。
- 在 `packages/llm/pi-ai/src/test/` 补两个引擎的集成用例，保留实际 SDK calculateCost 返回零的回归 fixture，证明新费用不再误标为供应商报告。
- Desktop/CLI adapter 用同一模型 fixture 验证价格快照与最终 apiModel 一致；流中刷新模型配置不影响已经开始的请求。
- `pnpm --filter @actspace/shared test src/test/model-catalog.test.ts`
- `pnpm --filter @actspace/llm-service test`
- `pnpm --filter @actspace/llm-pi-ai test`
- `pnpm --filter @actspace/runtime... build`，随后 `pnpm typecheck`；包名以现有 package.json 为准，若入口重命名先同步计划再执行。

## 完成与回退

- [x] 随包目录已生成且离线可读，归一化排序已测试；重复联网生成的一致性未单独实测。
- [x] Desktop/CLI、两个引擎均不再制造无依据的零成本，USD/CNY 单位不混淆。
- [x] 请求费用依据写入 Journal，重启读回不变。
- [x] 缺目录或模型不匹配时请求仍可执行，仅费用未知。

生成失败继续用旧有效文件；运行目录异常退到随包。代码回退不需要撤回新增 Journal 字段；不要回退为把未知费用写成 provider-reported 零值。原始 Journal 始终保留。

实施差异：契约集中在 model-catalog / usage provenance，不扩展重复的 ModelDefinition 元数据；CLI 首版只用随包目录，不新增自定义费率入口。真实响应账单字段尚未接入，当前 adapter 费用为 estimated / unknown。

[执行摘要](../../../exec-runs/20260906-actspace-usage-statistics/execution-summary.md)记录当前结果，原验证章节是计划范围，不代表每一条均已实测。
