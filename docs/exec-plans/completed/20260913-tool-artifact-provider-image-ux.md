# 工具进度、文件产物、模型目录与图片链路修复

## 目标

修复桌面端 Agent 工作台中六个相互关联但可独立验收的问题：Write/Edit 工具以低噪声的变动行数显示执行进度；生成文件进入右侧文件视图；聊天区代码块获得稳定且主题感知的渲染；Kimi 使用真实模型目录并保留静态回退；图片先进入 Session-owned Artifact，再按供应商能力发送；发送后的图片在当前会话、重载会话和右侧预览中都可见。DeepSeek 直连 OpenAI 兼容路线已接入 Files API `file_id` 映射，其他供应商继续使用各自兼容的内联协议。

## 范围

- 包含：
  - Write/Edit 工具的 `additions/deletions` 进度事件、尾部显示和设置开关。
  - Write/Edit 产物元数据、Artifacts 收集、工作区本地链接到右侧 `openTab()` 的路由。
  - 聊天 Markdown fenced code 的专用 renderer、复制动作、语言标识、长行和双主题样式。
  - Kimi `/models` 目录的 shared IPC、Main 网络服务、缓存、设置 UI、能力归一化和静态 fallback。
  - Session artifact 到供应商图片输入的安全边界；DeepSeek 直连 OpenAI 兼容路线使用 Files API，其他路线保留 provider-compatible base64 wire path。
  - v2 图片 artifact 的安全预览 IPC、发送后即时预览、会话重载 hydration、右侧 image tab。
  - 对应设计文档、测试、execution run 记录、history 和满足条件的 learning 文档。
- 不包含：
  - 恢复完整文件正文的流式展示。
  - 把所有供应商强制改成 DeepSeek Files API。
  - 删除静态 Kimi 模型 fallback。
  - 将图片原始 base64 或 API key 写入 Journal。
  - 允许任意工作区外绝对路径由 Markdown 自动打开。
  - Git stage/commit/push、分支清理或删除用户已有产物。

## 背景

### 相关文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/frontend/front-agent-tool-stream-rendering.md`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/SECURITY.md`
- `docs/FRONTEND_VERIFICATION.md`
- DeepSeek 官方图像理解与 Files API 文档：
  - <https://api-docs.deepseek.com/zh-cn/guides/vision>
  - <https://api-docs.deepseek.com/zh-cn/guides/files_api/>

### 相关代码路径

- 工具流与产物：
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts`
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-tool-preview.ts`
  - `apps/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
  - `apps/desktop/src/renderer/components/messages/TurnOutputArtifacts.tsx`
  - `apps/desktop/src/renderer/components/messages/MarkdownProse.tsx`
  - `apps/desktop/src/renderer/styles/markdown.css`
  - `packages/shared/src/session.ts`
- Workspace/right panel：
  - `apps/desktop/src/renderer/contexts/RightPanelContext.tsx`
  - `apps/desktop/src/renderer/components/ConversationView.tsx`
  - `apps/desktop/src/renderer/components/messages/UserMessage.tsx`
- Provider/model：
  - `packages/shared/src/provider-config.ts`
  - `packages/shared/src/ipc.ts`
  - `packages/shared/src/model-config.ts`
  - `apps/desktop/src/main/runtime-v2/provider-network-service.ts`
  - `apps/desktop/src/main/runtime-v2/openrouter-catalog-service.ts`
  - `apps/desktop/src/main/index.ts`
  - `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- 图片 artifact：
  - `apps/desktop/src/main/composer-attachment-service.ts`
  - `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
  - `packages/core/agent-loop/src/loop.ts`
  - `apps/desktop/src/renderer/components/messages/UserMessage.tsx`

### 已知约束

- 当前工作区已有未提交修改，尤其覆盖 `fixed-renderer-ipc.ts`、`fixed-renderer-tool-preview.ts`、`App.tsx`、`MarkdownProse.tsx`、`session.ts` 和相关测试；实施前必须逐文件审计 diff，增量合并，不得覆盖。
- Renderer 不直接访问文件系统；凭据只在 Main/Host 解析；Session-owned artifact 是图片持久化事实源。
- `write_file/edit_file` 当前不发布正文 `streamingContent`；本计划维持该低噪声边界。
  - DeepSeek 支持 base64、公开 URL、Files API `file_id`；Files API 的适用场景是复用或较大图片，上传用途为 `user_data`。实现不能把供应商能力误推广成通用协议。
- 这是超过 8 个文件、跨 shared/Main/renderer/provider 的高风险交互改动；采用交互模式，每个阶段独立验证后再进入下一阶段。

## 架构与数据流

```text
Agent tool events ──> Main stream adapter ──> shared preview contract ──> FileDiffBlock
        │                         └──── output path ──> Artifacts ──> RightPanel.openTab
        │
Composer local image ──> session artifact store ──> provider capability
                                      ├─ DeepSeek Files API ──> file_id block
                                      └─ other providers ──> validated inline image block
        │
        └─ artifact reference in Journal ──> preview IPC ──> Renderer previewUrl
```

## 方案与阶段

### 阶段 A：工具进度统计（独立可交付）

1. 在 shared session/IPC contract 中增加可选的 Write/Edit stats progress，字段只包含累计 `additions`、`deletions`、状态和必要的路径标识，不携带正文。
2. 在 `fixed-renderer-stream-adapter.ts` 中消费工具 progress，并保证交错 tool call 不串统计；在工具完成时用最终结果校正累计值。
3. 在 `FileDiffBlock.tsx` 中将统计显示放在工具行尾；running 状态显示轻量 spinner，finished 状态固定最终数字，failed 状态保留最终可得数字和错误。
4. 在现有设置契约和设置页增加“显示工具变动行数”，默认开启，关闭后仅隐藏统计。
5. 更新流式渲染设计文档，明确“不展示正文、展示行数”的新契约。

验证：新增 shared contract、stream adapter、renderer 设置与展示测试；覆盖交错调用、零变动、快速完成、失败和关闭设置。

### 阶段 B：生成文件右侧视图（独立可交付）

1. 在 `fixed-renderer-tool-preview.ts` 将 workspace root 内的完成态 Write/Edit 结果规范化为 `outputPath/outputRelativePath`、MIME/type 和统计。
2. 在 `TurnOutputArtifacts.tsx` 通过相对路径收集 v2 Write/Edit 产物；补齐 CSV 等已支持 tab 类型的映射。
3. 在 `MarkdownProse.tsx` 的本地链接组件中识别当前 workspace 内的安全相对路径，调用 `RightPanelContext.openTab()`；外部 URL 和工作区外路径保持原有安全行为。
4. 使用会话 `2ef729eb-9876-4f08-b32b-2fe70b7578cc` 的 `pelican-ride.html` fixture 做回归，不把该用户数据复制进仓库。

验证：Artifacts 收集测试、右侧 tab 类型测试、本地链接安全边界测试；Electron 手工验证 HTML/Markdown/image/text 文件均从右侧打开。

### 阶段 C：聊天代码块 renderer（独立可交付）

1. 为 `MarkdownProse` 增加专用 `pre/code` renderer，分离 inline code 与 fenced code class。
2. 代码块加入语言标签、复制动作、稳定的滚动容器和长行处理；复制内容不包含 UI 标签。
3. 将聊天区样式迁移到主题 token，补齐浅色/深色主题和可访问对比度；不引入新的颜色字面量。
4. 与右侧文档 Markdown 的高亮策略对齐，但保留两者不同的布局责任。

验证：TypeScript、JSON、Shell、Python、无语言代码块、长行、复制和双主题 renderer 测试；按 `docs/FRONTEND_VERIFICATION.md` 做浏览器 mock 与 Electron 截图验收。

### 阶段 D：Kimi 模型目录（独立可交付）

1. 将 Kimi 加入模型目录 IPC provider union 和 capability registry，避免继续使用只列 OpenRouter/DeepSeek 的硬编码分支。
2. 让 Main 网络服务按 provider capability 请求 `${baseUrl}/models`，解析 Kimi `data[]` 的 id、context length、image/reasoning 能力，并拒绝不符合 schema 的响应。
3. 为 Kimi 增加按 provider/base URL/config fingerprint 隔离的缓存；网络失败、401、空列表回退静态模型并显示原因。
4. 设置页为 Kimi 开放刷新和从目录添加，保留静态列表作为无 key/离线状态的可用路径。
5. 在模型目录设计文档中补充 `.cn`/`.ai` base URL 兼容和旧别名不作为唯一模型来源的规则。

验证：shared、Main service、cache、settings tests；fixture 覆盖成功、401、超时、空列表、未知字段和旧模型别名；使用真实 Kimi key 做一次人工刷新，不把 key 写入日志。

### 阶段 E：供应商级图片上传策略

1. 保持 `session artifact` 为唯一本地源，在 provider adapter 增加图片输入策略 capability。
2. DeepSeek 首次使用 artifact 时调用 `POST /files`，`purpose=user_data`，在进程内按凭据、会话和 artifact 缓存 provider file id；同一会话重试和复用时优先复用未过期 id。
3. DeepSeek 请求使用 `file` block + `file_id`；上传失败对 408/429/5xx 或网络错误重试一次，再返回可解释错误，不静默发送未预期的原始字节。
4. 其他 provider 继续使用各自已经支持的 image URL/base64 协议；不改变 AgentLoop 的 artifact 抽象。
5. 映射不保存 API key；远端 file id 过期后从本地 artifact 自动重新上传；应用层继续执行现有文件大小和 MIME 校验。

验证：provider adapter unit tests、重试/过期测试、协议 fixture；DeepSeek credentialed smoke 验证上传和 file_id 请求，失败时确认本地 artifact 仍可再次发送。

### 阶段 F：发送后图片预览与重载（独立可交付）

1. 增加 Main-only artifact preview IPC：校验 session/artifact 所属关系、MIME、大小和图片格式后返回受限预览数据。
2. 在 v2 projection/ConversationView 中保留 artifact id，并在发送完成后立即复用已有 Composer preview；会话重载时按需 hydration，不将 data URL 写入 Journal。
3. 让 `UserMessage`、`ConversationView` 和右侧 image tab 共用 preview resolver；缺失、损坏、过大 artifact 显示明确占位状态。
4. 对即时发送、切换会话、应用重启和右侧预览分别加回归测试。

验证：Main IPC 安全测试、projection/hydration tests、renderer preview tests；Electron 手工验证发送后、重载后和点击预览三条路径。

### 阶段 G：文档、学习沉淀与收尾

1. 更新受影响设计文档、`docs/histories/` 和执行记录；如果本轮形成可迁移的 provider capability/artifact preview 模式，按 `docs/learnings/WRITING_GUIDE.md` 新增学习文档。
2. 按依赖顺序执行 shared build、领域 package build、Desktop typecheck、focused tests，再执行桌面端人工验收。
3. 记录自动化通过项与未完成的真实 Provider/Electron/截图门禁，不把自动化结果表述为完整产品验收。

## 风险

- 风险：现有 dirty worktree 与本计划重叠，直接替换文件会丢失用户改动。
  - 缓解方式：实施前记录目标文件 diff，逐段应用 patch；每阶段只修改声明的文件集合。
- 风险：工具 progress 事件乱序或多个工具交错，导致行数串线。
  - 缓解方式：以 tool call id 建立独立累计器，完成事件做最终校正，并增加交错 fixture。
- 风险：Markdown 本地链接误判为安全路径，导致越界打开。
  - 缓解方式：只接受当前 workspace root 下解析后的相对路径，拒绝 `..`、协议 URL 和 workspace 外绝对路径。
- 风险：Kimi `/models` 返回字段或区域域名不同。
  - 缓解方式：能力驱动的 provider adapter、严格最小 schema、保留静态 fallback，并把 base URL 纳入缓存键。
- 风险：DeepSeek 远端 file id 过期或上传失败。
  - 缓解方式：本地 artifact 永不依赖远端 id 生存；过期自动重传，失败可解释且不丢附件。
- 风险：图片预览 IPC 造成敏感文件读取或内存膨胀。
  - 缓解方式：Main 校验 session ownership、MIME、大小上限和请求频率；previewUrl 只在 Renderer 内存中存在。

## 回滚策略

- 阶段 A：关闭设置项即可回到无统计占位状态；shared progress 字段保持可选，旧事件仍可消费。
- 阶段 B：移除 output metadata 到右侧 tab 的映射即可回到原工具链接，用户文件不被移动或删除。
- 阶段 C：保留旧 Markdown renderer 的兼容入口，CSS 采用独立 class，便于回退而不影响文档文件。
- 阶段 D：关闭 Kimi discovery capability 即回到静态模型列表，缓存可安全失效。
- 阶段 E：移除 DeepSeek upload capability 即回到现有本地 artifact 到 provider image block 的路径；本地 artifact 不受影响。
- 阶段 F：关闭 hydration 仅会退回空预览旧行为，不会删除 Journal 或 artifact。

## 验证方式

### 命令

- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/runtime... build`
- `pnpm --filter @actspace/desktop typecheck`
- 运行受影响的 shared/Main/renderer focused tests；具体命令在执行过程文档中按实际 package script 记录。
- 完成后运行仓库既有文档、类型和测试门禁，不使用 broad staging。

### 手工检查

- Write/Edit 长任务中尾部行数持续变化，完成后稳定，设置关闭后隐藏。
- 会话 `2ef729eb-9876-4f08-b32b-2fe70b7578cc` 对应生成文件从 Artifacts 和正文链接都在右侧打开。
- 聊天区代码块在浅色/深色主题下均可读，复制和长行行为正确。
- Kimi 设置中能刷新模型目录，真实 key 失败时有 fallback。
- DeepSeek 图片发送使用 file_id，重复发送复用或按过期策略重传。
- 图片发送后、切换会话、重启应用后仍能显示并打开右侧预览。

### 观测检查

- Journal 不出现 API key、base64 图片正文或 provider file id 之外的敏感请求体。
- Runtime diagnostics 能区分工具 progress、provider upload、preview hydration 的失败阶段。
- 失败场景不会删除本地 artifact，也不会让其他 provider 的图片能力失效。

## 进度记录

- [x] 已确认六项问题的根因、范围和推荐方向。
- [x] 已获用户确认整体方案。
- [x] 阶段 A：工具变动行数进度。
- [x] 阶段 B：右侧文件产物打开。
- [x] 阶段 C：聊天代码块 renderer。
- [x] 阶段 D：Kimi 模型目录。
- [x] 阶段 E：DeepSeek Files API provider-wire 上传；其他供应商仍按各自协议发送图片。
- [x] 阶段 F：图片预览与重载。
- [x] 阶段 G：验证、文档、history 和人工验收摘要。

## 决策记录

- 2026-09-13：采用“累计新增/删除行数”代替正文流式预览，保留低噪声工具轨迹，同时给用户持续执行反馈。
- 2026-09-13：生成文件统一通过 output metadata → Artifacts → `RightPanel.openTab()` 打开，普通 Markdown 外链不改变。
- 2026-09-13：图片本地传输先进入 Session-owned Artifact；DeepSeek 直连 OpenAI 兼容路线使用受会话/凭据作用域缓存的 Files API `file_id`，其他兼容供应商继续使用受 MIME/大小校验的 base64 data URL，避免把单一供应商能力推广成通用协议。
- 2026-09-13：图片预览数据只在 Renderer 内存中 hydration，Journal 只持久化 artifact 引用。

## 执行模式

- **交互模式**：人在线，Agent 按阶段逐步实施和验证；每阶段完成后报告结果，再进入下一阶段。

## 执行文档

执行开始时创建：

- `docs/exec-runs/20260913-tool-artifact-provider-image-ux/execution-process.md`
- `docs/exec-runs/20260913-tool-artifact-provider-image-ux/execution-summary.md`

执行文档从模板创建，并在每个阶段更新；完成后将本计划移到 `docs/exec-plans/completed/`，同时更新 `docs/exec-plans/README.md`。
