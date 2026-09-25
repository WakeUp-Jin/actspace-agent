# Main Chat 形态 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260924-main-chat-form.md`
- **执行过程**：`docs/exec-runs/20260924-main-chat-form/execution-process.md`
- **执行模式**：交互
- **执行结果**：代码、自动化与文档完成；外部人工门禁待验收

## 核心变更清单

- 固定 Session 形态：`actspace.main` / `actspace.chat`，Header 持久化、Projection 恢复、fork 继承。
- Chat Prompt 与工具隔离：无 workspace/Skills，工具严格为 `web`、`generate_image`。
- Prompt cache 修复：`modelFacts` 与审计 `facts` 分层，动态 mode 持久化到消息末尾。
- 首版附件：图片、TXT、Markdown、JSON、CSV；严格边界、持久化正文和 Artifact 回滚。
- Chat 压缩设置：80% 默认，50%～95%，保存后无需重启影响下一次自动判断。
- Desktop：顶部与 workspace 新建入口均支持 Agent/Chat；Chat Composer 使用固定控制面。

## 人工验证指引

1. 使用 `pnpm dev:log` 启动真实 Electron。
2. 分别从顶部和某个 workspace 的 `+` 创建 Agent 与 Chat；确认切换会话后 Composer 控制不串，`Command+N` 仍默认 Agent。
3. 退出并重启应用，确认 Chat 仍恢复为 Chat；fork Chat 后子会话仍为 Chat。
4. Chat 依次上传 PNG/JPEG/WEBP/GIF、TXT、MD、Markdown、JSON、CSV 并提问；确认消息显示附件而非全文。
5. 尝试 PDF、DOC、DOCX、非法 UTF-8、含 NUL 和超限文本；确认出现可读错误且消息未发送。
6. 配置可用 provider 后验证 `web.search`、`web.open`、`generate_image`；确认 localhost/私网 URL 被拒绝，未配置服务时错误不可重试且可读。
7. 在设置中把 Chat 自动压缩阈值从 80% 改为 50%/95%，不重启 Runtime，使用长会话或诊断 fixture 确认下一次判断使用新值。
8. 在浅色、深色、跟随系统与 ≤600px 窗口检查新建菜单、Chat pill、附件 chip 和设置输入无溢出。

## Agent 已完成的验证

- `pnpm --filter @actspace/runtime... build`
- Prompt、core-agent、core-agent-loop、session-journal、session-persistence、tools-core-tools、compaction、runtime、desktop-app、client 测试通过。
- `pnpm --filter @actspace/desktop test`：107 files / 759 tests 通过。
- `pnpm typecheck`、`pnpm build` 通过。
- `pnpm check:packages`、`pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:secrets`、`git diff --check` 通过。

## 已知风险和遗留事项

- 真实 Electron 验收已尝试两次，但本机 `electron@39.8.10` 缺少安装产物，启动在窗口创建前报 `Electron failed to install correctly`；`pnpm rebuild electron` 未补齐 `path.txt`。因此真实文件选择、多模态能力、重启恢复与主题截图仍未验收，自动化不能替代这些门禁。
- production renderer build 仍报告既有大 chunk warning，不是本功能引入的构建失败。
- 用户同时存在另一份尚未实施的 Anthropic active plan；本任务未实施、归档或纳入本次提交。

## 后续建议

- 先完成上述 8 项人工验收，再决定是否发布 2026-09-25 首版。
- Provider cache 只有 system prompt 字节稳定的自动证据；在拿到真实 cache read/write usage 前，不宣称缓存命中率已经提升。
