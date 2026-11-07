# docs 整理：前端设计规范重建与冗余清理

## 目标

让 docs 只保留"现行规则"和"决策时间线"两类内容，入口唯一、规则不重复、不过时。重点是前端：开发任何前端功能前只读 4 份必读规范（约 600 行），再按区域读 1 份区域规范；判断类规则（文案、信息密度、状态表达、对齐、长值）写成可直接判对错的条目。

## 范围

- 包含：`docs/` 下除 `histories/` 以外的全部内容；根目录 `DESIGN.md`；`apps/site/DESIGN.md` 中指向 docs 原型的说明；`scripts/check-docs.sh`、`scripts/check-current-docs.mjs` 的文件清单；`AGENTS.md`、`docs/README.md` 导航；代码注释里指向被移动文档的路径。
- 不包含：`docs/histories/**`（一字不动）；`docs/releases/`；`docs/roadmap.md`（官网读取）；任何功能代码行为。唯一的代码改动是决策 ① 的 dialog 圆角。

## 已确认的决策（2026-11-04 用户：「按照你的建议来开始执行」）

1. Dialog 圆角统一 12px，代码里 4 处 18px 改掉（`--act-radius-xl` 不再用于 dialog）。
2. 状态表达：不能只靠颜色；文字与图标/形状二选一再配颜色，不叠加。侧栏运行圆点是窄空间例外，悬停给文字。
3. 最小字号：`text-act-5xs/4xs/3xs`（8/9/10px）只允许在轨迹视图、Harness 统计这类数据密集页使用，规范里写明白名单。
4. 规范与 token 为准；demo 只用于选方向，选定后结论写进区域规范、demo 删除。
5. 新增对标规则：新界面或改版前找 1–2 个同类产品截图，"别人怎么做、我们取什么"写 3–5 行进区域规范。
6. `exec-plans/completed/` 原样保留，只补索引表；active 里的僵尸计划清理。
7. `exec-runs/` 每次验收只留 `execution-summary.md` 和被其他文档引用的文件；两个大数据文件出库。
8. `learnings/` 合并重复主题、加索引、收紧准入。
9. 删除 `retired-html-demos.md`，引用处改为"见 git 历史"。

## 写作规则（所有现行规范通用）

- 规范只写现行规则。日期、修订注记、"某天用户确认"、实施流水、对标过程一律不写（历史去 histories，过程去 completed 计划）。
- 全局规则只写在 4 份必读规范里；区域规范里发现全局规则，删掉并改成指向必读规范的一句话。
- 单份规范不超过约 400 行；超了拆。
- 每条规则一句话能判对错，必要时附一个反例（本仓库里真实发生过的）。
- 不新增"状态：已实施 / 待 Electron 验收"类头部流水；文档开头最多一行说明这份管什么。
- 链接用相对路径；不要链接 gitignored 或 `tmp/` 下的文件（新克隆看不到），改成纯文本路径。

## 前端规范的目标结构（`docs/design-docs/frontend/`）

### 必读 4 份 + 入口（子智能体 FE-core）

| 文件 | 约行数 | 内容 | 合并自（合并后删除原文件） |
|---|---|---|---|
| `README.md` | ≤60 | "做什么事读哪几份"一张路由表；区域规范目录，每份一句话 | 旧 README（重写） |
| `front-新功能开发清单.md` | ≈110 | 保留现有工程规则；新增「UI 自检」约 10 条，每条一句话链接到下面 3 份 | 原文件升级（文件名不变） |
| `front-视觉token规范.md`（新） | ≈200 | 颜色职责、唯一一份色板、字号/行高/字重（含 8–10px 白名单）、间距、圆角（dialog 12px）、阴影、z-index、动效、强调色、主题硬约束、样式归属（Tailwind 层次）、`check:frontend-*` 说明 | `front-全局视觉语言规范.md`（视觉部分）、`front-主题与配色规范.md`、`front-accent-palette.md`、`front-tailwind-style-architecture.md`、根 `DESIGN.md` 的视觉部分 |
| `front-文案与状态表达规范.md`（新） | ≈130 | ①中文取舍；②说明文字默认不写（只有"不写就会操作错"才写一句，数据与警示保留，不挪到悬停）；③同一信息在一个区域只出现一次；④有可见文字就不加图标；⑤分组内一致的标记放组标题不放每行；⑥状态表达（决策 2）；⑦空值/零值/未知/错误/加载的固定写法；⑧不伪造数据、不放占位入口 | `front-desktop-chinese-ui.md`、全局视觉语言规范「界面文案与说明文字」一节、各功能文档里散落的同类规则 |
| `front-组件与交互模式规范.md`（新） | ≈260 | Button/IconButton 变体与尺寸；Tooltip；弹层怎么选及浮层只放名称+数值；确认 vs 撤销（何时必须二次确认，破坏性用 danger-solid）；设置行/分组/不缩进对齐；表格、列表行、长值（标签 `shrink-0 whitespace-nowrap`，值 `min-w-0 truncate`，完整值进 title）；Tab 与横向溢出；焦点与 Esc；对标规则（决策 5）；demo 规则（决策 4） | `front-基础组件封装规范.md`、`front-icon-button-tooltip-guidelines.md`、各功能文档里散落的组件规则 |

根 `DESIGN.md` 缩成 ≤40 行品牌总纲（设计信念、气质、指向上面 4 份），删掉过时的"当前实现边界""Implementation sequence"和重复色板。

### 区域规范（子智能体 FE-regions-A / FE-regions-B）

| 文件 | 负责 | 处理 |
|---|---|---|
| `front-工作台布局与面板交互规范.md` | A | 清理历史与全局规则 |
| `front-左侧会话栏规范.md` | A | 删 Kairos/Lab、迁出的 demo 引用，全局 Tooltip 规则上提 |
| `front-中间消息区规范.md` | A | 只管消息流与工具流；吸收 `front-tool-stream-typography.md` 的现行数值（阅读字号以 16.5px/1.78 为准）和 `front-agent-tool-stream-rendering.md` 的现行规则；删「回复可视化」等已删功能 |
| `front-轮尾与导航规范.md`（新） | A | 从中间消息区拆出：轮尾操作、用量胶囊、轮次导航、压缩显示、交付卡片 |
| `front-聊天区Markdown渲染规范.md` | A | 压缩；吸收 `front-chat-mermaid-diagrams.md` 要点 |
| `front-聊天输入框规范.md` | A | 吸收 `front-composer-slash-command.md`；附件类型前后统一；删头部历史注记 |
| `front-composer-file-mentions-and-response-annotations.md` | A | 压到 ≤300 行；决策修订表、ASCII 线框、测试清单移入归档 |
| `front-workspace-git-worktree-context.md` | A | 压缩，删历史注记 |
| `front-environment-and-git-actions.md` | A | 轻度清理 |
| `front-文档面板规范.md`、`front-Markdown编辑与渲染规范.md` | A | 修正状态矛盾，压缩 |
| `front-轨迹视图规范.md`（由 `front-DSH轨迹能力迁移规范.md` 改名压缩） | A | 删流水与删除线 |
| `front-web-pwa客户端规范.md` | A | 保留；吸收 `docs/FRONTEND.md` 里的 web 规则后删除 `docs/FRONTEND.md` |
| `front-右侧面板与文件渲染规范.md` | B | 只留面板外壳与文件打开；删已不存在的 HTML/CSV/Terminal 预览描述；Context、子 Agent 段移走 |
| `front-Context面板规范.md`（新） | B | 右侧面板 Context 段 + `front-Context面板Bash命令统计.md` 前端部分 + 路径卡片规则 + 契约字段表；原 Bash 统计、`front-Context面板后端数据需求.md`、`front-Context面板Step刷新与路径展示交接.md` 删除（决策表、SQL 表结构、交接记录移入归档） |
| `front-子Agent与后台任务规范.md`（新） | B | `front-子Agent列表与详情顶部栏.md` + 右侧面板里子 Agent / 后台任务 / 侧边对话段 |
| `front-设置页规范.md`（新） | B | 重写 `front-设置中心重构规范.md` 的现行部分 + `front-模型设置页面-Maka重做规范.md` + `front-usage-statistics-refresh.md`；三份原文件删除，对标与 P0–P6 移入归档；`LIST_FRAME` 等不存在的符号删掉 |
| `front-会话状态与数据流规范.md`、`front-preload-bridge与mock规范.md` | B | 轻度清理，保留 |
| `docs/FRONTEND_VERIFICATION.md` | B | 原位瘦身到 ≈150 行，删过期矩阵项 |
| `front-progressive-session-loading.md` | B | 不是前端规范，移到 `docs/design-docs/agent-runtime/agent-progressive-session-loading.md` |

### 归档与 demo

- 归档目录：`docs/exec-plans/completed/design-archive/`。整份搬入的文档必须修好自身相对链接（或改纯文本）。
  - `design-archive/desktop-frontend-refactor/`：原 `frontend/desktop-frontend-refactor/` 9 份整体搬入（B）。
  - `design-archive/frontend/`：被拆掉的决策表、测试清单、交接文档、对标段、`front-agent-tool-stream-rendering.md`、`front-tool-stream-typography.md` 原文（A/B 各自放）。
- demo 删除：`compaction-display-demo.html`、`md-file-tree-demo.html`、`chat-md-demo/`（A）；`context-paths-demo.html`、`subagent-trajectory-demo.html`、`side-chat-demo.html`、`harness-stats-demo.html`、`plugins-page-demo.html`、`model-provider-demo/`、空目录 `assets/`（B）。
- demo 保留（待 Electron 复验）：`context-bash-demo.html`、`subagent-style-demo.html`、`md-render-demo/`。

## 其余目录

### 根目录与后端设计文档（子智能体 BE）

- 删除：`docs/PRODUCT_SENSE.md`、`docs/QUALITY_SCORE.md`、`docs/ARCHITECTURE_GRAPH_GUIDE.md`、`docs/TODOLIST.md`、`docs/security-public-release-checklist.md`（要点 ≤10 行并入 SECURITY）、`docs/design-docs/core-beliefs.md`、`docs/design-docs/retired-html-demos.md`、`docs/coding-standards/skill-catalog.md`。
- 合并后删除：`CODING_BEHAVIOR.md` → `REPO_COLLAB_GUIDE.md` 一小节；`SUPPLY_CHAIN_SECURITY.md` → `CICD.md` 一节；`design-docs/agent-index.md` → `design-docs/index.md`。
- 修正：`CICD.md` 去"模板"措辞；`RELIABILITY.md` 的 `bootRuntime`→`bootProfileRuntime`、删 Analysis/Trace 视图；`SECURITY.md` 右侧文件树措辞；`ARCHITECTURE.md` 删"架构阅读路线"。
- `design-docs/index.md` 重写为唯一设计索引；前端部分只留一行指向 `frontend/README.md`；沙箱条改为 `default/auto-review/full-access`。
- 后端合并：`agent-package-ledger.md`、`agent-spec-service-definition-provider-consumer.md` → `agent-spec-package-layout-and-plugin-packaging.md`；`agent-decision-cordis-adoption.md` → `agent-harness-host-refactor-decisions.md`；`agent-spec-agent-loop-cordis-surface.md` 与 `agent-spec-cordis-event-abi-and-eventhub-retirement.md` 合一；`core-data-storage-responsibilities.md` 与 `筛选存储改版V2-增加SQLite/` → `core-data-storage-design.md`（保留 `core-storage-and-observability.md`）；`core-review-large-diff-loading.md` → `core-review-change-sources.md`；`browser/agent-browser-bridge-design.md` → browser 索引（`agent-browser-use-command-surface.md` 保留，脚本依赖）。
- 修正矛盾：`agent-spec-agent-and-subagent.md`（子 Agent 已支持后台、续聊、fork）、`agent-host-guide.md`（apps/web 已实现）、`上下文管理引擎设计/README.md` 状态、`model-context/agent-token-usage-and-context-state.md` 失效路径、`上下文管理引擎V2/07` 失效路径、`tmp/deepseek-harness` 引用标明为外部参考快照、`架构优化/` 去待办口吻、`子智能体和后台任务设计规范/` 与 `collaboration/` 重叠段改指针。
- 删除早期稿：`自进化的方案设计/01、02、03`，`上下文管理引擎V2/04、06`。
- 资产：删 `design-docs/site-v4/`、`site-v5/`、`website-preview-assets/`、`多智能体协作/assets/unused/` 与原图（保留 `assets/demo/`）、`docs/assets/` 中无引用的图片；`apps/site/DESIGN.md` 第 3 行改为"原型见 git 历史"；`website-introduction-site-design.md` 并入 `apps/site/` 下现有文档。
- 参考资料：删 `references/` 下视频摘要第三方截图、`llm-agent-dev-skill-fixes/`、自述已归档的调研稿；保留 `dsh-self-modification`、沙箱调研；更新 `references/README.md`。

### 执行计划与执行记录（子智能体 RECORDS）

- active：`20261101-harness-stats.md` 移入 completed；`20260912-custom-model-reasoning.md`（已被取代）与 `20260928-chrome-connect-experience.md`（随功能减法暂停）移入 completed 并在顶部写明状态；`frontend-ui-components-foundation.md` 更新为只剩 Switch、Textarea、Tabs。
- `exec-plans/README.md` 更新当前进行中表（本计划保留在 active），新增 `completed/README.md` 索引表（日期、标题、一句话）。
- `tech-debt-tracker.md` 清理已解决或过时条目。
- `exec-runs/`：每个子目录保留 `execution-summary.md` 和被 exec-runs 以外文档引用的文件；其余删除；`cu-observations.json`、`cleanup-ledger.tsv` 删除；保留文档里指向已删文件、gitignored 截图或 `tmp/` 的链接改成纯文本（新克隆下 `check:current-docs` 要能通过）。

### learnings（子智能体 LEARNINGS）

- 按重复主题合并（目标约 323 → 200 篇），合并稿保留各原篇的独有要点；新增 `learnings/README.md` 主题索引；`WRITING_GUIDE` 改为 md 唯一格式、准入收紧（先搜同主题，有就补进旧篇；只写"下次还会踩、代码里看不出来"的教训）。

## 共享文件归属（防并行冲突）

- 主智能体独占：`AGENTS.md`、`CONTRIBUTING.md`、根 `README.md`、`docs/README.md`、`scripts/**`、代码文件、`docs/histories/**`（不动）。
- BE 独占 `docs/design-docs/index.md`；RECORDS 独占 `docs/exec-plans/README.md`。
- 每个子智能体只改自己范围内的文件；把每个被删除、改名、合并的文件记录到 `tmp/docs-reorg/moves-<agent>.tsv`（`旧路径<TAB>新路径或 DELETED<TAB>备注`）。跨范围的链接不要动，由主智能体最后按 moves 统一改写。

## 收尾（主智能体）

1. 汇总 moves，脚本改写 `docs/`（除 histories）、`AGENTS.md`、`README.md`、`CONTRIBUTING.md`、`apps/`、`packages/` 注释中指向旧路径的链接；目标已删除的改为纯文本或"见 git 历史"。
2. 更新 `check-docs.sh` 必需清单、`check-current-docs.mjs` 的 `currentTruthFiles`；新增"现行文档里反引号内的 `packages/…`、`apps/…` 路径必须存在"检查。
3. `AGENTS.md` 第 3 行改为 ActSpace 描述，导航精简；`docs/README.md` 成为唯一总导航。
4. 决策 ①：dialog 圆角代码改为 12px。
5. 验证：`pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`node --test scripts/test/current-docs.test.mjs`、desktop typecheck 与相关测试；人工通读 4 份必读规范。
6. histories 记录本次整理；本计划移入 completed。

## 进度记录

- [x] FE-core 完成：新功能开发清单、视觉 token、文案与状态表达、组件与交互模式四份必读规范与前端 README 路由表
- [x] FE-regions-A 完成：13 份区域规范收敛，决策表与验收矩阵拆到 `completed/design-archive/frontend/`，新增轮尾与导航规范
- [x] FE-regions-B 完成：新增 Context 面板、子 Agent 与后台任务、设置页规范；FRONTEND_VERIFICATION 精简
- [x] BE 完成：删除与合并失效设计文档，`design-docs/index.md` 成为唯一索引
- [x] RECORDS 完成：exec-plans 索引、completed 索引、exec-runs 560 → 229 个文件
- [x] LEARNINGS 完成：323 → 225 篇，新增 README 索引与 WRITING_GUIDE
- [x] 主智能体收尾与验证（2026-11-05）：全仓链接改写、AGENTS.md 与 docs/README.md 重写、代码注释里的文档路径修正；`check-current-docs` 增加代码块屏蔽、现行文档代码路径存在性检查和构建产物白名单；`check:docs`、`check:current-docs`（55 份现行文档，模拟全新 clone 也通过）、脚本测试与全量测试通过
