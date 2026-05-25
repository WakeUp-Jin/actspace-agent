## [2026-05-25 21:40] | Task: 重构 LLM 初始化链路 — 前端输入与后端环境配置分离

### 🤖 Execution Context

- **Agent ID**: `Cursor Agent`
- **Base Model**: `claude-opus-4-6`
- **Runtime**: `Cursor IDE`

### 📥 User Query

> 前端初始化 LLM 链路中，前端收集的参数、env 读取的配置、模型注册表解析三类数据来源混在 main/index.ts 的 createAgentDeps 中，导致无法一眼看出各参数的来源，改动时需要翻 300+ 行文件定位。希望抽取出独立模块，让前端传递的和后端读取的边界清晰可辨。

### 🛠 Changes Overview

**Scope:** `agent-core`, `desktop`

**Key Actions:**

- **新建 `engine/create-agent-deps.ts`**：定义 `FrontendTurnInput`（前端收集的 model/thinkingEnabled）、`AgentEnvConfig`（从 env 读取的 API Key/Base URL/temperature/maxTokens/disabledTools）、`AgentDeps`（完整运行依赖）三个类型边界。导出 `resolveAgentEnvConfig()`、`buildLLMConfig()`（纯函数）、`resolveAgentDeps()` 三个函数。
- **简化 `desktop/src/main/index.ts`**：删除 `createLLMConfigFromSpec`、`getDisabledToolsFromEnv`、`createAgentDeps` 三个函数（约 50 行），替换为两行 `resolveAgentEnvConfig()` + `resolveAgentDeps()` 调用。main 不再直接引用 `env`、`resolveModelSpec`、`createLLMService`、`createToolManager`、`ContextManager` 等内部 API。
- **更新 `engine/index.ts`**：re-export 新模块的类型和函数。
- **补充 15 个单元测试**：覆盖 `buildLLMConfig` 的 provider 选择、key 映射、可选字段传递，以及 `resolveAgentDeps` 的模型解析、thinking 默认值、工具禁用、Kimi 辅助工具注册等场景。
- **更新 `ARCHITECTURE.md`**：在 engine 模块描述中补充 `create-agent-deps.ts` 说明，更新 env.ts 中 `envToLLMConfig()` 的用途标注。

### 🧠 Design Intent (Why)

原始设计中，LLM 配置构造逻辑直接嵌在 Electron main 进程里，混合了三类数据来源（前端 IPC 输入、环境变量、模型注册表），违反了 `desktop -> agent-core -> shared` 的依赖边界原则——配置构造属于 agent-core 的职责而非 main 进程的。

重构后：
- **FrontendTurnInput** 类型让"前端传了什么"一目了然
- **AgentEnvConfig** 类型让"后端读了什么 env"一目了然
- **buildLLMConfig** 是纯函数，可独立测试，不依赖全局 env proxy
- main/index.ts 的 import 从 13 个减少到 9 个，不再直接接触任何 agent-core 内部构造 API

### 📁 Files Modified

- `packages/agent-core/src/engine/create-agent-deps.ts`（新建）
- `packages/agent-core/src/engine/test/create-agent-deps.test.ts`（新建）
- `packages/agent-core/src/engine/index.ts`
- `packages/desktop/src/main/index.ts`
- `docs/ARCHITECTURE.md`

---

## [2026-05-25 22:30] | Task: 深化重构 — 配置/实例两步分离 + Agent Turn 抽取 + 四层职责规范

### 📥 User Query

> 上一轮 resolveAgentDeps 仍然混合了"config 构建"和"实例创建"，不够清晰。希望：(1) 配置对象和运行时实例分开，前端看到的是先拿 config 再创建实例的两步；(2) Agent turn 编排逻辑从 main/index.ts 抽出独立文件；(3) 四层职责（Renderer → Main → Bridge → Agent）写成正式设计文档。

### 🛠 Changes Overview

**Scope:** `agent-core`, `desktop`, `docs`

**Key Actions:**

- **改造 `engine/create-agent-deps.ts`**：新增 `AgentConfig` 接口（纯配置对象），新增 `buildAgentConfig(frontendInput, workspaceRoot)` 函数（内部读 env，返回 AgentConfig），新增 `createAgentFromConfig(config)` 函数（根据配置创建实例），删除旧的 `resolveAgentDeps()`。保留 `resolveAgentEnvConfig` 和 `buildLLMConfig` 作为内部/测试用函数。
- **新建 `desktop/src/main/agent-turn.ts`**：从 main/index.ts 抽出 `runAndPersistTurn`、`writeAgentRunLog`、`abortTurn` 等 Agent turn 编排逻辑。
- **精简 `desktop/src/main/index.ts`**：移除所有 Agent turn 相关代码，IPC handler 改为调用 agent-turn.ts。main 只负责 Electron 生命周期 + IPC 路由。
- **更新 `engine/index.ts`**：导出 `buildAgentConfig`、`createAgentFromConfig`、`AgentConfig` 等新 API。
- **重写测试**：18 个测试覆盖 `buildLLMConfig`、`buildAgentConfig`（通过 `vi.resetModules` 重置 env 缓存）和 `createAgentFromConfig`（直接构造 AgentConfig 绕过 env）。
- **新建 `docs/design-docs/agent-core/agent-turn-layers.md`**：四层职责规范，定义每层的输入输出、做什么和不做什么、数据流向和新增代码检查清单。
- **更新文档引用**：在 ARCHITECTURE.md 和 AGENTS.md 中添加四层规范引用。

### 🧠 Design Intent (Why)

第一轮重构把三类数据来源分开了，但 `resolveAgentDeps` 同时做了"拼配置"和"建实例"两件事，调用方看不到中间的配置对象。第二轮拆成 `buildAgentConfig`（纯配置）+ `createAgentFromConfig`（纯实例化），调用方只需两行代码，每行的职责一目了然。

同时 main/index.ts 承担了太多 Agent 相关逻辑（日志、持久化、abort 管理），与 Electron 生命周期和 IPC 路由混在一起。抽出 agent-turn.ts 后，main 恢复到纯 Electron 入口的角色。

四层规范文档补上了项目缺失的"每层做什么、不做什么"的架构约束，避免后续开发时再次混淆层间边界。

### 📁 Files Modified

- `packages/agent-core/src/engine/create-agent-deps.ts`（重写）
- `packages/agent-core/src/engine/test/create-agent-deps.test.ts`（重写）
- `packages/agent-core/src/engine/index.ts`
- `packages/agent-core/src/env.ts`（JSDoc 更新）
- `packages/desktop/src/main/agent-turn.ts`（新建）
- `packages/desktop/src/main/index.ts`（精简）
- `docs/design-docs/agent-core/agent-turn-layers.md`（新建）
- `docs/design-docs/agent-core/index.md`
- `docs/ARCHITECTURE.md`
- `AGENTS.md`
