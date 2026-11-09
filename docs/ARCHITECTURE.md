# 架构总览

这份文档是 `actspace` 的架构入口，只保留顶层结构和依赖边界。设计专题的入口见 [设计文档索引](design-docs/index.md)。

如果架构、数据流、存储模型或模块边界发生变化，优先更新对应专题文档，再回到这里确认导航是否仍然准确。

## 当前仓库结构

- `apps/desktop`：Electron main、preload、renderer 所在的桌面端应用。
- `apps/cli`：通过 managed ESM loader 暴露 v2 `run` 命令、stdin 输入和 stdout/stderr 契约。
- `packages/core/runtime`：Host-facing ESM runtime，通过唯一 `bootProfileRuntime` 装配 Host 服务与 Harness 候选，显式编排排空执行、关闭 Session 和释放插件树；Headless/Desktop 包提供应用服务。
- `packages/<能力>/<包>`（两级结构，目录名即包名去掉 `@actspace/`，如 `packages/core/`、`packages/session/`、`packages/llm/`、`packages/context/`、`packages/fs/`、`packages/shell/`、`packages/subagent/`）：独立领域 workspace packages，每个可装载包拥有自己的 Plugin Entry 与生命周期测试；各能力目录的包表、依赖方向和新增插件步骤见[包地图](../packages/README.md)；Context 领域目录下的 engine、来源、披露和压缩策略分别独立装配。
- 插件清单：内置插件只在 `packages/core/runtime/src/plugin-catalog.ts` 的 `PLUGIN_CATALOG` 登记一次，每个插件的 manifest 带中文 `display`。Host 的 `TRUSTED_LOADER_ENTRIES` 与 `packages/core/runtime/cordis.yml`（由 `pnpm generate:plugin-loader` 生成，勿手改）、默认 Harness 的 `DEFAULT_HARNESS_ENTRIES` 与构建入口都从清单计算；`pnpm check:packages` 校验清单与仓库一致。
- `packages/english-learning/english-learning`：Desktop 内置英语辅助学习插件（默认不加载，在 扩展 › 插件 中开启），拥有单会话双语提示词与英文语音队列；凭据、临时文件和系统播放由 Desktop Host 提供。详见[设计](design-docs/agent-plugin-runtime/agent-english-learning.md)。
- `packages/core/agent-service`：Host 共同任务服务，拥有持久内容队列、单会话调度与结构化 Run 工厂契约。详见[Task/Run 生命周期](design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md)。
- `packages/host/agent-host`：独立 Node Host 接入、认证、观察与文件传输；bootstrap/lifecycle 拥有装配、维护和退出，CLI 注入 Runtime 端口；应用操作复用 AgentApplication，任务仍由 AgentService 调度。CLI 提供 `host` 启动与管理命令，Desktop Main 持有远端连接。当前验证边界见 [Host 指南](design-docs/agent-plugin-runtime/agent-host-guide.md)和 [P4 计划](exec-plans/completed/20261003-agent-harness-host-refactor/phase-4.md)。
- `packages/harness-evolution/harness-control`：Host 级固定 Harness 选择服务，负责 Patch 准备、独立授权、持久启用、恢复与回退；执行者只能经它异步获取租约。详见 [P3 计划](exec-plans/completed/20261003-agent-harness-host-refactor/phase-3.md)。
- `packages/session/session-storage`：存储中性 provider/handle 契约；`session-persistence-jsonl` 提供物理实现，`session-persistence` 负责 Session 业务语义。读写、列表、恢复、fork 与缓存均通过注入后端，详见[存储规范](design-docs/agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)。
- `packages/util/shared`：IPC contracts、session schema、跨进程共享类型。
- `apps/web`：浏览器 / PWA 客户端（React + Vite），手机和电脑浏览器经 WebSocket `/rpc` 连接一台 Agent Host，查看会话、审批与发送消息；可由 Host 的 `webRoot` 同源托管。设计见 [front-web-pwa客户端规范](design-docs/frontend/front-web-pwa客户端规范.md)。
- `apps/site`：Astro 静态官网、公开文档、博客与从 release 文档生成的更新页。
- `browser-bridge`：Browser Use Go bridge CLI、Chrome Extension 和协议层；对应插件 `browser-tools` 默认不加载，在 扩展 › 插件 中开启。
- `scripts/`：正式自动化入口；人工诊断脚本在 `scripts/diagnostics/`，可复建验收环境在 `scripts/acceptance/`。
- `docs/`：仓库知识库；规范、计划、验收证据、历史与参考资料按用途分区。
- `artifacts/`：Git 忽略的可再生成制品，包括 CLI 包、矩阵 JSON、图片与 Rust 输出；不再使用根 `output/` 或 `target/`。
- `tmp/`：Git 忽略的临时工作和参考仓库，禁止被生产源码导入；工具自身的 `dist/`、`node_modules/` 和 `logs/` 保留默认位置。

## 包分层与依赖边界

- `apps/desktop`
  - 可以依赖 `packages/util/shared`
  - 通过 `@actspace/runtime/loader` 动态加载 ESM Runtime
  - renderer 不能直接访问文件系统
- `apps/cli`
  - 可以依赖 `packages/util/shared`
  - 通过 managed loader 加载 `@actspace/runtime`
  - 负责 argv/stdin、TTY、stdout/stderr 和退出码，不实现第二套 Agent 内核
- `packages/core/runtime` 与领域 packages
  - 仅通过公开 exports 暴露 ESM Runtime API
  - `runtime` 负责 Host 装配、Harness 选择接线、Projection 与 `BootedRuntimeProfile`；领域语义由独立 package 提供。`agent-service` 持有任务接纳与调度，Headless/Desktop 服务消费同一应用接口；存储布局不泄漏进 Session 业务
- `packages/util/shared`
  - 只放跨进程共享契约和类型
  - 不依赖 `desktop` 或旧版 Agent Core

- `apps/web`
  - 只依赖 `packages/util/shared` 与 `@actspace/client`（`host`、`sessions`、`live` 子入口），通过 Host 协议访问 `packages/host/agent-host`，不加载 Runtime、不访问文件系统
  - 不依赖 `apps/desktop` 源码；与 desktop 共用的实时流折叠逻辑在 `@actspace/client/live`，desktop 侧只保留 re-export
  - 构建产物是静态文件，由 Host 静态托管（`webRoot`）或 Vite 开发服务器提供

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

## 当前已确认的实现方向

存储结构与读写路线见[数据存储结构与职责](design-docs/core-data-storage-design.md)：Session JSONL 与附件保存完整事实，内存维护当前运行状态，SQLite 按需提供查询加速，全局配置独立管理。

- 桌面端首版采用 `Electron + React + TypeScript + Vite`。
- 交互基础组件优先采用 `Radix UI` primitives，而不是直接依赖重样式组件库。
- 本地数据优先使用 `jsonl` 文件存储，直接落盘到用户电脑。
- 工程骨架已落地为 `apps/{desktop,cli,site,web} + packages/core/runtime + 多个领域 workspace packages + packages/util/shared` 的单仓结构。
- 桌面端主模型由前端模型选择器驱动，模型注册表定义在 `packages/util/shared/src/model-config.ts`，并由 IPC 契约 re-export。
- 密钥不进入 renderer 或 Session Journal，Host 只通过 credential resolver 向 Runtime 提供短生命周期凭据。
- 开发态启动需要先确保 `shared`、领域 packages、`runtime` 有可消费产物，再启动 Electron main/preload 的 watch 与 renderer。
- 更细的产品级技术选型以根目录 `README.md` 中的“技术栈”小节为准。

## 维护规则

- `ARCHITECTURE.md` 只做顶层导航，不继续堆实现清单。
- 长期设计原则优先放入 `docs/design-docs/`。
- 当前 v2 模块边界优先维护在 `docs/design-docs/agent-plugin-runtime/` 与各领域 package 的公共 exports/manifest 中。
- 存储、日志和可观测性边界优先维护在 `docs/design-docs/core-storage-and-observability.md`。
- 只要架构变化会让文档过期，就在同一轮任务里同步更新相关文档。

## Context 请求组织

`context.engine` 统一六类来源，经 `Context → toLlmInput → LlmInput` 进入 LLM。压缩协调器与渐进式披露策略复用原 Session Journal，补充和状态是纯插件事件，不改变 Surface。详细边界见[Context 规范](design-docs/上下文管理引擎设计/Context数据结构和模型输入数据结构的设计规范.md)。
