## [2026-05-30 20:55] | Task: Context 完整视图改逐条全文 + 持久化方案 B（describe 现算）

### 🤖 Execution Context

- **Agent ID**: `本地会话`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> Context 视图只显示「2 条」很奇怪、像只拿了一部分。重新设计这条链路：拿到 message / tool 时做整理转换再返回前端。讨论后定：
> - 持久化用**方案 B**（只存 token 统计，逐条明细一律由 describe 现场算，因为打开频率低、现算才体现实时性）。
> - 内容展示用 **4-B**（全文 + 前端展开）。
> - 空桶**折叠但保留**。
> - 用 **title 编码 role、不扩字段**。

### 🛠 Changes Overview

**Scope:** `@actspace/agent-core`（bridge + engine 导出）、`@actspace/desktop`（main describe-service + renderer ContextRenderView）+ 测试 + `docs/`

**Key Actions:**

- **「2 条」根因**：旧 `createContextState` 是「每桶一条汇总」——conversation 整段只产 1 条 entry，前端自然只看到极少条目。改为**逐条**。
- **新 `buildContextEntries(ctx)`（替换 `buildBucketPreviews`）**：每条消息一条、每个工具一条、systemPrompt 一条、每条摘要一条。
  - `conversation`：`title` 编码 role（`User` / `Assistant` / `Assistant · 工具调用` / `Tool · {工具名}`），`preview` = 该条全文；不新增字段。
  - `toolDefinitions`：逐个工具，`title`=工具名、`preview`=完整描述。
- **持久化方案 B**：turn 路径 `createContextState(snapshot, sessionId, turnId)` 缺省 `entries = []`，`context-state.json` 只剩 token 统计，不再和 `session.jsonl` 重复存正文、文件大小恒定有界。
- **describe 现算全文**：`describeSessionContext` 改用 `buildContextEntries`，打开视图时现场重建 ContextManager（不调 LLM）产出逐条全文。
- **前端 `ContextRenderView` 重做**：
  - 分区来源改为按 `CONTEXT_BUCKET_REGISTRY` 始终列出（**空桶折叠保留**），分区 token 取 `snapshot.buckets`（与弹窗权威一致）。
  - `described ?? contextState` 优先现算结果；新增 `loading` 态，正文区按「加载中 / 有 token 无内容 / 0 token」给不同文案。
  - 每条正文 **4-B**：默认 `line-clamp-3`，超阈值（>160 字符或 >3 行）给「展开全文 / 收起」。
  - 删除 `mergeContextPreviews`（不再需要把预览并回快照）。
- **导出 / engine 导出 / 文档**：`engine/index.ts` 导出 `buildContextEntries`；更新 `front-右侧面板与文件渲染规范.md`（数据来源、4-B、空桶、方案 B、V1/V2 边界）。

### 🧠 Design Intent (Why)

- **为什么方案 B 而非「持久化也存全文」**：`context-state.json` 每轮重写，若塞全文会随会话线性膨胀、且与 `session.jsonl` 重复。describe 现算「用完即扔」，装全文几乎免费。两相权衡，持久化降级为纯 token 快照（兜底 + 弹窗用），明细全靠现算——打开频率低，现算反而保证实时一致。
- **为什么 title 编码 role 不扩字段**：role 信息塞进 `title` 即可被现有 `ContextStateEntry` 承载，避免改 shared 契约与全链路类型，改动面最小。
- **为什么 4-B**：describe 已带全文，前端夹 3 行 + 展开是零额外 IPC 的最简「全文可达」方案，且长正文（工具描述 / systemPrompt）不会撑爆版面。
- **为什么空桶折叠保留**：本模板 `MAIN_AGENT_SYSTEM_PROMPT=""`，System/Rules/Skills 合法 0 token；保留分区头让用户对「有哪些上下文类型」有完整心智，而非以为缺失。

### ✅ Verification

- `pnpm typecheck`：通过。
- `vitest run`：`context-state-preview.test.ts`（5）、`context-describe-service.test.ts`（2）、`context-render-view.test.tsx`（6）全绿。
- 待人工：`pnpm dev` 重启后发一条新消息，打开 Context 视图核对逐条会话、4-B 展开、空桶折叠、浅/深双主题。

### 🔗 Related

- 规范：`docs/design-docs/front-右侧面板与文件渲染规范.md`
- 上一轮：`docs/histories/2026-05/20260530-1655-right-panel-fixes-and-reply-html.md`
- 数据分层：`docs/design-docs/agent-token-usage-and-context-state.md`
