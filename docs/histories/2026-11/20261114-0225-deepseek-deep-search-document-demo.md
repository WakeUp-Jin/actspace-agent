## [2026-11-14 02:25] | Task: DeepSeek 深度搜索与文档解析的前端 demo

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5-2`
- **Runtime**: `Cursor Cloud Agent (Linux VM)`

### 📥 User Query

> DeepSeek 开放了联网搜索和文件解析的新 API。深度搜索包装成一个工具；文件解析走 OCR，有 DeepSeek Key 就走 OCR，没有才用本机 Python + Skill。先用真实 Key 试一试，前端的变化先给一个 HTML demo 看，没有问题再梳理计划，审核后执行。

### 🛠 Changes Overview

**Scope:** `docs/`

**Key Actions:**

- **demo**：新增 `deep-search-and-document-demo.html`，六节：运行时的工具行（现状对照和 A / B / C 三种）、完成后的行尾统计与展开内容、回复里的出处、文档解析、设置里的两个开关、待确认的点。
- **实测**：用真实 Key 跑了深度搜索和 OCR；demo 里的搜索词、来源、页数和耗时取自这些调用。Key 没有写进仓库。
- **索引**：`frontend/README.md` 的 demo 清单加上这一份，标明还在选方向、功能尚未实现。

### 🧠 Design Intent (Why)

- 这一轮只做选方向用的 demo，不实现功能；方向定了再写 execution plan。
- 实测里，联网搜索和普通函数工具放进同一次请求时，关闭思考会被接口拒绝，开启思考时模型在需要两者配合的任务上没有去搜索。所以界面按「单独一次请求、包装成一个工具」来画：一次 13–23 秒，运行时要有进度表达。
- 示例内容用真实返回，是为了让行宽、标题长度和统计数字接近实际；其中有不准的标题和日期，demo 第 6 节写明了怎么处理。

### 📁 Files Modified

- `docs/design-docs/frontend/deep-search-and-document-demo.html`
- `docs/design-docs/frontend/README.md`

---

## [2026-11-14 16:00] | 续：方向选定后的目标设计与执行计划（总览、P0、PA、PB）

### 📥 User Query

> demo 的方向选定后：梳理计划，我审核一下再执行。写计划的那个会话中途坏掉了，这一轮先看进行到哪里、要怎么继续，在同一个分支上接着做。

### 🛠 Changes Overview

**Scope:** `docs/`

**Key Actions:**

- **恢复**：坏掉的会话已经写完但没有提交的四份文档（目标设计、计划总览、P0、PA）按会话记录恢复，在设计文档索引和执行计划索引里登记。
- **PB 子计划**：补上缺的 `pb-document-parsing.md`（文档解析），12 个任务：真实接口核对、类型判断与响应解析、缓存与并发、Node 端口、Host 接线与授权范围、附件文件名、设置开关、输入框「+」、行的投影、桌面端和 Web 的行、提示词与官方 Skill、文档与验收。
- **接口事实复核**：重新对照 DeepSeek OCR 官方文档，补全设计文档第 3.2 节（状态码、错误对象、错误消息原文、文本里的标记、计费口径）。
- **自审**：对着现有代码核对三份子计划引用的路径、符号和脚本名，改掉几处写错的（P0 里的打包脚本路径和授权建议的写法、PA 里 Web 测试的位置、审批卡上的按钮文字、总览里 PA 和 PB 共用文件的清单）。
- **设计回写**：PB 细化时新定的内容写回设计文档第 8、9.2、13 节，并列进总览「写计划时新定的内容」。
- **demo 清单**：`frontend/README.md` 里这份 demo 从「还在选方向」改成「已选定方向，功能尚未实现」。

### 🧠 Design Intent (Why)

- 这一轮只恢复和补全计划，不写实现代码：用户要先审核，总览里列了两项和确认时表述有出入的地方等审核时定。
- 超长的页按行拆成几页，替换原来「只返回前 50,000 字符」的写法：不含图片的 Word、PPT 由 DeepSeek 直接提取文字，长文档有可能整份只算一两页，不拆的话后面的内容永远读不到。
- 文档缓存放在 Host 端口对象里：一棵 Harness 只构造一次端口，多个会话共用，翻页和重读不再计费；不为此另做 Host 级的缓存。
- 调用被中止时只取消还没发出的请求：文件发出之后 DeepSeek 不会停止识别也照常计费，让它跑完进缓存，下次读取不再花钱。同时最多 2 份文档在读入和上传，限制内存峰值。
- `read_document` 用自己的授权范围，不和 `read_file` 共用：允许读某个目录里的文本，不等于允许把那里的文档发给 DeepSeek。
- 提示词和三个官方 Skill 里关于 `read_document` 的文字写成条件句，不跟着开关变：切换开关只让工具列表变一次，系统提示词不变。

### 📁 Files Modified（新增部分）

- `docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/README.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/p0-foundation-and-settings.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/pa-deep-search.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/pb-document-parsing.md`
- `docs/exec-plans/README.md`
- `docs/design-docs/index.md`
- `docs/design-docs/frontend/README.md`
