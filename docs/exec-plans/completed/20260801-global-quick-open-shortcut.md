# 2026-08-01 全局快捷唤起

## 目标

在设置中提供可配置的系统级快捷键，让用户从其他应用快速唤起紧凑 Actspace 窗口，并按指定会话、指定工作区或侧边栏第一个项目进入可立即输入的聊天状态。

## 范围

- 包含：快捷键启停与录制、系统注册冲突反馈、默认目标选择、目标失效降级、紧凑窗口定位、Composer 聚焦、设置持久化与验证。
- 不包含：多个快捷动作、独立悬浮窗口、剪贴板自动读取、自动发送、窗口尺寸自定义。

## 背景

- 相关文档：`docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-主题与配色规范.md`。
- 相关代码路径：`packages/shared/src/settings.ts`、`packages/desktop/src/main/settings-service.ts`、`packages/desktop/src/main/index.ts`、`packages/desktop/src/preload/index.ts`、`packages/desktop/src/renderer/App.tsx`、`packages/desktop/src/renderer/components/settings/`。
- 已知约束：全局快捷键和窗口生命周期归 Electron main；renderer 只通过类型化 IPC 接收唤起意图；现有 `820px` compact layout 与 `480px` 最小窗口能力必须复用。

## 风险

- 风险：快捷键被系统或其他应用占用，设置显示成功但实际不可用。
- 缓解方式：先注册候选快捷键，再持久化设置；失败时保留原快捷键并返回明确错误。
- 风险：保存的工作区或会话被删除后，快捷唤起落入无效状态。
- 缓解方式：每次唤起都读取当前 workspace/session 列表，按指定目标、侧边栏第一个项目、空 New chat 的顺序降级。
- 风险：主窗口尚未加载完成时唤起事件丢失。
- 缓解方式：主进程保存待处理 request，并在 renderer 显式 consume 后清除；实时事件只负责降低已加载窗口的延迟。

## 里程碑

1. 扩展共享设置与 IPC 契约，完成设置迁移和注册控制。
2. 实现设置页快捷键区域、目标选择和错误反馈。
3. 实现紧凑窗口唤起、目标路由与 Composer 聚焦。
4. 完成自动化测试、主题检查和 Electron 真实验收。

## 验证方式

- 命令：`pnpm --filter @actspace/shared build`、desktop 定向 Vitest、desktop typecheck、`pnpm build`、`pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check`。
- 手工检查：浅色与深色下录制快捷键；从其他应用唤起；验证指定会话、指定工作区、首项目和无项目四条路径；检查约 640px 窄窗口。
- 观测检查：注册冲突不覆盖旧设置；目标删除后降级；重复唤起不丢事件且 Composer 获得焦点。

## 进度记录

- [x] 2026-08-01：确认产品语义、默认快捷键和 compact window 复用方案。
- [x] 完成共享契约、设置持久化与 Electron 注册控制。
- [x] 完成 renderer 路由、设置 UI 和输入聚焦。
- [x] 完成自动化测试与文档检查；Electron 开发版已确认注册成功，跨应用快捷键和视觉验收由用户手动完成。

## 决策记录

- 2026-08-01：默认启用 `CommandOrControl+Shift+Space`；UI 在 macOS 显示为 `⌘⇧Space`。
- 2026-08-01：工作区目标始终创建空会话；会话目标恢复指定会话；自动目标使用侧边栏第一个非默认、非隐藏项目。
- 2026-08-01：快捷唤起复用主窗口并调整到约 640px 宽，不引入第二个 BrowserWindow 或独立聊天页面。
- 2026-08-01：人工 UI 验收不阻塞计划归档，按用户要求保留给用户在当前开发版中执行。
