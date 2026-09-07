# 使用统计页面与费用更新执行计划

> 建立：2026-09-06。状态：2026-09-07 P01–P04 实现完成并归档；真实 Electron / Provider / 发布制品验收尚未完成。
> 用户已明确要求开始执行；按 P01–P04 顺序推进，验证结果记录在执行文档。

## 目标

设置入口改为“使用统计”，借鉴 Maka 的清晰信息结构并统一 ActSpace 视觉；修复成本零值/缺失与来源误标；把 models.dev、OpenRouter 数据解析保存本地，以随包目录和按需后台刷新支持可靠估算。

## 设计事实来源

- [页面设计](../../../design-docs/frontend/front-usage-statistics-refresh.md)：视觉、中文、表格、交互和页面状态。
- [目录与费用设计](../../../design-docs/model-context/agent-model-catalog-and-usage-cost.md)：模型身份、单位、来源、价格快照、历史、缓存与刷新。
- 开始代码前读 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/CODING_BEHAVIOR.md`、`docs/QUALITY_SCORE.md`、`docs/HISTORY_GUIDE.md`；UI 阶段另读 `docs/FRONTEND_VERIFICATION.md` 与主题规范。
- 本计划补充设置中心与模型设置重做计划，不重置它们的实现状态。现有工作区有大量相关及无关未提交修改，必须基于当前文件作小范围增量修改，不覆盖整个文件或回退他人改动。

## 任务分类与范围

| 用户问题 | 判断 | 处理 |
| --- | --- | --- |
| Usage 不像设置页面、视觉不好看 | 已接受的视觉改善 | 共用页面原语、简化边界、紧凑表格 |
| 英文改为中文 | 已接受的文案改善 | 标题/导航为“使用统计”，统一当前页面文案 |
| 成本未显示 | 有代码和离线探针证据的缺陷 | 修正价格传递、来源、币种与历史展示 |
| 参考 pi 本地模型目录 | 已接受的设计方向 | 生成静态目录，运行时读取本地并按需刷新 |
| 担心拉取卡顿 | 明确非功能要求 | 统计页不触发价格下载，worker、超时、缓存、单飞 |

不包含：升级整个 pi SDK、引入 pi coding-agent、新建目录服务器、真实账单同步、自动历史重算、改写用户 Journal、全局国际化、图表扩展、发布或 Git 提交。

## 阶段与依赖

| 顺序 | 独立计划 | 依赖 | 完成后的可用结果 |
| --- | --- | --- | --- |
| P01 | [随包目录与请求费用](p01-local-catalog-and-cost.md) | 无 | 离线准确匹配价格，新请求保存可解释费用；旧 UI 仍可用 |
| P02 | [统计投影与历史口径](p02-usage-projection.md) | P01 契约 | 旧零值不再误导，同一页面各分类数据一致 |
| P03 | [按需更新本地目录](p03-catalog-refresh.md) | P01 | 新价目可后台获取，失败不影响已有能力 |
| P04 | [页面与中文体验](p04-usage-page.md) | P02、P03 | 页面与设置统一，价目状态和费用来源可理解 |

默认顺序执行，不自动开启多 Agent。每阶段单独记录验证，可单独合入；P01 + P02 是最小完整费用修复，后续未交付也不影响使用。预计跨 8 个以上代码文件，新增一个 Desktop 目录服务及 worker，复用现有 OpenRouter 接口，无新 npm 依赖或后台服务器。

## 公共契约先行

P01 冻结 `ModelCatalogEntry`、`ModelPricingSnapshot`、`LlmUsage.costProvenance`；P02 冻结 activity 的可选聚合与费用质量字段；P03/P04 不再各自添加第二套价格计算或历史统计协议。字段定义以设计文档与 shared/llm-service 公开类型为准。

所有新增字段兼容旧 Journal；价格更新仅改变未来请求。目录与投影属于可重建数据，回退不需要修改会话事实。已经记录的新请求价格快照保留，旧版本允许忽略新增字段。

## 总体验收

- [ ] 本地固定 fixture 手算金额与两个引擎、Desktop/CLI、Journal 回读一致；输入缓存与推理不重复收费。
- [x] 旧异常零值、缺价格、未知模型、有效免费、混合币种与部分已知数据呈现准确。
- [x] 同一匹配集摘要、服务商/模型分布、分页总数一致；assistant/message 与 step/end 不重复计费。
- [x] 本地启动与 TTL / 读取行为已自动验证；代码触发点符合约定，真实 Electron 网络观测尚未完成。
- [ ] 断网、超时、304、损坏/超限缓存、并发刷新、退出中断均保留有效数据。
- [ ] 浏览器 fixture 与真实 Electron 浅/深/系统主题验收完成，截图对比普通设置页面。
- [x] 10,000 请求 fixture 冷 / 热投影与 heapUsed 采样已有记录；读取次数测试确认无新事件时翻页不重读 Journal。峰值内存及全库磁盘冷启动未实测。
- [ ] 目录 worker 更新过程中，隔离 Electron 记录主进程事件循环延迟，目标 p95 小于 50ms；任何可归因于目录解析的长任务均需消除，不以网络异步代替 CPU 验收。
- [x] 文档、history、执行摘要已同步；未完成真实 Provider、Electron 或制品验收时如实列出。

## 验证与交付纪律

各阶段执行定向测试；公共依赖先运行 `pnpm --filter @actspace/runtime... build`。最终执行 `pnpm typecheck`、`pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:frontend-theme`，涉及发布构建时执行 `pnpm build`。失败先判断本轮增量与已有工作区问题，不为通过门禁扩大范围。

真实 Provider 只使用已有授权配置和隔离会话，记录模型/价格来源/费用元数据，不落凭据或完整聊天正文。自动化 stub 不证明真实账单；若没有实际调用条件，保留明确验收缺口。

## 风险与回退

- 目录无法精确覆盖自定义服务：显示未知，支持现有显式价格，不做模糊匹配。
- 价格来源过期或停止服务：随包与缓存继续使用，界面保留更新时间/估算标识。
- 协议兼容：先追加字段再切换消费者，旧事件按兼容路径读取；回退 UI 时仍保留费用修复。
- 并行开发覆盖风险：每阶段开始检查 diff、类型和已有测试。变更职责重叠时合并当前行为，不还原既有功能。
- 运行性能：大 JSON 在 worker 处理；统计聚合基于 session revision 复用，不把磁盘扫描绑定每次分页。

## 执行记录

模式为交互模式。完整计划获准实施后按已授权范围连续推进，不对常规可逆步骤重复询问。

实施开始才在 `docs/exec-runs/20260906-actspace-usage-statistics/` 创建 `execution-process.md` 与 `execution-summary.md`，逐阶段记录命令、结果、截图和剩余门禁。代码交付写 history，并按 `docs/learnings/WRITING_GUIDE.md` 判断是否沉淀计费来源/本地目录模式。完成后按仓库规则移至 completed，保留真实宿主未验收边界。

## 当前下一步

实现与自动化交付完成。开发启动问题已修复；下一步为执行摘要列出的真实 Electron IPC / 主题 / worker、Provider 费用回读与发布制品验收；不再有待实施功能阶段。

[执行过程](../../../exec-runs/20260906-actspace-usage-statistics/execution-process.md) · [执行摘要与人工门禁](../../../exec-runs/20260906-actspace-usage-statistics/execution-summary.md)。未勾选的复合验收项只完成其中部分，不作全通过声明。

## 2026-09-07 截图迭代

用户批准保留四项指标并进一步对齐 Maka 日志结构，已交付八列表格、分类数量、模型与工具混合日志、整表详情开关及费用提示；当前视觉契约以[更新后的页面设计](../../../design-docs/frontend/front-usage-statistics-refresh.md)为准。单次开发历史清理获得用户明确授权，范围和验证记录在执行文档，不改变历史保留的产品默认策略。

## 2026-09-07 悬浮明细收敛

用户批准移除价目、采用固定高峰估算，并在实际截图后进一步确认费用无弹窗、模型和 Token 仅显示名称 / 数值。已实现；具体显示规则与费用来源优先级以对应当前设计文档为准，验收见执行摘要。本轮不再增加时段计价逻辑。
