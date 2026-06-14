## [2026-06-14 12:45] | Task: Enrich glob output metadata

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望 `glob` 工具返回给模型的信息中包含文件大小和修改时间，让模型能利用文件复杂度与最近修改相关性信号。

### Changes Overview

**Scope:** `packages/agent-core`

**Key Actions:**

- **[Glob output metadata]**: `glob` 结果每行在路径后附加 `size` 和 `modified`，同时继续按修改时间倒序排列。
- **[Tool guidance]**: 更新 `glob` 工具描述和 glob 输出压缩 prompt，避免长输出摘要时丢掉 size/mtime。
- **[Regression tests]**: 补充 `globExecutor` 测试，覆盖元数据输出与最近修改优先排序。

### Design Intent (Why)

文件大小能给模型提供复杂度背景，修改时间能表达“最近改过、可能更相关”的隐含信号。把这些信息直接返回给模型，比只通过排序间接表达更清晰，同时保持路径在行首，方便模型继续调用 `read_file`。

### Files Modified

- `packages/agent-core/src/tools/tools/glob/executor.ts`
- `packages/agent-core/src/tools/tools/glob/definition.ts`
- `packages/agent-core/src/context/compression/tool-summary-prompts.ts`
- `packages/agent-core/src/tools/test/search-tools.test.ts`
- `docs/histories/2026-06/20260614-1245-glob-size-mtime-output.md`
