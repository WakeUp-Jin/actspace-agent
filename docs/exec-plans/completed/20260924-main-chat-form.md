# 主 Agent Chat 形态执行计划

状态：2026-09-24 M1～M5 实现与自动化已完成；真实 Electron、本地文件和 Provider 验收保留为人工门禁。

目标交付：2026-09-25 首版。

正式设计：[主 Agent 的 Chat 形态](../../design-docs/agent-runtime/agent-main-chat-form.md)。

## 1. 目标

在现有 Desktop Profile、Session Journal 和 AgentLoop 上增加固定的 `actspace.chat` 主会话 preset。Chat 只向模型暴露 `web` 与 `generate_image`，支持图片、TXT、Markdown、JSON、CSV 附件，并允许在 Settings 调整 Chat 自动压缩阈值。同时修复动态运行 facts 写入 system prompt 导致的前缀缓存失效，保证现场发送、Journal 持久化和后续重放一致。

## 2. 基线与执行约束

- 计划创建时工作树 `git status --short` 为空。
- 本任务明显超过 8 个文件，跨 Shared、Prompt、Session、Runtime、Tools、Compaction、Desktop main/preload/renderer、测试和文档。
- 采用交互模式；不自动 commit、push、发布安装包、修改真实密钥或消耗真实 Provider 额度。
- 每个里程碑都必须保持仓库可构建、旧 Agent Session 可用，并可以独立合并；不得出现依赖下一阶段才能恢复基本功能的半成品。
- 实现开始时创建 `docs/exec-runs/20260924-main-chat-form/{execution-process.md,execution-summary.md}`，按阶段持续更新。
- 修改 UI 前先读 `docs/design-docs/frontend/front-主题与配色规范.md`；本计划不新增颜色字面量或重做视觉系统。
- 完成代码前读 `docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`，并按学习沉淀规则判断是否新增 `docs/learnings/2026-09/` 文档。

## 3. 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/PLANS_GUIDE.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/agent-runtime/agent-main-chat-form.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-prompt-context-contributors.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/tool-system/agent-web-tools.md`
- `docs/design-docs/tool-system/agent-image-generation-tool.md`
- `docs/learnings/2026-06/static-prefix-dynamic-suffix-for-prompt-cache.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/frontend/front-设置中心重构规范.md`

## 4. 范围

### 4.1 包含

- `actspace.main` / `actspace.chat` 主 Session preset 与恢复规则；
- Agent/Chat 形态与 Agent Plan/Agent 单轮模式拆分；
- Prompt `model-fact` / `request-fact` 分层与缓存回归；
- 持久化的隐藏 `runtime-context` 动态尾部；
- Chat 专用 `web` 工具门面；
- Chat 工具 allowlist 恰好为 `web`、`generate_image`；
- Chat 图片和五类文本附件；
- Settings v4 `chatCompactionTriggerRatio` 和实时 policy resolver；
- 新建会话、Composer、设置页和恢复投影；
- 自动化、真实 Electron/Provider 验收说明、设计文档、history 与执行记录。

### 4.2 不包含

- PDF、DOC、DOCX、OCR、音频、视频、压缩包；
- 用户自定义主 Agent preset、热重载或新插件市场；
- Chat 文件系统、Bash、Browser Bridge、Subagent、Todo、Skills、权限审批；
- 新 Runtime Profile、新进程、新数据库或独立 Chat 历史；
- 新的 token 硬预算、历史消息手工 include/exclude、自动总结旧聊天以外的新压缩算法；
- 会话列表视觉重做、Chat 专属主题、跨会话记忆；
- 真实密钥配置、自动开通第三方搜索/生图服务。

## 5. 共享契约

以下命名在实施期间保持一致，不允许各阶段另造同义类型：

| 契约 | 决定 |
|---|---|
| 主会话 preset | `actspace.main`、`actspace.chat` |
| 旧 Session 缺 preset | 解释为 `actspace.main` |
| 产品形态类型 | `MainAgentForm = "agent" | "chat"` |
| Agent 单轮模式 | `AgentTurnMode = "agent" | "plan"` |
| Chat 工具 | `web`、`generate_image` |
| Web action | `search`、`open` |
| Settings 字段 | `general.taskDefaults.chatCompactionTriggerRatio` |
| 默认/范围/步进 | `0.8` / `0.5..0.95` / `0.05` |
| 动态尾部块 | `type: "runtime-context"` |
| 文本附件上限 | 单文件 1 MiB；单消息解码正文合计 256,000 字符 |
| 图片附件 | PNG/JPEG/WEBP/GIF；单文件沿用 20 MiB |

Session Header 的 `createdWith.presetId` 是持久事实。Projection 可以派生 `agentForm` 供 UI 使用，但 renderer 不能成为 preset 真相源。

## 6. 数据流

```text
Sidebar 新建 Agent/Chat
        |
        v
Shared create-session input(presetId)
        |
        v
Desktop IPC -> Runtime Registry -> Desktop App -> Session Controller
        |
        v
Session Header.createdWith.presetId
        |
        v
Agent Factory 解析主 preset
   | prompt contributors
   | allowed tool names
   | allowed turn modes
   v
AgentLoop -> request snapshot -> LLM / tools
   |
   +-> Journal -> Session Projection -> renderer
   +-> Compaction(policy resolver reads live Settings)
```

不得形成 `packages/* -> apps/desktop` 反向依赖。Settings 值通过 Host 只读 resolver 进入 Runtime，领域包不 import SettingsService。

## 7. M1：Prompt cache 修复

M1 可独立合并，不改变会话创建或用户可见工具；完成后现有 Agent 功能继续工作，但 system prompt 不再被内部运行 ID 每轮污染。

### 7.1 契约与实现

修改：

- `packages/prompt/src/contributor.ts`
- `packages/prompt/src/assembler.ts`
- `packages/prompt/src/request-snapshot.ts`
- `packages/prompt/src/core-contributors.ts`
- `packages/prompt/src/skills/contributor.ts`
- `packages/prompt/src/test/assembler.test.ts`
- `packages/prompt/src/test/host-context.test.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/test/**`
- `packages/english-learning/src/prompt.ts`
- `packages/english-learning/src/test/**`
- Context Projection 的 snapshot 消费与相关测试。

任务：

1. Contributor kind 增加 `model-fact`；`request-fact` 不再自动写入 system prompt。
2. Logical request candidate/snapshot 增加 `modelFacts`。新 snapshot 写 schema version 2；读取旧 version 1 时按旧 `facts` 解释模型可见 facts，保证历史可读。
3. `renderSystemPrompt` 只接收 `systemSections + modelFacts`；`facts` 继续保存 Host 和运行审计事实。
4. `agentRunId`、`invocationId`、run identity 和内部 mode 退出 system prompt，但继续进入 snapshot facts。
5. Agent descriptor、稳定 workspace 和 capability 描述改为 `model-fact`。
6. Skill catalog 改为稳定 `model-fact`，删除每项 `selected`；selected Skill 正文继续是 `prompt-section`。
7. English Learning 重渲染时使用 `modelFacts`，开启/关闭插件仍是有意的稳定前缀变化。
8. Context Projection 的模型上下文 bucket 使用 `modelFacts`；审计 facts 不伪装成模型已见内容。

### 7.2 动态尾部

1. M1 暂时兼容当前 `chat | plan | agent` 三值 turn mode，在首次写入 `user/message` 前将当前 mode 作为最后一个 `runtime-context` 内容块持久化；不得在 M1 提前删除当前逐轮 Chat 行为。M2 才原子拆分 Session Chat 形态和 Agent `plan | agent` turn mode。
2. `toLlmContent` 把该块转换为末尾结构化文本；同一块在后续请求从 Journal 原样重放。
3. `packages/client/src/sessions/chat.ts`、复制 transcript、标题提取和普通消息正文忽略该块。
4. `packages/compaction/src/summarizer.ts` 在生成自然语言摘要前删除该块，避免内部模式被总结为用户要求。
5. Context token estimate 仍计算该块，但预览不展示内部 JSON。

### 7.3 M1 测试

- 不同 `agentRunId`、`invocationId`、turn/step/request ID 得到相同 `renderedSystemPrompt`；
- workspace、用户规则或 selected Skill 正文真实变化时 system prompt 发生预期变化；
- 现有 Chat/Plan/Agent mode 块位于用户消息最后，现场 request 与下一轮 replay 的历史内容一致；
- renderer、标题、transcript、Compaction summary 不出现 `runtime-context`；
- request snapshot 保留内部 facts，Context Projection 只展示 model facts；
- English Learning 开关不丢失 model facts。

命令：

```bash
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/prompt typecheck
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/core-agent-loop typecheck
pnpm --filter @actspace/compaction test
pnpm --filter @actspace/english-learning test
pnpm --filter @actspace/client test
```

M1 完成标准：连续请求的稳定 system prompt 有逐字节测试证据；旧 snapshot fixture 仍可投影；当前 Chat/Plan/Agent 逐轮行为和工具行为未改变。

## 8. M2：固定 Chat Session preset 与两个工具

M2 可独立合并。完成后用户可以创建、运行、恢复一个只含联网与生图能力的 Chat Session；文本附件增强由 M3 后续加入。

### 8.1 Session 与 Shared

修改：

- `packages/shared/src/runtime-v2/runtime.ts`
- `packages/shared/src/runtime-v2/desktop-ipc.ts`
- `packages/shared/src/runtime-v2/projection.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `packages/session/journal/src/header.ts` 相邻测试（格式不升级，仅使用已有 optional preset 字段）
- `packages/runtime/src/runtime/session-controller.ts`
- `packages/desktop-app/src/service.ts`
- 对应 Session/Projection/Client 测试。

任务：

1. create-session 输入增加主 preset/form；只接受 `actspace.main` 或 `actspace.chat`。
2. Session Controller 创建持久/ephemeral Session 时写 `createdWith.presetId`。
3. 旧 Header 缺 preset 时解析为 `actspace.main`；未知主 preset 恢复失败并给出结构化错误。
4. fork 继承父 preset；renderer 不得在 fork 时改形态。
5. Projection、Session list 和 SessionRecord 派生 `agentForm`，保证冷启动与切换会话后 UI 不依赖本地 React 状态猜测。
6. 将当前 `ComposerMode.chat` 与主 Chat 形态拆开；Runtime turn mode 只保留 Agent 的 `plan/agent`。

### 8.2 Main preset 与 Prompt 组装

修改：

- `packages/core/agent/src/descriptor.ts`
- 新增 `packages/core/agent/src/main-preset.ts`
- `packages/core/agent/src/index.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/run-controller.ts`
- `packages/core/agent-loop/src/loop.ts`
- 相关 runtime/agent lifecycle 测试。

任务：

1. 定义 `actspace.main` 与 `actspace.chat` 两个静态主 preset；不复用 Subagent 的 `actspace.agent`。
2. Factory 从 Session Header 解析 preset，构造对应 descriptor、contributors 与 allowed tool names。
3. Chat 使用独立稳定 identity/safety prompt，只加载用户级指令；过滤 workspace 指令与 Skill catalog/selected Skills。
4. Agent 保持 workspace/Skills/Plan/Agent 行为。
5. Chat 忽略或拒绝 renderer 提交的 selected Skills、workspace execution context 和 per-turn mode override。
6. 两个 preset 继续共用同一个 AgentLoop、Journal 和 LLM route，避免第三套 Runtime。

### 8.3 `web` 门面

修改：

- `packages/tools/core-tools/src/manifest.ts`
- `packages/tools/core-tools/src/plugin.ts`
- `packages/tools/core-tools/src/web/node-web-ports.ts`
- `packages/tools/core-tools/src/test/**`
- `docs/design-docs/tool-system/agent-web-tools.md`
- 工具预览映射与相邻测试（只有现有预览不能表达 `web` 时修改）。

任务：

1. 注册 `web` definition，schema 使用 `action: search|open` 的判别输入。
2. `search` 复用现有 provider/failover、超时和错误；`open` 复用现有 SSRF、重定向、大小限制和 HTML 转换。
3. 保留 `web_search`、`web_fetch` 的名称、行为和 Agent 使用方式。
4. Chat allowlist 为精确集合 `{web, generate_image}`；Agent allowlist 排除 `web`，避免三套 Web 工具同时可见。
5. 搜索未配置和生图未配置返回明确、不可重试的配置提示；工具定义仍保持稳定。

### 8.4 Desktop 创建与 Composer

修改：

- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/main/runtime-v2/projection-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- renderer/main 测试。

任务：

1. “新建会话”和 workspace `+` 提供 Agent/Chat 两个选项；`Command+N` 默认 Agent。
2. create-session IPC 传 preset；Session 创建后 renderer 从 Projection 读取 `agentForm`。
3. Agent Composer 保留 Plan/Agent、Skills、Workspace/Worktree；Chat Composer 显示固定 Chat 状态并隐藏这些控制。
4. Chat 保留模型、Thinking、Context、附件与发送/停止。
5. 当前会话不出现形态切换；用户从新建入口创建另一形态。
6. 浏览器无 preload 的开发空态和现有本地 fixture 保持可运行。

### 8.5 M2 测试

- 新 Agent/Chat Header 分别写正确 preset；旧 Session 恢复为 Agent；未知 preset fail closed；
- Chat restart/resume/fork 仍是 Chat；
- Chat request snapshot 工具名称严格等于 `web`、`generate_image`；
- Agent request 不含 `web`，保留 `web_search`、`web_fetch`；
- Chat request 不包含 workspace instructions、Skill catalog 或 selected Skill body；
- renderer 创建入口、`Command+N` 默认值、Chat/Agent Composer 控制可见性有组件测试；
- 搜索/open 复用底层端口的错误、超时、SSRF 和去重测试。

命令：

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/tools-core-tools test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/desktop-app test
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/runtime... build
```

M2 完成标准：使用离线 LLM/tool fixture 可创建并恢复 Chat；模型工具 schema 恰好两个；Agent 行为和历史 Session 不回归。

## 9. M3：Chat 附件正文注入

M3 可独立合并。M2 的 Chat 已可用；M3 只增加首版文本附件和严格文件边界。

修改：

- `packages/shared/src/session.ts`
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/main/runtime-v2/projection-ipc.ts`
- `apps/desktop/src/renderer/components/Composer.tsx`
- `packages/core/agent-loop/src/loop.ts`
- `packages/client/src/sessions/chat.ts`
- `packages/desktop-app/src/service.ts`
- 附件、LLM message conversion、projection 和 title 测试。

任务：

1. Chat 文件选择器只列图片、TXT、MD/Markdown、JSON、CSV；拖放/粘贴仍在 Main 发送边界二次校验。
2. 扩展名允许：`.png/.jpg/.jpeg/.webp/.gif/.txt/.md/.markdown/.json/.csv`；Chat 明确拒绝 `.pdf/.doc/.docx` 和其他类型。
3. `importAttachment` 保留图片 20 MiB；Chat 文本原始文件限制 1 MiB，并进行严格 UTF-8/BOM/NUL 校验。
4. 先把本次全部文本文件读入内存并完成类型、UTF-8 与总字符数校验，再创建任何 Artifact，避免可预见的校验失败留下孤儿文件。
5. `DesktopArtifactStore` 增加仅供 Host staging 失败回滚使用的 session-owner 精确删除方法；如果 Artifact 创建、内容组装或 `user/message` append 前失败，清理本批次已经创建的 Artifact 和 metadata。该方法不暴露给 renderer 或模型。
6. `toRunContent` 在同一 Artifact 内容块保存文本正文与文件元数据；LLM conversion 优先使用持久化正文，不提示 Chat 使用 `read_file`。
7. 单消息文本附件正文合计超过 256,000 字符时，整次发送失败；不截断、不部分落盘用户消息。
8. Projection 仍把该块显示为一个附件，用户正文不重复显示完整文件内容；Context token estimate 计算实际正文。
9. 图片继续转为 image content；模型不支持图片时返回明确 prepare 错误，不回退 `inspect_image`。
10. Agent 现有附件路径保持兼容；Chat 的严格白名单不得误伤 Agent 既有文件引用流程。

测试：

- 每个允许扩展名成功导入并产生正确 media type；
- PDF/DOC/DOCX、未知扩展、目录、NUL、非法 UTF-8、超限文件和合计超限全部失败；
- 失败前不追加 `user/message`，原 Session Surface 不变，Artifact store 不留下本批次孤儿文件；
- 文本附件现场 request、snapshot 与重放 request 正文一致；
- UI 显示文件名/附件，不显示全文或内部 Artifact JSON；
- PNG/JPEG/WEBP/GIF 进入 image block；无视觉能力模型结构化失败。

命令：

```bash
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/client test
pnpm --filter @actspace/desktop-app test
pnpm --filter @actspace/desktop test
```

M3 完成标准：五类文本附件和图片在真实 Session Artifact/Journal 链路中可恢复；不支持格式不会进入模型或 Journal Surface。

## 10. M4：Chat 压缩阈值设置

M4 可独立合并。Chat 在没有新设置时继续使用 80% 默认值；M4 只增加用户可调控制。

修改：

- `packages/shared/src/settings.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- `apps/desktop/src/main/index.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/agent-host-port.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/compaction/src/policy.ts`
- `packages/compaction/src/plugin.ts`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- 设置迁移、Compaction 与 renderer 测试。

任务：

1. Settings v4 `general.taskDefaults` 增加 `chatCompactionTriggerRatio`，默认 0.8，解析/更新限制 0.5～0.95。
2. 旧 v3/v4 设置迁移后得到 0.8；legacy view 不增加第二份真相。
3. 设置页在 Task Defaults 增加百分比控制和保存错误提示，使用现有 Setting primitives 和主题 token。
4. Desktop Registry/Host 向 Runtime 提供只读 resolver；resolver 每次调用读取 SettingsService 当前 snapshot，不要求 Runtime restart。
5. `CompactionPlugin.maybeCompact` 接受本次 policy override，并与默认 policy 合并；只覆盖 Chat 的 `triggerRatio`。
6. Agent、Subagent、CLI、手动 compact 和 region selection 保持原行为。
7. 非法/缺失 resolver 值回退 0.8，不能阻断 Agent turn。

测试：

- Settings 默认、边界、非法值、revision conflict、重启持久化；
- Chat 50%/80%/95% 在同一 usage fixture 下产生正确判断；
- 设置保存后不重启 Runtime 即使用新值；
- Agent 相同 usage 始终使用现有 80%；
- 手动 compact 不受阈值影响；
- CLI 未提供 resolver 时使用默认策略。

命令：

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/compaction test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
```

M4 完成标准：设置修改能实时影响 Chat 下一次自动压缩判断，且没有让领域 package 依赖 Desktop Settings。

## 11. M5：全量验证与交付

### 11.1 自动化

按顺序执行并在 execution process/summary 记录结果：

```bash
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/tools-core-tools test
pnpm --filter @actspace/compaction test
pnpm --filter @actspace/desktop-app test
pnpm --filter @actspace/client test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm build
pnpm check:packages
pnpm check:docs
pnpm check:current-docs
pnpm check:secrets
git diff --check
```

已有并行 active plan 可能产生与本任务无关的全仓失败。任何失败都必须先用 package 级命令和 `git diff` 归因，不能删除或覆盖用户/其他计划的改动。

### 11.2 浏览器 renderer

验证：

- 新建菜单的 Agent/Chat 选项；
- Agent 与 Chat Composer 控制差异；
- Chat 图片/文本附件 chip、错误提示；
- Settings 阈值默认、修改、保存；
- 浅色、深色、跟随系统主题；
- 600px 以下 Composer 不溢出。

浏览器 renderer 不能证明 IPC、本地文件、Session 持久化或 Provider 能力。

### 11.3 Electron 真实验收

使用 `pnpm dev:log`，从日志读取当前开发 runtime 的 `appName/appId` 后验证：

1. 创建 Agent 与 Chat，会话切换后形态不串；
2. 退出重启，Chat 仍恢复为 Chat；
3. fork Chat，子会话保持 Chat；
4. Chat 上传图片、TXT、MD、JSON、CSV并完成问答；
5. PDF/DOC/DOCX 和超限文本出现可读错误，消息未发送；
6. Agent 的 Plan、Skills、workspace、权限与原 Web 工具仍可用；
7. 修改阈值后不重启 Runtime，结合小型确定性 fixture 或诊断确认 policy 更新；
8. Context Popup 不显示内部运行 ID 或 `runtime-context` 正文。

### 11.4 真实 Provider 边界

- 至少一个已配置搜索 provider：`web.search` 返回真实候选；
- `web.open` 读取公开 HTTP(S) 页面，私网/localhost 被拒绝；
- 已配置图片服务时 `generate_image` 产生产物；未配置时给出明确配置错误；
- 一个支持图片的主模型完成图片问答；不支持图片的模型明确失败；
- usage 中观察 cache read/write；没有足够重复请求证据时，只能声明 system prompt 字节稳定，不能声明供应商缓存命中率已提升。

不要求为验收临时申请、写入或暴露任何 API key。

### 11.5 文档与收尾

1. 同步 `agent-spec-prompt-context-contributors.md`、`agent-token-usage-and-context-state.md`、`agent-web-tools.md`、前端 Composer/Settings 规范及架构索引。
2. 按 `docs/HISTORY_GUIDE.md` 新增本次 history，记录兼容、测试和人工边界。
3. 本变更命中新概念、可迁移、陷阱和模式；阅读 `docs/learnings/WRITING_GUIDE.md`，沉淀“审计 facts 与模型 facts 分层/动态尾部必须持久化”的学习文档。
4. 填写 execution summary，明确自动化、浏览器、Electron、Provider 四层各自证据。
5. 实现完成后将本计划移到 `docs/exec-plans/completed/`，更新索引；未执行的真实 Provider/Electron 项留在摘要，不阻止计划从 active 归档。

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `ComposerMode.chat` 拆分影响现有测试与草稿状态 | 先建立 `MainAgentForm`/`AgentTurnMode` 类型，按编译错误逐 consumer 迁移；旧 Session 不迁移 |
| 动态块只临时拼接，下一轮历史缓存仍断 | 动态块必须先写 Journal，再从 Surface 生成请求；用现场/重放逐字节测试守住 |
| audit facts 从 system 移除后 Context UI 少算或误标 | snapshot 保留 `facts + modelFacts`；Context 只统计 modelFacts，Trajectory 可看完整 facts |
| Chat 意外获得 workspace/Skills/工具 | preset 采用精确 allowlist；负向测试断言工具与 contributor 集合 |
| `web` 与底层 Web 工具竞争 | Agent 排除 `web`；Chat 排除 `web_search/web_fetch`；底层实现继续复用 |
| 文本附件在 Journal 中放大存储 | 1 MiB/256,000 字符硬边界、无静默截断；原文件归 Artifact，正文只随用户主动发送持久化 |
| 附件失败后留下半条消息或孤儿 Artifact | 全部文件先校验；创建后的失败路径按 session owner 精确回滚本批次 Artifact，再 append `user/message` |
| Settings 值需要重启 Runtime | Host 传函数 resolver，Compaction 判断时读取；测试同一 runtime 修改前后 |
| Chat 与权限模式混淆 | UI 隐藏 Chat 无关权限入口，Session preset 与 permission projection 独立 |
| 9 月 25 日范围扩大 | M2/M3/M4 以已确认边界为准；PDF/Office、自定义 preset、硬预算直接拒绝进入首版 |

## 13. 回退

- M1：恢复旧 Prompt 渲染代码即可；snapshot v2 读取必须保留兼容，不能删除已经写入的 request/context。
- M2：停止提供 `actspace.chat` 创建入口；保留 Header preset 读取和只读恢复，不把已有 Chat 静默升级成全工具 Agent。
- M3：关闭 Chat 文本文件选择与发送；原始 Artifact/Journal 不删除，旧消息仍可投影。
- M4：移除 UI 控制并让 resolver 回退 0.8；已有 settings 字段可忽略，不需要重写 settings 文件。
- 任一回退不得删除 Session Journal、Artifact、用户设置、密钥或工作区文件。

## 14. 进度记录

- [x] 2026-09-24：确认 Chat/Agent 是 Session 形态，不是权限模式；形态创建后固定。
- [x] 2026-09-24：确认首版附件为图片、TXT、Markdown、JSON、CSV；不做 PDF/DOC/DOCX。
- [x] 2026-09-24：确认不引入请求硬 token 预算，仅增加 Chat 压缩阈值设置。
- [x] 2026-09-24：完成当前 Prompt cache、Session preset、Web tools、附件和 Compaction 链路只读审计。
- [x] 2026-09-24：设计文档与本 execution plan 落库并登记索引。
- [x] 用户审阅本计划并明确批准实施。
- [x] M1 Prompt cache 修复。
- [x] M2 Chat Session preset、两个工具和 Desktop 创建入口。
- [x] M3 Chat 附件正文注入。
- [x] M4 Chat 压缩阈值设置。
- [x] M5 全量验证、执行摘要、history、learning 与归档。

## 15. 决策记录

- 2026-09-24：主 Agent 继续使用 `actspace.main`，Chat 使用 `actspace.chat`；不复用 Subagent 的 `actspace.agent`。
- 2026-09-24：Chat 与 Agent 共用 Desktop Profile 和 AgentLoop，不增加第三 Runtime Profile。
- 2026-09-24：动态内部 ID不进入模型；模型确实需要的单轮 mode 持久化到最后用户消息的隐藏块。
- 2026-09-24：Chat 对模型只有两个工具；`web` 作为门面复用 `web_search/web_fetch`，不合并或删除底层能力。
- 2026-09-24：Compaction 算法不重做，只为 Chat 增加 50%～95% 的 trigger ratio 设置，默认 80%。
- 2026-09-24：文本附件不静默截断；超限整次失败，保证用户知道模型实际看到了什么。

## 16. 执行模式与执行记录

采用 **交互模式**。这是 Session/Prompt/Runtime/IPC/UI 跨域改动，按 M1→M5 顺序推进；每阶段结束先记录受影响 package 的验证结果，再进入下一阶段。

真正开始实施时，从模板创建：

- `docs/exec-runs/20260924-main-chat-form/execution-process.md`
- `docs/exec-runs/20260924-main-chat-form/execution-summary.md`
