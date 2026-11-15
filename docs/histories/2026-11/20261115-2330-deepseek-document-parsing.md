## [2026-11-15 23:30] | Task: DeepSeek 文档解析 PB：`read_document` 工具上线

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> PA 和 PB 是一起的：把 PB 文档解析做完，再统一验收，PB 的提交更新到同一个 PR。

### 🛠 Changes Overview

**Scope:** `@actspace/tool-document`、`@actspace/shared`、`@actspace/client`、`@actspace/prompt`、`@actspace/official-skills`、`@actspace/agent-host`、`@actspace/desktop`、`@actspace/web`、`docs/`

**Key Actions:**

- **实测（PB.1）**：PPTX、长 DOCX、带密码 PDF、改名 xlsx、错 Key、带杂字节 PDF 的真实响应录成夹具（测试文档都是自己造的占位内容）。
- **端口（PB.2–PB.4）**：`sniff.ts` 本机判断五种类型和设了密码的 OOXML；`ocr-response.ts` 解析响应、映射失败码、去标记、拆超长页；`assemble.ts` 按 50,000 字符分页；`cache.ts` 按字符数 LRU、同时最多 2 份在读入上传、同一份共用一次加载、中止时没发出的取消；`node-ports.ts` 串起路径复核、预检、上传、190 秒计时。
- **Host 与附件（PB.5、PB.6）**：桌面端每次调用读开关和 Key，受信授权范围加 `actspace.document`；CLI / 远程 Host 要 `ACTSPACE_DEEPSEEK_DOCUMENT=1`。附件元数据加可选文件名，Office 四种媒体类型。
- **设置与输入框（PB.7、PB.8）**：「工具 › 多媒体」最后一行「文档解析」；本机 Agent / Plan 在文档解析可用时「+」变成「图片与文件」，选择框只列图片和五种文档。
- **行（PB.9、PB.10）**：`read` 预览加 `document` 字段；桌面端文件名不是链接、行尾页数、展开第一项是警示色的识别不完整提示；Web 单行；mock 场景加文档会话。
- **提示词与 Skill（PB.11）**：条件句「工具在列表里时」，开关切换不改系统提示词；pdf、office-docx、office-pptx 三个 Skill 同步。
- **文档（PB.12）**：插件边界、权限模型、附件引用、预览规范、中间消息区、设置页、输入框、脚本执行、web 工具、SECURITY、设计文档第 8、9.2–9.4 节。

### 🧠 Design Intent (Why)

- 本机先检查类型再上传：模型可能对着任意文件调用，非文档内容不能发出去。
- 第一次读整份并缓存、之后按页取：OCR 按页计费，长文档翻页不该重复付费；已经发出的请求在中止后仍跑完并写缓存，因为 DeepSeek 那边照常计费。
- 授权范围独立于 `read_file`：发给第三方和本机读取是两种风险。

### Unverified & Leftovers（未验证与遗留）

- 真实应用验收 12 步（PB 计划 PB.12）和 PA 的验收合在统一验收里做，结果见 PR #110。
- 老格式 DOC、PPT 没有用真实接口测过。
- 文档缓存只在内存里，重启后重新解析、重新计费。

### 📁 Files Modified

- `packages/document/tool-document/src/`
- `apps/desktop/src/main/runtime-v2/`（`tool-host-services.ts`、`trusted-grant-audiences.ts`、`artifact-store.ts`、`attachment-media-type.ts`、`attachment-dialog-filters.ts`）、`packages/host/agent-host/src/node-ports/tool-host-services.ts`
- `apps/desktop/src/renderer/components/settings/`、`components/composer/attachment-entry.ts`、`Composer.tsx`、`conversation/TurnPromptEditor.tsx`
- `packages/util/shared/src/session/`、`packages/client/client/src/sessions/document-preview.ts`、`tool-failure-text.ts`、`live/stream-blocks.ts`
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`、`styles/tool-result.css`、`mock/scenarios/deepseek-tools.ts`
- `apps/web/src/pages/session/blocks/ExploreGroup.tsx`
- `packages/context/prompt/src/core-contributors.ts`、`packages/skill/official-skills/skills/{pdf,office-docx,office-pptx}/SKILL.md`
- `docs/design-docs/`、`docs/SECURITY.md`、`docs/FRONTEND_VERIFICATION.md`
