# Agent 重构最终清理与验收

状态：2026-10-05 已按八项审核意见补充，待实施批准。本轮仅完善计划，未修改产品代码或搬迁目录。

## 执行文件与阅读顺序

本目录是同一个收尾计划，不是新增阶段。先读本文，再按任务使用附件；附件中的验收条件同样属于完成要求。

1. [代码与文档处置映射](cleanup-map.md)：已确认改动、模块职责、文档主规范和删除判据。
2. [根目录处置表](root-layout.md)：最终目录结构、产物合并和逐路径处理。
3. [验证与目标证据](verification.md)：干净源码快照、CLI 欠账、目标不变量、CU 子项及 fixture。
4. [范围基线清单](scope-inventory.tsv)：实际文件/包清单与适用规则；登记不等于已审核通过。实施时逐项补结论，不能按目录抽样签收。

2026-10-05 基线登记：46 个 workspace 包、Browser Bridge、66 个脚本、947 个文档/资源文件及 52 个根入口，共 1,112 行。清单不包含本计划自身，histories/learnings 通过受保护文件清单与入链扫描单独覆盖；不读取真实配置内容。新增/删除必须结算，不把数字本身当作审计完成证据。

| 审核缺口 | 本轮补充落点 |
| --- | --- |
| 代码处置不具体 | cleanup-map C1–C8、M1–M14，scope-inventory 和最终 cleanup-ledger |
| 可能测到旧产物 | verification V-CLEAN；构建→重新打包→隔离 package smoke |
| CLI 原欠账未完整承接 | verification CLI1–CLI6，严格 stdout/stderr、持久结果/replay 和释放 |
| CU 粒度与环境不可复现 | verification V-FIXTURE、CU 子项；按点签收、按路线执行 |
| 文档主规范和删除去向不明 | cleanup-map D1–D11、P/R；保护区入链增量检查 |
| 根目录只是搬迁堆积 | root-layout 最终结构、缓存分类删除、旧模板副本退役 |
| 验证与 CI/移动风险脱节 | T4 完整命令、verification V-GUARDS 的正负例及 native smoke |
| 目标映射写得太晚 | verification G1–G8 执行前固定，实施时填证据 |

## 目标与完成条件

完成[原始目标](../../../design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md)的最后一轮收尾：核心与扩展解耦、Host 与客户端分离、冗余代码与目录清理、当前文档与实现一致。本计划承接两份已有[代码审计](../../../design-docs/agent-plugin-runtime/agent-refactor-code-cleanup-review.md)、[文档审计](../../../design-docs/agent-plugin-runtime/agent-refactor-docs-cleanup-review.md)，包括[上轮未覆盖项](../../../exec-runs/20261004-agent-storage-and-cleanup/execution-summary.md)，不再以“实施完成”替代目标验收。

- 当前 workspace 包、apps、browser-bridge、scripts、根目录，以及当前规范/计划/过程文档全部进入处置清单；每项写明保留、修改、合并、迁移或删除及依据，不抽样后宣称全仓清理完成。
- 删除项同时检查源码、manifest、动态加载、脚本、构建、测试与文档引用；不能只凭没有静态 import 就删除插件或公共契约。
- 本次目标内发现的问题在本计划闭环，不再转成“下一轮清理”。独立未来产品功能仅校准状态，不借本计划实现。
- 必需自动化、进程验证与逐项 Computer Use 验收通过；环境阻塞或未覆盖项必须明确，存在目标内未覆盖项就不宣布原始目标全部完成。
- 完成前后统计、目录职责说明、最终目标对照和保护文件校验。净减行数是观察结果，不是牺牲模块化的指标。

## 已确认的问题与方案取舍

当前工作树包含此前大量未提交改动，基线 HEAD 为 `1bc434d62152a783990e30e738eacc9ec302e140`；当前工作树才是本轮 before，不能把累计 Git diff 全算本轮成果。

具体问题包括：Inbox 仍暴露旧任务投递参数；当前 ABI 文档仍写已删除的 `bootProfile()`；前端规范仍写旧 `/compact` IPC 和 `RunAgentInput`；包导航仍列不存在的 `host/`；整体架构仍列不存在的 `infra/`；已实施计划仍作为 active 入口；根目录混有讨论稿、临时指令、演示、生成提示词和被 Git 跟踪的压缩制品。上轮整条 workspace 测试没有最终成功记录，CLI retry/error 进程 fixture 与五组 UI 边界尚未闭环。

采用“逐模块消费者闭包清理 + 同批文档校准 + 最后完整验收”。只修上述几个显眼问题的最小方案不足以满足全面收尾；重新合并包或重写架构会破坏已确认的模块边界，因此不采用。

本计划会修改超过 8 个文件。保留 Host、Harness、Run、Session/storage 和客户端各自职责，不增加新的常驻服务、事件系统、运行配置或永久兼容门面。

```text
Desktop / CLI -> Client / Host adapter -> Agent Host / Agent Service
                                            |               |
                                     Harness selection    Session -> Storage port -> JSONL
                                            |
                                    independent Harness -> Run -> Loop / tools / context
```

图表示职责关系，不要求把各模块串成更多转发层。Run 固定当前组合；跨 Run 可选择新 Harness；Cordis 管理插件、服务、事件和资源生命周期。未来 SQLite/MySQL 通过存储端口接入，不在本轮实现。

## 约束与保护

1. 实施前读 AGENTS、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、CODING_BEHAVIOR、HISTORY_GUIDE、QUALITY_SCORE；前端验收读 FRONTEND_VERIFICATION，颜色变化另读主题规范。
2. 不重置、覆盖或提交既有工作树；不操作无关前端工作台设计。记录已有 tracked/untracked 修改，修改前保留相关文件副本及路径映射。
3. 原有 histories/learnings 内容与路径保持不变；新增本轮记录允许。设置、凭据、Host 连接和真实用户数据不迁移、不清空。
4. `tmp/deepseek-harness/` 保留参考用途；独立 Git 仓库、注册 worktree、含用户配置的临时目录不当垃圾删除。根目录迁移见[处置表](root-layout.md)。
5. 不实现自进化工作流、执行途中换 Loop、Patch 共享树优化、手机 Web/APP、数据库生产适配或新云部署；不把独立官网素材、Browser Bridge 产品扩展、通用 UI 组件建设混入收尾。
6. 审核后自主完成本范围内清理、修复与复验，不逐文件请求许可。遇到会改变上述产品边界的选择才返回讨论。

## 执行任务

### T1：代码与测试消费者闭包清理

按下表逐组完成引用核对、清理与回归，每组在执行记录写实际路径和保留理由。第一组开始前保存工作树状态、受保护文件哈希，并运行 `pnpm refactor:stats before --plan 20261005-agent-refactor-final-closeout`。登记所有实际 workspace 包与 manifest；以执行时扫描结果为准，当前边界检查覆盖 46 包。

| 范围 | 处理目标 | 验证重点 |
| --- | --- | --- |
| `packages/core/agent/src/inbox.ts`、`packages/core/agent-loop/src/loop.ts` 与对应测试 | 收窄为实际后台通知消费能力；删除无消费者的 status、claim options 等写侧接口。旧持久化事件的读侧规则单独保留说明；Task 消费事件中的 steer 语义不按关键字误删 | 后台通知恰好消费一次、取消/恢复、真实 Task 输入不重复；更新测试，不以测试仍调用旧 API 为保留理由 |
| `packages/agent-service`、`agent-host`、`client`、`desktop-app`、`headless`、`runtime`，Desktop/CLI 入口 | 本地/远端/排队/压缩沿当前统一 Task 入口；删除剩余只转发旧契约的 facade、无效导出、重复状态转换和空生命周期包装 | submit/receipt、失败暂停/重试、审批/取消、断连重连、非默认 Loop 结果、资源释放 |
| `packages/boot`、`bundle`、`composition`、`harness-control`、Cordis/core/plugins | 删除旧 Profile 启动与装配别名、重复默认定义和无消费者分支；保留独立 Harness 构建、激活失败隔离、服务依赖与 disposal 顺序 | 固定组合、下一 Run 切换、激活失败、恢复阻断与维护、事件模式及 manifest 检查 |
| `packages/session` 与存储实现、context、subagent、shared、tools、其余 manifest 包 | 复查存储中立接口和文件实现边界、重复 DTO/工具注册/投影转换、停用导出和配置；不因目前只有一个生产实现而删除存储端口 | JSONL/Memory 同契约、冷读/fork/恢复/关闭竞争、父子任务取消与 drain、工具 scope 和 projection |
| `apps/desktop` main/preload/renderer、`apps/cli`、`apps/site`、`browser-bridge` | 清理本次重构遗留导入、IPC、启动和构建引用；源码大文件只按可说明的职责拆分，不机械按行数拆文件；独立产品能力保留 | Renderer/IPC/Host DTO 对齐、实际启动及站点构建、Browser capability 装配 |
| `scripts`、包 exports、根依赖、测试 fixture | 删除无入口且无独立用途的旧架构脚手架与专用测试；诊断工具按用途归类；替换断言旧包装层的测试，保留失败/恢复/生命周期行为验证 | 脚本调用、干净构建、包入口加载、CLI 打包 smoke |

新增 CLI 确定性 retry/error 进程 fixture，接入 `scripts/test/agent-cli-process.test.mjs`：可恢复错误后成功、终止错误与退出码、严格 stdout 协议、stderr 诊断、持久结果/replay、等待重试时 SIGINT 及资源释放全部覆盖，详细断言见验证附件 V-CLI。测试不能静默丢弃解析失败的 stdout 行。使用真实本地 HTTP fixture 驱动生产 retry 路径，不用 `--mock` 绕过；不请求线上 Key。

`scripts/check-package-cutover.mjs` 只检查受维护源码：明确排除 `.astro` 等生成目录，增加生成目录忽略与真实源码旧引用仍失败的测试；最终运行 strict 模式，不能扩大排除规则来掩盖实际残留。

### T2：根目录与文件夹职责落地

执行[逐路径处置表](root-layout.md)，同步路径消费者、帮助文案和忽略规则。更新 `docs/ARCHITECTURE.md` 与 `packages/README.md` 说明入口、依赖方向、代码/文档/制品/临时文件归属；不再创建另一套重复的目录规范。

构建、脚本相对路径和发布输入在每组移动后验证。`artifacts/` 整体 Git 忽略，包含契约矩阵 JSON；取消已有生成文件的跟踪，保留源码和生成能力。JSON 退出跟踪后同步调整矩阵检查，使 CI 在没有 artifacts 的全新 checkout 中可运行，已提交 Markdown 矩阵仍需与源码一致。删除根目录 `output/`、旧 Rust `target/`，对应可再生成产物统一归入 artifacts，不另存临时归档。保存独立仓库与参考资料，精简根目录并保留工具必须的默认路径。

### T3：当前文档收敛与历史结算

按范围基线逐文件执行处置映射：覆盖 `docs/design-docs/`、`docs/exec-plans/`、`docs/exec-runs/`，同步检查 docs 根入口、README、AGENTS 与站点的架构描述和内部链接。每份文件记录适用规则、内容结论、唯一内容去向与验证；不将“登记完成”记为“内容审核完成”。

- 修正 ABI 的 `bootProfile()`、Composer 的旧 `RunAgentInput`、中间消息区旧 `/compact` IPC；以当前源码和 T1 最终契约写调用链。
- 设置中心规范保留设置壳、保存和安全职责；模型/使用统计细节归各自现行规范。工具预览规范保留当前协议和行为，旧故障过程回归历史记录。合并重复段落后删除副本，不保留两份同时号称现行的规范。
- 清理失效设计稿、临时讨论、重复 process 和中间统计/截图。删除前提取唯一决定、未关闭问题、验收结果和最终证据；当前有效截图与本次验收证据保留，不能以“临时”抹掉验收依据。
- 上轮存储清理等已实施计划按 PLANS_GUIDE 移入 completed；mentions 的 PB、UI 基础组件、Chrome 连接等独立未实施目标继续保留准确状态。仅余人工验收的计划进入 completed 并明确门禁，不能写成已验收。
- 被 histories/learnings 引用的退役路径保留短回溯入口；保留被引用锚点，二进制证据原位保留，不用 Markdown 冒充图片。删除前只读扫描保护区入链，并比较前后断链集合：旧断链单列、不增加新断链。现有 check:docs 未覆盖全部保护区，不作为替代证据。旧路径不是 active 待办。同步 `docs/exec-plans/README.md`、`docs/TODOLIST.md`、design index、docs README。
- 更新原始目标文档、两份清理审计及技术债：只记录本轮实际结算结果；每条剩余项明确属于未来功能还是当前阻塞，不能通过改名消除任务。

### T4：自动化与进程验收

按验证附件 V-CLEAN 制作包含最终未提交源码的隔离快照，不只检出旧 HEAD；排除旧产物和真实配置，先 frozen 安装与构建再测试。下列命令按最终路径保持可运行，构建/打包与依赖 dist 的测试顺序执行。失败修复后刷新快照并重跑受影响范围，最后获得完整测试成功记录。

```sh
pnpm install --frozen-lockfile
pnpm ci
pnpm check:site
pnpm test:site
pnpm run gen:contract-matrix --check
pnpm typecheck
pnpm build
pnpm build:site
pnpm test
pnpm check:docs
pnpm check:current-docs
pnpm check:repo
pnpm check:packages
pnpm check:desktop-build-graph
pnpm check:v2-legacy-removal
pnpm check:package-cutover --strict
pnpm check:harness-events
pnpm check:browser
pnpm test:agent-cli:process
pnpm package:agent-cli
pnpm test:agent-cli:package
pnpm test:agent-host:protocol
```

另在 `browser-bridge/` 执行 `go test ./packages/protocol/... ./apps/cli/...`。站点构建使用 CI 的 `SITE_URL=https://example.com`、`SITE_BASE=/`。Markdown lint 使用 CI 当前规则，检查本轮改动文档；全仓历史 lint 失败单列，不顺手改保护区。

矩阵先 check 再生成确定性检查；必须有“无 artifacts 仍通过”和“源码变更但 Markdown 未更新则失败”的负向测试。Host/recovery 进程门禁由 `pnpm test` 执行。SSH 测试使用本机隔离 fixture，不能把本地验证描述为真实云部署。不以跳过/空测试作为通过；缺少系统能力时记录明确阻塞并继续可执行部分。上述列表与 `.github/workflows/ci.yml` 逐项核对，记录实际执行环境，不声称本机通过等于远端 CI 已通过。

### T5：Computer Use 与缺陷闭环

委派 `gpt-6.1-sol`，主智能体定位修复，修后同模型复验。使用隔离用户目录、Provider fixture 和本机独立 Host；不改真实凭据。下表仅为场景导航，实际签收必须使用验证附件 CU1.1–CU8.2 的子项，禁止给下表整行一个 PASS 掩盖未覆盖行为。

| 编号 | 验收点与预期 |
| --- | --- |
| CU1 | 清理后从规范入口启动；设置/连接配置可读；正常退出重开可继续原会话 |
| CU2 | 本地发送/流式/停止；同 Session 下一条更换 Plan/Agent、模型和推理参数；实际请求消费对应配置且不重复 |
| CU3 | 附件选择、预览、发送；无效附件与批注输入反馈明确、草稿保留；skills 选择在实际请求生效 |
| CU4 | 忙时队列排序/插入/撤回/编辑回填/删除；停止暂停、继续与 Reload 后恢复正确 |
| CU5 | compact 的执行、skipped、失败重试；busy 时取消再重新排队并最终执行，队列不永久暂停 |
| CU6 | 自动标题与手动改名竞争后保留手动标题；运行中 Reload 用户消息/导航不重复 |
| CU7 | 远端配对、会话、发送、审批、取消、附件及结果访问；断连保留草稿、重连仅发送一次 |
| CU8 | 涉及移动/修改的界面在浅/深主题代表位置无布局、文字、按钮状态和浮层回归 |

实际操作分组：本地启动与配置→CU1/2/3；同会话繁忙队列与压缩→CU4/5/6；远端完整任务及断连→CU7；复用以上路线检查主题与重开→CU1/8。必要时根据状态增补路线，不限制工具调用次数。

每点记录通过/失败/未覆盖、步骤和必要截图/AX/运行日志。UI 操作与请求日志互相支撑，但日志不代替交互；原生附件选择器若失败，排除操作工具问题并尝试应用支持的其他交互入口，不能用内部注入代替验收。模型或界面不可用就保留门禁，不能静默换 Astra。

### T6：目标结算与交付

- 运行 `pnpm refactor:stats after --plan 20261005-agent-refactor-final-closeout`；分别报告源码、测试、文档变化、根目录迁移与删除，不把移动文件当作删除代码成果。
- 执行记录存于 `docs/exec-runs/20261005-agent-refactor-final-closeout/`，包含 process、summary、代码/文档处置清单、根路径映射和 Computer Use 证据。
- 原有 histories/learnings 哈希逐项一致；新增 history；命中学习沉淀条件时按写作指南新增 learning。
- 执行前按验证附件 G1–G8 固定目标与证据映射，执行中逐项填实际结果，不等交付时反向挑选成功项。完成后按计划生命周期移动本计划并修复入口；目录 completed 只表示实施生命周期，不自动代表目标验收通过。
- 不主动 commit/push；交付列明修改范围、验证、未来独立功能与本轮阻塞。用户要求提交时才提交。

## 风险与回退

最脆弱的判断是“没有静态调用就表示无用”：动态 manifest、CLI 外部调用和旧 journal 读侧会让这个判断失效。通过消费者清单和加载/恢复进程测试约束删除，不把所有历史字段当兼容层删掉。

每批保留开始时相关文件内容与路径映射；失败时仅恢复该批变化，不回退其他未提交工作。文档删除先保存唯一内容与入链，目录迁移保留完整原件及逆向映射，临时嵌套仓库保持 Git 元数据。代码不改变真实数据格式，不需要清空数据回退。完整验收前不声称完成；任何阻塞记录真实状态，不生成一轮新的“补清理计划”替代本轮承诺。
