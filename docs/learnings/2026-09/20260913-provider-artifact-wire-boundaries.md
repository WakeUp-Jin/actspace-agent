# Provider wire payload 与 Session Artifact 的分层

这次图片链路改造提炼出一个可迁移的模式：本地持久化事实、供应商请求格式和 UI 预览不应该共享同一种表示。

## 三层表示

1. **Session-owned Artifact**：本地文件导入后生成稳定的 `artifactId`，Journal 只记录引用和 MIME。它是重试、会话重载和预览的事实源。
2. **Provider wire payload**：在请求边界按供应商能力转换。普通 OpenAI-compatible/Anthropic 路线可以发送受大小和 MIME 校验的 base64；DeepSeek 直连路线可以先调用 Files API，再发送 `file` block 和 `file_id`。
3. **Renderer preview**：只通过 Main 的 session/artifact 校验 IPC 生成短期 data URL，不把预览数据回写 Journal。

## 为什么不能只保留一种格式

如果把 base64 直接塞进消息持久化，会放大 Journal、泄露敏感内容，并让 provider 协议细节侵入恢复逻辑。反过来，如果只保存远端 `file_id`，过期或换凭据后本地消息就无法恢复。因此远端 ID 只能是带过期时间的进程内缓存；缓存失效时从本地 artifact 重新上传。

## 可复用的实现清单

- 让 adapter 在 wire boundary 选择 provider strategy，不改 AgentLoop 的 artifact 抽象。
- 缓存键至少包含 endpoint、凭据作用域、session、artifact 和内容版本；不要跨凭据复用远端 ID。
- 对上传设置有限重试，并把 HTTP/网络错误保留为可解释 provider failure。
- 预览 IPC 重新校验 session ownership、MIME、大小和格式；renderer 不直接读盘。
- 为每一种 wire strategy 写请求体 fixture，同时保留“其他 provider 不变”的回归测试。

本条学习来自 [20260913 工具进度、文件产物、模型目录与图片链路修复](../../histories/2026-09/20260913-1612-tool-artifact-provider-image-ux.md)。
