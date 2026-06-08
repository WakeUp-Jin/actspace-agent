# Desktop、IPC 与存储审查计划

## 目标

检查 Electron main/preload、桌面端服务、IPC、session store、workspace registry、settings、context describe、local update 和右侧预览服务等实现是否符合桌面端边界和存储设计。重点关注 renderer 文件系统隔离、userData/workspaceRoot 边界、Main Process 责任收敛和服务间耦合。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/SECURITY.md`
- `docs/design-docs/agent-turn-layers.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/front-设置页规范.md`

## 重点代码与文件范围

- `packages/desktop/src/main/`
- `packages/desktop/src/main/test/`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/right-panel/`
- `packages/desktop/src/renderer/components/settings/`
- `packages/agent-core/src/persistence/`
- `packages/shared/src/`

## 审查问题

- Main Process 是否只承担 Electron 生命周期、IPC、依赖装配、持久化和服务调用。
- Preload 是否只暴露稳定、安全的 API，没有泄漏 Node/Electron 原生能力。
- Renderer 是否完全通过 preload + IPC 访问文件、session、settings 和右侧预览。
- session、context-state、attachments、tmp、cache-audit、kairos inbox 的边界是否清楚。
- workspaceRoot 和 userData 是否在写入、读取、预览、handoff 中被正确区分。
- 各 main service 是否职责单一，是否出现过大服务或重复路径解析逻辑。
- `context:describe` 和真实 turn 是否共用 runtime context loader，避免上下文视图和 LLM 输入漂移。
- 本地 update/review/visualize 等服务是否有和核心 Agent 逻辑不必要的耦合。

## 输出格式

### 偏移点

- 记录代码和文档设计不一致的地方。

### 不合理设计

- 记录实现选择、职责边界、数据流问题。

### 可读性问题

- 记录难读函数、命名、重复逻辑。

### 耦合问题

- 记录过高耦合、边界混乱，或者过度拆分导致理解成本高的问题。

### 死代码/兼容残留

- 记录开发期不需要保留的旧入口、无用分支、废弃类型。

### 建议动作

- 只给建议，不改代码。建议类型包括：删除、收敛、重构、补文档、补测试。

## 产出要求

- 本轮只审查和记录，不修改代码。
- 结论需要引用具体文件路径，尽量给出行号。
- 对不确定的问题标注为“待确认”，不要当作确定缺陷。

## 审查结果

### 发现 1：workspace/review IPC 对 renderer 传入的绝对 `workspaceRoot` 信任偏宽

- 偏移点：文档要求 renderer 只能通过 preload + IPC 访问文件，并且所有 workspace 路径必须回到 workspaceRoot 边界内；但当前多个 IPC 入口直接接受 renderer 传入的 `workspaceRoot`，main 侧只把它作为新的根目录使用。`preload` 暴露 `listWorkspaceDir` / `readWorkspaceFile` / `getWorkspaceReview` / `initGitRepository`（`packages/desktop/src/preload/index.ts:92`、`packages/desktop/src/preload/index.ts:97`），右侧 Review 调用时原样传入 `workspaceRoot`（`packages/desktop/src/renderer/components/right-panel/ReviewRenderView.tsx:251`、`packages/desktop/src/renderer/components/right-panel/ReviewRenderView.tsx:297`）。
- 不合理设计：`workspace-fs-service` 的 `resolveRoot()` 直接 `resolve(input.workspaceRoot ?? roots.defaultWorkspaceRoot)`（`packages/desktop/src/main/workspace-fs-service.ts:79`），之后只校验 `relativePath` 是否在这个根内（`packages/desktop/src/main/workspace-fs-service.ts:92`）；`review-git-service` 也只校验该路径存在且是目录（`packages/desktop/src/main/review-git-service.ts:188`）。这使得 preload 的稳定 API 变成“renderer 可指定任意本机目录作为根”的读/Review 能力。
- 可读性问题：`workspace-registry-service` 已有 `resolveWorkspaceSelection()` 注册表解析（`packages/desktop/src/main/workspace-registry-service.ts:80`），但 workspace 文件浏览与 Review 服务各自重复做根解析，读者需要跨服务推断哪些入口受注册表约束、哪些入口只受目录存在性约束。
- 耦合问题：Review、Workspace 文件浏览和 session workspace 选择没有共享同一套 workspace 解析策略；session 创建/切换会走 registry（`packages/desktop/src/main/index.ts:984`、`packages/desktop/src/main/index.ts:1015`），但右侧浏览和 Review 不走 registry。
- 死代码/兼容残留：未发现明确死代码；`workspaceRoot?: string` 作为 IPC 字段可能是早期灵活入口保留下来的兼容形态，待确认。
- 建议动作：收敛。为 workspace 浏览和 Review 增加统一的 main 侧 workspace resolver：优先接受 `workspaceId` 或当前 session 的 `meta.workspaceRoot`，绝对路径只有在显式“选择/注册 workspace”流程中写入 registry 后才可用；至少补测试覆盖“renderer 直接传 `/`、`/Users`、不存在目录、未注册目录”的行为。

### 发现 2：`visualize:convert-reply` 使用应用默认 workspace，可能与当前会话 workspace 漂移

- 偏移点：真实 turn 和 `context:describe` 都会读取当前 session `meta.workspaceRoot` 后再回退默认 workspace（`packages/desktop/src/main/agent-turn.ts:184`、`packages/desktop/src/main/agent-turn.ts:187`；`packages/desktop/src/main/context-describe-service.ts:32`、`packages/desktop/src/main/context-describe-service.ts:37`），但消息可视化转换直接把 `roots.workspaceRoot` 传给 `convertReplyToHtml()`（`packages/desktop/src/main/visualize-service.ts:95`、`packages/desktop/src/main/visualize-service.ts:97`）。
- 不合理设计：`roots.workspaceRoot` 来自 `ACTSPACE_WORKSPACE_ROOT` / repo root / downloads 的应用级默认解析（`packages/desktop/src/main/app-paths.ts:53`），不是会话的真实 workspace。若用户在顶部 Workspace 选择器切到另一个项目并发送消息，可视化服务仍可能按默认根运行，和该回复所属 session 的 workspace 不一致。
- 可读性问题：`VisualizeReplyInput` 只有 `sessionId`、`messageId`、`content`、`model`（`packages/shared/src/ipc.ts:149`），服务名又落在 session sidecar（`packages/desktop/src/main/visualize-service.ts:57`），读者容易以为所有上下文都按 session 取；实际 workspace 另走全局 roots。
- 耦合问题：visualize 服务直接调用 agent-core 的 `convertReplyToHtml`（`packages/desktop/src/main/visualize-service.ts:15`），但没有复用 main turn/context describe 的 session workspace 解析逻辑，导致“同一条回复”的模型转换和真实 turn 使用不同运行根。
- 死代码/兼容残留：未发现死代码。
- 建议动作：重构。让 `visualizeReply()` 按 `sessionId` 读取 `meta.json`，使用 `meta.workspaceRoot ?? roots.defaultWorkspaceRoot`；把该规则与 `agent-turn.ts` / `context-describe-service.ts` 抽成共享 helper，并补一个不同 workspace 的缓存命中/生成测试。

### 发现 3：设置页 Kairos 存储文档与当前实现相互矛盾

- 偏移点：`front-设置页规范.md` 仍写着 Kairos 模型写 `preferences.json`、思考链走 settings/env，并在配置生效段写“模型不再走 settings/env，唯一来源是 `preferences.json`”（`docs/design-docs/front-设置页规范.md:61`、`docs/design-docs/front-设置页规范.md:99`）；但当前 Kairos 设计文档明确说模型/思考链真来源是 `settings.json` 的 `kairos` 分区（`docs/design-docs/agent-kairos-autonomous-mode.md:50`）。
- 不合理设计：实现也按 `settings.json` 走：共享契约声明 `KairosSettings.modelId` 持久化在 settings（`packages/shared/src/settings.ts:47`、`packages/shared/src/settings.ts:52`），main 创建 Kairos controller 时从 `getSettingsService().get().kairos` 读取模型与 thinking（`packages/desktop/src/main/index.ts:627`、`packages/desktop/src/main/index.ts:632`），settings 更新后重建 controller（`packages/desktop/src/main/index.ts:1066`、`packages/desktop/src/main/index.ts:1075`）。
- 可读性问题：两个设计文档给出相反事实，审查者无法只靠文档判断 settings、preferences、env 的责任边界。
- 耦合问题：设置页、Kairos runtime 和 docs 已经形成三方耦合；文档漂移会让后续开发把同一个字段重新写回 `preferences.json` 或 env，破坏当前实现。
- 死代码/兼容残留：`docs/design-docs/front-设置页规范.md` 中关于 `preferences.json` / `KAIROS_THINKING` 的描述属于兼容残留或过期描述。
- 建议动作：补文档。把 `front-设置页规范.md` 与 `agent-kairos-autonomous-mode.md` 对齐：Kairos 模型/思考链来源为 `settings.json.kairos`；`preferences.json` 只保留 enabled/sleep/rhythm 等运行偏好；env 不再作为 Kairos 模型/思考链来源。

### 发现 4：主 Agent system prompt 路径可被 settings 指向任意绝对路径

- 偏移点：设置页规范说正文由 `settings:read-agent-system-prompt` / `settings:write-agent-system-prompt` 读写 `<userData>/prompts/main-agent.md`（`docs/design-docs/front-设置页规范.md:99`），但 `SettingsService` 会保留 settings 中的绝对 `systemPromptPath`：`sanitizeSystemPromptPath()` 对绝对路径直接返回（`packages/desktop/src/main/settings-service.ts:418`、`packages/desktop/src/main/settings-service.ts:422`）。
- 不合理设计：`readAgentSystemPrompt()` 和 `writeAgentSystemPrompt()` 会直接读写 `this.settings.agent.systemPromptPath`（`packages/desktop/src/main/settings-service.ts:155`、`packages/desktop/src/main/settings-service.ts:166`）。如果 `<userData>/settings.json` 被写入任意绝对路径，设置页保存 prompt 可能覆盖 userData 外文件。该风险需要结合本地 settings 文件写入权限评估，待确认。
- 可读性问题：共享类型仍把 `systemPromptPath` 暴露为 renderer 可见设置字段（`packages/shared/src/settings.ts:27`、`packages/shared/src/settings.ts:29`），但写接口本身只接收 `content`（`packages/shared/src/settings.ts:83`）；“路径是否可配置”在 UI 和服务层语义不一致。
- 耦合问题：system prompt 路径既是持久化配置，又被真实 turn/context describe runtime loader 读取（`packages/desktop/src/main/index.ts:768`、`packages/desktop/src/main/index.ts:905`），路径策略一旦偏离 userData 会影响模型输入与设置页写盘。
- 死代码/兼容残留：允许绝对 `systemPromptPath` 可能是旧 settings 迁移兼容口；测试目前只覆盖默认 `<userData>/prompts/main-agent.md` 和 legacy `systemPrompt` 迁移（`packages/desktop/src/main/test/settings-service.test.ts:120`、`packages/desktop/src/main/test/settings-service.test.ts:137`），未覆盖外部绝对路径，待确认。
- 建议动作：收敛。除非明确支持自定义 prompt 文件位置，否则 sanitize 时强制落回 `<userData>/prompts/main-agent.md`；如果必须兼容历史绝对路径，应只读迁移一次到 userData，再改写 settings，并补外部绝对路径不会被继续写入的测试。

### 发现 5：`main/index.ts` 已承担过多服务装配与副作用协调

- 偏移点：`agent-turn-layers.md` 要求 main 进程主要负责 Electron 生命周期、IPC、依赖准备、持久化和服务调用（`docs/design-docs/agent-turn-layers.md`），但当前 `packages/desktop/src/main/index.ts` 长度约 1249 行，集中包含启动日志、DeepSeek 余额 HTTP、provider 测试、Kairos controller lifecycle、approval registry、workspace registry helper、usage 全局聚合、local update 初始化和全部 IPC 注册。
- 不合理设计：例如 provider 测试直接在 main 入口中拼 URL 并发 fetch（`packages/desktop/src/main/index.ts:468`、`packages/desktop/src/main/index.ts:478`），Kairos 重建和 settings 更新副作用也在同一文件协调（`packages/desktop/src/main/index.ts:689`、`packages/desktop/src/main/index.ts:1066`）。这不是单个缺陷，但已经超过“路由注册 + 服务调用”的轻量边界。
- 可读性问题：同一文件内既有 Electron window 配置（`packages/desktop/src/main/index.ts:547`）、IPC 注册（`packages/desktop/src/main/index.ts:735`）、数据目录创建（`packages/desktop/src/main/index.ts:253`）和业务服务状态机（`packages/desktop/src/main/index.ts:620`），定位某个 IPC 的实际数据边界成本较高。
- 耦合问题：settings 更新会直接触发 Kairos controller 重建（`packages/desktop/src/main/index.ts:1073`），agent turn 会直接 notify Kairos 让位（`packages/desktop/src/main/index.ts:748`、`packages/desktop/src/main/index.ts:753`），local update ready 又直接 `app.quit()`（`packages/desktop/src/main/index.ts:1171`、`packages/desktop/src/main/index.ts:1178`）；main 入口成为多个服务间的隐式协调中心。
- 死代码/兼容残留：未发现明确死代码；这是结构性膨胀问题。
- 建议动作：重构。保持 `index.ts` 只做 app lifecycle/window/create service container/register IPC；把 provider diagnostics、usage 聚合、workspace IPC、settings 副作用调和、Kairos lifecycle 分别收进独立 registrar/service，并为 registrar 的 IPC 输入输出补最小单测。
