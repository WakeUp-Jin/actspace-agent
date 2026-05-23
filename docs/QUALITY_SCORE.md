# 质量评分

用这份文档按产品区域和架构层次记录当前质量水位，方便持续知道最薄弱的地方在哪。

## 建议的评分标准

- `A`：覆盖完整、行为稳定、文档清楚、运行风险低。
- `B`：整体可接受，但还有明确短板。
- `C`：能用，但需要针对性补强。
- `D`：脆弱、缺少规范，或很多行为尚未定义。

## 当前评分

| 区域 | 评分 | 原因 | 下一步 |
| --- | --- | --- | --- |
| 产品面 | B | 产品方向、界面语法、核心交互和首版技术路线都已明确，桌面端工作台骨架已出现。 | 把"可用骨架"推进到"真实可用工作流"，优先接 DeepSeek provider。 |
| 架构文档 | B+ | 三层骨架已落地，agent-core 已完成模块化重构（llm/tools/context/engine/persistence 五大子模块），ARCHITECTURE.md 已同步。 | 补充模块间交互时序图，跟随前端对接补充 IPC 层细节。 |
| 后端 agent-core | B+ | 模块化架构已就位，类型体系完整，mock provider 可用，86 个测试覆盖全部 5 个子模块 + 端到端 smoke。 | 接入 DeepSeek 真实 API，补充真实 provider 的集成测试和错误处理。 |
| 测试 | B | vitest 测试体系已建立，14 个测试文件 86 个测试全部通过，覆盖 messages/adapters/llm/tools/context/engine/persistence + E2E smoke。 | 补充前端 UI/turn 测试，增加 CI 自动化。 |
| 可观测性 | D | 已有 `logs/` 目录初始化，但还没有真正的日志结构、故障追踪和调试约定。 | 补最小日志格式、本地排障入口和关键错误面板。 |
| 安全 | C | Electron 边界采用 `contextIsolation` 和 preload bridge，工具系统增加了 workspace-guard 路径边界守卫。 | 在接真实 provider 前明确密钥注入、文件读取边界和错误暴露策略。 |
| 学习沉淀 | B | 体系已经跑起来，且已有学习文档。 | 随着 DeepSeek 接入和前端对接，继续补真正有迁移价值的学习文档。 |
