# DeepSeek 搜索聚合与可选抓取

状态：2026-10-18 实现与工程验证完成；mock UI关键路线通过，原生CU与真实Provider边界见执行摘要。分支 codex/deepseek-web-tools。

## 目标与约束

搜索是叠加：DeepSeek、智谱、国际通道并行，国际内部保留 Tavily → TinyFish → Exa 回退。按规范化 URL 去重、RRF（k=60）融合排名，最终取 max_results（默认5，1..10）。不得用 DeepSeek 覆盖其他搜索通道。
抓取是替换：独立默认关闭，开启后 DeepSeek 优先，普通获取失败回退本地，安全拒绝和取消不回退。沿用现有公网 URL 防线、有界读取和按实现隔离的缓存。
DeepSeek 使用现有 main-only 官方凭据；UI 明确与模型共享，不自动启用搜索或抓取。不增加模型依赖、不增加付费重排服务。

## 实施顺序

1. shared/settings、Desktop settings defaults/migrations/general、model-runtime-service：扩展 deepseek 搜索与 deepseekFetchEnabled；旧设置中 DeepSeek 默认关闭，旧来源默认保持开启；每次调用读取当前设置。
2. tools/web-tools：接入 POST /v1/tools/search 与 /fetch；搜索三路并行、RRF 去重截取；抓取校验、缓存、错误与回退。CLI 仅通过显式 ACTSPACE_DEEPSEEK_SEARCH/FETCH=1 授权使用 DEEPSEEK_API_KEY。
3. SearchSettings 与 SettingsPage/Nav：搜索与网页读取入口；独立来源开关、共享 Key 提示、费用提示、默认关闭的抓取开关及写入失败提示。复用现有设置原语。
4. 测试：三路聚合、单路失败、开关组合、去重截取、默认不付费抓取、热更新、缓存隔离、403不回退、普通错误回退、取消、迁移、UI设置写入。
5. 验证依赖构建、Desktop typecheck、相关单测、renderer/electron build、前端与文档守卫。更新设计、history及执行记录。

## 验收点

- A1 入口与五个来源、并行聚合说明、费用可见。
- A2 DeepSeek搜索与抓取初始关闭，缺Key不可开启。
- A3 来源独立启停，互不覆盖；保存后状态一致。
- A4 共享Key录入/管理提示明确，抓取可独立开启与关闭。
- A5 浅/深主题、480px窄窗和键盘操作可用。
- A6 Electron设置持久化；无真实Key时不声称外部API成功。

Computer Use 委派 gpt-6.1-sol：先浏览器mock同一路线批量检查 A1-A4，再复用路线看主题/尺寸 A5，最后隔离数据目录 Electron 检查 A6。按验收点报告通过/失败/未覆盖，不用静态检查代替交互。

## 风险与回退

官方 API 文档已核对；真实凭据与外部服务质量需单独验收。多源搜索按各成功请求分别计费；RRF只使用排名，不比较不同服务商原始分数。禁用DeepSeek两开关即可停止后续付费调用，不迁移或删除用户凭据。改动涉及超过8个文件，跨shared、main、runtime端口与renderer；通过现有tools namespace和工具端口串联，无新服务。

## 完成结果

实现与测试已完成，见[执行摘要](../../exec-runs/20261018-deepseek-web-tools/execution-summary.md)。原生Computer Use工具受限的子项保留未覆盖；真实付费API未调用。不影响代码完成状态，不宣称全量验收通过。
