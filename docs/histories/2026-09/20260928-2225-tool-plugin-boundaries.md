## [2026-09-28 22:25] | Task: 拆分工具插件和 Todo 领域边界

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop 本地工作树

### 📥 User Query

> 按已确认的方案开始执行工具插件边界拆分；旧 Todo 事件不做兼容，Plan 模式以后设计。

### 🛠 Changes Overview

**Scope:** Tool Runtime、Session Journal/Projection、Todo、七个工具插件、Runtime Profile、CLI/Desktop Host、契约矩阵与文档。

**Key Actions:**

- 将文件读、搜索、写入、Shell、Web、图片生成与图片分析迁到七个独立 workspace 插件包；Host 端口、权限 audience、注册和清理分别归属各包，退役 `core-tools`。
- Todo 独立为 `todo-tools`，写入 `plugin/actspace.todo/todo-write`，提供 required Codec 和 `todos` Projection Contributor；删除 core `todo/write` Codec 与 Core Agent Todo 实现。
- Session Projection 在 checkpoint 恢复前应用 contributors；Tool Runtime 对直接提交的越权调用返回 `TOOL_SCOPE_DENIED` 并记录权限事件。
- Profile 启动仅加载已启用插件的 Codec 和 Behavior；配置变更维持 restart-only。旧 required Todo Journal 报 `UNKNOWN_REQUIRED_CODEC` 并以 browse-only 打开。
- 更新包图、文档入口与执行记录；新增工具权限、生命周期、真实组合启动、旧事件恢复和 Todo checkpoint 回放测试。

### 🧠 Design Intent (Why)

Tool Runtime 应只处理通用执行机制；具体能力、授权 audience 与持久领域语义需要由各插件独立拥有，避免聚合工具包和 Core Agent 持续扩张。

### 📁 Files Modified

- `packages/tools/{runtime,todo-tools,filesystem-read,filesystem-search,filesystem-write,shell-tools,web-tools,image-generation,image-inspection}/`
- `packages/session/{journal,projection}/`、`packages/runtime/src/{profiles,runtime,projection}/`
- `apps/{cli,desktop}/src/*/runtime-v2/`
- `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md`
- `docs/exec-runs/20260928-tool-plugin-boundaries/`

### 验证

执行结果与未覆盖门禁见 `docs/exec-runs/20260928-tool-plugin-boundaries/execution-summary.md`。
