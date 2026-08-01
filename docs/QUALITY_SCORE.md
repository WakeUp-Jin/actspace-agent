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
| 官网与公开内容 | B+ | `packages/site` 已交付静态主页、10 篇公开文档、博客、release 驱动的更新页、三态主题与 GitHub Pages workflow；站点 check、单测、base-path build 和桌面/移动浏览器验收通过。 | 在真实 Pages 环境测量 LCP，再决定是否引入 Sharp、AVIF/WebP 与搜索全文索引；补公开 Browser 实机截图后更新产品展示。 |
| 架构文档 | A- | 三层骨架已落地，agent-core 模块化重构完成，ARCHITECTURE.md 已收敛为顶层导航，细节拆入 agent-core 模块地图、四层职责规范与存储可观测性专题。 | 补充模块间交互时序图。 |
| 后端 agent-core | B+ | 模块化架构已就位，DeepSeek 真实 SSE provider、测试专用 mock provider、IPC bridge 与集中 env 入口均已落地；bridge 已保证每轮 turn 写入 `user_message`；provider 可重试错误已有 loop 层自动重试 + 失败轮次 error 事件兜底。 | 补高级上下文策略。 |
| 前后端对接 | B+ | 双通道流式架构已落地，Composer 可真实发送；普通会话默认走 DeepSeek，最终展示以恢复后的 `SessionRecord` 为事实来源。 | 继续打磨 streaming UI、工具状态和真实 Electron 回归。 |
| 测试 | B+ | vitest 测试体系覆盖核心模块与 E2E smoke；新增 bridge 测试锁定 `user_message -> thinking/tool -> assistant -> context` 事件顺序。 | 补自动化的 provider integration gate、前端 UI/turn 测试和 CI。 |
| 可观测性 | B+ | Session V2 已统一 `agentRunId → turnId → llmCallId`；生产分析观测页可按用户输入、Turn、LLM Call 查看脱敏请求上下文、响应和差异，并具备 summary sidecar、64 MiB 单 Run 上限、30 天 / 512 MiB retention、损坏隔离与显式清理。 | 完成真实 Electron 长会话、Retina 和多 provider 人工验收；若要对齐网络代理级观测，再补原始 HTTP wire request/stream 的安全采集。 |
| 安全 | B | Electron 边界采用 `contextIsolation` + preload bridge；provider 默认 Key、额外命名 Key 与搜索 Key 均由 main 使用 `safeStorage` 管理，renderer 只接收脱敏状态；DuckCoding 本地模型档案不读取外部目录或携带用户凭据。 | 补 API Key 替换/轮换流程、更完整的错误脱敏和敏感路径按需读审核。 |
| 学习沉淀 | B | 体系已经跑起来，且已有学习文档。 | 随着 DeepSeek 接入和前端对接，继续补真正有迁移价值的学习文档。 |
| Kairos 自治模式 | B+ | v1 闭环已落地，KairosPage 已从原始事件表改成监控台式两列 UI；上下文已重构为「静态前缀 + 动态尾部」（system prompt 静态化、观测增量进 tick message、thinking 全链路落盘/重放/展示、contextWindow 接模型注册表），重放保真有序列化层 deepEqual 回归锁住；短期记忆压缩已接线（tick 闭合后异步触发 week 压缩，`compression/trigger.ts`）。 | 真实 tick 缓存命中率（目标 ≥85%）待手动验收；intra-day 压缩与压缩 LLM 调用的用量计费未做；继续补 notes 编辑、external 数据源插件。 |
