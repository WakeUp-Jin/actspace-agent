# TODO List

这个文件记录当前需要持续推进的仓库级任务。它不替代 execution plan；复杂任务仍以 `docs/exec-plans/` 中的计划文件为准。

## 当前焦点：Bash 工具与工具权限调度

计划入口：

- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`
- `docs/design-docs/agent-core/权限设计规则和原则.md`

### 状态总览

| 任务 | 状态 | 当前情况 | 下一步 |
| --- | --- | --- | --- |
| 工具权限调度 | 完成 | ApprovalGate 异步等待、engine/runtime 事件、单测已完成。 | — |
| Bash 工具 | 完成 | Bash definition、permissions、executor（已改用 runProcess）、render result、注册和测试已完成。 | 等权限调度闭环接通后，做真实审核触发回归。 |
| Bash 审核 UI | 基本完成 | 普通 Bash 工具调用 UI 和 pending 审核面板已完成；浏览器 mock 和 Electron smoke 已验收。 | 用真实 Bash ask 触发审核面板验证。 |
| 暂停恢复与会话边界 | 大部分完成 | PendingApprovalRegistry、暂停模型、幂等 decision、IPC 通道已完成。 | 待 Electron 手动验收。 |
| 会话级动态 allowlist + Allow 子命令拆分授权（A+B） | 待执行 | 设计文档与 Phase 1 plan 已落档：`docs/design-docs/agent-core/bash-policy-allowlist-design.md`、`docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-session-allowlist-plan.md`。 | 按 Phase 1 plan 执行，从共享契约 → split-for-authorization → store → permissions/scheduler 推进。 |

### 推荐推进顺序

1. 回归 Bash 审核 UI。
   - 用真实 Bash `ask` 触发审核面板。
   - 验证 `Run / Allow / Skip` 后状态正确转换。
2. Electron 手动验收暂停恢复。
   - 触发 Bash 审核 → 切换 session → 切回 → approve/deny。
   - 刷新/重启后确认 pending 过期。

### 验收缺口

- `allow` 应直接执行，不显示审核面板。
- `deny` 应硬拒绝，不进入审核面板。
- `ask` 应生成 approval request，并显示 Bash 审核面板。
- `Run` 应只允许本次命令。
- `Allow` 应允许本会话内相似操作，授权范围必须可见。
- `Skip` 应取消本次执行，并在消息流中显示 cancelled。
- 会话切换或应用重启后，pending 状态不能丢失、重复执行或错误自动放行。

## 已完成：Edit/Write 文件操作工具

状态：完成，已在 `docs/histories/2026-05/20260526-1400-edit-write-tools.md` 记录。

- `edit-file` 工具从只读 diff 预览升级为真正的文件写入，使用 `diff` 库生成 unified diff。
- 新增 `write_file` 工具，支持创建和覆写文件。
- 前端 `FileDiffBlock` 统一展示 edit 和 write 的 diff 卡片。
- 权限接口预留，默认 allow，未来可通过 AgentMode 开启审批。
- Skill 修复计划见 `docs/design-docs/llm-agent-fix-plan/05-skill-file-tools-fix.md`。

## 已完成：FileDiffBlock UI 重构 + 流式消息顺序修复

状态：完成，已在 `docs/histories/2026-05/20260526-1501-filediff-ui-streaming-order.md` 记录。

- `FileDiffBlock` 从全卡片 diff 改为折叠式工具行（"Edit xxx.ts +3 -1"），点击展开 diff 详情，无 icon。
- `StreamingState` 引入 `segments` 有序数组，流式消息按后端事件推送顺序渲染，修复 thinking/tool/text 分组错位问题。
- `streamingStateToBlocks` 新增 edit_diff/write 流式预览支持。

## 已完成：FileDiffBlock 样式回归对齐 + 工具进行中状态

状态：完成，已在 `docs/histories/2026-05/20260526-1525-filediff-style-and-running.md` 记录。

- 修复 `FileDiffBlock` 视觉突出问题：改用 `max-width + padding` 与 Thinking/Read 左边缘对齐，chevron `inline-flex` 紧贴文本而不是最右端。
- 新增 `edit_diff/write_diff` 的 running 态：`tool_started` 时显示 `Write filename` + shimmer 闪光，`tool_finished` 后切换为折叠卡片。
- 后端 `getToolSummary` 将 `Edited/Wrote` 统一为现在时 `Edit/Write`，与前端 UI 文案对齐。
- 设计文档 `中间消息区规范.md` 移除 "Edit File 唯一卡片化" 约束，改为与 Read/Grep 同级别的轻量行 + 展开 diff。

## 已完成：工具行 running 态文字可见性修复

状态：完成，已在 `docs/histories/2026-05/20260526-1831-tool-running-shimmer-visibility.md` 记录。

- 修复 `.tool-log-line.is-running .tool-log-line-text` 起始帧文字 transparent 的问题：文字底色始终是 `#6f7681` 灰色可读，蓝色高光只是叠加扫过。
- shimmer 一轮从 1.45s 收紧到 1.1s。
- `MIN_TOOL_RUNNING_MS` 保持 300ms 不动（仅用于防 UI 闪烁，不为了显示 shimmer 而延长 running 态）。
- design-docs 补齐「工具执行中态规范」小节，明确视觉、时序、文案与后端契约。

## 待处理：工具行显示细节

### Grep 前端工具行过长

状态：完成，已在 `docs/histories/2026-05/20260526-1242-grep-glob-overflow-tooltip.md` 记录。

当前问题：`Grep` 工具行会直接展示完整 pattern 和绝对路径，遇到长正则或长 workspace 路径时占用过多消息区空间，影响阅读。

例子：

```txt
Grep react|React|useState|useEffect|useCallback|useMemo|useRef|createContext|useContext|useReducer|useLayoutEffect|useImperativeHandle|useDebugValue|useTransition|useDeferredValue|createElement|jsx|JSX in /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/packages
Grep from ['"]react['"]|require\(['"]react['"]\)|import.*React in /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/packages
```

处理结果：

- 采用样式省略号，工具行保持完整字符串来源，但通过 CSS `text-overflow: ellipsis` / max-width 控制单行显示。
- 仅当文本真实溢出时启用完整内容 tooltip；短文本不显示 tooltip。

下一步：如后续仍觉得绝对路径过长，可以再做 workspace-relative scope 摘要，这应作为单独体验优化处理。

### 工具执行中闪光反馈不明显

状态：已处理。

处理结果：取消整块背景扫光，改为只在工具行文本上做浅蓝色流动高亮；普通文字保持灰色，扫过区域变为品牌感浅蓝，并保留 reduced-motion 兼容。

## 未来：Bash 全局执行策略 + 真沙箱

设计依据：`docs/design-docs/agent-core/bash-policy-allowlist-design.md` 中的 Phase 2 / Phase 3 段落。

### Phase 2：全局执行策略选择器（C）

状态：**未启动**。等 Phase 1（会话级 allowlist + Allow 子命令拆分授权）落地并通过手动验收后再开 exec-plan。

范围：

- 引入 `BashExecutionPolicy = "autorun" | "allowlist" | "run_everything"`。
- 在 `bashCheckPermissions` 入口按策略短路：`autorun` 跳过 ask、`run_everything` 一律放行、`allowlist`（默认）保持当前行为。
- 用户偏好持久化到 `~/.actspace/preferences.json`。
- UI：`BashApprovalBlock` 左下角占位"Allowlist ›"按钮升级为策略选择菜单（参考 Cursor 截图）。
- **不**提供 Sandbox 选项，避免"看起来在隔离实际没隔离"的安全错觉。Sandbox 与 Phase 3 联动后再解锁。

### Phase 3：真沙箱（D）

状态：**调研方向，单独立项**。需要安全调研与跨平台抽象。

范围（占位）：

- macOS：sandbox-exec profile 设计、文件系统/网络白名单。
- Linux：bwrap / firejail / seccomp 选型。
- Windows：暂不在初版支持范围。
- 与 Phase 2 联动：策略选择器解锁 "Allowlist (with Sandbox)" 与 "Run Everything (Unsandboxed)" 两个选项。
- 不进入 Phase 1/2 实现节奏，单独立项后再写设计文档与 plan。

## 后续维护规则

- 新增跨多轮任务时，先在这里加一行总控 TODO，再视复杂度落 execution plan。
- 完成任务后，把状态改为 `完成`，并链接 history 或完成的 plan。
- 如果 TODO 已经沉淀成独立计划簇，保留这里的摘要和入口，不把所有细节复制进来。
