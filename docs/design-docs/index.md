# 设计文档索引

[Host/Harness/Run 总览](agent-plugin-runtime/agent-target-overall-architecture.md)：Host 稳定基底、Harness 独立组合与 Run 固定租约；P5 实机验收单独跟踪。

- [Tool 插件边界与 Todo 领域事件](agent-plugin-runtime/agent-tool-plugin-boundaries.md)：独立工具包、Host port、Projection Contributor、scope 和不兼容旧 Todo 的事件断点。


- [Agent 工具权限模型](execution-safety/agent-tool-permission-model.md)：当前权限事实源；定义已实施的 `default/full-access`、结构化资源、once 与 Desktop 文件 Session Grant。

- [LLM Core Pi 收敛设计](agent-plugin-runtime/agent-llm-core-pi.md)：已实施 Host prepare、重试 generation、pi-ai 直接调用、backend parity 与 replay；外部验收边界见执行摘要。

- [Session 事件持久化重构](agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)：核心行为已实施；Session 接纳、持久化协调器、检查点与 live/durable 边界。

- [Session 三类读模型设计规范](agent-plugin-runtime/agent-spec-runtime-projection.md)：已落地；定义 Global Aggregate、Session Projection、Window Presentation 及其水位、缓存和 Client 边界。

- [工具输出、文件引用与图片输入](tool-system/agent-tool-output-references.md)：Bash 大输出回读、历史引用、Provider 图片转换和失败反馈。

- [Web / PWA 客户端规范](frontend/front-web-pwa客户端规范.md)：已实施（2026-10-17）；手机与浏览器共用的响应式客户端 `apps/web`，支持 PWA，直连 agent-host（Host 同源托管，手机经 Tailscale HTTPS）；2026-10-18 视觉改为 B · 轻玻璃；真机验收待做。

- [聊天 Mermaid 图表渲染](frontend/front-chat-mermaid-diagrams.md)：已实施；助手回复中闭合的 Mermaid 代码块渲染为固定 Codex 浅色图表，源码按不可信输入处理，Electron 验收边界见执行摘要。

- [日常桌面界面中文文案](frontend/front-desktop-chinese-ui.md)：日常操作中文化，保留模式、思考档位与工具执行名称；验收边界见执行摘要。

- [外观强调色](frontend/front-accent-palette.md)：已实施，Electron 验收待做；5 个调色板只驱动发送按钮、开关、焦点、链接与文字选中，默认零变化。
- [使用统计页面更新](frontend/front-usage-statistics-refresh.md)与[本地模型目录及使用费用](model-context/agent-model-catalog-and-usage-cost.md)：已实施，实机门禁见执行摘要；统一设置视觉，修正费用来源，定义随包目录、缓存和按需刷新。
- [存储改版 V2：增加 SQLite 查询读模型](筛选存储改版V2-增加SQLite/README.md)：Session JSONL 继续作为唯一事实源，SQLite 负责使用统计、历史搜索和过去会话查询；Worker 边界见[单独说明](筛选存储改版V2-增加SQLite/worker.md)。
- [Context 面板与 SQLite 联合设计](上下文管理引擎设计/上下文管理引擎V2/05-Context面板与SQLite联合设计.md)：当前 Context、历史索引、同步生命周期与联合修复；待审阅未实施。
- [SQLite 原会话与联合方案校验](上下文管理引擎设计/上下文管理引擎V2/06-原会话决策与联合方案校验.md)：核对按需查询、失败恢复、迁移成本与已有验收边界，登记早期导出/诊断的范围缺口。
- [英语辅助学习插件设计](agent-plugin-runtime/agent-english-learning.md)：提示词与朗读功能保留；当前 live Agent 绑定存在接线限制，详见正文。
- [Agent 工具流式渲染修复设计](frontend/front-agent-tool-stream-rendering.md)：已实施的跨 Core、Tools、Desktop 事件链修复设计。

`docs/design-docs/` 集中管理当前 v2 架构设计、产品设计和重要设计决策。

## 目录硬约束

- `docs/design-docs/` 下面最多只允许一层专题目录。
- 专题文档直接放在一级专题目录；原型复用图片可置于资产目录，不把资产目录发展为第二层文档专题。
- 只有强关联、需要一起阅读和维护的文档才进入同一专题目录。
- 跨专题入口、基础原则和无法形成稳定专题的独立设计继续放在根层。
- 专题目录已经表达归属，现阶段仍保留 `agent-`、`front-` 文件名前缀，避免目录迁移与全面重命名同时发生。
- HTML prototype 放在所属专题目录；PNG 可与原型相邻或按原型资源组织，入口需说明用途与状态。

新增专题目录前应先确认：至少有两份长期强关联文档，并且把它们放在一起能明显降低查找成本。否则不要为了分类而创建空目录或单文件目录。

## 根层入口

- `core-beliefs.md`：Agent-first 的工作原则和模板设计出发点。
- [ActSpace 产品概念思路（初稿）](ActSpace产品概念思路初稿.md)：产品形象：定位、信念“唯变所适，每一个问题都有它的空间”、故事线、Agent / 场景 / Actor / Actor 名册 / 空间、意象与气质；视觉方向待定。
- `core-storage-and-observability.md`：本地存储、workspace root 和可观测性边界。
- `core-review-change-sources.md`：Git-first Review Workbench 单一事实源，覆盖六种 scope、upstream Branch、结构化 diff、Review Options、Git actions 与验收边界。
- `core-review-large-diff-loading.md`：Review Standard/capped 双模式、批量 patch、完整文件正文、虚拟渲染和性能验收规范。
- `agent-index.md`：Agent Runtime 和全部 Agent 专题的总入口。
- `website-introduction-site-design.md`：`apps/site` 官网、公开文档、博客、更新页、内容归属和静态部署边界；视觉规范见 `apps/site/DESIGN.md`。

## 一级专题目录

- [自进化的方案设计](自进化的方案设计/README.md)：V1 用户显式修改、下一条消息使用新版本，新增官方 Skill 内容集合；V2 失败触发与沙箱评估。V1 已实施，实际 API、限制和验收证据以专题 README 与执行摘要为准。
- [会话内自进化与 Actor 扩展边界](自进化的方案设计/04-会话内自进化与Actor扩展边界.md)：早期可行性分析；自动续跑已移出当前计划，最新决策见专题导航；只预留 Actor 能力版本接口，不实施 Actor。

| 目录 | 内容边界 | 入口或代表文档 |
|---|---|---|
| `agent-plugin-runtime/` | v2 后端插件化重构的总体架构、研究证据、已确认决策、目标边界、包结构与公共契约 | `docs/design-docs/agent-plugin-runtime/agent-target-overall-architecture.md`、`docs/design-docs/agent-plugin-runtime/README.md` |
| `agent-runtime/` | Agent 形态、工作模式与 Journal 观测数据契约 | `docs/design-docs/agent-runtime/agent-forms-and-modes.md`、`docs/design-docs/agent-runtime/agent-observability-trace-model.md` |
| `model-context/` | 当前模型供应商、模型能力、request snapshot、token usage 和 Context Projection | `docs/design-docs/model-context/agent-multi-provider-llm.md`、`docs/design-docs/model-context/agent-context-model-facts-and-composer.md` |
| `上下文管理引擎设计/` | V2 生命周期与物理拆包已有实现；Context 面板与 SQLite 联合设计待审阅，联合验收未执行 | [V2 设计](上下文管理引擎设计/上下文管理引擎V2/README.md)、[第一版数据结构规范](上下文管理引擎设计/Context数据结构和模型输入数据结构的设计规范.md)、[第一版插件拆分](上下文管理引擎设计/上下文管理引擎的插件拆分和上下文的插件拆分.md)、[渐进式披露](上下文管理引擎设计/agent-progressive-disclosure.md)、[压缩提示词](上下文管理引擎设计/agent-compaction-prompt.md)、[第一版执行计划](../exec-plans/completed/20261006-context-management-engine/README.md) |
| `tool-system/` | 当前 Skill、Web/图片工具、工具预览和受控子进程 | `docs/design-docs/tool-system/agent-skill-loading.md`、`docs/design-docs/tool-system/agent-image-inspection-tool.md` |
| `execution-safety/` | v2 Tool Runtime、Host policy、权限模式、审批、Grant、Bash hard guard 和副作用恢复边界 | `docs/design-docs/execution-safety/README.md`、`docs/design-docs/execution-safety/agent-tool-permission-model.md` |
| `browser/` | Browser Bridge、ActSpace 集成和 canonical command | `docs/design-docs/browser/agent-browser-use-index.md` |
| `collaboration/` | 当前一次性 Subagent / Explore | `docs/design-docs/collaboration/agent-subagent-runtime.md` |
| `多智能体协作/` | Space 工作台、Actor 名册与一对一对话：多个 Actor 协作解决一个问题的产品与前端设计、demo 和头像素材 | [README](多智能体协作/README.md)、[Space 工作台设计](多智能体协作/front-space-工作台设计.md) |
| `frontend/` | 桌面端视觉、主题、组件、工作台、页面和前端原型 | `README.md` |

## 推荐阅读路线

- [Agent 形态与三种工作模式](agent-runtime/agent-forms-and-modes.md)：当前 Chat/Plan/Agent 模式、工具白名单与持久化边界；未接通项在专题中单独说明。

### Agent Runtime

1. `agent-index.md`
2. `agent-plugin-runtime/README.md`
3. 涉及 v2 Desktop / CLI 多宿主时读 `agent-plugin-runtime/agent-target-runtime-architecture.md`
4. `agent-plugin-runtime/agent-task-run-lifecycle.md`
5. 涉及 Journal 观测时读 `agent-runtime/agent-observability-trace-model.md`
6. 根据任务进入 `model-context/`、`tool-system/`、`execution-safety/`、`browser/` 或 `collaboration/`

### v2 插件化 Runtime

1. [总体架构](agent-plugin-runtime/agent-target-overall-architecture.md)
2. [Runtime 与 Composition](agent-plugin-runtime/agent-target-runtime-architecture.md)
3. [插件组装与 Agent 启动](agent-plugin-runtime/agent-spec-dsh-plugin-assembly-and-agent-startup.md)
4. [专题契约与实施状态](agent-plugin-runtime/README.md)

当前实现与部分实施目标按文档状态区分。Profile-first 等决策保留在原目录供追溯；DSH-native 早期提案不再作为首读规范。

### 前端

1. `frontend/README.md`
2. `frontend/front-新功能开发清单.md`：新增或改动前端功能前必读
3. `frontend/front-全局视觉语言规范.md`
4. `frontend/front-主题与配色规范.md`
5. 再进入具体工作台区域、组件或页面规范

### 官网与公开内容

1. `website-introduction-site-design.md`
2. `docs/releases/README.md`
3. `docs/releases/feature-release-notes.md`

## 设计文档与其他资料的边界

- 设计文档回答为什么做、做成什么样和边界是什么。
- 实施步骤放在 `docs/exec-plans/`。
- 外部资料、调研底稿和历史快照放在 `docs/references/`。
- 当前实现变化需要同步设计文档，但不要把逐次实现流水账堆进长期设计入口。
- `docs/references/llm-agent-dev-skill-fixes/README.md` 是 Skill 修复分析归档，不作为主线架构事实来源。

- [ActSpace 官网专属设计规范](../../apps/site/DESIGN.md)：产品参考取舍、双主题、排版与官网各页面设计方向。
