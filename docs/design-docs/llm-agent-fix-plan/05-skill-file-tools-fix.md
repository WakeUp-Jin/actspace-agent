# llm-agent-dev Skill 文件操作工具修复说明

## 背景

在 actspace-agent 实现 Edit 和 Write 工具时，发现 `.agents/skills/llm-agent-dev` 对文件操作工具的指导不够具体。

当前 skill 在 `references/tools/file-tools.md` 中已经说明：

- Read/Write/Edit 三个工具的职责划分
- 原子写入的策略（tmpfile → fsync → rename）
- FileReadTracker 的用途
- description 编写要点
- 常见失败模式（Edit 匹配失败、Write 覆写风险、大文件保护）

但它没有提供任何 TypeScript 示例代码。`examples/` 目录只包含 `tool-definition.ts`、`bash-tool.ts`、`grep-tool.ts`，缺少文件操作工具的完整实现示例。

## 缺口列表

### 1. 无 Write/Edit 示例代码

skill 描述了概念但缺少可直接参考的 TypeScript 实现。开发者在实现时缺少：
- Edit executor 的精确字符串替换逻辑
- Write executor 的创建/覆写判断
- 两者如何与 workspace 路径守卫配合

### 2. 无原子写入示例

`file-tools.md` 描述了原子写入的三步策略，但没有对应的 TypeScript 代码。实际实现中有多个细节需要处理：
- `node:fs/promises` 的 `open` + `writeFile` + `sync` + `close` 组合
- `rename` 作为原子替换操作
- 原文件权限保留（`stat().mode` → `chmod(tmp)`）
- 失败回退到直接写入
- 临时文件的清理

### 3. 无 FileReadTracker 示例

TOCTOU 防护机制只有概念描述，没有代码。实际需要：
- 记录 Agent 读取过的文件及其内容哈希
- 写入前检查文件是否在读取后被外部修改
- 写入后更新追踪状态

### 4. diff 生成方式未涉及

skill 完全没有提及 edit/write 工具如何生成 diff 供前端展示。实际开发中这是关键需求：
- 使用 `diff` npm 库的 `createTwoFilesPatch()` 生成标准 unified diff
- edit 工具对比替换前后内容生成红+绿 diff
- write 工具对比旧文件（或空字符串）和新内容生成 diff
- diff 文本通过 `renderResult` 传递给模型和前端

### 5. 权限审批设计未展开

`file-tools.md` 只说"非只读工具，需要权限审批"，未展开：
- `checkPermissions` 函数如何实现（workspace boundary 检查 + 路径清洗）
- 默认策略设计（当前主流 Agent 默认 allow）
- AgentMode 扩展点预留（future "careful" mode 切换到 ask）
- 与 ToolScheduler 的 `awaiting_approval` 流程如何配合

## 参考实现

### actspace-agent 实现

本次在 actspace-agent 中完成的实现可作为 skill 示例的直接来源：

- `packages/agent-core/src/tools/tools/shared/write-atomic.ts`：TypeScript 原子写入
- `packages/agent-core/src/tools/tools/edit-file-diff/executor.ts`：Edit 工具（精确替换 + diff 库 + 弯引号规范化）
- `packages/agent-core/src/tools/tools/edit-file-diff/permissions.ts`：Edit 权限（预留 AgentMode）
- `packages/agent-core/src/tools/tools/write-file/executor.ts`：Write 工具（创建/覆写 + diff 库）
- `packages/agent-core/src/tools/tools/write-file/permissions.ts`：Write 权限（预留 AgentMode）

### heartclaw 参考实现（Python）

- `heartclaw/apps/ruyi-api/src/core/tool/tools/edit/`：弯引号规范化 + 删除换行符清理
- `heartclaw/apps/ruyi-api/src/core/tool/tools/write/`：文件创建/覆写
- `heartclaw/apps/ruyi-api/src/core/tool/tools/shared/file_write_atomic.py`：Python 原子写入
- `heartclaw/apps/ruyi-api/src/core/tool/tools/shared/file_read_tracker.py`：TOCTOU 防护

## 建议补充到 Skill 的内容

### 新增示例文件

- `examples/file-write-atomic.ts`：从 actspace-agent 的 `write-atomic.ts` 提取，展示 tmpfile → fsync → rename 完整实现
- `examples/edit-tool.ts`：包含 definition + executor + permissions + renderResult，展示精确替换 + diff 库集成 + 弯引号规范化
- `examples/write-tool.ts`：包含 definition + executor + permissions + renderResult，展示创建/覆写 + diff 库集成

### 更新参考文档

更新 `references/tools/file-tools.md`：

- **diff 生成**：说明使用 `diff` 库（npm 包名 `diff`）的 `createTwoFilesPatch()` 生成标准 unified diff，包含上下文行、行号、hunk header。edit 和 write 都需要返回 diff 供前端展示
- **权限设计**：展开 `checkPermissions` 的实现模式——workspace boundary 检查 + 路径清洗 + AgentMode 扩展点
- **renderResult**：说明 edit/write 工具需要提供 `renderResult` 函数，将结构化 ToolResult 转为 diff 文本字符串，同时服务模型（理解变更）和前端（展示 diff 卡片）
- **弯引号规范化**：说明 LLM 经常生成弯引号（smart quotes），edit 工具需要将弯引号规范化为直引号后再匹配
- **TOCTOU 防护**：补充 FileReadTracker 的完整实现描述和使用模式

## Skill 源文件位置

```
/Users/wakeup-jin/Desktop/code-project/side-project/agent-harness-dev
```

需要修改的文件：

- `references/tools/file-tools.md`（更新）
- `examples/file-write-atomic.ts`（新增）
- `examples/edit-tool.ts`（新增）
- `examples/write-tool.ts`（新增）

## 验收标准

- Edit 示例包含完整的 definition + executor + permissions + renderResult
- Write 示例包含完整的 definition + executor + permissions + renderResult
- 原子写入示例可直接复制使用，包含错误处理和回退
- `file-tools.md` 明确说明 diff 库用法和 renderResult 模式
- `file-tools.md` 明确说明权限默认策略和 AgentMode 扩展点
- `file-tools.md` 说明弯引号规范化匹配

## 决策记录

- 2026-05-26：actspace-agent 的 edit/write 工具使用 `diff` npm 库（`createTwoFilesPatch`）生成 unified diff，不再手动拼接 diff 字符串。
- 2026-05-26：edit 和 write 工具的前端展示复用同一个 `FileDiffBlock` 组件，通过 `kind: "edit_diff"` vs `kind: "write_diff"` 区分标题文案。
- 2026-05-26：权限默认 `allow`，预留 `checkPermissions` 函数和 AgentMode 注入点。ToolScheduler 已有完整的 `awaiting_approval` 流程，未来只需在 checkPermissions 中返回 `ask` 即可触发。
- 2026-05-26：skill 修复不放在 actspace-agent 当前任务中执行，后续单独修复 skill 源码。
