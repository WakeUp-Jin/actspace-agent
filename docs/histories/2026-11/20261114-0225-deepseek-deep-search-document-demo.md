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

---

## [2026-11-14 16:25] | 续：恢复未提交的文档，细化 PB，合并两个会话各自写的版本

### 📥 User Query

> 写计划的那个会话中途坏掉了，任务好像没有完成。先看进行到哪里、要怎么继续，在同一个分支上接着做。

### 🛠 Changes Overview

**Scope:** `docs/`

**Key Actions:**

- **恢复**：原会话停住时，目标设计、计划总览、P0、PA 四份文档已经写完但没有提交。按会话记录恢复出来，登记索引后提交。
- **两份 PB 合并成一份**：恢复的提交推上去之后，原会话被 CI 通知唤醒，接着写了一份 PB 并推送；新会话同一时间也写了一份。合并时以逐项对过代码的那一份为底（12 个任务），并入另一份里多出来的几项：`pdf` Skill 里两处「本机没有 OCR」的说法、新增的媒体类型不影响其他附件路径的核对、附件缓存键带前缀、别的会话读不到缓存的测试、子智能体预设的测试、附件元数据文档的同步。
- **接口事实复核**：重新对照 DeepSeek OCR 官方文档，补全设计文档第 3.2 节（状态码、错误对象、错误消息原文、文本里的标记、计费口径）。
- **自审**：对着现有代码核对三份子计划引用的路径、符号和脚本名，改掉几处写错的（P0 里的打包脚本路径和授权建议的写法、PA 里 Web 测试的位置、审批卡上的按钮文字、总览里 PA 和 PB 共用文件的清单）。
- **设计回写**：PB 细化时新定的内容写回设计文档第 8、9.2、13、14 节，并列进总览「写计划时新定的内容」，等审核时一起看。

### 🧠 Design Intent (Why)

- 这一轮仍然只写计划，不写实现代码：用户要先审核。
- 两份 PB 有分歧的地方按代码里的事实取舍：
  - 行上的文档名放进 `read` 预览新增的 `document` 字段，`filePath` 仍然是真实路径。等待审批的卡片显示的就是 `filePath`，换成文件名之后用户在批准前看不到完整路径。
  - 桌面端只认登记在受信任集合里的授权范围。`read_document` 用了自己的范围，不登记的话审批卡上没有「本会话允许」，已有的会话授权也不生效。
  - 审批卡上的按钮文字是「本会话允许」，验收步骤按这个写。
- 超长的页按行拆成几页，替换原来「只返回前 50,000 字符」的写法：不含图片的 Word、PPT 由 DeepSeek 直接提取文字，长文档有可能整份只算一两页，不拆的话后面的内容永远读不到。
- 文档缓存放在 Host 端口对象里：一棵 Harness 只构造一次端口，多个会话共用，翻页和重读不再计费；不为此另做 Host 级的缓存。附件每次调用先过归属检查再查缓存。
- 调用被中止时只取消还没发出的请求：文件发出之后 DeepSeek 不会停止识别，也照常计费，让它跑完进缓存，下次读取不再花钱。同时最多 2 份文档在读入和上传，限制内存峰值。
- `read_document` 用自己的授权范围，不和 `read_file` 共用：允许读某个目录里的文本，不等于允许把那里的文档发给 DeepSeek。
- 提示词和三个官方 Skill 里关于 `read_document` 的文字写成条件句，不跟着开关变：切换开关只让工具列表变一次，系统提示词不变。
- 同一个分支上不要让两个会话同时写：原会话订阅了这个分支的 CI 通知，任何一次推送都会把它唤醒。这次是靠合并提交收拢的，没有强推。

### 📁 Files Modified（新增部分）

- `docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/README.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/p0-foundation-and-settings.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/pa-deep-search.md`
- `docs/exec-plans/active/20261114-deepseek-deep-search-document-parsing/pb-document-parsing.md`
