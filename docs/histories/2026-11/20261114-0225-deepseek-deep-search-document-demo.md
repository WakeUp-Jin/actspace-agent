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

## [2026-11-14 15:10] | 续：目标设计与执行计划

### 📥 User Query

> 六个待确认的点都按建议来；继续执行。

按此前约定的流程（先梳理计划，审核后再执行），这一轮只写设计文档和执行计划，不写功能代码。

### 🛠 Changes Overview

**Scope:** `docs/`

**Key Actions:**

- **设计文档**：新增 `agent-deep-search-and-document-parsing.md`（目标设计，未实现）：接口事实与实测记录、两个工具的契约、对模型隐藏的机制、界面契约、数据外发与费用、否决的方案、已知限制。
- **执行计划**：新增 `20261114-deepseek-deep-search-document-parsing/`，一份总览加三份子计划：P0 共享契约与两个空插件、PA 深度搜索、PB 文档解析。
- **登记**：`design-docs/index.md`、`exec-plans/README.md` 各加一行；`frontend/README.md` 的 demo 清单把这份 demo 改成「已选定方向，功能尚未实现」。

### 🧠 Design Intent (Why)

- **不可用时从工具列表里消失，而不是留着报错。** 两个工具默认关、按量付费；留在列表里模型会去调，每次白白失败一轮，文档那边模型也不会改走本机 Python。做法是工具登记带一个同步的可见性判断，不动态注册、注销（注销会让已经发出的调用找不到工具，整个 Run 失败）。
- **两处和用户确认时的表述有出入，没有擅自定。** Chat 里深度搜索写成独立工具而不是 `web` 的第三种动作；文档解析默认关。理由、代价和「如果坚持原表述要改什么」都写在计划总览里，等审核时定；两项各只影响一个任务。
- **先落共享部分再拆两条线。** 两个工具互不依赖，但共用隐藏机制、设置字段和插件登记方式，所以拆成 P0 加两份可以单独验收的子计划。
- **写计划时对着代码核对出来的几件事**（读代码不容易一眼看出，执行时会踩）：
  - 历史里结果较大的工具行，调用事件的参数会被裁掉，只剩摘要和参数摘要。所以两种行在折叠状态下只能靠这两样显示，摘要的写法成了界面契约的一部分。
  - `pnpm check:hot-path-reads` 查不出「在高频路径上取设置快照」，可用性读取要靠单元测试守住。
  - 工具包的契约测试要求 `{}` 得到 `INVALID_ARGUMENTS` 且不调用 Host 端口；`read_document` 的参数结构没有必填项，「`path` 和 `artifact_id` 恰好一个」必须在插件里、调用端口之前检查。
  - 一个可选插件只要有工具「部分在、部分不在」，Run 就启动失败，所以用了隐藏机制的插件只能贡献一个工具。

### 📁 Files Modified

- `docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/README.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/p0-foundation-and-settings.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/pa-deep-search.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/pb-document-parsing.md`
- `docs/design-docs/index.md`
- `docs/exec-plans/README.md`
- `docs/design-docs/frontend/README.md`
