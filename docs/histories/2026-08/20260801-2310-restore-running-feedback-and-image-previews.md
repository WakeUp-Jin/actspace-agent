# 恢复运行态反馈与图片预览回读

## 用户诉求

- 工具执行与模型输出前缺少可感知的运行反馈；采用独立 HTML 中确认的 B 方案高对比墨色 shimmer。
- 图片发送成功后，消息中的缩略图不应退化为空白占位。

## 主要改动

- 将共享 running shimmer 调整为 `text-faint` 底字 + `text-main` 墨色扫光，保持原有 1.1s 节奏，并覆盖所有工具、流式 Thinking 标题与模型等待文案。
- 流式 Thinking 只在当前 segment 仍在输出时显示 shimmer；工具或后续文本开始后立即停止，历史回读不重放动画。
- `session:get` 在 Electron main 进程从已持久化的图片路径重建有界预览，只丰富 IPC 返回值，不把 Base64 写入 session。
- 增加运行态颜色语义、Thinking 生命周期和图片预览回读测试。

## 设计动机

- running 与 completed 的明度差必须足够明显，但不应把整行运行文字染成 operational green。
- 图片的持久化身份与 UI 预览身份必须分离；发送时剥离预览可以控制数据体积，读取时受控重建则保证界面连续性。

## 影响文件

- `packages/desktop/src/renderer/styles/base.css`
- `packages/desktop/src/renderer/components/messages/ThinkingBlock.tsx`
- `packages/desktop/src/main/composer-attachment-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/shared/src/session.ts`

## 验证

- shared build、Desktop typecheck/build 均通过；构建仅保留既有的 bundle size warning。
- Composer 图片回读与 shimmer 颜色语义定向 Vitest 6/6 通过，App 流式运行态定向 Vitest 1/1 通过。
- 主题检查、文档检查和 `git diff --check` 均通过。
- 真实 Electron 手动验收由用户完成。
