# 架构总览

这份文档用于描述 `actspace` 当前确认下来的顶层结构和实现边界。

## 当前仓库结构

- `packages/desktop`：Electron main、preload、renderer 所在的桌面端应用。
- `packages/agent-core`：Agent 运行层、模型接入、上下文、工具与执行循环。
- `packages/shared`：IPC contracts、session schema、跨进程共享类型。
- `infra/`：部署、基础设施和环境定义。
- `scripts/`：仓库级自动化脚本，供人和 Agent 直接调用。
- `docs/`：仓库知识库，也是本地规则和上下文的正式来源。

## 边界建议

- 基础设施和运行编排要显式版本化，不要藏在手工操作里。
- 避免隐式跨包耦合；一旦仓库成形，就把允许的依赖方向写清楚。
- 只要架构有变化，就同步更新这份文档。

## 当前运行拓扑

当前桌面端采用标准的 Electron 三层结构：

- `main`：负责窗口生命周期、IPC 注册、本地数据目录初始化，以及调用 `agent-core` 跑 turn。
- `preload`：负责向 renderer 暴露最小、安全、类型化的 bridge API。
- `renderer`：负责工作台界面渲染、会话列表展示、消息流展示和用户交互。

## 当前包分层与依赖边界

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

默认依赖方向应保持为：

`desktop -> agent-core -> shared`

而不是反向耦合。

为保证 Electron 主进程编译输出稳定，`desktop` 不应直接相对引用 sibling package 的 `src/`，而应通过包名消费：

- `@actspace/shared`
- `@actspace/agent-core`

对应地，`shared` 和 `agent-core` 需要先构建出各自的 `dist/` 产物，再作为 `desktop` 的运行时依赖。

## 当前已落地的 Agent 运行层模块

`packages/agent-core` 首版已经拆出这些模块：

- `agent.ts`：运行一轮 turn，组装事件和最终结果。
- `llm.ts`：provider 注册与 mock provider。
- `tools.ts`：工具注册表与默认工具集合。
- `context.ts`：上下文快照与相关辅助结构。
- `persistence.ts`：session 本地落盘、列表、读取。
- `types.ts`：agent-core 内部使用的辅助类型。

## 本地存储模型

当前首版本地存储采用会话目录模型：

- 每个会话一个目录
- `meta.json`：会话摘要、标题、更新时间、turn 计数
- `session.jsonl`：会话事件流持久化文件
- `attachments/`：附件目录

当前应用启动时会初始化：

- `sessions/`
- `logs/`
- `tmp/`

应用会在启动早期显式把 Electron `userData` 目录固定为产品名 `actspace`，因此安装后目录规则应稳定为：

- macOS：`~/Library/Application Support/actspace/`
- Windows：`%APPDATA%/actspace/`
- Linux：`~/.config/actspace/`

上述目录下再包含：

- `sessions/`
- `logs/`
- `tmp/`

## 当前 IPC 契约

当前已接通的 IPC 通道包括：

- `app:get-bootstrap-state`
- `agent:run-turn`
- `session:list`
- `session:get`

这些契约统一由 `packages/shared` 暴露，作为 main、preload 和 renderer 之间的单一事实来源。

## 当前数据流

首版主链路如下：

1. renderer 启动后请求 bootstrap state
2. renderer 请求 `session:list`
3. 若存在旧会话，则请求 `session:get` 恢复
4. 若没有旧会话，则通过 `agent:run-turn` 触发一轮 turn
5. main 调用 `agent-core` 跑 turn
6. 结果落盘到本地 session 目录
7. renderer 根据 turn result 或恢复结果渲染消息流

## 当前已确认的实现方向

- 桌面端首版采用 `Electron + React + TypeScript + Vite`。
- 交互基础组件优先采用 `Radix UI` primitives，而不是直接依赖重样式组件库。
- 本地数据优先使用 `jsonl` 文件存储，直接落盘到用户电脑。
- 更细的产品级技术选型以根目录 `README.md` 中的“技术栈”小节为准。
- 工程骨架已开始落地为 `packages/desktop + packages/agent-core + packages/shared` 的单仓结构。
- 当前 provider 仍为 mock 实现，真实 DeepSeek 接入仍是后续里程碑。
- 开发态启动需要先确保 `shared`、`agent-core` 有可消费产物，再启动 Electron main/preload 的 watch 与 renderer。
