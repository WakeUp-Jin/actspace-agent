# 运行态反馈与图片预览回读修复

## 目标

把用户确认的 B 方案高对比墨色 shimmer 落到统一运行态，并修复图片附件在 Agent Run 完成、session 回读后缩略图变空白的问题。

## 范围

- 包含：共享 running shimmer、模型等待文案、流式 Thinking 标题、所有工具 running 行、session 图片附件预览受控重建、相关测试与文档。
- 不包含：工具事件协议重构、改变工具并行策略、持久化 Base64、图片云端上传、重做 Worked for 信息架构。

## 已确认事实

- 真实日志存在独立 `tool_started -> tool_finished`，工具生命周期事件没有丢失。
- 当前工具行已经统一消费 `.tool-log-text-running`，但浅深主题的文字/覆盖层明度组合不足，运行态不明显。
- `Operating Space · Expanding` 仅覆盖无可见模型/工具活动的等待窗口；流式 Thinking 标题自身没有 running 状态。
- Composer 预览 data URL 在构造 `RunAgentInput` 时被正确剥离，但 session 回读没有从受信本地附件路径重建预览，导致完成后空白。

## 实施步骤

1. 用主题文本 token 实现 B 方案：subtle/faint 底字 + main ink sweep，浅深主题自动反转。
2. 为仅存在于 renderer 的流式 Thinking block 增加 running 状态；工具或后续段开始时自动停止，不污染持久化事件。
3. 在 main 的 session 读取边界为已持久化的 image attachment 生成有界 data URL；renderer 和 session 文件都不持久化 Base64。
4. 增加工具/Thinking/模型等待与 session 图片回读回归测试，同步设计规范、history 和 learning 判断。

## 验证

- shared / desktop 定向 Vitest。
- shared build、Desktop typecheck/build。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check`。
- 真实 Electron 浅深主题与图片发送后回读由用户手动验收。

## 进度

- [x] 定位工具事件、shimmer CSS、模型等待和 session 回读边界。
- [x] 实现 B 方案统一运行态。
- [x] 实现 session 图片预览受控重建。
- [x] 完成测试、文档与静态验证。
- [ ] 用户完成真实 Electron 验收。

## 决策记录

- 2026-08-01：采用用户在独立 HTML 中确认的 B 方案，节奏保持不变，只提高基础文字与扫光之间的明度差。
- 2026-08-01：运行态仍使用中性色 token，不把所有 running 状态染成 operational green。
- 2026-08-01：预览 data URL 只存在于 main 返回值和 renderer 内存，不写入 `session.jsonl`。

## 验证记录

- `pnpm --filter @actspace/shared build`：通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop build`：通过；仅保留既有的 bundle size warning。
- Composer 图片回读与 shimmer 颜色语义定向 Vitest：6/6 通过。
- App 流式 Thinking / 工具 / 模型等待定向 Vitest：1/1 通过。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check`：通过。
