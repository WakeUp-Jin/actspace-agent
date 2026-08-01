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
| 产品面 | B+ | 产品方向、界面语法和核心交互已明确；桌面工作台现已具备完整 Git-first Review、Environment、Git 操作、本机编辑器打开和绑定当前会话 workspace / worktree 的右侧交互式 Terminal。 | 完成真实 Electron、大仓库、disposable Git mutation、GitHub remote 与跨平台 Terminal 的用户验收。 |
| 官网与公开内容 | B+ | `packages/site` 已交付静态主页、10 篇公开文档、博客、release 驱动的更新页、三态主题与 GitHub Pages workflow；站点 check、单测、base-path build 和桌面/移动浏览器验收通过。 | 在真实 Pages 环境测量 LCP，再决定是否引入 Sharp、AVIF/WebP 与搜索全文索引；补公开 Browser 实机截图后更新产品展示。 |
| 架构文档 | A | Agent Harness、宿主无关 Runtime、Host Adapter 与 Capability Provider 边界已落地并有 Desktop / CLI 双宿主验证；五层职责现已统一 `agentRunId → turnId → llmCallId` 生命周期与分析 Trace 边界。 | Web / Voice 产品形态明确后，按同一 Port 边界补 Adapter 专题。 |
| 后端 agent-core | A- | 模块化架构、统一 Runtime、提交后终态、初始化窗口 Abort、实例级活动 Agent Run、Context loader 与跨 Host parity 已落地；Bridge 对齐真实 Turn、LLM Call、重试和 usage，Runtime 仍拥有唯一顶层终态。 | 补真实 provider 的跨 Host 对照与高级上下文策略。 |
| 前后端对接 | B+ | 双通道流式架构已落地；Terminal 使用 shared 契约、typed preload 和 main-owned session，Review 使用 main-owned Coordinator、generation cancellation、批量 Git worker、独立 full-content contract 和虚拟 renderer 贯通 renderer 与 Git。 | 继续打磨 streaming UI、窗口关闭时的后台任务观测、真实 Electron 与跨平台 Terminal 回归。 |
| 测试 | A- | Runtime 已覆盖 persistence、终态顺序、Abort、rollback 和 Host parity；Trace 覆盖归属、损坏隔离与有界读取；CLI 已覆盖真实子进程、TTY、Session lock 和 SEA runtime assets。 | 补真实 Electron、真实 provider，以及等待 CI 报告 Windows/Linux/macOS x64 原生制品结果。 |
| 可观测性 | B+ | Session V2 已统一 `agentRunId → turnId → llmCallId`；生产分析观测页可按用户输入、Turn、LLM Call 查看脱敏请求上下文、响应和差异，并具备 summary sidecar、64 MiB 单 Run 上限、30 天 / 512 MiB retention、损坏隔离与显式清理。 | 完成真实 Electron 长会话、Retina 和多 provider 人工验收；若要对齐网络代理级观测，再补原始 HTTP wire request/stream 的安全采集。 |
| 安全 | B+ | Electron 边界采用 `contextIsolation` + typed preload；Trace 在 main 侧校验路径与身份并执行脱敏、有界读取；Terminal renderer 不能传 executable、cwd 或 env；provider Key 继续由 `safeStorage` 管理。 | 补 API Key 替换/轮换流程、外部 URL 窄化打开桥和敏感路径按需读审核。 |
| 学习沉淀 | B | 体系已经跑起来，且已有学习文档。 | 随着 DeepSeek 接入和前端对接，继续补真正有迁移价值的学习文档。 |
| Kairos 自治模式 | B+ | v1 闭环已落地，KairosPage 已从原始事件表改成监控台式两列 UI；上下文已重构为「静态前缀 + 动态尾部」（system prompt 静态化、观测增量进 tick message、thinking 全链路落盘/重放/展示、contextWindow 接模型注册表），重放保真有序列化层 deepEqual 回归锁住；短期记忆压缩已接线（tick 闭合后异步触发 week 压缩，`compression/trigger.ts`）。 | 真实 tick 缓存命中率（目标 ≥85%）待手动验收；intra-day 压缩与压缩 LLM 调用的用量计费未做；继续补 notes 编辑、external 数据源插件。 |
