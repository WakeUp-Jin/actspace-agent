# Composer 图片附件可用性修复

## 目标

让 Composer 通过文件选择、拖放或剪贴板粘贴加入的图片都能显示真实缩略图、点击后在右侧面板预览，并能随当前消息发送；文本主模型继续通过现有 `inspect_image` 工具按需查看图片。

## 范围

- 包含：图片附件安全预览、剪贴板图片临时落盘、缩略图与移除交互、右侧图片 Tab、发送能力判断、相关 IPC/types/tests/docs。
- 不包含：通用文件预览重构、图片编辑、上传云端、历史附件长期归档、自动调用 `inspect_image`、新增视觉模型配置。

## 背景

- 相关文档：`docs/design-docs/frontend/front-聊天输入框规范.md`、`docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`、`docs/design-docs/tool-system/agent-image-inspection-tool.md`、`docs/FRONTEND_VERIFICATION.md`。
- 相关代码路径：`packages/shared/src/ipc.ts`、`packages/desktop/src/main/index.ts`、`packages/desktop/src/preload/index.ts`、`packages/desktop/src/renderer/components/Composer.tsx`、`packages/agent-core/src/runtime/agent-runtime.ts`。
- 已知约束：renderer 不直接读取文件系统；本地 `file://` 不能作为 Vite renderer 图片来源；`inspect_image` 需要当前轮注册的真实本地路径；当前工作区存在其他未提交改动，必须保留。

## 风险

- 风险：剪贴板图片只有内存字节，没有可供 Agent 工具读取的稳定路径。
- 缓解方式：由 Electron main 校验输入并写入 `tmpRoot/composer-attachments`，renderer 只接收 typed 结果。
- 风险：把任意绝对路径读取能力暴露给 renderer 会扩大桌面安全面。
- 缓解方式：文件选择仍由 main 发起；拖放路径与剪贴板字节通过专用附件 IPC 处理，不新增通用绝对路径读取 API。
- 风险：旧 Composer 规则把文本模型视为不能发送图片。
- 缓解方式：只移除 UI 层硬阻断，保持 runtime 现有分流：原生视觉模型接收图片数据，文本模型接收附件元数据并在可用时调用 `inspect_image`。

## 里程碑

1. 共享契约与 main/preload 图片准备链路：选择图片返回安全 data URL；粘贴图片写入临时目录并返回真实路径。
2. Composer 交互：真实缩略图、紧凑移除按钮、键盘可访问的右侧图片预览、图片发送不再被原生模态能力硬阻断。
3. 定向测试、文档同步、Electron 真实链路与浅深主题验收。

## 验证方式

- 命令：Composer/main 定向 Vitest、`pnpm typecheck`、`pnpm build`、`pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check`。
- 手工检查：真实 Electron 中分别选择、拖入和粘贴 PNG/JPEG/WebP；确认缩略图、右侧预览、移除、DeepSeek 发送和原生视觉模型发送。
- 观测检查：启动日志不再出现附件缩略图的 `Not allowed to load local resource: file://...`。

## 进度记录

- [x] 已确认空白缩略图由 renderer 拒绝本地 `file://` 引起。
- [x] 已确认发送禁用来自 Composer 的 `supportsImages` 硬判断，runtime 已具备 `inspect_image` 分流。
- [x] 完成 shared/main/preload 图片附件准备链路。
- [x] 完成 Composer 缩略图、右侧预览和发送交互。
- [x] 发送后的用户消息缩略图复用右侧 Image Tab，可由鼠标或键盘打开。
- [x] 完成定向测试、类型检查、构建、主题检查、文档检查与 history。
- [ ] 用户手动完成真实 Electron 验收：选择、拖入、粘贴、右侧预览、移除、DeepSeek/视觉模型发送及浅深主题。

## 决策记录

- 2026-08-01：图片点击采用现有右侧面板 Image Tab，不新增模态预览，以保持三栏工作台的一致对象浏览语法。
- 2026-08-01：图片发送由 runtime 能力路由决定，Composer 不再把“非原生视觉模型”等同于“禁止发送附件”。
- 2026-08-01：剪贴板图片由 main 落入应用临时目录；不把 Base64 当作 `inspect_image` 路径，也不向 renderer 暴露任意本地文件读取接口。
- 2026-08-01：自动化验证已通过；应用户要求，真实 Electron UI 与功能验收由用户手动完成，计划在验收前保留于 `active/`。
