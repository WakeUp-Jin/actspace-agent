# 架构总览

这份文档是 `actspace` 的架构入口，只保留顶层结构、依赖边界和阅读路线。更细的设计规范放在 `docs/design-docs/`，当前实现清单放在对应专题文档里。

如果架构、数据流、存储模型或模块边界发生变化，优先更新对应专题文档，再回到这里确认导航是否仍然准确。

## 当前仓库结构

- `packages/desktop`：Electron main、preload、renderer 所在的桌面端应用。
- `packages/agent-core`：Agent 运行层、模型接入、上下文、工具与执行循环。
- `packages/shared`：IPC contracts、session schema、跨进程共享类型。
- `plugins/browser-bridge`：Browser Use Go bridge CLI、Chrome Extension 和协议层。
- `plugins/fs-watch`：文件监听 Rust 插件。
- `infra/`：部署、基础设施和环境定义。
- `scripts/`：仓库级自动化脚本，供人和 Agent 直接调用。
- `docs/`：仓库知识库，也是本地规则和上下文的正式来源。

## 包分层与依赖边界

- `packages/desktop`
  - 可以依赖 `packages/shared`
  - 可以依赖 `packages/agent-core`
  - renderer 不能直接访问文件系统
- `packages/agent-core`
  - 可以依赖 `packages/shared`
  - 负责 provider、context、tools、persistence、execution loop
- `packages/shared`
  - 只放跨进程共享契约和类型
  - 不依赖 `desktop` 或 `agent-core`

- `plugins/browser-bridge`
  - 独立 Go 模块，不参与 pnpm workspace
  - 通过 Unix socket 与 `agent-core` 通信
  - 不依赖 TS 编译产物
- `plugins/fs-watch`
  - 独立 Rust crate，不参与 pnpm workspace
  - 通过文件契约与 `desktop` main 进程通信

默认依赖方向应保持为：

```txt
desktop -> agent-core -> shared
agent-core --(socket)--> plugins/browser-bridge
desktop --(file contract)--> plugins/fs-watch
```

为保证 Electron 主进程编译输出稳定，`desktop` 不应直接相对引用 sibling package 的 `src/`，而应通过包名消费：

- `@actspace/shared`
- `@actspace/agent-core`

对应地，`shared` 和 `agent-core` 需要先构建出各自的 `dist/` 产物，再作为 `desktop` 的运行时依赖。

## 架构阅读路线

- `docs/design-docs/agent-runtime/agent-turn-layers.md`：Agent Turn 从前端输入到结果返回的四层职责边界（Renderer → Main Process → Bridge → Agent），也是运行拓扑、IPC 双通道和 turn 数据流的主要入口。
- `docs/design-docs/agent-runtime/agent-current-module-map.md`：当前 `packages/agent-core` 已落地模块清单，包括 LLM、prompt、tools、context、engine、persistence、observability、env 和兼容层。
- `docs/design-docs/model-context/agent-multi-provider-llm.md`：已落地的多供应商 LLM 架构，统一 DeepSeek / Kimi / OpenRouter / DuckCoding 的服务商连接、模型目录、服务商级代理、协议服务和任务模型选择；DuckCoding 多 Key、本地 Codex/Grok 档案、Codex Responses 与名称变体详见同目录专题，真实 provider 场景待用户统一手动验收。
- `docs/design-docs/core-storage-and-observability.md`：本地 session 存储、`context-state.json`、Electron `userData`、workspace root 和本地排障日志边界。
- `docs/design-docs/agent-runtime/agent-backend-design.md`：后端 Agent Runtime 的长期设计事实来源，解释为什么采用这些模块边界。
- `docs/design-docs/collaboration/agent-members.md`：跨 Room 持久 Agent Member 的身份、配置版本、Activity、设置页与 Room 私有上下文边界。
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`：token usage、成本统计、context snapshot 与 context state 的数据分层设计。
- `docs/design-docs/tool-system/agent-skill-loading.md`：Agent Skill 设计与加载规范，约束 `.actspace/skills`、`.agents/skills`、`.claude/skills` 的发现优先级、catalog 注入和 `read_file` 读取边界。
- `docs/design-docs/agent-plugins-fs-watch.md`：插件（Plugins）模式与 fs-watch 文件监听插件——外部 Rust 二进制的文件契约（事件 JSONL / 心跳 / config）、main 进程生命周期管理、设置页「插件」「Skills」分区和 Kairos Skill 白名单。插件源码在 `plugins/fs-watch/`。
- `docs/design-docs/browser/agent-browser-use-index.md`：Browser Use 专题入口，统一 Agent Core、Go Command Engine、Injected Locator runtime 与 Chrome Extension 的职责边界。
- `docs/design-docs/browser/agent-browser-use-command-surface.md`：Browser Use 62 条命令面分类详解。
- `docs/design-docs/browser/agent-browser-use-integration-design.md`：Browser Use 集成方案设计。
- `docs/design-docs/browser/agent-browser-use-command-implementation.md`：Browser Use 62 条命令的核心实现设计——CDP 调用链、Go/Extension/Injected runtime 职责，以及 Plan 5 前历史基线与当前 62/62 实现矩阵。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：新增工具时必须遵守的前端预览契约。
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的混合接入边界。
- `docs/design-docs/frontend/README.md`：前端工作台设计文档入口。
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`：Kairos 自治模式设计——独立 prompt + 短期记忆、tick 调度、IPC 契约和页面规范。
- `docs/design-docs/lab/README.md`：Lab 能力实验台设计入口，约束实验矩阵、实验生命周期、产物晋升和分版本构建路线。
- `docs/references/llm-agent-dev-skill-fixes/README.md`：`llm-agent-dev` Skill 修复分析归档，不作为主线架构事实来源。

## 当前已确认的实现方向

- 桌面端首版采用 `Electron + React + TypeScript + Vite`。
- 交互基础组件优先采用 `Radix UI` primitives，而不是直接依赖重样式组件库。
- 本地数据优先使用 `jsonl` 文件存储，直接落盘到用户电脑。
- 工程骨架已落地为 `packages/desktop + packages/agent-core + packages/shared` 的单仓结构。
- 桌面端主模型由前端模型选择器驱动，模型注册表定义在 `packages/shared/src/model-config.ts`，并由 IPC 契约 re-export。
- 密钥不进入 renderer 或 session 事件，环境变量统一由 `agent-core/env.ts` 管理。
- 开发态启动需要先确保 `shared`、`agent-core` 有可消费产物，再启动 Electron main/preload 的 watch 与 renderer。
- 更细的产品级技术选型以根目录 `README.md` 中的“技术栈”小节为准。

## 维护规则

- `ARCHITECTURE.md` 只做顶层导航，不继续堆实现清单。
- 长期设计原则优先放入 `docs/design-docs/`。
- 已落地模块清单优先维护在 `docs/design-docs/agent-runtime/agent-current-module-map.md`。
- 存储、日志和可观测性边界优先维护在 `docs/design-docs/core-storage-and-observability.md`。
- 只要架构变化会让文档过期，就在同一轮任务里同步更新相关文档。
