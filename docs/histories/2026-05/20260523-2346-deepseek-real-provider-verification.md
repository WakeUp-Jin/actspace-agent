## [2026-05-23 23:46] | Task: DeepSeek 真实 provider 接入与桌面验收

### Execution Context

- Runtime: Codex + Electron Computer Use
- Scope: `packages/agent-core`、架构与安全文档

### User Query

> 在本地已配置 DeepSeek 密钥的前提下，完成真实 API 访问并验证桌面端消息链路；不得读取或暴露本地密钥文件内容。

### Changes Overview

- 将 `DeepSeekService` 从占位骨架实现为真实 SSE provider，调用 OpenAI 兼容的 chat completions endpoint。
- 映射流式文本、思考内容、工具调用片段与 token usage，并对认证、限流、余额和服务端错误进行分类。
- 新增 provider 单测，覆盖流式文本聚合、工具调用重组与缺失密钥错误。
- 更新架构、质量评分与安全约定，明确真实 provider 已可用及探针验证的安全边界。

### Verification

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/agent-core test`：15 个测试文件、89 个测试通过。
- `pnpm typecheck`
- `pnpm build`
- Electron 真实验收：在运行时选择 DeepSeek provider 后，发送不含仓库内容的固定探针，界面流式展示并最终返回预期固定字符串。
- 落盘确认：探针回合的 session 事件记录 `provider=deepseek`、`model=deepseek-chat` 与 token usage，未记录密钥内容。

### Follow-ups

- 工具运行工作区目前与应用数据目录混用，真实文件工具回合需要单独修复后再开放验证。
- renderer 的历史消息合并/恢复仍存在展示问题，应作为独立前端链路缺陷处理。
