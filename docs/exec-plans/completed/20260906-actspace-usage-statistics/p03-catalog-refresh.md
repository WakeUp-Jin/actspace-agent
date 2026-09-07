# P03：本地模型目录按需后台更新

> 状态：2026-09-07 实现完成；下方清单保留未通过的宿主验收项，实际证据见执行摘要。依赖 P01；不依赖 P02 的聚合实现。完成后模型设置可独立后台更新目录。

## 必读与范围

先读 `AGENTS.md`、[总计划](README.md)、[目录设计](../../../design-docs/model-context/agent-model-catalog-and-usage-cost.md)、`apps/desktop/src/main/runtime-v2/openrouter-catalog-service.ts` 和 `provider-network-service.ts`。沿用现有网络策略，不把私有模型发现接口或用户凭据直接转发给公共目录源。

## 文件与实施任务

1. 新增 `apps/desktop/src/main/model-catalog-service.ts` 与 `model-catalog-worker.ts`，复用 P01 数据契约和归一化规则。两个源缓存放 `<dataRoot>/model-catalog/`；包产物包括 worker，开发态和 Electron 打包态都从实际构建路径启动。
2. 扩展现有 `runtime-v2/openrouter-catalog-service.ts` 作为兼容门面，模型列表价格来自统一目录，不独立计算第二份价格。私有模型发现继续走原 provider network 边界。旧缓存验证通过才迁入；无效或单位不明则忽略并保留原文件。
3. 在 `runtime-v2/desktop-host-adapter.ts` / 现有服务装配处启动和 dispose 服务；本地解析立刻可用。目录异步成功后只更新未来请求可用事实，不能改变已冻结请求或历史投影金额。
4. 通过现有 model IPC 命名空间追加 `catalogStatus` 和 `refreshCatalog` 操作，shared、main IPC、preload/global 类型同步。状态包含 idle/updating/failed、最近成功时间、来源与是否使用随包目录，不含凭据。读取状态绝不隐式拉网。
5. 模型设置打开先显示本地列表，再在 TTL 满 4 小时且网络允许时刷新。无定时轮询。显式刷新越过 TTL；同源 single-flight、失败 5 分钟冷却、每尝试 4 秒最多重试一次、总等待 15 秒、16 MiB 上限按设计落实。
6. 网络数据在 worker 解析/校验，原子替换后发布 revision；304 仅在存在有效正文时接受。损坏 schema/hash、超限、超时、退出取消与旧响应均不得覆盖最后有效缓存。缓存比随包旧时用随包，校验未来时间异常。
7. 更新 `apps/desktop/src/renderer/components/settings/ModelSettings.tsx` 的现有刷新状态，不重做模型页面结构；P04 在价目分类复用同一状态和动作。

## 验证

新增 `apps/desktop/src/main/test/model-catalog-service.test.ts`，扩展 `runtime-v2-openrouter-catalog-service.test.ts`：

- 假时钟验证 TTL 边界、无轮询、失败冷却、显式强制刷新；并发多个调用者每源仅一次网络请求。
- 200/304/404/429/5xx、离线、网络超时、解析失败、超限、截断文件、重启读取、旧缓存迁移、随包比缓存新。
- 对所有公共请求断言无 Authorization、用户连接地址、聊天或使用记录；不影响已有 provider 私有目录调用。
- 更新中退出不留下有效路径下的半文件；重启可回到上次目录；新目录不改变进行中请求和历史费用。
- `pnpm --filter @actspace/desktop exec vitest run src/main/test/model-catalog-service.test.ts src/main/test/runtime-v2-openrouter-catalog-service.test.ts`
- `pnpm build` 验证 worker 随产物存在；按前端验证规范隔离 Electron 验证加载路径。

## 完成与回退

- [x] 本地启动及读取无隐式拉网已有测试，统计组件不会调用自动价目更新；真实 Electron 网络观测仍未完成。
- [x] 两源均可在触发时后台更新，失败仍可使用模型与本地价格。
- [x] 10 倍输入或超过上限时受控拒绝，renderer 无全量目录解析，主进程延迟按总计划记录。
- [ ] Worker 在开发与打包环境均可加载和退出，无残留活动句柄。

回退时停止目录刷新接入，恢复 P01 随包读取；保留缓存文件及 Journal。无需新增用户设置开关或删除数据即可回退代码。

实施差异：状态 / 刷新操作通过 getPricingCatalog / refreshPricingCatalog 接入 fixed-renderer 通道；服务装配位于 main/index.ts。大 JSON 归一化在 worker，缓存写出在主进程；单飞替代任务序号。取消与完整 HTTP 状态矩阵尚未逐项实测。

[执行摘要](../../../exec-runs/20260906-actspace-usage-statistics/execution-summary.md)记录当前结果，原验证章节是计划范围，不代表每一条均已实测。
