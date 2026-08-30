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
| 产品面 | C+ | v2 固定工作台已覆盖 Session、Conversation、工具、审批、附件、Inbox、Todo、子 Agent、credential/provider/OpenRouter catalog/model/prompt/appearance/Quick Open 设置和诊断；Workspace 文件浏览与 Git Review 已重新接通。Terminal 仅恢复了产品位置和 main/preload 契约，xterm/native 制品和部分专用展示尚未完成，不能视为产品等价交付。 | 在 P13 中补齐 Terminal renderer/native 制品，并完成真实 Electron、Provider、浅深主题与大仓库验收。 |
| 官网与公开内容 | B+ | `apps/site` 已交付静态主页、10 篇公开文档、博客、release 驱动的更新页、三态主题与 GitHub Pages workflow；站点 check、单测、base-path build 和桌面/移动浏览器验收通过。 | 在真实 Pages 环境测量 LCP，再决定是否引入 Sharp、AVIF/WebP 与搜索全文索引；补公开 Browser 实机截图后更新产品展示。 |
| 架构文档 | A- | 默认阅读路径已收敛到 v2 Cordis 生命周期、真实插件包、RuntimeHandle、Session Journal、Tool ABI 和 Journal Projection；v1 设计进入 `v1-legacy/`，失效 Team/Bash 计划进入 `discarded/`，current truth zone 与相对链接由机械门禁守卫。 | 继续缩减旧总计划中仅用于追溯的机械路径，并在真实 Provider、Chrome、DMG/签名验收后更新发布事实。 |
| 后端 Agent Runtime | B+ | `@actspace/runtime` 与独立领域 packages 已实现 Cordis Boot、raw JSONL Journal、LLM、Prompt、Tool、Agent/Subagent 与 RuntimeHandle；Session golden、LLM、Tool、Loop、Subagent、CLI 和 Desktop 回归已通过。真实 Provider/Browser 与 packaged lifecycle 尚未签收。 | 完成真实 Provider/Browser 与 packaged lifecycle 外部门禁。 |
| 前后端对接 | B | Desktop 已通过 namespaced typed IPC 消费 v2 snapshot/cursor、approval、attachments、Main-only credentials、provider network/catalog、settings、diagnostics、Workspace 和 Review，32 个测试与 production build 通过；左右栏 resize 与右栏互斥已有回归。Terminal 和真实 Electron 仍未签收。 | 完成 Terminal 和真实 Electron reload/quit/repair 验收。 |
| 测试 | B+ | Shared、领域 packages、CLI 14、Desktop 522 assertions 和 2 个 CLI 真实进程 SIGINT smoke 通过；插件 package 契约与 current docs truth zone 都有正向仓库和负向 fixture，根 build、Browser 静态/Go、文档与安全门禁已接入。真实 Provider、Chrome Extension、DMG/签名制品仍未完成。 | 在具备宿主权限的环境重跑 package/DMG，并补 Provider、Chrome/Extension 与 packaged shutdown。 |
| 可观测性 | B | Session Journal 是 Agent 运行与模型历史的唯一持久事实源；Runtime diagnostics/live progress 与 durable projection 分离，Context、Usage 和 Analysis 均从 Journal 派生，不再把 v1 Trace/context sidecar 写成当前恢复依赖。 | 补真实长会话、损坏事件降级、重启重建和大 Journal 性能验收。 |
| 安全 | B | credential 只在 Main/Host 解析，Renderer 与 Journal 不接触 Key；attachment 先进入 Session-owned artifact store；插件数据准入、Host ceiling、JSON-safe config 和 Tool redaction 已落地。Cordis 同进程插件仍不是沙箱，第三方安装/签名不在首版范围。 | fresh dependency/SBOM 检查、真实 secret canary、外部 URL 打开边界和 packaged 文件权限验收。 |
| 学习沉淀 | B | 体系已经跑起来，且已有学习文档。 | 随着 DeepSeek 接入和前端对接，继续补真正有迁移价值的学习文档。 |
| 旧能力退役 | B | Kairos、fs-watch、旧 Agent Core、CLI SEA 和 v1 fallback 已从 Git 跟踪源码与正式入口退役；v1 用户数据原位保留且不混读。旧构建缓存和最终制品扫描尚未完成。 | P15 发布前从 clean checkout 扫描源码与制品，确认无旧 Runtime 可达路径；任何用户数据清理另立破坏性计划。 |
