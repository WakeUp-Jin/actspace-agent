## [2026-07-29 15:15] | Task: 完善 Composer 模式、Image 与 Skills

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop worktree`

### 📥 User Query

> 精简 Composer 的 `+` 菜单，实现 Chat、Plan、Agent 三种模式；Image 使用原生文件选择；Skills 展示真实可用列表并可绑定到当前会话。MCP 暂不实现。

### 🛠 Changes Overview

**Scope:** `shared`、`agent-core`、`desktop`、前端设计文档

**Key Actions:**

- **模式权限**: 新增 `none / read-only / full` 工具 profile，Chat 无工具，Plan 仅允许明确的只读工具，Agent 保持完整能力。
- **Composer UI**: `+` 菜单只保留 Chat / Plan、Image、Skills；加入主题感知的 Chat / Plan pill、模式 placeholder 和 Plan 快捷入口。
- **交互收口**: Agent 改为无 pill 的默认态，菜单只展示 Chat / Plan；Skills 以鼠标悬浮展开二级菜单，同时保留点击与键盘兼容。
- **Image**: 新增图片专用原生 picker，并在当前模型不支持图片输入时阻止发送并显示原因。
- **Skills**: 读取当前 workspace 的真实 registry，支持多选与 pills；renderer 只传 Skill name，main 重新解析并注入 SKILL.md 正文。
- **会话状态**: mode 与 selected Skills 在 renderer 生命周期内按会话保持，发送后不清除 Skill 绑定。

### 🧠 Design Intent (Why)

模式不是外观标签，而是运行时安全边界，因此权限限制落在 ToolManager 注册入口；Skill 绑定也不信任 renderer 路径，而由 main 按当前 workspace registry 重新校验。这样 UI 状态、IPC 契约和 Agent 实际能力保持一致。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/shared/src/ipc.ts`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
