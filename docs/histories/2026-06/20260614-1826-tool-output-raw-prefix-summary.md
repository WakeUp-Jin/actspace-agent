## [2026-06-14 18:26] | Task: 调整工具输出压缩回填

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 调研工具输出压缩策略，确认压缩后是否只返回模型摘要；建议在模型摘要前保留原始输出前 2000 字符，降低关键细节被摘要稀释或遗漏的风险。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`docs`

**Key Actions:**

- **[Tool output compression]**: 非 bash 工具在 flash 摘要成功时，回填给主模型的内容从“压缩标记 + flash 摘要”改为“压缩标记 + 原始输出前 2000 字符 + flash 摘要”。
- **[Fallback preserved]**: summarizer 不可用或失败时仍保持原来的确定性头尾截断兜底，避免兜底输出额外膨胀。
- **[Tests and docs]**: 更新工具压缩单测、上下文压缩设计文档，并沉淀“raw prefix + summary”压缩模式学习记录。

### 🧠 Design Intent (Why)

单独依赖模型摘要会稀释工具输出里的前段高保真细节，例如路径、表头、命令回显、错误上下文或格式说明。固定保留原始输出前缀能给主模型一个不可改写的事实锚点，同时让 flash 摘要继续覆盖长输出里的整体关键信息。

### 📁 Files Modified

- `packages/agent-core/src/tools/output-truncator.ts`
- `packages/agent-core/src/context/compression/tool-summary-prompts.ts`
- `packages/agent-core/src/tools/test/output-truncator.test.ts`
- `docs/design-docs/agent-context-compression.md`
- `docs/learnings/2026-06/raw-prefix-plus-summary-compression.md`
