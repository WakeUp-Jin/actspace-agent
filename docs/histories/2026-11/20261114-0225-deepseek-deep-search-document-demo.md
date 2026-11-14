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
