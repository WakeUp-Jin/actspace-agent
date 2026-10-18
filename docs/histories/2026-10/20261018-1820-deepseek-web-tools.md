## 2026-10-18 | Task: 接入 DeepSeek 聚合搜索与可选网页抓取

### Execution Context

- Agent：Codex 主智能体；Computer Use 由 gpt-6.1-sol 子智能体验收。
- Runtime：Codex Desktop，本地功能分支；未提交或推送。

### 用户诉求

新增 DeepSeek Search/Fetch。搜索必须作为新来源加入既有国内/国际聚合，独立启停、合并排序取前几条，不能覆盖原来源；付费抓取可以替代本地，但必须显式开启、默认关闭。先列计划再执行。

### 主要变更

- DeepSeek、智谱、国际三路并行；国际内部保留 Tavily→TinyFish→Exa 回退。跨路URL去重、保留来源，RRF排名融合后应用总结果上限。
- 复用main-only官方DeepSeek凭据，搜索和抓取独立默认关闭；旧设置和已有模型Key不自动授权付费Web请求。
- DeepSeek Fetch优先获取Markdown，普通失败回退本地，403/私网/取消不回退；有界响应、实现隔离缓存、每次调用读取最新开关。
- 搜索来源开关真正控制Runtime注入；搜索总开关也阻止Chat web门面搜索，但不影响网页读取。
- 设置页更名「搜索与网页读取」，新增来源开关、费用和共享凭据提示，保存失败可见；mock契约同步。
- CLI通过ACTSPACE_DEEPSEEK_SEARCH/FETCH显式授权使用DEEPSEEK_API_KEY。

### 设计动机

搜索聚合与抓取替换是两个不同选择。凭据存在只代表可连接，不能隐式授予新的付费能力。排名融合避免比较不同供应商不兼容的原始分数。

### 关键文件

- packages/tools/web-tools/src/node-ports.ts
- packages/shared/src/settings.ts
- apps/desktop/src/main/model-runtime-service.ts
- apps/desktop/src/main/settings/
- apps/desktop/src/renderer/components/settings/SearchSettings.tsx
- docs/design-docs/tool-system/agent-web-tools.md

### 验证

工程与Computer Use分层结果见 [执行摘要](../../exec-runs/20261018-deepseek-web-tools/execution-summary.md)。未使用真实Key调用付费接口，外部服务质量与真实计费未验证。

### 学习沉淀

排名融合命中可迁移、有深度、有陷阱，见 [多源搜索的排名融合](../../learnings/2026-10/20261018-reciprocal-rank-fusion.md)。
