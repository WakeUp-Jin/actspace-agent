# 架构总览

这份文档是 `actspace` 的架构入口，只保留顶层结构、依赖边界和阅读路线。更细的设计规范放在 `docs/design-docs/`，当前实现清单放在对应专题文档里。

如果架构、数据流、存储模型或模块边界发生变化，优先更新对应专题文档，再回到这里确认导航是否仍然准确。

## 当前仓库结构

- `apps/desktop`：Electron main、preload、renderer 所在的桌面端应用。
- `apps/cli`：通过 managed ESM loader 暴露 v2 `run` 命令、stdin 输入和 stdout/stderr 契约。
- `packages/runtime`：Host-facing ESM runtime，通过唯一 `bootProfileRuntime` 装配 Host 服务与 Harness 候选，显式编排排空执行、关闭 Session 和释放插件树；Headless/Desktop 包提供应用服务。
- `packages/core/`、`packages/session/`、`packages/llm/`、`packages/prompt/`、`packages/tools/`、`packages/subagent/`、`packages/compaction/`：独立领域 workspace packages，每个可装载包拥有自己的 Plugin Entry 与生命周期测试。
- `packages/english-learning`：Desktop 内置英语辅助学习插件，拥有单会话双语提示词与英文语音队列；凭据、临时文件和系统播放由 Desktop Host 提供。详见[设计](design-docs/agent-plugin-runtime/agent-english-learning.md)。
- `packages/agent-service`：Host 共同任务服务，拥有持久内容队列、单会话调度与结构化 Run 工厂契约。详见[Task/Run 生命周期](design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md)。
- `packages/agent-host`：独立 Node Host 接入、认证、观察与文件传输；bootstrap/lifecycle 拥有装配、维护和退出，CLI 注入 Runtime 端口；应用操作复用 AgentApplication，任务仍由 AgentService 调度。CLI 提供 `host` 启动与管理命令，Desktop Main 持有远端连接。当前验证边界见 [Host 指南](design-docs/agent-plugin-runtime/agent-host-guide.md)和 [P4 计划](exec-plans/completed/20261003-agent-harness-host-refactor/phase-4.md)。
- `packages/harness-control`：Host 级固定 Harness 选择服务，负责 Patch 准备、独立授权、持久启用、恢复与回退；执行者只能经它异步获取租约。详见 [P3 计划](exec-plans/completed/20261003-agent-harness-host-refactor/phase-3.md)。
- `packages/session/storage`：存储中性 provider/handle 契约；`session/jsonl` 提供物理实现，`session/persistence` 负责 Session 业务语义。读写、列表、恢复、fork 与缓存均通过注入后端，详见[存储规范](design-docs/agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)。
- `packages/shared`：IPC contracts、session schema、跨进程共享类型。
- `apps/site`：Astro 静态官网、公开文档、博客与从 release 文档生成的更新页。
- `browser-bridge`：Browser Use Go bridge CLI、Chrome Extension 和协议层。
- `scripts/`：正式自动化入口；人工诊断位于 `diagnostics/`，原生实验位于 `experiments/`，可复建验收环境位于 `acceptance/`。
- `docs/`：仓库知识库；规范、计划、验收证据、历史与参考资料按用途分区。
- `artifacts/`：Git 忽略的可再生成制品，包括 CLI 包、矩阵 JSON、图片与 Rust 输出；不再使用根 `output/` 或 `target/`。
- `tmp/`：Git 忽略的临时工作和参考仓库，禁止被生产源码导入；工具自身的 `dist/`、`node_modules/` 和 `logs/` 保留默认位置。

## 包分层与依赖边界

- `apps/desktop`
  - 可以依赖 `packages/shared`
  - 通过 `@actspace/runtime/loader` 动态加载 ESM Runtime
  - renderer 不能直接访问文件系统
- `apps/cli`
  - 可以依赖 `packages/shared`
  - 通过 managed loader 加载 `@actspace/runtime`
  - 负责 argv/stdin、TTY、stdout/stderr 和退出码，不实现第二套 Agent 内核
- `packages/runtime` 与领域 packages
  - 仅通过公开 exports 暴露 ESM Runtime API
  - `runtime` 负责 Host 装配、Harness 选择接线、Projection 与 `BootedRuntimeProfile`；领域语义由独立 package 提供。`agent-service` 持有任务接纳与调度，Headless/Desktop 服务消费同一应用接口；存储布局不泄漏进 Session 业务
- `packages/shared`
  - 只放跨进程共享契约和类型
  - 不依赖 `desktop` 或旧版 Agent Core

- `apps/site`
  - 独立消费公开 Markdown 与脱敏后的静态资产
  - 构建时读取根目录 `docs/releases/feature-release-notes.md` 与 `docs/roadmap.md`，生成更新页和开发计划页
  - 不依赖桌面端运行时、用户数据、密钥或 Electron 构建产物

- `browser-bridge`
  - 独立 Go 模块，不参与 pnpm workspace
  - 通过 Host capability 与 v2 Tool Runtime 通信
  - 不依赖 TS 编译产物

默认依赖方向应保持为：

```txt
desktop/cli -> Profile Boot / App Service -> domain packages -> shared
runtime --(Host capability)--> browser-bridge
```

为保证 Electron 主进程编译输出稳定，`desktop` 不应直接相对引用 sibling package 的 `src/`，而应通过包名消费：

- `@actspace/shared`
- `@actspace/runtime` 及各领域 package exports

对应地，`shared`、领域 packages 和 `runtime` 需要先构建出各自的 `dist/` 产物，再作为 `desktop` 的运行时依赖。

## 架构阅读路线

- [LLM Core Pi 收敛目标](design-docs/agent-plugin-runtime/agent-llm-core-pi.md)：已实施的 LLM prepare、Host 配置绑定、pi-ai 调用、backend policy 和重试生命周期边界；验收边界见执行摘要。

- `docs/design-docs/agent-runtime/agent-turn-layers.md`：Agent Run 从 Host 输入到 Journal、Agent Loop、LLM / Tool 与 Projection 的五层职责边界，并定义 `agentRunId → turnId → stepId → requestId` 的运行层级。
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`：v2 Runtime、Profile / Bundle / Patch、基础与生产启动类型、Host 和固定前端边界。
- `docs/design-docs/agent-runtime/agent-observability-trace-model.md`：Journal 观测的数据契约，解释 Session V2、真实 Turn、LLM Call、重试、Trace 安全边界及投影边界。
- `docs/design-docs/agent-plugin-runtime/agent-target-overall-architecture.md`：v2 当前架构总图，解释启动、单次任务、Session、Host、Cordis 和 Agent Core 的关系。
- `docs/design-docs/agent-plugin-runtime/README.md`：v2 后端插件化架构入口，汇总设计证据、决策、公共契约和执行记录。
- `docs/design-docs/model-context/agent-multi-provider-llm.md`：已落地的多供应商 LLM 架构，统一 DeepSeek / Kimi / OpenRouter 的服务商连接、模型目录、服务商级代理、协议服务和任务模型选择；历史 DuckCoding 设计文档仅用于变更追溯。图片生成仍可独立使用 DuckCoding 的 OpenAI-compatible Images API。
- `docs/design-docs/core-storage-and-observability.md`：`sessions-v2/<id>/journal.jsonl`、Session-owned artifact、Runtime Projection、Electron `userData`、workspace root 和本地排障日志边界。
- `docs/design-docs/core-review-change-sources.md`：Git-first Review Workbench 总规范，定义六种 scope、upstream Branch、结构化 diff、Review Options、Git mutation 和右侧 Tab 边界。
- `docs/design-docs/collaboration/agent-members.md`：未来 Team / Room 产品设计中的持久 Agent Member；不代表当前 v2 已实现对应 Runtime。
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`：v2 Journal usage、request snapshot、Context Projection 与成本统计边界。
- `docs/design-docs/agent-plugin-runtime/agent-testing.md`：v2 package lifecycle、Session golden、Runtime、Host 与外部人工门禁的测试分层。
- `docs/design-docs/tool-system/agent-skill-loading.md`：Agent Skill 设计与加载规范，约束 `.actspace/skills`、`.agents/skills`、`.claude/skills` 的发现优先级、catalog 注入和 `read_file` 读取边界。
- `docs/design-docs/browser/agent-browser-use-index.md`：Browser Use 专题入口，统一 Agent Core、Go Command Engine、Injected Locator runtime 与 Chrome Extension 的职责边界。
- `docs/design-docs/browser/agent-browser-use-command-surface.md`：Browser Use 62 条命令面分类详解。
- `docs/design-docs/browser/agent-browser-use-integration-design.md`：Browser Use 集成方案设计。
- `docs/design-docs/browser/agent-browser-use-command-implementation.md`：Browser Use 62 条命令的核心实现设计——CDP 调用链、Go/Extension/Injected runtime 职责，以及 Plan 5 前历史基线与当前 62/62 实现矩阵。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：新增工具时必须遵守的前端预览契约。
- `docs/design-docs/tool-system/agent-image-generation-tool.md`：图片生成工具的 provider/key 边界、`generate_image` 参数、会话产物、上下文控制和多图预览规范。
- `docs/design-docs/tool-system/agent-image-inspection-tool.md`：文本主模型按需委托 Kimi 或 OpenRouter Luna 分析图片的配置、路径安全、固定视觉提示词、稳定输出和验收边界。
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的混合接入边界。
- `docs/design-docs/frontend/README.md`：前端工作台设计文档入口。
- `docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`：右侧交互式 Terminal 的 Electron main / preload / renderer 边界、PTY 会话、输出背压、进程清理和 native 发布制品要求。
- `docs/references/llm-agent-dev-skill-fixes/README.md`：`llm-agent-dev` Skill 修复分析归档，不作为主线架构事实来源。

## 当前已确认的实现方向

- 桌面端首版采用 `Electron + React + TypeScript + Vite`。
- 交互基础组件优先采用 `Radix UI` primitives，而不是直接依赖重样式组件库。
- 本地数据优先使用 `jsonl` 文件存储，直接落盘到用户电脑。
- 工程骨架已落地为 `apps/{desktop,cli,site} + packages/runtime + 多个领域 workspace packages + packages/shared` 的单仓结构。
- 桌面端主模型由前端模型选择器驱动，模型注册表定义在 `packages/shared/src/model-config.ts`，并由 IPC 契约 re-export。
- 密钥不进入 renderer 或 Session Journal，Host 只通过 credential resolver 向 Runtime 提供短生命周期凭据。
- 开发态启动需要先确保 `shared`、领域 packages、`runtime` 有可消费产物，再启动 Electron main/preload 的 watch 与 renderer。
- 更细的产品级技术选型以根目录 `README.md` 中的“技术栈”小节为准。

## 维护规则

- `ARCHITECTURE.md` 只做顶层导航，不继续堆实现清单。
- 长期设计原则优先放入 `docs/design-docs/`。
- 当前 v2 模块边界优先维护在 `docs/design-docs/agent-plugin-runtime/` 与各领域 package 的公共 exports/manifest 中；旧模块地图只在 `docs/archive/v1/design-docs/` 归档。
- 存储、日志和可观测性边界优先维护在 `docs/design-docs/core-storage-and-observability.md`。
- 只要架构变化会让文档过期，就在同一轮任务里同步更新相关文档。
