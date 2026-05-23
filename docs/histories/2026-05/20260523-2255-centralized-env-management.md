## [2026-05-23 22:55] | Task: 新增集中式环境变量管理

### 🤖 Execution Context

- **Agent ID**: `claude-opus-4-6`
- **Base Model**: `claude-opus-4-6`
- **Runtime**: `Cursor Agent`

### 📥 User Query

> 新增加一个 env 文件，用于读取环境变量，例如 DeepSeek 的 key 之类的。最好可以有一个文件用于读取 env 文件，之后将 env 的值放入到一个对象中，其他文件只要引入这个对象就可以直接使用。在这个文件中可以做一些读取环境变量的判断和验证之类的。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, 项目根目录

**Key Actions:**

- **env.ts 模块**: 新增集中式环境变量管理，自带轻量 `.env` 解析器（无 dotenv 依赖），Schema 驱动验证，导出冻结的类型安全 `env` proxy 对象。
- **LLM factory 改造**: 去掉 `llm/factory.ts` 中散落的 `process.env` 读取，新增 `createLLMServiceFromEnv()` 直接从 env 创建 LLM 服务。
- **desktop/main 接入**: 启动时调用 `loadEnv()`，`createAgentDeps()` 改用 `createLLMServiceFromEnv()`。
- **.env.example**: 项目根目录新增模板文件，列出全部可配置项和默认值。
- **文档同步**: 更新 ARCHITECTURE.md（env 模块描述）、SECURITY.md（密钥管理、进程隔离规范）、QUALITY_SCORE.md（安全评分 C→B-）。

### 🧠 Design Intent (Why)

原来环境变量的读取散落在 `llm/factory.ts` 的局部函数中，使用 `process.env` 直接拼接。随着 DeepSeek 真实接入临近，需要一个集中、类型安全、有验证的环境变量入口。核心设计决策：

- **不引入 dotenv**：自带轻量解析器，减少依赖表面积。
- **process.env 优先**：已有值 > .env 文件值 > 默认值，保证 CI/Docker 可覆盖。
- **Object.freeze 冻结**：解析后不可篡改，防止运行时意外修改。
- **MOCK_MODE 快捷开关**：一个布尔值切换 mock/真实 provider，不需要改多处配置。

### 📁 Files Modified

- `packages/agent-core/src/env.ts`（新建）
- `packages/agent-core/src/index.ts`
- `packages/agent-core/src/llm/factory.ts`
- `packages/agent-core/src/llm/index.ts`
- `packages/agent-core/src/llm.ts`（兼容层）
- `packages/desktop/src/main/index.ts`
- `.env.example`（新建）
- `.env`（新建，gitignored）
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
