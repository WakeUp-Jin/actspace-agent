# actspace V1 基础工程骨架计划

## 目标

在不追求完整产品功能的前提下，搭建 `actspace` 桌面端的可运行工程骨架，使应用能够启动 Electron、渲染 React 工作台、初始化本地数据目录，并为 Agent 运行层、前端工作台和后续集成留出清晰边界。

## 范围

- 包含：
  - 单仓库目录重组与基础包边界落地
  - `Electron + React + TypeScript + Vite + Radix UI` 基础工程初始化
  - `main / preload / renderer` 最小可运行链路
  - 基础环境变量约定、开发启动、构建、类型检查
  - 本地应用数据目录初始化
- 不包含：
  - 完整 Agent 功能实现
  - 多窗口协同
  - 云同步
  - 插件系统
  - 完整设置页与高级 UI 能力

## 背景

- 相关文档：
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/frontend/README.md`
  - `docs/exec-plans/active/actspace-v1-agent-runtime.md`
  - `docs/exec-plans/active/actspace-v1-workbench-ui.md`
  - `docs/exec-plans/active/actspace-v1-integration-and-acceptance.md`
- 已确认约束：
  - 桌面端首版采用 `Electron + React + TypeScript + Vite`
  - 交互基础组件优先采用 `Radix UI` primitives
  - 本地数据优先使用 `jsonl` 文件存储
  - 当前前端视觉以 `docs/design-docs/frontend/README.md` 为单一事实来源

## 工程结构

- 保持单仓库。
- 新增目录：
  - `packages/desktop`
  - `packages/agent-core`
  - `packages/shared`
- `packages/desktop` 职责：
  - `src/main`：Electron main process
  - `src/preload`：受控 bridge
  - `src/renderer`：React UI
- `packages/agent-core` 职责：
  - LLM provider
  - 上下文管道
  - 工具注册表
  - 执行引擎
  - session persistence
- `packages/shared` 职责：
  - IPC contracts
  - session schema
  - 跨进程 types

## 进程边界

- `main`
  - 管理窗口生命周期
  - 初始化应用数据目录
  - 处理所有 IPC 请求
  - 代理 session 读写和 Agent 运行请求
- `preload`
  - 暴露最小、安全、类型化 API
  - 不暴露原始 Node 能力给 renderer
- `renderer`
  - 只负责 UI、状态同步和事件触发
  - 不直接访问文件系统

## 基础工程能力

- 包管理统一为 `pnpm`
- 根目录配置：
  - workspace
  - TypeScript project references 或等价边界
  - 基础 lint/typecheck/dev/build scripts
- `packages/desktop` 需要提供：
  - `pnpm dev`
  - `pnpm build`
  - `pnpm typecheck`
- 环境变量至少明确：
  - `DEEPSEEK_API_KEY`
  - `ACTSPACE_DATA_DIR`（可选覆盖）
  - `NODE_ENV`

## 本地数据目录初始化

- 默认数据根目录使用用户本地应用目录
- 启动时确保存在：
  - `sessions/`
  - `logs/`（可选）
  - `tmp/`（可选）
- 不在首版引入数据库迁移系统

## 首版完成线

- Electron 能启动
- React 工作台能渲染默认两栏布局
- preload 暴露最小 IPC bridge
- 本地数据目录可初始化
- 基础类型检查和构建命令可运行

## 风险

- 风险：Electron + Vite + monorepo 初始化时边界不清，后续 renderer/main/agent-core 容易耦合
  - 缓解方式：从第一天起把 `shared` 契约和 IPC 边界固定下来
- 风险：脚手架过重，初始化阶段被配置问题拖慢
  - 缓解方式：首版只保留最小可运行骨架，不预埋复杂插件系统
- 风险：本地数据目录策略反复变化
  - 缓解方式：先用固定目录结构和 `jsonl`，后续再升级

## 里程碑

1. 建立 workspace、目录结构和桌面端启动链路。
2. 打通 `main / preload / renderer` 最小可运行路径。
3. 接入共享类型、基础数据目录初始化与验证命令。

## 验证方式

- 命令：
  - `pnpm install`
  - `pnpm typecheck`
  - `pnpm dev`
  - `pnpm build`
- 手工检查：
  - 应用窗口能启动
  - 默认两栏工作台渲染成功
  - 本地数据目录被创建
- 观测检查：
  - main/preload/renderer 日志可区分
  - IPC 基础链路可看到成功调用

## 进度记录

- [x] 确认 workspace 结构与根级脚本。
- [x] 初始化 `packages/desktop`。
- [x] 初始化 `packages/shared`。
- [x] 初始化 `packages/agent-core`。
- [x] 打通 Electron 启动与工作台渲染。
- [x] 接入本地数据目录初始化。
- [x] 完成基础命令验证。

## 决策记录

- 2026-05-21：首版初始化采用 `V1 基础版`，而不是 `V0 Demo`，以便从一开始就固定可持续扩展的模块边界。
- 2026-05-21：后端统一采用 `TypeScript`，降低桌面端和 Agent 运行层之间的工程割裂。
