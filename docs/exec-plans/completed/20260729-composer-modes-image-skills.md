# Composer 模式、Image 与 Skills 实施计划

## 目标

把 Composer `+` 菜单从无行为的 demo 升级为真实能力入口：提供 Chat / Plan / Agent 三种有明确运行时权限的模式，让 Image 调起只选图片的原生文件选择器，并让 Skills 展示真实 registry、支持 Composer 显式绑定与安全的 main 侧正文注入。

## 范围

- 包含：
  - shared 中的 Composer mode、选中 Skill 和 Image picker IPC 契约。
  - Agent Core 的 `none / read-only / full` 工具 profile，以及 Plan 专用 system prompt segment。
  - main 进程对当前 workspace Skill registry 的重新校验、SKILL.md 读取与注入。
  - Composer 中的彩色 mode pill、正式 command menu、Skills 二级菜单、Skill pills 和图片能力校验。
  - 相关单测、类型检查、构建、主题检查、设计文档与 history。
- 不包含：
  - MCP 任何实现或占位 UI。
  - Debug / Multitask 等第四种模式。
  - Plan Document、计划审批状态机或批准后自动执行。
  - Composer 中的 Skill 安装、卸载、全局启停或 marketplace。
  - mode / selected Skills 的 session 持久化；V1 只在当前 renderer 生命周期中按会话保持。

## 背景

- 相关文档：
  - `docs/design-docs/frontend/front-聊天输入框规范.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
  - `docs/design-docs/tool-system/agent-skill-loading.md`
  - `docs/design-docs/agent-runtime/agent-turn-layers.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/main/agent-turn.ts`
  - `packages/desktop/src/main/agent-runtime-context.ts`
  - `packages/desktop/src/main/skills-service.ts`
  - `packages/agent-core/src/engine/create-agent-deps.ts`
  - `packages/agent-core/src/tools/index.ts`
  - `packages/shared/src/ipc.ts`
- 已知约束：
  - renderer 不直接读取文件系统，Image 和 Skill 正文都必须通过 preload / main。
  - mode 必须在工具注册阶段生效，不能仅依赖 prompt。
  - Plan 使用明确 allowlist，新工具不得默认进入只读 profile。
  - 所有颜色消费现有语义 token，浅色、深色和 system-dark 都必须可用。

## 风险

- 风险：Chat / Plan 仍然暴露了不允许的工具。
  - 缓解：在 `createToolManager` 注册入口实现 profile allowlist，为三种 profile 直接断言工具名集合。
- 风险：renderer 伪造 Skill 路径或绑定已失效 Skill。
  - 缓解：IPC 只传 Skill name，main 按当前 workspace registry 重新解析并明确失败。
- 风险：模式、Skills 和 model menu 状态叠加导致 Composer 焦点或窄窗口回归。
  - 缓解：保持现有单一 grid DOM，扩展互斥 popover 测试，增加窄窗口及键盘交互断言。
- 风险：文本模型带图片发送时只传元数据，用户误以为模型看到图片。
  - 缓解：Composer 根据当前模型 capability 禁用发送并提示明确原因。

## 里程碑

1. 契约与运行时：定义 mode / Skills / Image IPC，实现 ToolProfile 和 Plan prompt，并用 agent-core 测试锁定工具集。
2. main 能力：实现图片专用 picker、Skill 绑定重新校验与正文注入，并贯通 turn 参数。
3. renderer 交互：实现彩色 mode pill、真实 command menu、Skills 二级菜单和 Image / model capability 交互。
4. 验证与收尾：完成 targeted tests、typecheck、build、theme check，同步设计事实、history 和必要的 learning 判断。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test -- src/tools/test/manager.test.ts src/engine/test/create-agent-deps.test.ts`
  - `pnpm --filter @actspace/desktop test -- src/renderer/test/composer.test.tsx`
  - 按新增 main / Skill 测试文件执行 targeted tests。
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm check:frontend-theme`
- 手工检查：
  - 浏览器 renderer 检查 Composer 三种 mode pill、command menu、Skills 宽/窄布局、hover/focus/selected 和浅深主题。
  - Electron 真实窗口检查 Image 文件选择、本地预览、Skills registry IPC 和真实 turn 参数。
- 观测检查：
  - Chat turn 日志不应出现 tool call。
  - Plan turn 只能出现 allowlist 工具，不应进入写操作审批。
  - 显式 Skill 绑定的 Context snapshot 中应出现独立 Skill segment，不持久化 renderer 传入路径。

## 进度记录

- [x] 确认 Composer 设计规范、范围和运行时权限边界。
- [x] 完成 shared / agent-core 契约与 ToolProfile。
- [x] 完成 main Image / Skill / turn 编排。
- [x] 完成 Composer UI 和会话内状态。
- [x] 完成 targeted tests、typecheck 与 production build；Electron 真实窗口留给人工验收。
- [x] 完成 history、必要文档同步与 plan 归档。

## 决策记录

- 2026-07-29：默认模式为 Agent；Chat 不暴露任何工具；Plan 复用主 Agent loop 但使用明确只读 allowlist，不建新 Runtime。
- 2026-07-29：Skills 在 Composer 中是显式上下文绑定，不是全局开关或权限包；main 侧按 name 重新解析并读取正文。
- 2026-07-29：MCP、Debug、Multitask、Models 重复入口和通用 Attach files 菜单项不进入本轮 UI。
- 2026-07-29：保持既有拖拽文件兼容入口，但 `+` 菜单只暴露图片选择；图片模型能力在发送前由 Composer 阻断并说明原因。
- 2026-07-29：Agent 作为无 pill 的默认态，不在菜单中重复展示；Skills 在桌面端改为悬浮展开，点击只作为无 hover 设备兼容。
