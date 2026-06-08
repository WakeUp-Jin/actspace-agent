# 工具与权限审查计划

## 目标

检查 Agent 工具系统、权限审批、路径守卫、输出裁剪、工具预览和受控子进程是否符合设计规范。重点关注工具定义和 executor 分离是否稳定，工具结果是否分层，权限逻辑是否清晰，以及开发期多余兼容代码是否可删除。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/SECURITY.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/agent-subprocess-runner-guidelines.md`
- `docs/design-docs/agent-权限设计规则和原则.md`
- `docs/design-docs/agent-tool-approval-pause-resume.md`
- `docs/design-docs/agent-bash-policy-allowlist-design.md`
- `docs/design-docs/agent-subagent-runtime.md`
- `docs/design-docs/agent-explore-subagent.md`

## 重点代码与文件范围

- `packages/agent-core/src/tools/`
- `packages/agent-core/src/tools/tools/read-file/`
- `packages/agent-core/src/tools/tools/list-directory/`
- `packages/agent-core/src/tools/tools/grep/`
- `packages/agent-core/src/tools/tools/glob/`
- `packages/agent-core/src/tools/tools/edit-file-diff/`
- `packages/agent-core/src/tools/tools/write-file/`
- `packages/agent-core/src/tools/tools/delete-file/`
- `packages/agent-core/src/tools/tools/bash/`
- `packages/agent-core/src/tools/tools/agent/`
- `packages/agent-core/src/tools/subprocess/`
- `packages/agent-core/src/engine/streaming-preview-extractors.ts`
- `packages/desktop/src/main/approval-registry.ts`
- `packages/desktop/src/main/test/approval-registry.test.ts`

## 审查问题

- 每个工具是否都有稳定的 `previewKind`，并通过 typed `ToolUiPreview` 给前端展示。
- 前端展示是否避免从 raw args/raw output 反推工具状态。
- 读类工具和写类工具是否使用正确路径守卫，workspace/userData 边界是否清晰。
- 删除、写入、bash 等高风险工具审批是否和文档一致。
- ToolScheduler 是否承担过多职责，权限、执行、裁剪、渲染是否可读。
- Bash 和 ripgrep 子进程是否使用受控 runner，是否存在 ad hoc shell 调用。
- 输出裁剪、落盘 ref、modelOutput/rawOutput 是否分层清楚。
- Agent/SubAgent 工具是否保持只读隔离、transcript 落盘和非递归边界。

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

### 发现 1：`allow_similar` 仍未形成会话级 Bash allowlist

#### 偏移点

- `docs/design-docs/agent-bash-policy-allowlist-design.md:108-140` 要求 `allow_similar` 携带 `allowPrefixes`、写入 session/user allowlist，并通过 session 事件 replay 恢复；当前 `packages/agent-core/src/tools/scheduler.ts:204-213` 仍把 `allow_similar` 和 `approve_once` 合并为“本次执行”，`packages/desktop/src/main/approval-registry.ts:101-119` 的 `decide()` 也只接收 `ToolApprovalDecisionKind`，没有透传 prefix。
- `docs/design-docs/agent-bash-policy-allowlist-design.md:56-58` 指出硬编码 allowlist 应迁移为 store；当前 `packages/agent-core/src/tools/tools/bash/permissions.ts:183-220` 仍只查 `isAllowedDevelopmentCommand()` 硬编码前缀。

#### 不合理设计

- 用户选择 `allow_similar` 后没有任何持久化或会话内记忆，授权语义和普通 `approve_once` 等价，容易让用户误以为后续相似命令已被窄授权。

#### 可读性问题

- `ToolApprovalDecision` 只有 `decision` 字段（`packages/agent-core/src/tools/scheduler.ts:43-49`），从类型上看不出 `allow_similar` 与一次性批准有什么区别。

#### 耦合问题

- Bash allowlist 目标需要 scheduler、approval registry、shared IPC、Bash permission checker、session replay 同步改造；当前能力散在 `scheduler.ts` 与 `permissions.ts`，缺少一个可注入的 allowlist store 边界。

#### 死代码/兼容残留

- 待确认：如果 Phase 1 allowlist 尚未实施，`allow_similar` 按钮/决策名本身属于“提前暴露但未兑现”的兼容残留；若近期不落地，应收敛文案或禁用入口。

#### 建议动作

- 重构：为 Bash 引入 `BashAllowlistStore`/`BashExecutionPolicy` 注入点，拆开 `approve_once` 与 `allow_similar`。
- 补协议：让 `ApprovalDecideInput`/`ToolApprovalDecision` 携带 `allowPrefixes`，并让 `ToolApprovalRequest` 暴露 `prefixOptions`。
- 补测试：覆盖 “Allow 后同会话相同 prefix 自动放行”、跨会话不继承、delete_file 不允许 allow_similar。

### 发现 2：Bash 管道命令仍被硬拒绝，和 allowlist 设计的 D1 决策不一致

#### 偏移点

- `docs/design-docs/agent-bash-policy-allowlist-design.md:156-165` 明确 Phase 1 决定放开 `|` 进入授权拆分；当前 `packages/agent-core/src/tools/tools/bash/permissions.ts:17-18` 的 `UNSUPPORTED_SHELL_SYNTAX_RE = /[|<>`$(){}]/` 仍包含管道，`packages/agent-core/src/tools/tools/bash/permissions.ts:113-124` 会在权限检查早期直接 deny。

#### 不合理设计

- `pnpm test | tail -15` 这类常见开发命令不会进入审核面板，用户无法通过审批授予低风险的“测试后裁剪输出”操作；同时会诱导 Agent 改用更长输出的命令，增加输出裁剪压力。

#### 可读性问题

- 当前只有 `splitCommandSegments()`（`packages/agent-core/src/tools/tools/bash/permissions.ts:129-134`）按 `&&`/`;` 拆段，没有独立的 `splitForAuthorization()`，读代码时不容易看出“执行分段”和“授权 prefix 分段”是否是同一概念。

#### 耦合问题

- hard reject 正则、分段策略和 allowlist prefix 生成绑在一个权限文件里；一旦放开 `|`，需要同时保证 `bash -lc` 执行语义、prefix 展示和危险语法拒绝不互相冲突。

#### 死代码/兼容残留

- 待确认：文档里的 D1 可能是尚未执行的计划；如果不打算近期放开 `|`，应把设计文档从“Phase 1 决定”改为“待实施”，避免审查和实现持续偏移。

#### 建议动作

- 重构：将 `UNSUPPORTED_SHELL_SYNTAX_RE` 中的 `|` 移出 hard reject，并新增只用于审批展示/allowlist 的 `splitForAuthorization()`。
- 补测试：覆盖 `pnpm test | tail -15` 进入 ask、`<`/`>`/`` ` ``/`$()` 仍 hard reject。

### 发现 3：Explore 首帧展示依赖 renderer 用 `toolName` 兜底，破坏 typed preview 分层

#### 偏移点

- `docs/design-docs/agent-tool-preview-design-guidelines.md:7-13` 和 `docs/design-docs/agent-tool-preview-design-guidelines.md:45-49` 要求 renderer 只消费 `ToolUiPreview`/`MessageBlock`，不按 `toolName` 反推展示；当前 `packages/agent-core/src/engine/streaming-preview-extractors.ts:120-129` 的 `agent` streaming extractor 没有带 `display` 字段，导致 `packages/desktop/src/renderer/App.tsx:408-423` 需要用 `tool.toolName === "explore"` 兜底为 `inline`。

#### 不合理设计

- `agent` 与 `explore` 共用 `previewKind: "agent"`（`packages/agent-core/src/tools/tools/agent/definition.ts:31-33`、`packages/agent-core/src/tools/tools/agent/definition.ts:60-62`），但首帧 preview 没表达 display 语义，前端只能回看工具名。这让新增第三种 agent-like 工具时很容易出现首帧展示错位。

#### 可读性问题

- `App.tsx:421-423` 的注释承认这是兜底逻辑；阅读者需要同时理解 `previewKind`、`toolName` 和 `display` 三层才能知道为何 explore 不打开 panel。

#### 耦合问题

- renderer 对内部工具名 `explore` 产生展示依赖，绕过了 `AgentToolPreview.display` 这个共享契约（`packages/shared/src/session.ts:274-294`）。

#### 死代码/兼容残留

- 无明显死代码；这是首帧 streaming preview 字段缺失导致的兼容兜底。

#### 建议动作

- 收敛：让 `extractStreamingPreview()` 能根据工具名或由 bridge 传入的 spec 生成 `display: "inline" | "panel"`，保证首帧也是完整 typed `AgentToolPreview`。
- 补测试：覆盖 `explore` 的 `tool_call_streaming.preview.display === "inline"`，并移除 renderer 侧 `toolName` 兜底。

### 发现 4：SubAgent transcript 面板仍从 raw tool args/output 重建工具行

#### 偏移点

- `docs/design-docs/agent-tool-preview-design-guidelines.md:49` 要求 SubAgent running 更新通过完整 typed `AgentToolPreview`，renderer 不解析 SubAgent 原始工具参数；但 transcript 面板内部在 `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx:151-224` 直接读取 `tool_call.payload.arguments`、按 `toolName` 分支，并从 `modelOutput/truncatedOutput/rawOutput` 计算 resultCount/entryCount（`packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx:102-137`）。

#### 不合理设计

- SubAgent transcript 是 sidecar 事实流（`docs/design-docs/agent-subagent-runtime.md:120-154`），但 UI 回放逻辑没有复用主消息流的 `ToolUiPreview`/`MessageBlock` 选择器，导致同一 read/grep/glob/list_directory 的展示规则在主消息流和 transcript 面板各维护一份。

#### 可读性问题

- `toolCallMessage()` 里硬编码 `read_file`、`grep`、`glob`、`list_directory` 四个分支（`packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx:162-215`），与 `packages/shared/src/session-selectors.ts:93-246` 的 preview 到 MessageBlock 映射重复。

#### 耦合问题

- Transcript UI 同时耦合 SubAgent 工具集、SessionEvent payload shape、工具输出文本格式和 renderer 展示组件；如果 SubAgent 增加工具或调整输出文案，面板可能和主消息流展示不一致。

#### 死代码/兼容残留

- 待确认：如果 transcript 事件当前没有持久化每个内部工具结果的 `uiPreview`，这段 raw 重建逻辑是兼容路径；但应明确标为 legacy/fallback，而不是作为主路径长期存在。

#### 建议动作

- 重构：SubAgent transcript 写入时为内部 `tool_result` 补 `uiPreview`，面板优先走 shared `messageBlockFromToolPreview`/统一 selector；raw args/output 解析仅保留为旧 transcript fallback。
- 补测试：覆盖 SubAgent transcript 回放不依赖 raw args、read/grep/glob/list_directory 展示与主消息流一致。
