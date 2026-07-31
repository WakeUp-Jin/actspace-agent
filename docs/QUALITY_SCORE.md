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
| 产品面 | B+ | 产品方向、界面语法和核心交互已明确；桌面工作台现已具备 Environment、Review、Git 操作、本机编辑器打开和绑定当前会话 workspace / worktree 的右侧交互式 Terminal。 | 继续补远端认证引导、终端 shell integration 和更完整的工作区状态可观测性。 |
| 官网与公开内容 | B+ | `packages/site` 已交付静态主页、10 篇公开文档、博客、release 驱动的更新页、三态主题与 GitHub Pages workflow；站点 check、单测、base-path build 和桌面/移动浏览器验收通过。 | 在真实 Pages 环境测量 LCP，再决定是否引入 Sharp、AVIF/WebP 与搜索全文索引；补公开 Browser 实机截图后更新产品展示。 |
| 架构文档 | A- | 三层骨架已落地，agent-core 模块化重构完成，ARCHITECTURE.md 已收敛为顶层导航，细节拆入 agent-core 模块地图、四层职责规范与存储可观测性专题。 | 补充模块间交互时序图。 |
| 后端 agent-core | B+ | 模块化架构已就位，DeepSeek 真实 SSE provider、测试专用 mock provider、IPC bridge 与集中 env 入口均已落地；bridge 已保证每轮 turn 写入 `user_message`；provider 可重试错误已有 loop 层自动重试 + 失败轮次 error 事件兜底。 | 补高级上下文策略。 |
| 前后端对接 | B+ | 双通道流式架构已落地；Terminal 也采用 shared 契约 + typed preload + main-owned session，输出 ACK 不经过 React 全局状态。 | 继续打磨 streaming UI、工具状态和跨平台 Terminal 回归。 |
| 测试 | A- | Desktop Vitest 已覆盖 593 个用例；Terminal 新增 fake backend、背压、环境脱敏、数量上限、renderer 恢复、启动/关闭状态与 ANSI 主题映射测试，开发进程监督器另有进程组 SIGINT 回归，并完成真实 `.app` / DMG 与 Electron 进程验收。 | 补自动化 provider integration gate、Windows/Linux PTY 制品和 CI 原生架构矩阵。 |
| 可观测性 | C | 已有应用数据 `logs/` 目录初始化、根目录本地开发日志入口 `pnpm dev:log`、即时 console 链路日志，以及每次 Agent turn 一个最近 1 天保留的 JSONL 排障文件。 | 补统一错误面板、renderer 错误按 turn 归因和 provider/tool 故障排查约定。 |
| 安全 | B+ | Electron 边界采用 `contextIsolation` + typed preload；Terminal renderer 不能传 executable、cwd 或 env，main 只从已登记会话解析工作区并过滤 secret / app-internal 环境变量；provider Key 继续由 `safeStorage` 管理。 | 补 API Key 替换/轮换流程、外部 URL 窄化打开桥和敏感路径按需读审核。 |
| 学习沉淀 | B | 体系已经跑起来，且已有学习文档。 | 随着 DeepSeek 接入和前端对接，继续补真正有迁移价值的学习文档。 |
| Kairos 自治模式 | B+ | v1 闭环已落地，KairosPage 已从原始事件表改成监控台式两列 UI；上下文已重构为「静态前缀 + 动态尾部」（system prompt 静态化、观测增量进 tick message、thinking 全链路落盘/重放/展示、contextWindow 接模型注册表），重放保真有序列化层 deepEqual 回归锁住；短期记忆压缩已接线（tick 闭合后异步触发 week 压缩，`compression/trigger.ts`）。 | 真实 tick 缓存命中率（目标 ≥85%）待手动验收；intra-day 压缩与压缩 LLM 调用的用量计费未做；继续补 notes 编辑、external 数据源插件。 |
