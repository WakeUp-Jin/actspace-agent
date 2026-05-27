# 2026-05-27 基础 Bug 与可用性修复计划

## 目标

集中修复 2026-05-27 使用 bug 小记中已经影响基础可用性、展示正确性和用户信任感的问题。完成后，工具审核状态、Markdown 渲染、Usage 统计、失败工具展示和默认文件创建路径都应有明确、可验证的行为。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/agent-core/tool-preview-design-guidelines.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
- `docs/exec-plans/active/actspace-usage-statistics-session-jsonl-plan.md`

补充素材：

- `2026-05-27的使用bug小记.md`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/1.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/7.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/9.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/9-2.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/13.png`

## 范围

包含：

- `#1` Bash 审核后状态没有从审核态切换到运行态。
- `#7` Markdown 表格仍按 pipe 文本显示，没有 GFM table 渲染。
- `#9` Usage 使用趋势显示异常。
- `#10` Usage 日、周、月筛选无效。
- `#11` Usage 页面假数据清理。
- `#13` 工具执行失败展示混乱，需要统一失败态 UI。
- `#16` 默认文件创建路径不清晰，需要确定策略并让用户可见。

不包含：

- 不新增工具能力；`delete_file`、edit 删除语义和工具压缩由 `20260527-agent-tool-capabilities.md` 负责。
- 不重做完整 Usage Statistics 页面架构；本计划只修当前页面的异常显示和筛选行为，并以 `actspace-usage-statistics-session-jsonl-plan.md` 为数据契约来源。
- 不做 Composer、附件、Context popup、设置页和右侧面板功能；这些由另外三份计划负责。
- 不改变模型 provider 接入方式。

## 相关代码路径

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools/**`
- `packages/agent-core/src/persistence/**`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/**`
- `packages/desktop/src/renderer/fixtures/**`
- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`

## 并行边界

- 本计划可以修改工具状态展示组件、Markdown 渲染组件、Usage 统计页面和默认路径策略相关提示。
- 不修改 `ToolDefinition` 的工具注册清单，除非只是读取已有 preview 字段完成展示。
- 如果发现 `#16` 必须改工具执行根目录，先在本计划记录决策，再与 `20260527-agent-tool-capabilities.md` 对齐，避免两个会话同时改工具路径解析。
- Usage 页面如需新增共享类型，优先复用 `actspace-usage-statistics-session-jsonl-plan.md` 已定义的 `UsageStatisticsSnapshot`，不要另起新类型。

## 实施任务

### Task 1: Bash 审核态状态切换

修改目标：

- 找到 Bash approval card 和工具消息 block 的状态来源。
- 修复 Allow / Run 后仍保留审核卡片视觉的问题。
- 同一条工具调用应按 `pending -> running -> success | failed | denied | expired | cancelled` 转换。

验收：

- 复现 `1.png` 场景，点击 Allow 后按钮区不再停留在审核态。
- running 阶段显示轻量工具行或 running 卡片状态，不再出现可重复点击的审核操作。
- 失败、拒绝和过期状态都有稳定文案。

### Task 2: Markdown GFM 表格渲染

修改目标：

- 让 assistant 消息正文和右侧 Markdown 预览都支持 GFM table。
- 表格需要有可读边框、表头层级、横向溢出处理。

验收：

- `7.png` 中的 pipe 表格渲染成真实表格。
- 中文、inline code、emoji 和长文件名不会撑破消息区。
- 浏览器 mock 或 Electron 中表格可读。

### Task 3: Usage 趋势、筛选和假数据清理

修改目标：

- 修复趋势图全柱同日、日期范围错误或 hover 数据不一致的问题。
- 修复日、周、月筛选无效的问题。
- 删除 Usage 页面运行时 mock fallback，真实数据为空时显示空态而不是误导数据。

验收：

- `day`、`week`、`month` 切换会改变统计范围和图表数据。
- 无真实 usage 时展示明确空态。
- 有真实 snapshot 时，趋势、热力图、tooltip 和汇总数字来自同一份 snapshot。

### Task 4: 失败工具展示统一

修改目标：

- 对齐 `docs/design-docs/agent-core/tool-preview-design-guidelines.md` 的失败态语义。
- 长命令摘要截断，展开后显示 command、cwd、exit code、stdout、stderr 和安全分类错误。
- 避免失败块内出现多层卡片和滚动条混乱。

验收：

- `13.png` 场景中失败摘要不再被长命令撑乱。
- 展开态能看清真正失败原因，例如 unsupported shell syntax。
- Bash、文件工具、搜索工具的失败态视觉一致。

### Task 5: 默认文件创建路径策略

修改目标：

- 明确用户未指定路径时，文件工具默认写入哪个 workspace root。
- 工具执行结果展示相对路径，必要时补充完整路径展开信息。
- 如果当前 workspace 不明确，Agent 应先澄清或使用当前选中 workspace，而不是悄悄写到不可预期目录。

验收：

- 复现“直接让 Agent 创建文件”时，创建位置可预测。
- 工具结果不只显示绝对路径，还能让用户知道它属于哪个 workspace。
- 相关策略写入工具文档或设计文档。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- Usage 聚合相关测试命令按现有 package 测试脚本执行。
- 前端改动按 `docs/FRONTEND_VERIFICATION.md` 做浏览器 mock 验证；涉及 IPC、session 或文件系统时补 Electron 真实验证。

## 进度记录

- [x] 确认各 bug 的复现路径和影响文件。
- [x] 完成 Bash 审核态切换修复。
- [x] 完成 Markdown 表格渲染修复。
- [x] 完成 Usage 趋势、筛选和假数据清理。
- [x] 完成工具失败展示统一。
- [x] 完成默认文件创建路径策略。
- [x] 跑完验证，更新必要文档和 history。

## 决策记录

- 2026-05-27：本计划只处理基础可用性 Bug，不新增大功能；Usage 页面数据契约以 `actspace-usage-statistics-session-jsonl-plan.md` 为准。
- 2026-05-28：Usage 页面不再使用运行时 mock 数据；没有真实 snapshot 时展示空态，测试 fixture 可以保留在测试边界内。文件写入和编辑工具继续以当前 workspace root 为默认根目录，用户可见结果优先展示 workspace 相对路径。
