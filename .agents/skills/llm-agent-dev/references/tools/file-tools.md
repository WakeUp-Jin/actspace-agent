# Read/Write/Edit 文件操作工具

文件操作是 Agent 修改代码的核心能力。三个工具各有职责：Read 读取文件内容，Write 创建或覆写文件，Edit 精确替换文件中的片段。

## Read 工具

功能：读取指定文件的内容，支持行号范围限制。

关键参数：
- `path`：文件绝对路径
- `offset`：起始行号（可选）
- `limit`：读取行数（可选）

设计要点：
- 输出带行号前缀（`LINE_NUMBER|CONTENT`），为后续 Edit 操作提供精确定位
- 大文件保护：超过阈值行数时强制截断，返回提示让 Agent 使用 offset/limit 分段读取
- 标记为只读工具，跳过审批

## Write 工具

功能：将内容写入指定路径的文件。如果文件已存在则覆写，不存在则创建（含父目录）。

关键参数：
- `path`：文件绝对路径
- `content`：要写入的完整文件内容

设计要点：
- 原子写入：先写临时文件，成功后 rename 到目标路径。防止写入中断导致文件损坏
- 自动创建父目录
- 非只读工具，需要权限审批

## Edit 工具

功能：在文件中进行精确的字符串替换。找到 old_string，替换为 new_string。

关键参数：
- `path`：文件路径
- `old_string`：要被替换的精确文本
- `new_string`：替换后的文本

设计要点：
- old_string 必须在文件中唯一匹配，否则报错要求提供更多上下文
- 保持文件其余部分完全不变
- 支持 `replace_all` 选项用于全局替换（如变量重命名）
- 非只读工具，需要权限审批

## 共享基础设施

### 文件读取追踪器（FileReadTracker）

记录 Agent 已读取过的文件列表。用途：
- 帮助 Agent 判断是否需要重新读取文件
- 为上下文管理提供"Agent 已知文件"的信息

### 原子写入（file_write_atomic）

Write 和 Edit 工具共用的底层写入逻辑：
1. 写入 `{target}.tmp` 临时文件
2. 调用 fsync 确保数据落盘
3. rename 临时文件为目标文件（原子操作）

这确保在任何时刻断电或崩溃，文件要么是旧内容、要么是新内容，不会出现半写状态。

## description 编写

- Read 的 description 需要说明支持行号范围读取，鼓励 Agent 先读取关键片段而非整个大文件
- Edit 的 description 需要强调 old_string 必须唯一，引导 Agent 提供足够的上下文行
- Write 的 description 需要说明"会覆写整个文件"，引导 Agent 优先使用 Edit 进行局部修改

参考代码: `examples/tool-definition.ts`（通用工具定义模式）

## 注意事项

- Edit 工具的 old_string 匹配失败是最常见的错误。原因通常是 Agent 记忆中的代码和文件实际内容有出入（上下文过时）。解决方案：Edit 前先 Read 确认当前内容
- Write 工具会覆写整个文件——如果 Agent 只想改几行但用了 Write，会导致文件其余部分被它"记忆中的版本"覆盖。description 中必须强调这一点
- 大文件（>1000 行）不要一次性读取完毕注入上下文，使用 offset/limit 分段读取
