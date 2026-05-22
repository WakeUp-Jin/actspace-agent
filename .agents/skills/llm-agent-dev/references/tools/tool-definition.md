# 工具定义规范

## definition + executor 分离模式

每个工具由两个部分组成：

- **definition**：工具的声明信息（名称、描述、参数 schema），传递给 LLM 作为可用工具列表
- **executor**：工具的执行逻辑（handler 函数），系统内部调用，不传递给 LLM

这种分离使得工具定义可以独立管理、动态注册，executor 可以独立测试和替换。

## 工具类型结构（InternalTool）

一个完整的工具定义包含以下字段：

**必需字段：**
- `name`：工具名称，LLM 通过此名称调用
- `description`：工具描述，决定 LLM 何时选择此工具
- `parameters`：JSON Schema 格式的参数定义
- `handler`：异步执行函数，接收参数字典，返回统一的 ToolResult

**可选字段：**
- `check_permissions`：权限验证函数，在执行前调用，可拒绝执行或修正参数
- `render_result`：结果格式化函数，将 ToolResult 转为 LLM 可读的字符串
- `category`：工具分类（system / file / search / memory 等）
- `is_read_only`：只读标记，影响审批模式判断和并行调度策略

## description 编写要点

工具描述是 LLM 决定是否调用该工具的唯一依据。写得模糊，LLM 要么不用、要么乱用。

有效的 description 结构：
1. 第一句说明工具做什么（功能定位）
2. 后续说明使用约束和最佳实践（Instructions 部分）
3. 明确说明"不要用这个工具做什么"（负面指引）

例如 Bash 工具的 description 会明确说"避免使用此工具运行 find、grep、cat 等命令，应使用专用工具"——这防止 LLM 把所有操作都路由到 Bash。

## 参数 schema 设计

参数定义使用 JSON Schema 格式，关键原则：

- 参数名语义清晰（`command` 而非 `cmd`）
- 每个参数都有 description 字段解释用途
- 明确标注 required 字段
- 类型尽量具体：用 enum 约束取值范围，用 integer 而非 string 表示数字

## 工具的返回值设计

所有工具 handler 返回统一的 ToolResult 结构：
- `success`：布尔值，执行是否成功
- `data`：成功时的返回数据
- `error`：失败时的错误信息

统一返回值使得调度器可以用同一套逻辑处理所有工具的结果，包括错误重试、输出裁剪、结果格式化。

## render_result 的作用

handler 返回的是结构化数据（ToolResult），但 LLM 需要读到自然语言格式的结果。render_result 负责这层转换。

设计原则：输出对 LLM 友好的文本，包含关键信息但不冗余。例如 Bash 工具的 render 会包含退出码、输出内容、工作目录等信息。

参考代码: `examples/tool-definition.ts`

## 注意事项

- 工具数量超过 30 个时 LLM 选择准确率显著下降，考虑使用 RAG 动态筛选相关工具子集
- description 中的 Instructions 部分对 LLM 行为的引导作用非常强，善用它来避免常见误用
- check_permissions 可以在验证通过的同时修正参数（如路径展开、超时值清洗），通过 sanitized_args 返回
