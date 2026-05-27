## [2026-05-28 01:08] | Task: Kairos 默认工作空间收口

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 修复 Agent 文件工具默认目录问题后，确认 Kairos 是否也会出现同类情况，并补齐 Kairos 独立工作空间或初始化步骤。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs`

**Key Actions:**

- **Kairos workspace**: `ensureKairosScaffolding()` 现在会创建 `<userData>/kairos/workspace/`，作为 Kairos 默认文件工具工作区。
- **默认授权路径**: 新安装的 `config/paths.json` 默认只授权 Kairos workspace 并开启 watch；旧版空 `paths.json` 会自动迁移到该默认值，用户自定义配置不会被覆盖。
- **ToolManager 对齐**: main 进程创建 Kairos ToolManager 时使用 Kairos workspace，而不是普通聊天 Agent 的 workspace root。
- **System prompt 对齐**: Kairos system prompt 增加 workspace boundary 规则，明确相对路径默认只应在 Kairos workspace 内读写，不默认触碰 app 仓库或主聊天 workspace。
- **Notes 路径收口**: 默认札记路径统一为 `workspace/notes/`，bootstrap 和 controller 都会预创建该目录。
- **测试补强**: 补充 scaffolding 单测，覆盖 workspace 目录创建、默认 paths 写入、自定义 paths 保留和 legacy 空配置迁移。
- **文档同步**: 更新 Kairos 自治模式设计文档，明确默认初始化布局、工作区边界、`bash` 默认禁用，以及外部路径需要显式授权。

### 🧠 Design Intent (Why)

Kairos 是后台自治 Agent，不能默认借用 app 仓库或普通聊天 Agent 的项目目录作为读写根。独立 workspace 让它有一个安全、可解释、可清理的默认行动范围；真正需要读写其它项目时，再由用户显式把路径加入 `paths.json`。

### 📁 Files Modified

- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/test/kairos-bootstrap.test.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/prompt.ts`
- `packages/agent-core/src/kairos/test/prompt-assembler.test.ts`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`
